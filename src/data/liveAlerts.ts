import { loadSiteStock } from "./siteInventory";
import { loadSystemAlertSettings } from "./systemSettingsStore";
import { stockAlerts } from "./stockLevelAlerts";
export type LiveAlert = { id: string; module: string; severity: "warning" | "critical"; title: string; detail: string };
export const liveAlertEvents = ["storage", "titan-bulk-tanks-updated", "titan-workshop-stock-updated", "titan-service-trucks-updated", "titan-site-stock-updated", "titan-system-settings-updated"];
export function buildLiveAlerts(): LiveAlert[] { return stockAlerts(loadSiteStock(), loadSystemAlertSettings()); }
