import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyActivity, activityPeriod } from '../src/data/dailyActivity.ts';
const date='20 Sept 2026';
const fuel=[{id:'f1',date,shift:'Day Shift',employee:'A',asset:'TR1',litres:100,submitted:true},{id:'f2',date,shift:'Day Shift',employee:'A',asset:'tr1',litres:50,submitted:true},{id:'old',date:'19 Sept 2026',shift:'Day Shift',employee:'A',asset:'TR2',litres:1000,submitted:true}];
const service=[{id:'s1',date,shift:'Day Shift',employee:'A',assetNumber:'TR1',oils:[{product:'Engine Oil',litres:10},{product:'Coolant',litres:4}],submitted:false},{id:'s2',date,employee:'B',assetNumber:'TR2',oils:[{product:'Hydraulic Oil',litres:3}],submitted:true}];
const change=(key,department,before,after,productId='engine')=>({key,department,name:key,productId,before,after,expectedBefore:before,expectedAfter:after,configuration:false});
const audit=[
 {id:'transfer',at:'2026-09-20T00:00:00Z',user:'A',changes:[change('bulk:e','Bulk Storage',1000,900),change('truck:A:e','Service Trucks',50,100),change('workshop:e','Workshop',50,100)]},
 {id:'delivery',at:'2026-09-20T01:00:00Z',user:'A',changes:[change('bulk:e','Bulk Storage',900,1100)]},
 {id:'dip',at:'2026-09-20T02:00:00Z',user:'A',changes:[{...change('bulk:e','Bulk Storage',1100,1090),expectedAfter:1100}]},
 {id:'opening',at:'2026-09-20T03:00:00Z',user:'A',changes:[{...change('facility:e','Field',0,100),configuration:true}]},
];
test('daily totals use fuel register once, service oils once and unique machines',()=>{
 const result=dailyActivity(fuel,service,audit,date,'Day Shift');
 assert.equal(result.fuelUsed,150);assert.equal(result.oilUsed,10);assert.equal(result.coolantUsed,4);assert.equal(result.machinesFuelled,1);assert.equal(result.machinesServiced,1);
 assert.equal(result.employeesSubmitted,0);assert.equal(result.employeesOutstanding,1);
 assert.equal(result.serviceTrucksRefilled,1);assert.equal(result.workshopRefills,1);assert.equal(result.bulkDeliveries,1);assert.equal(result.movements.length,3);
});
test('unknown shifts remain in all-shift totals and dates do not leak',()=>{
 const all=dailyActivity(fuel,service,audit,date);assert.equal(all.oilUsed,13);assert.equal(all.unassignedShiftRecords,1);assert.equal(all.employeesSubmitted,1);
 const night=dailyActivity(fuel,service,audit,date,'Night Shift');assert.equal(night.fuelUsed,0);assert.equal(night.oilUsed,0);assert.equal(night.movements.length,0);
 const empty=dailyActivity(fuel,service,audit,'21 Sept 2026');assert.equal(empty.fuelUsed,0);assert.equal(empty.employeesOutstanding,0);
});
test('Brisbane midnight and shift boundaries classify movement timestamps correctly',()=>{
 assert.deepEqual(activityPeriod('2026-09-19T14:00:00Z'),{date,shift:'Night Shift'});
 assert.equal(activityPeriod('2026-09-19T20:00:00Z').shift,'Day Shift');
 assert.equal(activityPeriod('2026-09-20T08:00:00Z').shift,'Night Shift');
 assert.equal(activityPeriod('bad'),null);
});
