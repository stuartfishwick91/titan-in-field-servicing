import test from 'node:test';
import assert from 'node:assert/strict';
import {submissionReportRows,submissionHeaders,csvReport,submissionWorkbook,markPeriodSubmitted} from '../src/data/submissionReports.ts';
const date='20 Sept 2026';
const service={id:'s1',date,shift:'Day Shift',employee:'A',assetNumber:'EX1',workOrder:'WO-123 & 4',workArea:'Field',smu:100,fuelAdded:50,fuelSource:'Field Storage',oils:[{product:'Engine Oil',litres:10,source:'Field Storage',sourceLocation:'Field',comments:'Oil check'}],comments:'Job complete',submitted:true};
const fuel={id:'f1',date,shift:'Day Shift',employee:'A',asset:'EX1',smu:100,litres:50,fuelSource:'Field Storage',submitted:true,locked:true,serviceEntryId:'s1'};
test('saved work orders reach the same period report and both downloadable formats',()=>{
 const rows=submissionReportRows([fuel],[service],date,'Day Shift');
 assert.equal(rows.length,2);assert.equal(rows[0][6],service.workOrder);assert.equal(rows[1][6],service.workOrder);
 assert.equal(rows.reduce((sum,row)=>sum+row[10],0),60);
 const csv=csvReport(submissionHeaders,rows);assert.ok(csv.includes('Work Order'));assert.ok(csv.includes('WO-123 & 4'));
 const xml=submissionWorkbook(rows,date);assert.ok(xml.includes('WO-123 &amp; 4'));assert.ok(xml.includes('<Data ss:Type="Number">10</Data>'));
});
test('oil-only services export, repeated asset work orders stay separate, and unrelated periods are excluded',()=>{
 const services=[service,{...service,id:'s2',workOrder:'WO-999',fuelAdded:0},{...service,id:'old',date:'19 Sept 2026'},{...service,id:'night',shift:'Night Shift'}];
 const rows=submissionReportRows([],services,date,'Day Shift');assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row[6]),['WO-123 & 4','WO-999']);
 assert.equal(submissionReportRows([],services,date,'Day Shift','Workshop Storage').length,0);
 const legacy=submissionReportRows([{...fuel,serviceEntryId:undefined}],services,date,'Day Shift');assert.equal(legacy[0][6],'');
});
test('Home and Daily Sheet submission helper only marks the current employee and period',()=>{
 const rows=[{...service,submitted:false},{...service,id:'old',date:'19 Sept 2026',submitted:false},{...service,id:'other',employee:'B',submitted:false},{...service,id:'night',shift:'Night Shift',submitted:false}];
 const submitted=markPeriodSubmitted(rows,'A',date,'Day Shift');assert.deepEqual(submitted.map(row=>row.submitted),[true,false,false,false]);assert.equal(rows[0].submitted,false);
 assert.equal(submissionReportRows([],submitted,date,'Day Shift')[0][11],'Submitted');
});
test('spreadsheet exports keep user content as text and escape delimiters',()=>{
 assert.ok(csvReport(['Work Order'],[['=1+1']]).includes("'="));
 assert.ok(csvReport(['Comments'],[['a,"b"\nc']]).includes('a,""b""\nc'));
 assert.ok(submissionWorkbook([['<test>']],date).includes('&lt;test&gt;'));
});
