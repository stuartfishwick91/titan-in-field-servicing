import { readSharedItem, writeSharedItem } from "../cloud/sharedStorage";
export type ServiceOilEntry = {
  compartment: string;
  product: string;
  capacity: number;
  litres: number;
  source: "Workshop Storage" | "Service Truck Storage" | "Bulk Storage";
  comments: string;
};

export type ServiceEntryRecord = {
  id: string;
  date: string;
  employee: string;
  assetNumber: string;
  make: string;
  model: string;
  type: string;
  smu: number;
  fuelAdded: number;
  fuelSource: string;
  oils: ServiceOilEntry[];
  comments: string;
  submitted: boolean;
};

const STORAGE_KEY = "titan-service-entries-v1";

export function loadServiceEntries() {
  try {
    const stored = readSharedItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as ServiceEntryRecord[] : [];
  } catch {
    return [];
  }
}

export function saveServiceEntries(entries: ServiceEntryRecord[]) {
  writeSharedItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event("titan-service-entries-updated"));
}
