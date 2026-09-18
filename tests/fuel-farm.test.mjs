import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFuelFarmEntry } from '../src/data/fuelFarmEntry.ts';

const asset = { assetNumber: 'TEST-1', make: 'CAT', model: '793F', type: 'Haul Truck', status: 'Active' };
const tanks = [{ id: 'farm-1', productId: 'diesel', name: 'Farm 1', currentLitres: 1000, expectedLitres: 950, capacity: 2000 },
  { id: 'farm-2', productId: 'diesel', name: 'Farm 2', currentLitres: 800, capacity: 2000 }];
const input = { assetNumber: 'TEST-1', tankId: 'farm-1', employee: 'Test Operator', litres: 100, smu: 0,
  shift: 'Night Shift', id: 'entry-1', now: new Date('2026-09-19T20:00:00') };

test('fuel farm entry updates the matching live shift, daily register and only the selected tank', () => {
  const schedule = [
    { id: 'day', assetNumber: 'TEST-1', shift: 'Day Shift', status: 'Scheduled' },
    { id: 'night', assetNumber: 'TEST-1', shift: 'Night Shift', status: 'Scheduled', assignedServiceTruckId: 'TRUCK-1' },
  ];
  const next = prepareFuelFarmEntry(input, [asset], tanks, [], schedule);
  assert.equal(next.fuel.length, 1);
  assert.equal(next.fuel[0].fuelSource, 'Fuel Farm');
  assert.equal(next.fuel[0].fuelTankId, 'farm-1');
  assert.equal(next.fuel[0].employee, 'Test Operator');
  assert.equal(next.fuel[0].litres, 100);
  assert.equal(next.tanks[0].currentLitres, 900);
  assert.equal(next.tanks[0].expectedLitres, 850);
  assert.equal(next.tanks[1].currentLitres, 800);
  assert.equal(next.schedule[0].status, 'Scheduled');
  assert.equal(next.schedule[1].status, 'Fuelled');
  assert.equal(next.schedule[1].assignedFuelSource, 'Fuel Farm');
  assert.equal(next.schedule[1].assignedServiceTruckId, null);
  assert.equal(next.schedule[1].smu, 0);
  assert.equal(tanks[0].currentLitres, 1000);
});

test('an unscheduled fuel farm entry appears in the live schedule', () => {
  const next = prepareFuelFarmEntry(input, [asset], tanks, [], []);
  assert.equal(next.schedule[0].status, 'Fuelled');
  assert.equal(next.schedule[0].unscheduled, true);
  assert.equal(next.schedule[0].assignedFuelSource, 'Fuel Farm');
});

test('invalid quantities, insufficient stock, missing sources and unavailable assets cannot produce a save', () => {
  for (const litres of [0, -1, NaN, Infinity, 1001]) {
    assert.throws(() => prepareFuelFarmEntry({ ...input, litres }, [asset], tanks, [], []));
  }
  assert.throws(() => prepareFuelFarmEntry({ ...input, smu: -1 }, [asset], tanks, [], []));
  assert.throws(() => prepareFuelFarmEntry(input, [], tanks, [], []));
  assert.throws(() => prepareFuelFarmEntry(input, [asset], [], [], []));
  assert.throws(() => prepareFuelFarmEntry(input, [{ ...asset, status: 'Maintenance' }], tanks, [], []));
});
