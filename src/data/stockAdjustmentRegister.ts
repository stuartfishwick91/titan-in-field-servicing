export type StockAdjustmentArea = "Bulk Storage" | "Workshop Storage";

export type StockAdjustmentRegisterEntry = {
  id: string;
  dateTime: string;
  area: StockAdjustmentArea;
  product: string;
  previousLitres: number;
  newLitres: number;
  difference: number;
  user: string;
  acknowledgement: string;
};

const STORAGE_KEY = "titan-stock-adjustment-register-v1";

export function loadStockAdjustmentRegister() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as StockAdjustmentRegisterEntry[] : [];
  } catch {
    return [];
  }
}

export function saveStockAdjustmentRegister(entries: StockAdjustmentRegisterEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event("titan-stock-adjustment-register-updated"));
}

export function recordStockAdjustment(entry: Omit<StockAdjustmentRegisterEntry, "id" | "dateTime" | "difference">) {
  const previousLitres = Number(entry.previousLitres);
  const newLitres = Number(entry.newLitres);
  saveStockAdjustmentRegister([
    {
      ...entry,
      id: `stock-adjustment-${Date.now()}`,
      dateTime: new Date().toLocaleString(),
      previousLitres,
      newLitres,
      difference: newLitres - previousLitres,
    },
    ...loadStockAdjustmentRegister(),
  ]);
}
