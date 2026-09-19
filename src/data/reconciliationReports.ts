import { loadSiteStock } from "./siteInventory";
import { loadBulkTanks, productIdForName, type BulkTankRecord } from "./bulkTankStore";
import { loadFuelSubmissions } from "./fuelSubmissionStore";
import { loadServiceEntries } from "./serviceEntryStore";
import { loadServiceTrucks } from "./serviceTruckStore";
import { exceedsVarianceTolerance, loadSystemAlertSettings } from "./systemSettingsStore";
import { loadAssets } from "./assetStore";
import { loadUsers } from "./userAccessStore";
import { loadWorkshopStock, type WorkshopStockRecord } from "./workshopStore";

export type ReconciliationItem = {
  area: "Bulk Storage" | "Workshop Storage" | "Service Trucks" | "Field" | "Light Vehicles";
  productId: string;
  product: string;
  opening: number;
  deliveries: number;
  refills: number;
  transfers: number;
  employeeUsage: number;
  expected: number;
  actual: number;
  difference: number;
  status: "Balanced" | "Small Variance" | "Investigation Required";
  supervisorNotes: string;
};

export type FuelSheetRow = {
  date: string;
  employee: string;
  assetNumber: string;
  make: string;
  model: string;
  smuHours: number;
  fuelAdded: number;
  engineOil: number;
  hydraulicOil: number;
  transmissionOil: number;
  coolant: number;
  otherOils: number;
  comments: string;
  submissionTime: string;
  status: "Submitted" | "Not Submitted";
};

export type DailyFuelSheetSummaryRow = {
  fuelSource: string;
  employee: string;
  assetNumber: string;
  smuHours: number;
  fuelUsed: number;
};

const today = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });

export function reportDateFromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return today;
  return new Date(year, month - 1, day).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function entryReportDate(entry: { date?: string }) {
  return entry.date || today;
}

function resolveFuelSheetSource(source: string, employee: string) {
  if (source !== "Assigned Service Truck") return source || "Unassigned Source";
  const userTruck = loadUsers().find((user) => user.fullName === employee)?.assignedServiceTruckId;
  if (userTruck) return userTruck;
  try {
    return localStorage.getItem("titan-employee-assigned-truck") || "Assigned Service Truck";
  } catch {
    return "Assigned Service Truck";
  }
}

function varianceStatus(area: ReconciliationItem["area"], difference: number, expected: number): ReconciliationItem["status"] {
  const absolute = Math.abs(difference);
  if (absolute === 0) return "Balanced";
  const settings = loadSystemAlertSettings();
  const tolerance = area === "Bulk Storage" ? settings.bulkVarianceTolerance : settings.workshopVarianceTolerance;
  const mode = area === "Bulk Storage" ? settings.bulkVarianceMode : settings.workshopVarianceMode;
  if (exceedsVarianceTolerance(difference, expected, tolerance, mode)) return "Investigation Required";
  return "Small Variance";
}

function buildItem(
  area: ReconciliationItem["area"],
  productId: string,
  product: string,
  opening: number,
  deliveries: number,
  refills: number,
  transfers: number,
  employeeUsage: number,
  actual: number,
): ReconciliationItem {
  const expected = opening + deliveries - refills - transfers - employeeUsage;
  const difference = expected - actual;
  const status = varianceStatus(area, difference, expected);
  return {
    area,
    productId,
    product,
    opening,
    deliveries,
    refills,
    transfers,
    employeeUsage,
    expected,
    actual,
    difference,
    status,
    supervisorNotes: status === "Balanced" ? "No action required." : "Supervisor review required.",
  };
}

function bulkMovementForTank(tank: BulkTankRecord) {
  return {
    opening: tank.expectedLitres ?? tank.currentLitres,
    deliveries: 0,
    serviceTruckRefills: 0,
    employeeUsage: 0,
    actual: tank.currentLitres,
  };
}

function workshopMovementForTank(tank: WorkshopStockRecord) {
  return {
    opening: tank.expectedLitres ?? tank.current,
    deliveries: 0,
    refills: 0,
    transfers: 0,
    employeeUsage: 0,
    actual: tank.current,
  };
}

export function buildDailyReconciliation() {
  return loadSiteStock().map(row => buildItem(
    row.department === "Workshop" ? "Workshop Storage" : row.department,
    row.productId, row.name, row.expected, 0, 0, 0, 0, row.current,
  ));
}
export function buildDailyFuelSheetRows(): FuelSheetRow[] {
  const assetDetails = new Map(loadAssets().map((asset) => [asset.assetNumber.toLowerCase(), asset]));
  const latestServiceEntryByAsset = new Map(
    loadServiceEntries().map((entry) => [entry.assetNumber.toLowerCase(), entry]),
  );
  return loadFuelSubmissions().map((entry) => {
    const asset = assetDetails.get(entry.asset.toLowerCase());
    const latestServiceEntry = latestServiceEntryByAsset.get(entry.asset.toLowerCase());
    const oilUsage = latestServiceEntry?.oils ?? [];
    const oilTotalFor = (matcher: (product: string) => boolean) =>
      oilUsage.filter((oil) => matcher(oil.product)).reduce((sum, oil) => sum + oil.litres, 0);
    return {
      date: entryReportDate(entry),
      employee: entry.employee,
      assetNumber: entry.asset,
      make: asset?.make ?? "Unknown",
      model: asset?.model ?? "Unknown",
      smuHours: latestServiceEntry?.smu ?? 0,
      fuelAdded: entry.litres,
      engineOil: oilTotalFor((product) => productIdForName(product) === "engine-15w40"),
      hydraulicOil: oilTotalFor((product) => productIdForName(product).startsWith("hydraulic")),
      transmissionOil: oilTotalFor((product) => productIdForName(product) === "transmission"),
      coolant: oilTotalFor((product) => productIdForName(product) === "coolant"),
      otherOils: oilTotalFor((product) => !["engine-15w40", "hydraulic-46", "hydraulic-32", "transmission", "coolant", "diesel"].includes(productIdForName(product))),
      comments: entry.locked ? "Submitted shift entry." : "Draft shift entry.",
      submissionTime: entry.submitted ? entry.submittedAt ?? "17:42" : "-",
      status: entry.submitted ? "Submitted" : "Not Submitted",
    };
  });
}

export function buildSubmittedDailyFuelSheetSummaryRows(filters: { date?: string; shift?: string; fuelSource?: string } = {}): DailyFuelSheetSummaryRow[] {
  const latestServiceEntryByAsset = new Map(
    loadServiceEntries().map((entry) => [entry.assetNumber.toLowerCase(), entry]),
  );
  const rowsBySourceAndAsset = new Map<string, DailyFuelSheetSummaryRow>();

  loadFuelSubmissions()
    .filter((entry) => {
      if (!entry.submitted) return false;
      const dateMatch = !filters.date || entryReportDate(entry) === filters.date;
      const shiftMatch = !filters.shift || filters.shift === "All" || (entry.shift ?? "Day Shift") === filters.shift;
      const employee = entry.employee || "Unassigned Employee";
      const source = resolveFuelSheetSource(entry.fuelSource, employee);
      const sourceMatch = !filters.fuelSource || filters.fuelSource === "All" || source === filters.fuelSource;
      return dateMatch && shiftMatch && sourceMatch;
    })
    .forEach((entry) => {
      const assetKey = entry.asset.toLowerCase();
      const employee = entry.employee || "Unassigned Employee";
      const fuelSource = resolveFuelSheetSource(entry.fuelSource, employee);
      const rowKey = `${fuelSource.toLowerCase()}-${employee.toLowerCase()}-${assetKey}`;
      const current = rowsBySourceAndAsset.get(rowKey);
      const smuHours = entry.smu ?? latestServiceEntryByAsset.get(assetKey)?.smu ?? current?.smuHours ?? 0;
      rowsBySourceAndAsset.set(rowKey, {
        fuelSource,
        employee,
        assetNumber: entry.asset,
        smuHours,
        fuelUsed: (current?.fuelUsed ?? 0) + entry.litres,
      });
    });

  return Array.from(rowsBySourceAndAsset.values()).sort((left, right) =>
    left.fuelSource.localeCompare(right.fuelSource) ||
    left.employee.localeCompare(right.employee) ||
    left.assetNumber.localeCompare(right.assetNumber),
  );
}

export function buildDailySummary() {
  const fuelRows = buildDailyFuelSheetRows();
  const reconciliation = buildDailyReconciliation();
  const submittedEmployees = new Set(fuelRows.filter((row) => row.status === "Submitted").map((row) => row.employee));
  const activeEmployees = loadUsers().filter((user) => user.role === "Employee" && user.status === "Active").length;
  const totalOilUsed = fuelRows.reduce((sum, row) => sum + row.engineOil + row.hydraulicOil + row.transmissionOil + row.coolant + row.otherOils, 0);
  const serviceEntries = loadServiceEntries();
  return {
    fuelUsed: fuelRows.reduce((sum, row) => sum + row.fuelAdded, 0),
    oilUsed: totalOilUsed,
    machinesFuelled: fuelRows.filter((row) => row.fuelAdded > 0).length,
    serviceTrucksRefilled: 0,
    bulkDeliveries: 0,
    workshopRefills: serviceEntries.filter((entry) => entry.oils.some((oil) => oil.source === "Workshop Storage" && oil.litres > 0)).length,
    unaccountedBulkOil: reconciliation.filter((item) => item.area === "Bulk Storage").reduce((sum, item) => sum + Math.abs(item.difference), 0),
    unaccountedWorkshopOil: reconciliation.filter((item) => item.area === "Workshop Storage").reduce((sum, item) => sum + Math.abs(item.difference), 0),
    employeesSubmitted: submittedEmployees.size,
    employeesOutstanding: Math.max(0, activeEmployees - submittedEmployees.size),
  };
}

export function buildReportHistory() {
  const summary = buildDailySummary();
  const hasFuelRows = buildDailyFuelSheetRows().length > 0;
  const hasReconciliation = buildDailyReconciliation().length > 0;
  return [
    hasReconciliation ? { date: today, name: "Daily Reconciliation Report", employee: "All", asset: "All", product: "All Products", shift: "All", crew: "All", status: summary.unaccountedBulkOil || summary.unaccountedWorkshopOil ? "Investigation Required" : "Balanced" } : null,
    hasFuelRows ? { date: today, name: "Daily Fuel Sheet Report", employee: "All", asset: "All", product: "Diesel Fuel", shift: "All", crew: "All", status: "Generated" } : null,
    hasFuelRows ? { date: today, name: "Employee Submission Report", employee: "All", asset: "All", product: "Fuel and Oil", shift: "All", crew: "All", status: `${summary.employeesSubmitted} submitted` } : null,
    hasReconciliation ? { date: today, name: "Workshop Usage Report", employee: "Workshop", asset: "Workshop", product: "Workshop Oils", shift: "All", crew: "All", status: "Generated" } : null,
    hasReconciliation ? { date: today, name: "Bulk Tank Usage Report", employee: "Bulk Storage", asset: "Bulk Storage", product: "Bulk Tanks", shift: "All", crew: "All", status: "Generated" } : null,
  ].filter((report): report is NonNullable<typeof report> => Boolean(report));
}

export function reportRowsToCsv(headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

export function downloadReport(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function productIdForReportName(name: string) {
  return productIdForName(name);
}
