import test from "node:test";
import assert from "node:assert/strict";
import { stockLevel, stockAlerts } from "../src/data/stockLevelAlerts.ts";
const settings = { bulkLowLevelPercent: 30, bulkCriticalLevelPercent: 15, workshopLowLevelPercent: 30, workshopCriticalLevelPercent: 15, serviceTruckLowLevelPercent: 30, serviceTruckCriticalLevelPercent: 15, bulkWasteOilWarningPercent: 70, bulkWasteOilCriticalPercent: 90, workshopWasteOilWarningPercent: 70, workshopWasteOilCriticalPercent: 90 };
const row = (department, current, productId = "engine-15w40", key = department) => ({key,department,name:key,current,expected:current,capacity:1000,productId});
for (const department of ["Bulk Storage", "Workshop", "Service Trucks", "Field", "Light Vehicles"]) {
  test(`${department}: precise low/critical boundaries and refill recovery`, () => {
    for (const [litres,tone] of [[0,"critical"],[149.9,"critical"],[150,"critical"],[150.1,"warning"],[300,"warning"],[300.1,"normal"],[1000,"normal"]]) assert.equal(stockLevel(row(department,litres), settings),tone);
    assert.equal(stockAlerts([row(department,100)],settings).length,1);
    assert.equal(stockAlerts([row(department,600)],settings).length,0);
  });
  test(`${department}: waste oil alerts only at high levels`, () => {
    for (const [litres,tone] of [[0,"normal"],[699.9,"normal"],[700,"warning"],[899.9,"warning"],[900,"critical"],[1000,"critical"]]) assert.equal(stockLevel(row(department,litres,"waste-oil"),settings),tone);
  });
}
test("same-product compartments keep separate alerts; healthy stock does not conceal a low tank", () => {
  const alerts=stockAlerts([row("Field",100,"engine-15w40","a"),row("Field",250,"engine-15w40","b"),row("Field",1000,"engine-15w40","c")],settings);
  assert.deepEqual(alerts.map(a=>[a.id,a.severity]),[["a","critical"],["b","warning"]]);
});
test("custom thresholds and invalid capacities", () => {
  assert.equal(stockLevel(row("Field",350),{...settings,workshopLowLevelPercent:40}),"warning");
  assert.equal(stockLevel(row("Service Trucks",350),{...settings,serviceTruckLowLevelPercent:40}),"warning");
  assert.equal(stockLevel({...row("Bulk Storage",0),capacity:0},settings),"normal");
});
