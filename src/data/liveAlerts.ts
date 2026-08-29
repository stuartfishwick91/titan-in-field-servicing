import { loadBulkTanks, productIdForName } from "./bulkTankStore";
import { loadServiceTrucks } from "./serviceTruckStore";
import { loadSystemAlertSettings, levelAlertTone } from "./systemSettingsStore";
import { loadWorkshopStock } from "./workshopStore";

export type LiveAlert = {
  id: string;
  module: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
};

export const liveAlertEvents = [
  "storage",
  "titan-bulk-tanks-updated",
  "titan-workshop-stock-updated",
  "titan-service-trucks-updated",
  "titan-system-settings-updated",
];

export function buildLiveAlerts(): LiveAlert[] {
  const settings = loadSystemAlertSettings();
  const alerts: LiveAlert[] = [];

  loadBulkTanks().forEach((tank) => {
    const percent = percentage(tank.currentLitres, tank.capacity);
    const isWasteOil = tank.productId === "waste-oil" || productIdForName(tank.name) === "waste-oil";
    if (isWasteOil) {
      if (percent >= settings.bulkWasteOilCriticalPercent) {
        alerts.push(alert("bulk-waste-critical", "Bulk Storage", "critical", `${tank.name} critical`, `${percent}% full`));
      } else if (percent >= settings.bulkWasteOilWarningPercent) {
        alerts.push(alert("bulk-waste-warning", "Bulk Storage", "warning", `${tank.name} warning`, `${percent}% full`));
      }
      return;
    }
    const tone = levelAlertTone(percent, settings.bulkLowLevelPercent, settings.bulkCriticalLevelPercent);
    if (tone !== "normal") {
      alerts.push(alert(`bulk-${tank.productId}`, "Bulk Storage", tone === "critical" ? "critical" : "warning", `${tank.name} low`, `${percent}% remaining`));
    }
  });

  loadWorkshopStock().forEach((tank) => {
    const percent = percentage(tank.current, tank.capacity);
    const isWasteOil = tank.productId === "waste-oil" || productIdForName(tank.name) === "waste-oil";
    if (isWasteOil) {
      if (percent >= settings.workshopWasteOilCriticalPercent) {
        alerts.push(alert("workshop-waste-critical", "Workshop Storage", "critical", `${tank.name} critical`, `${percent}% full`));
      } else if (percent >= settings.workshopWasteOilWarningPercent) {
        alerts.push(alert("workshop-waste-warning", "Workshop Storage", "warning", `${tank.name} warning`, `${percent}% full`));
      }
      return;
    }
    const tone = levelAlertTone(percent, settings.workshopLowLevelPercent, settings.workshopCriticalLevelPercent);
    if (tone !== "normal") {
      alerts.push(alert(`workshop-${tank.productId}`, "Workshop Storage", tone === "critical" ? "critical" : "warning", `${tank.name} low`, `${percent}% remaining`));
    }
  });

  loadServiceTrucks().forEach((truck) => {
    truck.oilGroups.forEach((group) => {
      const percent = percentage(group.current, group.capacity);
      const tone = levelAlertTone(percent, settings.serviceTruckLowLevelPercent, settings.serviceTruckCriticalLevelPercent);
      if (tone !== "normal") {
        alerts.push(alert(`${truck.truckId}-${group.productId ?? group.name}`, "Service Trucks", tone === "critical" ? "critical" : "warning", `${truck.truckId} ${group.name} low`, `${percent}% remaining`));
      }
    });
  });

  return alerts;
}

function percentage(current: number, capacity: number) {
  return capacity ? Math.round((current / capacity) * 100) : 0;
}

function alert(id: string, module: string, severity: LiveAlert["severity"], title: string, detail: string): LiveAlert {
  return { id, module, severity, title, detail };
}
