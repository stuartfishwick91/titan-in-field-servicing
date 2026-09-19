import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStockOperation, summarizeSiteStock, inventoryChanges, movementKind } from '../src/data/siteInventoryModel.ts';

const initial = [
  { key: 'bulk', department: 'Bulk Storage', name: 'Bulk engine oil', productId: 'engine', current: 1000, expected: 1050, capacity: 2000 },
  { key: 'workshop', department: 'Workshop', name: 'Workshop engine oil', productId: 'engine', current: 100, expected: 100, capacity: 500 },
  { key: 'field', department: 'Field', name: 'Field engine oil', productId: 'engine', current: 50, expected: 50, capacity: 500 },
  { key: 'lv', department: 'Light Vehicles', name: 'LV engine oil', productId: 'engine', current: 60, expected: 60, capacity: 200 },
  { key: 'truck', department: 'Service Trucks', name: 'Truck engine oil', productId: 'engine', current: 80, expected: 80, capacity: 300 },
  { key: 'waste', department: 'Workshop', name: 'Waste oil', productId: 'waste-oil', current: 40, expected: 40, capacity: 300 },
];
test('transfers conserve site stock and preserve the original shortage through every department', () => {
  let rows = initial;
  for (const [source, destination] of [['bulk','workshop'],['workshop','field'],['field','lv'],['lv','truck']]) {
    const next = applyStockOperation(rows, { kind: 'transfer', source, destination, litres: 20 });
    assert.deepEqual(summarizeSiteStock(next), summarizeSiteStock(initial));
    assert.equal(movementKind(inventoryChanges(rows,next)), 'Internal transfer');
    rows = next;
  }
  assert.equal(summarizeSiteStock(rows)[0].shortage, 50);
  assert.equal(initial[0].current, 1000);
});
test('delivery and usage change site totals, while dips expose discrepancies without changing expected stock', () => {
  let rows = applyStockOperation(initial, { kind: 'delivery', source: 'bulk', litres: 200 });
  assert.equal(summarizeSiteStock(rows)[0].current, 1490);
  rows = applyStockOperation(rows, { kind: 'usage', source: 'field', litres: 10 });
  assert.equal(summarizeSiteStock(rows)[0].current, 1480);
  const beforeDip = rows;
  rows = applyStockOperation(rows, { kind: 'dip', source: 'workshop', litres: 90 });
  assert.equal(summarizeSiteStock(rows)[0].shortage, 60);
  assert.equal(rows.find(row => row.key === 'workshop').expected, 100);
  assert.equal(movementKind(inventoryChanges(beforeDip, rows)), 'Measurement / discrepancy');
  assert.equal(summarizeSiteStock(rows).find(row => row.productId === 'waste-oil').current, 40);
});
test('a surplus in another location does not hide shortages', () => {
  const rows = applyStockOperation(initial, { kind: 'dip', source: 'workshop', litres: 150 });
  const total = summarizeSiteStock(rows)[0];
  assert.equal(total.current, total.expected);
  assert.equal(total.shortage, 50);
  assert.equal(total.surplus, 50);
});
test('invalid, overfilled, cross-product and insufficient-stock transfers are rejected before any write', () => {
  for (const operation of [
    { kind: 'transfer', source: 'bulk', destination: 'waste', litres: 10 },
    { kind: 'transfer', source: 'bulk', destination: 'lv', litres: 150 },
    { kind: 'transfer', source: 'field', destination: 'bulk', litres: 51 },
    { kind: 'transfer', source: 'bulk', destination: 'bulk', litres: 10 },
    { kind: 'delivery', source: 'bulk', litres: Infinity },
    { kind: 'usage', source: 'field', litres: -10 },
  ]) assert.throws(() => applyStockOperation(initial, operation));
});
