import { movementKind, type StockAudit } from "./siteInventoryModel.ts";

type Fuel = { id: string; date?: string; shift?: string; employee: string; asset: string; litres: number; submitted: boolean };
type Service = { id: string; date: string; shift?: string; employee: string; assetNumber: string; oils: { product: string; litres: number }[]; submitted: boolean };
export function activityPeriod(at: string) {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return null;
  const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", hour: "2-digit", hourCycle: "h23" }).format(date));
  return { date: date.toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", day: "2-digit", month: "short", year: "numeric" }), shift: hour >= 6 && hour < 18 ? "Day Shift" : "Night Shift" };
}
const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(row => [row.id, row])).values()];
export function dailyActivity(fuel: Fuel[], services: Service[], audit: StockAudit[], date: string, shift = "All") {
  const inPeriod = (row: { date?: string; shift?: string }) => row.date === date && (shift === "All" || row.shift === shift);
  const fuels = unique(fuel).filter(inPeriod);
  const entries = unique(services).filter(inPeriod);
  const contributors = new Map<string, boolean>();
  for (const entry of [...fuels, ...entries]) contributors.set(entry.employee, (contributors.get(entry.employee) ?? true) && entry.submitted);
  const movements: { id: string; at: string; type: string; department: string; location: string; product: string; litres: number; employee: string }[] = [];
  const trucks = new Set<string>(); const bulkDeliveries = new Set<string>();
  const refills = new Map<string, Set<string>>();
  for (const event of unique(audit)) {
    const period = activityPeriod(event.at);
    if (!period || !inPeriod(period)) continue;
    for (const product of new Set(event.changes.map(change => change.productId))) {
      const changes = event.changes.filter(change => change.productId === product);
      const kind = movementKind(changes);
      if (kind !== "Internal transfer" && kind !== "External delivery") continue;
      for (const change of changes.filter(change => change.after > change.before)) {
        movements.push({ id: `${event.id}:${change.key}:${product}`, at: event.at, type: kind === "Internal transfer" ? "Refill / transfer in" : "Delivery", department: change.department, location: change.name, product, litres: change.after - change.before, employee: event.user });
        if (kind === "External delivery" && change.department === "Bulk Storage") bulkDeliveries.add(event.id);
        if (kind === "Internal transfer") {
          if (change.department === "Service Trucks") trucks.add(change.key.split(":")[1]);
          const events = refills.get(change.department) ?? new Set<string>(); events.add(event.id); refills.set(change.department, events);
        }
      }
    }
  }
  const oils = entries.flatMap(entry => entry.oils);
  return {
    fuelUsed: fuels.reduce((sum, row) => sum + row.litres, 0),
    oilUsed: oils.filter(row => !/coolant|waste|diesel/i.test(row.product)).reduce((sum, row) => sum + row.litres, 0),
    coolantUsed: oils.filter(row => /coolant/i.test(row.product)).reduce((sum, row) => sum + row.litres, 0),
    machinesFuelled: new Set(fuels.filter(row => row.litres > 0).map(row => row.asset.trim().toLowerCase())).size,
    machinesServiced: new Set(entries.map(row => row.assetNumber.trim().toLowerCase())).size,
    serviceTrucksRefilled: trucks.size, bulkDeliveries: bulkDeliveries.size,
    workshopRefills: refills.get("Workshop")?.size ?? 0,
    fieldRefills: refills.get("Field")?.size ?? 0,
    lightVehicleRefills: refills.get("Light Vehicles")?.size ?? 0,
    employeesSubmitted: [...contributors.values()].filter(Boolean).length,
    employeesOutstanding: [...contributors.values()].filter(value => !value).length,
    unassignedShiftRecords: [...unique(fuel), ...unique(services)].filter(row => row.date === date && !row.shift).length,
    movements,
  };
}
