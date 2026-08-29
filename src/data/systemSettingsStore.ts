export type ToleranceMode = "litres" | "percentage";

export type SystemAlertSettings = {
  bulkVarianceTolerance: number;
  bulkVarianceMode: ToleranceMode;
  workshopVarianceTolerance: number;
  workshopVarianceMode: ToleranceMode;
  serviceTruckVarianceTolerance: number;
  serviceTruckVarianceMode: ToleranceMode;
  bulkLowLevelPercent: number;
  bulkCriticalLevelPercent: number;
  bulkWasteOilWarningPercent: number;
  bulkWasteOilCriticalPercent: number;
  workshopLowLevelPercent: number;
  workshopCriticalLevelPercent: number;
  workshopWasteOilWarningPercent: number;
  workshopWasteOilCriticalPercent: number;
  serviceTruckLowLevelPercent: number;
  serviceTruckCriticalLevelPercent: number;
  fuelDisplayDayShiftStart: string;
  fuelDisplayNightShiftStart: string;
};

const STORAGE_KEY = "titan-system-alert-settings-v1";

export const defaultSystemAlertSettings: SystemAlertSettings = {
  bulkVarianceTolerance: 50,
  bulkVarianceMode: "litres",
  workshopVarianceTolerance: 20,
  workshopVarianceMode: "litres",
  serviceTruckVarianceTolerance: 50,
  serviceTruckVarianceMode: "litres",
  bulkLowLevelPercent: 30,
  bulkCriticalLevelPercent: 15,
  bulkWasteOilWarningPercent: 30,
  bulkWasteOilCriticalPercent: 75,
  workshopLowLevelPercent: 30,
  workshopCriticalLevelPercent: 15,
  workshopWasteOilWarningPercent: 30,
  workshopWasteOilCriticalPercent: 75,
  serviceTruckLowLevelPercent: 30,
  serviceTruckCriticalLevelPercent: 15,
  fuelDisplayDayShiftStart: "06:00",
  fuelDisplayNightShiftStart: "18:00",
};

export function loadSystemAlertSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...defaultSystemAlertSettings, ...JSON.parse(stored) } as SystemAlertSettings : defaultSystemAlertSettings;
  } catch {
    return defaultSystemAlertSettings;
  }
}

export function saveSystemAlertSettings(settings: SystemAlertSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event("titan-system-settings-updated"));
}

export function resetSystemAlertSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSystemAlertSettings));
  window.dispatchEvent(new Event("titan-system-settings-updated"));
}

export function exceedsVarianceTolerance(difference: number, expected: number, tolerance: number, mode: ToleranceMode) {
  const absolute = Math.abs(difference);
  if (mode === "percentage") {
    if (!expected) return absolute > 0;
    return (absolute / expected) * 100 > tolerance;
  }
  return absolute > tolerance;
}

export function levelAlertTone(percent: number, low: number, critical: number) {
  if (percent <= critical) return "critical";
  if (percent <= low) return "warning";
  return "normal";
}
