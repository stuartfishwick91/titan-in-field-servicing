import { loadAssets, type EditableAsset } from "./assetStore";

export type FuelShift = "Day Shift" | "Night Shift";
export type FuelScheduleStatus = "Scheduled" | "Due Soon" | "Fuelled" | "Overdue" | "Not Fuelled" | "Unscheduled" | "In Service";
export type FuelPriority = "High" | "Medium" | "Low";

export type FuelScheduleEntry = {
  id: string;
  assetNumber: string;
  make: string;
  model: string;
  assetType: string;
  smu: number;
  shift: FuelShift;
  requiresFuelWindow: boolean;
  scheduledWindow: string | null;
  assignedFuelSource: string;
  assignedServiceTruckId: string | null;
  assignedEmployee: string;
  priority: FuelPriority;
  status: FuelScheduleStatus;
  litresAdded: number;
  lastFuelTime: string;
  unscheduled: boolean;
};

const STORAGE_KEY = "titan-fuel-schedule-v3";

export const defaultFuelSchedule: FuelScheduleEntry[] = [];

export function assetTypeRequiresWindow(assetType: string) {
  return ["Excavator", "Drill"].includes(assetType);
}

export function assetTypeAllowsOptionalWindow(assetType: string) {
  return ["Dozer", "Water Cart", "Support Equipment"].includes(assetType);
}

export function loadFuelSchedule() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const entries = stored ? JSON.parse(stored) as FuelScheduleEntry[] : defaultFuelSchedule;
    return mergeAssetsIntoSchedule(entries.map(normaliseEntry));
  } catch {
    return mergeAssetsIntoSchedule(defaultFuelSchedule.map(normaliseEntry));
  }
}

export function saveFuelSchedule(entries: FuelScheduleEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.map(normaliseEntry)));
  window.dispatchEvent(new Event("titan-fuel-schedule-updated"));
}

export function statusFromWindow(entry: FuelScheduleEntry, now = new Date()): FuelScheduleStatus {
  if (entry.status === "In Service") return "In Service";
  if (entry.status === "Fuelled" || entry.unscheduled) return entry.unscheduled ? "Unscheduled" : "Fuelled";
  if (!entry.scheduledWindow) return "Scheduled";
  const [startRaw, endRaw] = entry.scheduledWindow.split("-").map((part) => part.trim());
  const [startHour, startMinute] = startRaw.split(":").map(Number);
  const [endHour, endMinute] = endRaw.split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return "Scheduled";
  const start = new Date(now);
  start.setHours(startHour, startMinute, 0, 0);
  const end = new Date(now);
  end.setHours(endHour, endMinute, 0, 0);
  if (end < start) end.setDate(end.getDate() + 1);
  const minutesToStart = (start.getTime() - now.getTime()) / 60000;
  if (now > end) return "Overdue";
  if (minutesToStart <= 60 && minutesToStart >= 0) return "Due Soon";
  return "Scheduled";
}

export function scheduleLabel(entry: FuelScheduleEntry) {
  return entry.scheduledWindow || "Shift Fuel List";
}

export function recordScheduledFuelUp(assetNumber: string, litres: number, employee: string, source: string, shift: FuelShift = "Day Shift", smu = 0) {
  const entries = loadFuelSchedule();
  const existing = entries.find((entry) => entry.assetNumber.toLowerCase() === assetNumber.toLowerCase() && entry.shift === shift);
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (existing) {
    saveFuelSchedule(entries.map((entry) => entry.id === existing.id ? { ...entry, status: "Fuelled", litresAdded: litres, smu: smu || entry.smu, lastFuelTime: time, assignedEmployee: employee, assignedFuelSource: source } : entry));
    return;
  }
  saveFuelSchedule([
    {
      id: `unscheduled-${Date.now()}`,
      assetNumber,
      make: "Unknown",
      model: "Unknown",
      assetType: "Unscheduled Fuel Up",
      smu,
      shift,
      requiresFuelWindow: false,
      scheduledWindow: null,
      assignedFuelSource: source,
      assignedServiceTruckId: source.startsWith("ST") || source.startsWith("RD") ? source : null,
      assignedEmployee: employee,
      priority: "Medium",
      status: "Fuelled",
      litresAdded: litres,
      lastFuelTime: time,
      unscheduled: true,
    },
    ...entries,
  ]);
}

function normaliseEntry(entry: FuelScheduleEntry): FuelScheduleEntry {
  const requiresFuelWindow = entry.requiresFuelWindow ?? assetTypeRequiresWindow(entry.assetType);
  return {
    ...entry,
    requiresFuelWindow,
    assignedServiceTruckId: entry.assignedServiceTruckId ?? null,
    scheduledWindow: entry.scheduledWindow === "Unscheduled" ? null : entry.scheduledWindow,
  };
}

function mergeAssetsIntoSchedule(entries: FuelScheduleEntry[]) {
  const assets = loadAssets();
  const assetMap = new Map(assets.map((asset) => [asset.assetNumber.toLowerCase(), asset]));
  const hydrated = entries.map((entry) => {
    const asset = assetMap.get(entry.assetNumber.toLowerCase());
    return asset ? hydrateEntryFromAsset(entry, asset) : entry;
  });
  const scheduledAssetNumbers = new Set(hydrated.map((entry) => entry.assetNumber.toLowerCase()));
  const missingAssets = assets
    .filter((asset) => !scheduledAssetNumbers.has(asset.assetNumber.toLowerCase()))
    .map(assetToScheduleEntry);

  return [...hydrated, ...missingAssets];
}

function hydrateEntryFromAsset(entry: FuelScheduleEntry, asset: EditableAsset): FuelScheduleEntry {
  const inService = asset.status === "In Service" || asset.status === "Maintenance";
  return {
    ...entry,
    assetNumber: asset.assetNumber,
    make: asset.make,
    model: asset.model,
    assetType: asset.type,
    requiresFuelWindow: assetTypeRequiresWindow(asset.type),
    scheduledWindow: asset.type === "Haul Truck" ? null : entry.scheduledWindow,
    status: inService ? "In Service" : entry.status === "In Service" ? "Scheduled" : entry.status,
    litresAdded: inService ? 0 : entry.litresAdded,
    lastFuelTime: inService ? "-" : entry.lastFuelTime,
  };
}

function assetToScheduleEntry(asset: EditableAsset): FuelScheduleEntry {
  const inService = asset.status === "In Service" || asset.status === "Maintenance";
  return {
    id: `asset-${asset.assetNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-day`,
    assetNumber: asset.assetNumber,
    make: asset.make,
    model: asset.model,
    assetType: asset.type,
    smu: 0,
    shift: "Day Shift",
    requiresFuelWindow: assetTypeRequiresWindow(asset.type),
    scheduledWindow: assetTypeRequiresWindow(asset.type) ? "09:00 - 11:00" : null,
    assignedFuelSource: "Fuel Farm",
    assignedServiceTruckId: null,
    assignedEmployee: "",
    priority: asset.type === "Haul Truck" ? "High" : "Medium",
    status: inService ? "In Service" : "Scheduled",
    litresAdded: 0,
    lastFuelTime: "-",
    unscheduled: false,
  };
}
