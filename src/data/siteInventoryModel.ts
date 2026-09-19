export type Department = "Bulk Storage" | "Workshop" | "Service Trucks" | "Field" | "Light Vehicles";
export const departments: Department[] = ["Bulk Storage", "Workshop", "Service Trucks", "Field", "Light Vehicles"];
export type StockLocation = {
  key: string; department: Department; name: string; productId: string;
  current: number; expected: number; capacity: number;
};
export type StockOperation = { kind: "transfer" | "delivery" | "usage" | "dip"; source: string; destination?: string; litres: number };

export function applyStockOperation(rows: StockLocation[], operation: StockOperation): StockLocation[] {
  const source = rows.find(row => row.key === operation.source);
  const destination = rows.find(row => row.key === operation.destination);
  const { litres, kind } = operation;
  if (!source) throw new Error("Select a stock location.");
  if (!Number.isFinite(litres) || litres < 0 || (kind !== "dip" && litres === 0)) throw new Error("Enter valid litres greater than zero (a dip may be zero).");
  if (kind === "transfer") {
    if (!destination || destination.key === source.key) throw new Error("Select a different destination.");
    if (destination.productId !== source.productId) throw new Error("Transfers must use the same product at both locations.");
    if (destination.current + litres > destination.capacity) throw new Error("The destination has insufficient capacity.");
  }
  if ((kind === "transfer" || kind === "usage") && source.current < litres) throw new Error("The source has insufficient stock.");
  if ((kind === "delivery" && source.current + litres > source.capacity) || (kind === "dip" && litres > source.capacity)) throw new Error("The quantity exceeds the compartment capacity.");
  return rows.map(row => {
    if (row.key === source.key) {
      if (kind === "dip") return { ...row, current: litres };
      const delta = kind === "delivery" ? litres : -litres;
      return { ...row, current: row.current + delta, expected: row.expected + delta };
    }
    if (kind === "transfer" && row.key === destination?.key) return { ...row, current: row.current + litres, expected: row.expected + litres };
    return row;
  });
}

export function summarizeSiteStock(rows: StockLocation[]) {
  const groups = new Map<string, { productId: string; current: number; expected: number; shortage: number; surplus: number }>();
  for (const row of rows) {
    const group = groups.get(row.productId) ?? { productId: row.productId, current: 0, expected: 0, shortage: 0, surplus: 0 };
    group.current += row.current; group.expected += row.expected;
    group.shortage += Math.max(0, row.expected - row.current);
    group.surplus += Math.max(0, row.current - row.expected);
    groups.set(row.productId, group);
  }
  return [...groups.values()];
}

export type StockAuditChange = { key: string; department: Department; name: string; productId: string; before: number; after: number; expectedBefore: number; expectedAfter: number; configuration: boolean };
export type StockAudit = { id: string; at: string; user: string; changes: StockAuditChange[] };
export function inventoryChanges(before: StockLocation[], after: StockLocation[]): StockAuditChange[] {
  const old = new Map(before.map(row => [row.key, row]));
  const next = new Map(after.map(row => [row.key, row]));
  return [...new Set([...old.keys(), ...next.keys()])].flatMap(key => {
    const a = old.get(key); const b = next.get(key); const row = b ?? a!;
    if (a && b && a.productId !== b.productId) return [
      { ...a, before: a.current, after: 0, expectedBefore: a.expected, expectedAfter: 0, configuration: true },
      { ...b, before: 0, after: b.current, expectedBefore: 0, expectedAfter: b.expected, configuration: true },
    ];
    if (a?.current === b?.current && a?.expected === b?.expected) return [];
    return [{ key, department: row.department, name: row.name, productId: row.productId,
      before: a?.current ?? 0, after: b?.current ?? 0, expectedBefore: a?.expected ?? 0, expectedAfter: b?.expected ?? 0, configuration: !a || !b }];
  });
}

export function movementKind(changes: StockAuditChange[]): string {
  if (changes.some(row => row.configuration)) return "Opening / configuration";
  const current = changes.reduce((sum, row) => sum + row.after - row.before, 0);
  const expected = changes.reduce((sum, row) => sum + row.expectedAfter - row.expectedBefore, 0);
  if (changes.some(row => Math.abs((row.after - row.before) - (row.expectedAfter - row.expectedBefore)) > 0.0001)) return "Measurement / discrepancy";
  if (Math.abs(current) < 0.0001 && changes.length > 1) return "Internal transfer";
  return expected < 0 ? "Usage / stock issued" : "External delivery";
}
