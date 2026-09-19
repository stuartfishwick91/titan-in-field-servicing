import { readSharedItem, writeSharedItem, type SharedDocuments } from "../cloud/sharedStorage";
import { defaultBulkTanks, loadBulkTanks, saveBulkTanks, productIdForName, type BulkTankRecord } from "./bulkTankStore";
import { defaultWorkshopStock, loadWorkshopStock, saveWorkshopStock, type WorkshopStockRecord } from "./workshopStore";
import { defaultServiceTrucks, loadServiceTrucks, saveServiceTrucks, type ServiceTruckRecord } from "./serviceTruckStore";
import { inventoryChanges, type StockLocation, type StockAudit } from "./siteInventoryModel";

export type FacilityStock = { id: string; department: "Field" | "Light Vehicles"; name: string; productId: string; current: number; expected: number; capacity: number };
export const facilitiesKey = "titan-site-facilities-v1";
export const stockAuditKey = "titan-site-stock-audit-v1";
export function loadFacilities(): FacilityStock[] { return JSON.parse(readSharedItem(facilitiesKey) ?? "[]"); }
export function saveFacilities(rows: FacilityStock[]) { writeSharedItem(facilitiesKey, JSON.stringify(rows)); window.dispatchEvent(new Event("titan-site-stock-updated")); }
export function loadStockAudit(): StockAudit[] { return JSON.parse(readSharedItem(stockAuditKey) ?? "[]"); }

function rowsFrom(bulk: BulkTankRecord[], workshop: WorkshopStockRecord[], trucks: ServiceTruckRecord[], facilities: FacilityStock[]): StockLocation[] {
  return [
    ...bulk.map(t => ({ key: `bulk:${t.id}`, department: "Bulk Storage" as const, name: t.name, productId: t.productId, current: t.currentLitres, expected: t.expectedLitres ?? t.currentLitres, capacity: t.capacity })),
    ...workshop.map(t => ({ key: `workshop:${t.id}`, department: "Workshop" as const, name: t.name, productId: t.productId, current: t.current, expected: t.expectedLitres ?? t.current, capacity: t.capacity })),
    ...trucks.flatMap(t => t.oilGroups.map(g => ({ key: `truck:${t.truckId}:${g.id ?? g.name}`, department: "Service Trucks" as const, name: `${t.truckId} — ${g.name}`, productId: g.productId ?? productIdForName(g.name), current: g.current, expected: g.expectedLitres ?? g.current, capacity: g.capacity }))),
    ...facilities.map(t => ({ ...t, key: `facility:${t.id}` })),
  ];
}
export function loadSiteStock() { return rowsFrom(loadBulkTanks(), loadWorkshopStock(), loadServiceTrucks(), loadFacilities()); }
export function saveSiteStock(rows: StockLocation[]) {
  const byKey = new Map(rows.map(row => [row.key, row]));
  saveBulkTanks(loadBulkTanks().map(t => { const row = byKey.get(`bulk:${t.id}`)!; return { ...t, currentLitres: row.current, expectedLitres: row.expected }; }));
  saveWorkshopStock(loadWorkshopStock().map(t => { const row = byKey.get(`workshop:${t.id}`)!; return { ...t, current: row.current, expectedLitres: row.expected }; }));
  saveServiceTrucks(loadServiceTrucks().map(t => ({ ...t, oilGroups: t.oilGroups.map((g, index) => {
    const row = byKey.get(`truck:${t.truckId}:${g.id ?? g.name}`)!; return { ...g, current: row.current, expectedLitres: row.expected };
  }) })));
  saveFacilities(loadFacilities().map(t => { const row = byKey.get(`facility:${t.id}`)!; return { ...t, current: row.current, expected: row.expected }; }));
}

function documentStock(documents: SharedDocuments) {
  return rowsFrom(
    JSON.parse(documents["titan-bulk-tanks-v1"] ?? JSON.stringify(defaultBulkTanks)),
    JSON.parse(documents["titan-workshop-stock-v1"] ?? JSON.stringify(defaultWorkshopStock)),
    JSON.parse(documents["titan-service-trucks-v1"] ?? JSON.stringify(defaultServiceTrucks)),
    JSON.parse(documents[facilitiesKey] ?? "[]"),
  );
}
// Runs once for the complete action, including employee entries and old management screens.
// Uses the committed baseline, so failed/retried saves cannot create extra audit rows.
export function withStockAudit(before: SharedDocuments, after: SharedDocuments, user: string, id: string): SharedDocuments {
  const changes = inventoryChanges(documentStock(before), documentStock(after));
  if (!changes.length) return after;
  const history: StockAudit[] = JSON.parse(before[stockAuditKey] ?? "[]");
  return { ...after, [stockAuditKey]: JSON.stringify([{ id, at: new Date().toISOString(), user, changes }, ...history]) };
}
