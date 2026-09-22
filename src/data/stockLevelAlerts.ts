import type { StockLocation } from "./siteInventoryModel";
import type { SystemAlertSettings } from "./systemSettingsStore";
export type StockLevel = "normal" | "warning" | "critical";
export function stockLevel(row: StockLocation, settings: SystemAlertSettings): StockLevel {
  if (!Number.isFinite(row.capacity) || row.capacity <= 0 || !Number.isFinite(row.current)) return "normal";
  const percent = row.current / row.capacity * 100;
  const bulk = row.department === "Bulk Storage";
  const truck = row.department === "Service Trucks";
  if (row.productId === "waste-oil") {
    const warning = bulk ? settings.bulkWasteOilWarningPercent : settings.workshopWasteOilWarningPercent;
    const critical = bulk ? settings.bulkWasteOilCriticalPercent : settings.workshopWasteOilCriticalPercent;
    return percent >= critical ? "critical" : percent >= warning ? "warning" : "normal";
  }
  const low = bulk ? settings.bulkLowLevelPercent : truck ? settings.serviceTruckLowLevelPercent : settings.workshopLowLevelPercent;
  const critical = bulk ? settings.bulkCriticalLevelPercent : truck ? settings.serviceTruckCriticalLevelPercent : settings.workshopCriticalLevelPercent;
  return percent <= critical ? "critical" : percent <= low ? "warning" : "normal";
}
export function stockAlerts(rows: StockLocation[], settings: SystemAlertSettings) {
  return rows.flatMap(row => {
    const severity = stockLevel(row, settings);
    if (severity === "normal") return [];
    const waste = row.productId === "waste-oil";
    return [{ id: row.key, module: row.department === "Workshop" ? "Workshop Storage" : row.department === "Field" ? "Field Storage" : row.department,
      severity, title: `${row.name} ${waste ? "high" : "low"}`,
      detail: `${(row.current / row.capacity * 100).toFixed(1)}% ${waste ? "full" : "remaining"} (${row.current.toLocaleString()} / ${row.capacity.toLocaleString()} L)` }];
  });
}
