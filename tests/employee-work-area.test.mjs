import test from 'node:test';
import assert from 'node:assert/strict';
import { workAreaTabs, areaOilSource, prepareAreaUsage } from '../src/data/employeeWorkArea.ts';
const rows = [
  { key:'workshop:w', department:'Workshop', name:'Workshop', productId:'engine', current:100, expected:110, capacity:200 },
  { key:'facility:f', department:'Field', name:'Field', productId:'engine', current:80, expected:80, capacity:200 },
  { key:'truck:A:e', department:'Service Trucks', name:'A oil', productId:'engine', current:60, expected:60, capacity:200 },
  { key:'truck:B:e', department:'Service Trucks', name:'B oil', productId:'engine', current:70, expected:70, capacity:200 },
  { key:'truck:A:d', department:'Service Trucks', name:'A diesel', productId:'diesel', current:90, expected:90, capacity:200 },
];
test('work area navigation stays focused and respects schedule access', () => {
  assert.deepEqual(workAreaTabs('Fuel Farm',true),['home','fuelFarm','daily']);
  for (const area of ['Workshop','Field']) assert.deepEqual(workAreaTabs(area,true),['home','service','refills']);
  assert.deepEqual(workAreaTabs('Service Truck',true),['home','service','fuelSchedule','refills','daily']);
  assert.equal(workAreaTabs('Service Truck',false).includes('fuelSchedule'),false);
  assert.equal(areaOilSource('Field'),'Field Storage');
});
test('service usage deducts only selected work area and preserves discrepancies', () => {
  const workshop=prepareAreaUsage(rows,'Workshop','A',[{product:'engine',litres:10}]);
  assert.equal(workshop[0].current,90); assert.equal(workshop[0].expected,100);
  assert.deepEqual(workshop.slice(1), rows.slice(1));
  const field=prepareAreaUsage(rows,'Field','A',[{product:'engine',litres:10}]);
  assert.equal(field[1].current,70); assert.deepEqual(field[0],rows[0]);
  const truck=prepareAreaUsage(rows,'Service Truck','A',[{product:'engine',litres:5},{product:'diesel',litres:20}]);
  assert.equal(truck[2].current,55); assert.equal(truck[4].current,70); assert.deepEqual(truck[3],rows[3]);
});
test('missing, ambiguous or insufficient stock rejects the complete operation without mutation', () => {
  const before=structuredClone(rows);
  assert.throws(()=>prepareAreaUsage(rows,'Service Truck','missing',[{product:'engine',litres:1}]));
  assert.throws(()=>prepareAreaUsage(rows,'Service Truck','A',[{product:'engine',litres:10},{product:'diesel',litres:100}]));
  assert.throws(()=>prepareAreaUsage([...rows,{...rows[1],key:'facility:other'}],'Field','',[{product:'engine',litres:1}]));
  assert.throws(()=>prepareAreaUsage(rows,'Field','',[{product:'engine',litres:NaN}]));
  assert.deepEqual(rows,before);
});
