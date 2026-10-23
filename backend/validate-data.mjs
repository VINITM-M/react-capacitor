import fs from "fs";
const db = JSON.parse(fs.readFileSync(new URL("./database/mock-db.json", import.meta.url)));
const expected = JSON.parse(fs.readFileSync(new URL("./source-validation.json", import.meta.url)));
const sum = key => db.capacityStructure.reduce((s,r)=>s + (Number(r[key]) || 0),0);
const countBy = (rows,key) => rows.reduce((out,row)=>{const value=String(row[key]??"").trim();if(value)out[value]=(out[value]||0)+1;return out;},{});
const close=(a,b)=>Math.abs(Number(a)-Number(b))<0.001;
const norm=v=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
const uid=row=>norm(row?.reactorUid??row?.uid);
const mappedUids=new Set(db.mappingTracker.map(uid).filter(Boolean));
const confidenceCounts={};
for(const row of db.mappingTracker){const category=String(row.category||row.planningStatus||"").trim();const reactorUid=uid(row);if(!category||!reactorUid)continue;if(!confidenceCounts[category])confidenceCounts[category]=new Set();confidenceCounts[category].add(reactorUid);}
const confidenceUnique=Object.fromEntries(Object.entries(confidenceCounts).map(([category,uids])=>[category,uids.size]));
const siteCapacitySummary=db.siteTotals.reduce((out,row)=>{for(const key of ["totalCapacity","mappedCapacity","utilizedCapacity","availableCapacity"])out[key]=(out[key]||0)+(Number(row[key])||0);return out;},{});
const productNames=new Set(db.mappingTracker.map(row=>String(row.product||"").trim().toLowerCase()).filter(Boolean));
const actual={capacity:{rows:db.capacityStructure.length,totalCapacity:sum("totalCapacity"),utilization:sum("utilization"),mapped:sum("mapped"),available:sum("available")},siteCapacitySummary,productInformation:{uniqueProductNames:productNames.size},inventory:{equipmentRows:db.equipment.length,uniqueUids:new Set(db.equipment.map(uid).filter(Boolean)).size,mappedPhysicalRecords:db.equipment.filter(row=>mappedUids.has(uid(row))).length,unassignedPhysicalRecords:db.equipment.filter(row=>!mappedUids.has(uid(row))).length,individualCapacitySumKL:db.equipment.reduce((sum,row)=>sum+(Number(row.capacity)||0),0)/1000},mappingTracker:{records:db.mappingTracker.length,uniqueMappedPhysicalRecords:mappedUids.size,confidenceUnique},equipmentBySite:countBy(db.equipment,"site"),mappingBySite:countBy(db.mappingTracker,"site"),volume:{total:0,mapped:0,utilized:0,available:0}};
const checks=[
 ["source capacity rows",actual.capacity.rows===expected.capacity.rows],
 ["source total capacity",close(actual.capacity.totalCapacity,expected.capacity.totalCapacity)],
 ["source utilized capacity",close(actual.capacity.utilization,expected.capacity.utilization)],
 ["source mapped capacity",close(actual.capacity.mapped,expected.capacity.mapped)],
 ["source available capacity",close(actual.capacity.available,expected.capacity.available)],
 ["source inventory row count",actual.inventory.equipmentRows===expected.inventory.equipmentRows],
 ["workbook schedule intervals",actual.mappingTracker.records===expected.mappingTracker.records],
 ["planning confidence counts by physical UID",JSON.stringify(Object.fromEntries(Object.entries(actual.mappingTracker.confidenceUnique).sort(([a],[b])=>a.localeCompare(b))))===JSON.stringify(Object.fromEntries(Object.entries(expected.planningProbability.uniqueReactors).sort(([a],[b])=>a.localeCompare(b))))],
 ["physical inventory UIDs reconcile",actual.inventory.uniqueUids===actual.inventory.equipmentRows],
 ["physical inventory mapping count",actual.inventory.mappedPhysicalRecords===expected.inventory.mappedPhysicalRecords],
 ["physical inventory available count",actual.inventory.unassignedPhysicalRecords===expected.inventory.unassignedPhysicalRecords],
 ["mapped + available reconciles to total",actual.inventory.mappedPhysicalRecords+actual.inventory.unassignedPhysicalRecords===actual.inventory.equipmentRows],
 ["source capacity discrepancy remains documented",close(actual.inventory.individualCapacitySumKL-actual.capacity.totalCapacity,expected.inventory.differenceFromCapacitySummaryKL)],
 ["site capacity summary matches capacity structure",close(actual.siteCapacitySummary.totalCapacity,actual.capacity.totalCapacity)&&close(actual.siteCapacitySummary.mappedCapacity,actual.capacity.mapped)&&close(actual.siteCapacitySummary.utilizedCapacity,actual.capacity.utilization)&&close(actual.siteCapacitySummary.availableCapacity,actual.capacity.available)],
 ["capacity summary components reconcile",close(actual.capacity.mapped+actual.capacity.available,actual.capacity.totalCapacity)&&actual.capacity.utilization<=actual.capacity.mapped],
 ["unique mapped Product Name count",actual.productInformation.uniqueProductNames===expected.productInformation.uniqueProductNames],
 ["equipment by site",JSON.stringify(actual.equipmentBySite)===JSON.stringify(expected.equipmentBySite)],
 ["mapping intervals by site",JSON.stringify(actual.mappingBySite)===JSON.stringify(expected.mappingBySite)],
 ["capacity source is locked",db.meta?.capacitySourceLocked===true],
 ["platform schedule source bundled",fs.existsSync(new URL("./source-data/platform-schedule.xlsx",import.meta.url))],
 ["detailed equipment master bundled",fs.existsSync(new URL("./source-data/master-workbook.xlsx",import.meta.url))],
 ["latest Mapping Tracker source retained",Array.isArray(db.rawSheets?.["Mapping Tracker"]) && db.rawSheets["Mapping Tracker"].length>250]
];
for(const [name,pass] of checks)console.log(`${pass?"PASS":"FAIL"} ${name}`);
if(checks.some(([,pass])=>!pass))process.exit(1);
