import { productIdForName } from "./bulkTankStore";

export type WorkshopStockRecord = {
  id: string;
  productId: string;
  name: string;
  current: number;
  expectedLitres?: number;
  capacity: number;
  tone: "green" | "yellow" | "blue" | "orange";
};

const STORAGE_KEY = "titan-workshop-stock-v1";

export const defaultWorkshopStock: WorkshopStockRecord[] = [
  { id: "workshop-engine-15w40", productId: "engine-15w40", name: "Workshop Engine Oil 15W-40", current: 1260, capacity: 2000, tone: "green" },
  { id: "workshop-hydraulic-46", productId: "hydraulic-46", name: "Workshop Hydraulic 46", current: 740, capacity: 1500, tone: "yellow" },
  { id: "workshop-coolant", productId: "coolant", name: "Workshop Coolant", current: 620, capacity: 1000, tone: "blue" },
  { id: "workshop-waste-oil", productId: "waste-oil", name: "Workshop Waste Oil", current: 380, capacity: 1000, tone: "orange" },
];

function normaliseWorkshopStock(items: WorkshopStockRecord[]) {
  return items.map((item) => ({
    ...item,
    id: item.id || `workshop-${productIdForName(item.name)}`,
    productId: item.productId || productIdForName(item.name),
    expectedLitres: item.expectedLitres ?? item.current,
  }));
}

export function loadWorkshopStock() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normaliseWorkshopStock(JSON.parse(stored) as WorkshopStockRecord[]) : normaliseWorkshopStock(defaultWorkshopStock);
  } catch {
    return normaliseWorkshopStock(defaultWorkshopStock);
  }
}

export function saveWorkshopStock(items: WorkshopStockRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normaliseWorkshopStock(items)));
  window.dispatchEvent(new Event("titan-workshop-stock-updated"));
}
