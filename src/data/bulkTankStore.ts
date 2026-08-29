export type BulkTankRecord = {
  id: string;
  productId: string;
  name: string;
  currentLitres: number;
  expectedLitres?: number;
  capacity: number;
};

const STORAGE_KEY = "titan-bulk-tanks-v1";

export const defaultBulkTanks: BulkTankRecord[] = [
  { id: "bulk-diesel", productId: "diesel", name: "Diesel Fuel", currentLitres: 16800, capacity: 25000 },
  { id: "bulk-engine-15w40", productId: "engine-15w40", name: "Engine Oil 15W-40", currentLitres: 7200, capacity: 10000 },
  { id: "bulk-hydraulic-46", productId: "hydraulic-46", name: "Hydraulic Oil 46", currentLitres: 5800, capacity: 10000 },
  { id: "bulk-hydraulic-32", productId: "hydraulic-32", name: "Hydraulic Oil 32", currentLitres: 3300, capacity: 10000 },
  { id: "bulk-coolant", productId: "coolant", name: "Coolant", currentLitres: 4600, capacity: 10000 },
  { id: "bulk-transmission", productId: "transmission", name: "Transmission Oil", currentLitres: 8100, capacity: 10000 },
  { id: "bulk-waste-oil", productId: "waste-oil", name: "Waste Oil", currentLitres: 1800, capacity: 5000 },
];

export function loadBulkTanks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as BulkTankRecord[]).map(normaliseBulkTank) : defaultBulkTanks.map(normaliseBulkTank);
  } catch {
    return defaultBulkTanks.map(normaliseBulkTank);
  }
}

export function saveBulkTanks(tanks: BulkTankRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tanks.map(normaliseBulkTank)));
  window.dispatchEvent(new Event("titan-bulk-tanks-updated"));
}

function normaliseBulkTank(tank: BulkTankRecord): BulkTankRecord {
  return {
    ...tank,
    expectedLitres: tank.expectedLitres ?? tank.currentLitres,
  };
}

export function productIdForName(name: string) {
  const normalised = name.toLowerCase();
  if (normalised.includes("diesel")) return "diesel";
  if (normalised.includes("engine") || normalised.includes("15w-40")) return "engine-15w40";
  if (normalised.includes("hydraulic") && normalised.includes("46")) return "hydraulic-46";
  if (normalised.includes("hydraulic") && normalised.includes("32")) return "hydraulic-32";
  if (normalised.includes("coolant")) return "coolant";
  if (normalised.includes("transmission")) return "transmission";
  if (normalised.includes("waste")) return "waste-oil";
  return normalised.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
