import { applyStockOperation, type StockLocation } from "./siteInventoryModel.ts";

export type WorkArea = "Fuel Farm" | "Workshop" | "Field" | "Service Truck";
export const workAreas: WorkArea[] = ["Fuel Farm", "Workshop", "Field", "Service Truck"];
export function workAreaTabs(area: WorkArea, fuelSchedule: boolean) {
  if (area === "Fuel Farm") return ["home", "fuelFarm", "daily"] as const;
  if (area === "Service Truck" && fuelSchedule) return ["home", "service", "fuelSchedule", "refills", "daily"] as const;
  return ["home", "service", "refills", "daily"] as const;
}
export function areaOilSource(area: WorkArea) {
  return area === "Service Truck" ? "Service Truck Storage" : area === "Field" ? "Field Storage" : area === "Fuel Farm" ? "Bulk Storage" : "Workshop Storage";
}
export function prepareAreaUsage(rows: StockLocation[], area: WorkArea, truckId: string, usage: { product: string; litres: number }[]) {
  let next = rows;
  for (const entry of usage) {
    const matches = next.filter(row => row.productId === entry.product && (area === "Service Truck" ? row.key.startsWith(`truck:${truckId}:`) : row.department === (area === "Workshop" ? "Workshop" : area === "Field" ? "Field" : "Bulk Storage")));
    if (matches.length !== 1) throw new Error(`Configure one matching ${entry.product} compartment in ${area === "Service Truck" ? truckId : area}, or use management to select the specific compartment.`);
    next = applyStockOperation(next, { kind: "usage", source: matches[0].key, litres: entry.litres });
  }
  return next;
}
