import { dailyActivity, activityPeriod } from "./dailyActivity";
import { loadStockAudit, loadSiteStock } from "./siteInventory";
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
  workOrder: string;
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
  return entry.date || "Not recorded";
}

function resolveFuelSheetSource(source: string, employee: string) {
  if (source !== "Assigned Service Truck") return source || "Unassigned Source";
  return "Assigned Service Truck (not recorded)";
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
  const serviceById = new Map(loadServiceEntries().map(entry => [entry.id, entry]));
  return loadFuelSubmissions().map((entry) => {
    const asset = assetDetails.get(entry.asset.toLowerCase());
    const latestServiceEntry = entry.serviceEntryId ? serviceById.get(entry.serviceEntryId) : undefined;
    const oilUsage: Array<{ product: string; litres: number }> = [];
    const oilTotalFor = (matcher: (product: string) => boolean) =>
      oilUsage.filter((oil) => matcher(oil.product)).reduce((sum, oil) => sum + oil.litres, 0);
    return {
      date: entryReportDate(entry),
      employee: entry.employee,
      assetNumber: entry.asset,
      make: asset?.make ?? "Unknown",
      model: asset?.model ?? "Unknown",
      smuHours: entry.smu ?? latestServiceEntry?.smu ?? 0,
      fuelAdded: entry.litres,
      engineOil: oilTotalFor((product) => productIdForName(product) === "engine-15w40"),
      hydraulicOil: oilTotalFor((product) => productIdForName(product).startsWith("hydraulic")),
      transmissionOil: oilTotalFor((product) => productIdForName(product) === "transmission"),
      coolant: oilTotalFor((product) => productIdForName(product) === "coolant"),
      otherOils: oilTotalFor((product) => !["engine-15w40", "hydraulic-46", "hydraulic-32", "transmission", "coolant", "diesel"].includes(productIdForName(product))),
      comments: entry.locked ? "Submitted shift entry." : "Draft shift entry.",
      submissionTime: entry.submitted ? entry.submittedAt ?? "Not recorded" : "-",
      status: entry.submitted ? "Submitted" : "Not Submitted",
    };
  });
}

export function buildSubmittedDailyFuelSheetSummaryRows(filters: { date?: string; shift?: string; fuelSource?: string } = {}): DailyFuelSheetSummaryRow[] {
  const serviceById = new Map(loadServiceEntries().map(entry => [entry.id, entry]));
  const rowsBySourceAndAsset = new Map<string, DailyFuelSheetSummaryRow>();

  loadFuelSubmissions()
    .filter((entry) => {
      if (!entry.submitted) return false;
      const dateMatch = !filters.date || entryReportDate(entry) === filters.date;
      const shiftMatch = !filters.shift || filters.shift === "All" || entry.shift === filters.shift;
      const employee = entry.employee || "Unassigned Employee";
      const source = resolveFuelSheetSource(entry.fuelSource, employee);
      const sourceMatch = !filters.fuelSource || filters.fuelSource === "All" || source === filters.fuelSource;
      return dateMatch && shiftMatch && sourceMatch;
    })
    .forEach((entry) => {
      const assetKey = entry.asset.toLowerCase();
      const employee = entry.employee || "Unassigned Employee";
      const fuelSource = resolveFuelSheetSource(entry.fuelSource, employee);
      const workOrder = entry.workOrder ?? (entry.serviceEntryId ? serviceById.get(entry.serviceEntryId)?.workOrder : undefined) ?? "";
      const rowKey = JSON.stringify([fuelSource.toLowerCase(), employee.toLowerCase(), assetKey, workOrder]);
      const current = rowsBySourceAndAsset.get(rowKey);
      const smuHours = Math.max(entry.smu ?? (entry.serviceEntryId ? serviceById.get(entry.serviceEntryId)?.smu : undefined) ?? 0, current?.smuHours ?? 0);
      rowsBySourceAndAsset.set(rowKey, {
        workOrder,
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

export function buildDailySummary(date = activityPeriod(new Date().toISOString())!.date, shift = "All") {
  const reconciliation = buildDailyReconciliation();
  return {
    ...dailyActivity(loadFuelSubmissions(), loadServiceEntries(), loadStockAudit(), date, shift),
    unaccountedBulkOil: reconciliation.filter(item => item.area === "Bulk Storage").reduce((sum, item) => sum + Math.max(0, item.difference), 0),
    unaccountedWorkshopOil: reconciliation.filter(item => item.area === "Workshop Storage").reduce((sum, item) => sum + Math.max(0, item.difference), 0),
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
