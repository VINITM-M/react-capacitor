import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import {
 readDatabase,
 writeDatabase,
} from "./database/mockDatabase.js";
const app = express();
const PORT = 4000;
const HOST = "127.0.0.1";
app.use(cors());
app.use(express.json({ limit: "10mb" }));
/* =========================================================
  DATABASE
  ========================================================= */
async function readDB() {
 const db = await readDatabase();
 if (!Array.isArray(db.equipment)) {
   db.equipment = [];
 }
 if (!Array.isArray(db.mappingTracker)) {
   db.mappingTracker = [];
 }
 if (!Array.isArray(db.capacityStructure)) {
   db.capacityStructure = [];
 }
 if (!Array.isArray(db.maintenance)) {
   db.maintenance = [];
 }
 if (!Array.isArray(db.audit)) {
   db.audit = [];
 }
 if (!Array.isArray(db.clientInformation)) {
   db.clientInformation = [];
 }
 if (!db.rawSheets || typeof db.rawSheets !== "object") {
   db.rawSheets = {};
 }
 if(!Array.isArray(db.deletedEquipment)){
  db.deletedEquipment=[];
 }
 /*
   Give every reactor a permanent UID.
   This is important because some imported reactor IDs
   are duplicated.
 */
 let changed = false;
 for (const reactor of db.equipment) {
   if (!reactor.uid) {
     reactor.uid = randomUUID();
     changed = true;
   }
   if (!reactor.equipmentId) {
     reactor.equipmentId = reactor.uid;
     changed = true;
   }
   const normalizedSite = canonicalSite(reactor.site);
   if (reactor.site !== normalizedSite) {
     reactor.site = normalizedSite;
     changed = true;
   }
   const normalizedCapacity = parseNumber(reactor.capacity);
   if (reactor.capacity !== normalizedCapacity) {
     reactor.capacity = normalizedCapacity;
     changed = true;
   }
   if (!reactor.status) {
     reactor.status = "Available";
     changed = true;
   }
   const derivedProjectCodes = Array.isArray(reactor.projectCodes)
     ? reactor.projectCodes.map(cleanText).filter(Boolean)
     : splitProjectCodes(reactor.projectMapped);
   if (JSON.stringify(reactor.projectCodes || []) !== JSON.stringify(derivedProjectCodes)) {
     reactor.projectCodes = derivedProjectCodes;
     changed = true;
   }
   if (reactor.status === "Reserved") {
     reactor.status = "Available";
     // Reserved is an operational status, not master-data mapping. Restore the
     // source Project Mapped value when one exists.
     if (!reactor.sourceProjectMapped) reactor.projectMapped = "";
     changed = true;
   }
 }
 const probabilityValues = new Set(["Confirmed", "High Probable", "Visible"]);
 for (const mapping of db.mappingTracker) {
   const linked = mapping.reactorUid ? findEquipmentByUid(db, mapping.reactorUid) : findEquipmentById(db, mapping.reactorId);
   if (linked) {
     if (!probabilityValues.has(cleanText(mapping.category)) && probabilityValues.has(cleanText(linked.planningStatus))) { mapping.category = cleanText(linked.planningStatus); changed = true; }
     if (!mapping.block && linked.block) { mapping.block = linked.block; changed = true; }
     if (!mapping.area && linked.area) { mapping.area = linked.area; changed = true; }
     if (!mapping.moc && linked.moc) { mapping.moc = linked.moc; changed = true; }
     if (!mapping.agitator && linked.agitator) { mapping.agitator = linked.agitator; changed = true; }
   }
   if (!mapping.productCode && mapping.product) { mapping.productCode = cleanText(mapping.product); changed = true; }
   if (!mapping.stage && mapping.productCode) {
     const derived = stageFromProductCode(mapping.productCode);
     if (derived) { mapping.stage = derived; changed = true; }
   }
 }
 for (const row of db.capacityStructure) {
   const normalizedSite = canonicalSite(row.site);
   if (row.site !== normalizedSite) { row.site = normalizedSite; changed = true; }
   for (const key of ["totalCapacity", "utilization", "mapped", "available"]) {
     const normalized = parseNumber(row[key]);
     if (row[key] !== normalized && row[key] != null) { row[key] = normalized; changed = true; }
   }
 }
 /*
   Make historical Mapping Tracker records reflect
   the reactor status.
 */
 if (syncHistoricalStatuses(db)) {
   changed = true;
 }
 const derivedBefore = JSON.stringify(db.capacityStructure || []);
 recalculateDerivedCapacity(db);
 if (JSON.stringify(db.capacityStructure || []) !== derivedBefore) changed = true;
 if (changed) {
   await writeDatabase(db);
 }
 return db;
}
async function writeDB(data) {
 return await writeDatabase(data);
}
/* =========================================================
  HELPERS
  ========================================================= */
function now() {
 return new Date().toISOString();
}
function cleanText(value) {
 const text = String(value ?? "").trim();
 return !text || /^\s*[-‐‑‒–—−]\s*$/u.test(text) ? "" : text;
}
function splitProjectCodes(value) {
 const raw = cleanText(value);
 if (!raw) return [];
 const parts = raw.split(/\s*(?:,|;|&|\band\b|\/)\s*/i).map(cleanText).filter(Boolean);
 const seen = new Set();
 return parts.filter(part => {
   const key = normalizeId(part);
   if (!key || seen.has(key)) return false;
   seen.add(key);
   return true;
 });
}
function number(value) {
 return parseNumber(value);
}
function normalizeId(value) {
 return String(value ?? "")
   .trim()
   .toLowerCase()
   .replace(/[^a-z0-9]/g, "");
}
function canonicalSite(value) {
 const raw = cleanText(value);
 const key = normalizeId(raw);
 const sites = {
   cto2: "CTO-2",
   cto3: "CTO-3",
   cto4: "CTO-4",
   cto5: "CTO-5",
   cto6: "CTO-6",
   ctosez: "CTO-SEZ",
   mexico: "Mexico",
   mirfield: "Mirfield",
 };
 return sites[key] || raw;
}
function parseNumber(value) {
 if (typeof value === "number" && Number.isFinite(value)) return value;
 if (value === null || value === undefined || value === "") return 0;
 const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
 return match ? Number(match[0]) : 0;
}
function dateOnly(value) {
 const raw = cleanText(value);
 if (!raw) return "";
 const d = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
 if (Number.isNaN(d.getTime())) return "";
 return d.toISOString().slice(0, 10);
}
function localTodayISO() {
 const d = new Date();
 const year = d.getFullYear();
 const month = String(d.getMonth() + 1).padStart(2, "0");
 const day = String(d.getDate()).padStart(2, "0");
 return `${year}-${month}-${day}`;
}
function capacityKL(value) {
 return +(number(value) / 1000).toFixed(3);
}
function sameText(a, b) {
 return normalizeId(a) === normalizeId(b);
}

function validDateRange(startValue, endValue) {
 const start = new Date(`${cleanText(startValue)}T00:00:00`);
 const end = new Date(`${cleanText(endValue)}T00:00:00`);
 if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
 if (start > end) return null;
 return { start, end };
}

function dateRangesOverlap(startA, endA, startB, endB) {
 const a = validDateRange(startA, endA);
 const b = validDateRange(startB, endB);
 if (!a || !b) return false;
 return a.start <= b.end && b.start <= a.end;
}

function mappingOverlapsRange(mapping, start, end, excludeId = '') {
 if (!mapping?.startDate || !mapping?.endDate) return false;
 if (excludeId && String(mapping.id) === String(excludeId)) return false;
 return dateRangesOverlap(mapping.startDate, mapping.endDate, start, end);
}

function maintenanceOverlapsRange(db, reactor, start, end) {
 return (db.maintenance || []).some(item => {
   const sameReactor = item.reactorUid
     ? String(item.reactorUid) === String(reactor.uid)
     : sameText(item.reactorId, reactor.id);
   if (!sameReactor) return false;
   const status = cleanText(item.status).toLowerCase();
   if (status === 'completed' || status === 'cancelled') return false;
   return dateRangesOverlap(item.startDate, item.endDate, start, end);
 });
}
/* =========================================================
  AUDIT
  ========================================================= */
function addAudit(db, action) {
 db.audit.unshift({
   id: `AUD-${Date.now()}`,
   timestamp: now(),
   user: "Local Operator",
   ip: "127.0.0.1",
   action,
 });
 db.audit = db.audit.slice(0, 100);
}
/* =========================================================
  EQUIPMENT LOOKUP
  ========================================================= */
function findEquipmentByUid(db, uid) {
 return db.equipment.find(
   reactor =>
     String(reactor.uid) === String(uid)
 );
}
function findEquipmentById(db, id) {
 const requested = normalizeId(id);
 return db.equipment.find(reactor => {
   if (sameText(reactor.id, id)) return true;
   // Some source rows list paired reactor IDs in one cell, e.g. "3000227/3000228".
   // Resolve either alias to the source row without inventing extra inventory rows.
   return String(reactor.id || "").split(/[\/,&;]|\band\b/i).some(part => normalizeId(part) === requested);
 });
}
function findEquipment(db, identifier) {
 return (
   findEquipmentByUid(db, identifier) ||
   findEquipmentById(db, identifier)
 );
}
/* =========================================================
  HISTORICAL MAPPING MATCHING
  ========================================================= */
function mappingMatchesEquipment(mapping, equipment) {
 if (!mapping || !equipment) return false;
 if (mapping.reactorUid) {
   return String(mapping.reactorUid) === String(equipment.uid);
 }
 const mappingId = normalizeId(mapping.reactorId);
 if (!mappingId || ["reactor", "equipment", "na", "none"].includes(mappingId)) return false;
 const identifiers = [
   equipment.id,
   equipment.sapCode,
   equipment.equipmentType,
 ].filter(Boolean).map(normalizeId);
 return identifiers.includes(mappingId);
}

/* =========================================================
  HISTORICAL STATUS SYNC
  ========================================================= */
function syncHistoricalStatuses(db) {
 let changed = false;
 const mappings = Array.isArray(db.mappingTracker) ? db.mappingTracker : [];
 const today = localTodayISO();

 for (const reactor of db.equipment || []) {
   const historicalMappings = mappings.filter(mapping => mappingMatchesEquipment(mapping, reactor));
   const activeMaintenance = (db.maintenance || []).some(item => {
     const sameReactor = item.reactorUid
       ? String(item.reactorUid) === String(reactor.uid)
       : sameText(item.reactorId, reactor.id) && (!item.site || sameText(item.site, reactor.site));
     if (!sameReactor) return false;
     const status = cleanText(item.status).toLowerCase();
     if (["completed", "cancelled"].includes(status)) return false;
     return dateRangesOverlap(item.startDate, item.endDate, today, today);
   });
   const sourceProject = cleanText(reactor.sourceProjectMapped || reactor.projectMapped);
   const hasAssignment = historicalMappings.length > 0 || Boolean(sourceProject);
   const nextStatus = activeMaintenance ? "Maintenance" : hasAssignment ? "Mapped" : "Available";
   if (reactor.status !== nextStatus) { reactor.status = nextStatus; changed = true; }

   // Keep useful assignment information even when its scheduled window is not today.
   // Exact availability for a selected date range is computed by the Availability page.
   const representativeMapping = historicalMappings.find(mapping =>
     mapping.startDate && mapping.endDate && dateRangesOverlap(mapping.startDate, mapping.endDate, today, today)
   ) || historicalMappings.filter(mapping => mapping.startDate && mapping.startDate >= today)
       .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0]
     || historicalMappings.slice().sort((a, b) => String(b.endDate || "").localeCompare(String(a.endDate || "")))[0];

   if (hasAssignment) {
     const project = sourceProject || cleanText(representativeMapping?.product || representativeMapping?.productCode || representativeMapping?.project || representativeMapping?.projectName || "Mapped");
     if (project && reactor.projectMapped !== project) { reactor.projectMapped = project; changed = true; }
     if (representativeMapping?.id && reactor.mappingId !== representativeMapping.id) { reactor.mappingId = representativeMapping.id; changed = true; }
     if (representativeMapping?.planningStatus && reactor.planningStatus !== representativeMapping.planningStatus) { reactor.planningStatus = representativeMapping.planningStatus; changed = true; }
   } else {
     if (reactor.projectMapped) { reactor.projectMapped = ""; changed = true; }
     if (reactor.mappingId) { reactor.mappingId = ""; changed = true; }
   }
 }
 return changed;
}
function stageFromProductCode(code) {
 const value = cleanText(code);
 const match = value.match(/(STG|STEP)[-_ ]*(\d+(?:\.\d+)?)/i);
 if (!match) return "";
 return `${match[1].toUpperCase() === "STEP" ? "Step" : "Stage"} ${match[2]}`;
}
function productFamilyFromCode(code) {
 const value = cleanText(code);
 const family = value.replace(/(?:STG|STEP)[-_ ]*\d+(?:\.\d+)?$/i, "").replace(/[-_ ]+$/, "").trim();
 return family || value;
}
function buildMappingOptions(db) {
 const catalogMap = new Map();
 const addCatalog = (code, product, stage, stageCode) => {
   const c = cleanText(code);
   const p = cleanText(product);
   const st = cleanText(stage);
   const sc = cleanText(stageCode);
   if (!c) return;
   const key = normalizeId(c);
   if (!catalogMap.has(key)) {
     catalogMap.set(key, {
       code: c,
       product: p,
       products: new Set(),
       occurrences: 0,
       stages: new Set(),
       stageCodes: new Set(),
       stagesByProduct: new Map(),
     });
   }
   const item = catalogMap.get(key);
   item.occurrences += 1;
   if (p) item.products.add(p);
   if (!item.product && p) item.product = p;
   if (st) {
     item.stages.add(st);
     if (p) {
       const productKey = normalizeId(p);
       if (!item.stagesByProduct.has(productKey)) item.stagesByProduct.set(productKey, new Set());
       item.stagesByProduct.get(productKey).add(st);
     }
   }
   if (sc) item.stageCodes.add(sc);
 };

 for (const row of db.equipment || []) {
   const codes = Array.isArray(row.projectCodes) && row.projectCodes.length
     ? row.projectCodes
     : splitProjectCodes(row.projectMapped || row.productCode || row.product);
   codes.forEach(code => addCatalog(code, row.product, row.stage, row.stageCode));
 }
 for (const row of db.clientInformation || []) {
   const codes = Array.isArray(row.projectCodes) && row.projectCodes.length
     ? row.projectCodes
     : splitProjectCodes(row.projectCode || row.projectMapped || row.product);
   codes.forEach(code => addCatalog(code, row.product, row.stage, row.stageCode));
 }
 // Workbook Mapping Tracker cells are a planning schedule and may contain
 // later-week project codes for the same reactor. They must not be allowed
 // to pollute the master Product -> Product Code catalogue. Only platform
 // mappings created after the workbook import are added here.
 for (const row of db.mappingTracker || []) {
   if (cleanText(row.category).toLowerCase() === "workbook") continue;
   const codes = Array.isArray(row.projectCodes) && row.projectCodes.length
     ? row.projectCodes
     : splitProjectCodes(row.productCode || row.product || row.projectCode || row.project);
   codes.forEach(code => addCatalog(code, row.product, row.stage, row.stageCode));
 }

 const catalog = [...catalogMap.values()]
   .map(item => ({
     code: item.code,
     product: item.product,
     products: [...item.products].sort((a,b) => a.localeCompare(b)),
     stages: [...item.stages].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true})),
     stageCodes: [...item.stageCodes].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true})),
     stagesByProduct: Object.fromEntries([...item.stagesByProduct.entries()].map(([productKey, values]) => [productKey, [...values].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}))])),
     occurrences: item.occurrences,
   }))
   .sort((a,b)=>a.code.localeCompare(b.code, undefined, {numeric:true}));

 const families = new Map();
 for (const item of catalog) {
   for (const product of item.products) {
     const familyKey = normalizeId(product);
     if (!familyKey) continue;
     if (!families.has(familyKey)) families.set(familyKey, { product, codes: new Set(), stages: new Set() });
     const family = families.get(familyKey);
     family.codes.add(item.code);
     const productStages = Array.isArray(item.stagesByProduct?.[familyKey])
       ? item.stagesByProduct[familyKey]
       : [];
     productStages.forEach(stage => family.stages.add(stage));
   }
 }

 const stageValues = new Set();
 const stageCodes = new Set();
 [...(db.equipment || []), ...(db.mappingTracker || []), ...(db.clientInformation || [])].forEach(row => {
   if (cleanText(row.stage)) stageValues.add(cleanText(row.stage));
   if (Array.isArray(row.stages)) row.stages.map(cleanText).filter(Boolean).forEach(stage => stageValues.add(stage));
   if (cleanText(row.stageCode)) stageCodes.add(cleanText(row.stageCode));
 });
 catalog.forEach(item => {
   item.stages.forEach(stage => stageValues.add(stage));
   item.stageCodes.forEach(code => stageCodes.add(code));
 });

 const products = [...families.values()]
   .map(item => ({
     product: item.product,
     codes: [...item.codes].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true})),
     stages: [...item.stages].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true})),
     codeCount: item.codes.size,
   }))
   .sort((a,b)=>a.product.localeCompare(b.product, undefined, {numeric:true}));

 return {
   products,
   productCodes: catalog.map(item => item.code),
   stages: [...stageValues].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true})),
   stageCodes: [...stageCodes].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true})),
   catalog,
 };
}

function recalculateDerivedCapacity(db) {
 // When the uploaded source workbook provides explicit capacity totals, keep those
 // values authoritative. Live mappings/maintenance must not overwrite source totals.
 if (db.meta?.capacitySourceLocked && Array.isArray(db.capacityStructure)) {
   db.siteTotals = buildSiteTotals(db.capacityStructure);
   return db.capacityStructure;
 }
 if (!Array.isArray(db.equipment) || db.equipment.length === 0) return db.capacityStructure || [];
 const groups = new Map();
 for (const reactor of db.equipment || []) {
   const capacity = number(reactor.capacity);
   if (!reactor.site || capacity <= 0) continue;
   const key = `${normalizeId(reactor.site)}|${normalizeId(reactor.block)}|${normalizeId(reactor.area)}`;
   if (!groups.has(key)) groups.set(key, { site: canonicalSite(reactor.site), block: cleanText(reactor.block), area: cleanText(reactor.area), totalCapacity:0, mapped:0, available:0, utilized:0 });
   const g = groups.get(key);
   g.totalCapacity += capacity;
   if (reactor.status === "Mapped") { g.mapped += capacity; g.utilized += capacity; }
   else if (reactor.status === "Available") g.available += capacity;
 }
 const rows = [...groups.values()].map(g => ({
   site:g.site, block:g.block, area:g.area,
   totalCapacity:capacityKL(g.totalCapacity), utilization:capacityKL(g.utilized),
   mapped:capacityKL(g.mapped), available:capacityKL(g.available)
 })).sort((a,b)=>`${a.site}|${a.block}|${a.area}`.localeCompare(`${b.site}|${b.block}|${b.area}`));
 db.capacityStructure = rows;
 db.siteTotals = buildSiteTotals(rows);
 return rows;
}

/* =========================================================
  SITE CAPACITY
  ========================================================= */
function buildCapacityTotals(rows = []) {
 const total = rows.reduce((sum,row)=>sum+number(row.totalCapacity),0);
 const utilization = rows.reduce((sum,row)=>sum+number(row.utilization),0);
 const mapped = rows.reduce((sum,row)=>sum+number(row.mapped),0);
 const available = rows.reduce((sum,row)=>sum+number(row.available),0);
 return { total:+total.toFixed(3), utilization:+utilization.toFixed(3), mapped:+mapped.toFixed(3), available:+available.toFixed(3) };
}

function buildSiteTotals(rows = []) {
 const map = new Map();
 for (const row of rows) {
   const site =
     cleanText(row.site) ||
     "Unknown";
   if (!map.has(site)) {
     map.set(site, {
       site,
       totalCapacity: 0,
       utilizedCapacity: 0,
       mappedCapacity: 0,
       availableCapacity: 0,
       blocks: 0,
       areas: new Set(),
       capacityRows: 0,
     });
   }
   const item =
     map.get(site);
   item.totalCapacity +=
     number(row.totalCapacity);
   item.utilizedCapacity +=
     number(row.utilization);
   item.mappedCapacity +=
     number(row.mapped);
   item.availableCapacity +=
     number(row.available);
   item.capacityRows += 1;
   if (row.block) {
     item.blocks += 1;
   }
   if (row.area) {
     item.areas.add(row.area);
   }
 }
 return [...map.values()]
   .map(item => ({
     site: item.site,
     totalCapacity:
       +item.totalCapacity.toFixed(3),
     utilizedCapacity:
       +item.utilizedCapacity.toFixed(3),
     mappedCapacity:
       +item.mappedCapacity.toFixed(3),
     availableCapacity:
       +item.availableCapacity.toFixed(3),
     blocks: item.blocks,
     areas: [...item.areas],
     capacityRows:
       item.capacityRows,
     utilizationPercent:
       item.totalCapacity
         ? +(
             item.utilizedCapacity /
             item.totalCapacity *
             100
           ).toFixed(1)
         : 0,
   }))
   .sort((a, b) =>
     a.site.localeCompare(b.site)
   );
}
/* =========================================================
  DASHBOARD
  ========================================================= */
app.get(
 "/api/dashboard",
 async (_, res) => {
   try {
     const db =
       await readDB();
     const total =
       Number(db.meta?.totalReactors) || db.equipment.length;
     const available =
       db.equipment.filter(
         x =>
           x.status ===
           "Available"
       ).length;
     const mapped =
       db.equipment.filter(
         x =>
           x.status ===
           "Mapped"
       ).length;
     const maintenance =
       db.equipment.filter(
         x =>
           x.status ===
           "Maintenance"
       ).length;
     const capacityTotals = buildCapacityTotals(db.capacityStructure);
     const totalCapacity = capacityTotals.total;
     const utilized = capacityTotals.utilization;
     const siteTotals =
       buildSiteTotals(
         db.capacityStructure
       );
     res.json({
       total,
       available,
       mapped,
       maintenance,
       utilization:
         totalCapacity
           ? +(
               utilized /
               totalCapacity *
               100
             ).toFixed(1)
           : 0,
       totalCapacity:
         +totalCapacity.toFixed(3),
       utilizedCapacity:
         +utilized.toFixed(3),
       siteTotals,
       sourceCapacity: {
         total: +totalCapacity.toFixed(3),
         utilized: +utilized.toFixed(3),
         mapped: +db.capacityStructure.reduce((sum, row) => sum + number(row.mapped), 0).toFixed(3),
         available: +db.capacityStructure.reduce((sum, row) => sum + number(row.available), 0).toFixed(3),
         utilizationPercent: totalCapacity ? +(utilized / totalCapacity * 100).toFixed(1) : 0,
       },
       lastUpdated: now(),
     });
   } catch (error) {
     console.error(
       "Dashboard error:",
       error
     );
     res.status(500).json({
       error:
         "Failed to load dashboard data.",
     });
   }
 }
);
/* =========================================================
  EQUIPMENT
  ========================================================= */
app.get(
 "/api/equipment",
 async (_, res) => {
   try {
     const db =
       await readDB();
     res.json(
       db.equipment
     );
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to load equipment."
     );
   }
 }
);
/*
 Frontend compatibility.
*/
app.get(
 "/api/reactors",
 async (_, res) => {
   try {
     const db =
       await readDB();
     res.json(
       db.equipment
     );
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to load reactors."
     );
   }
 }
);
/* =========================================================
  ADD REACTOR
  ========================================================= */
app.post(
 "/api/equipment",
 async (req, res) => {
   try {
     const db =
       await readDB();
     const body =
       req.body || {};
     const id =
       cleanText(body.id);
     if (
       !id ||
       !cleanText(body.site) ||
       body.capacity === "" ||
       body.capacity == null
     ) {
       return res.status(400).send(
         "Reactor ID, Site and Capacity are required."
       );
     }
     if (
       db.equipment.some(
         x =>
           sameText(x.id, id)
       )
     ) {
       return res.status(409).send(
         "A reactor with this ID already exists."
       );
     }
     const item = {
       uid: randomUUID(),
       id,
       site:
         canonicalSite(body.site),
       block:
         cleanText(body.block),
       area:
         cleanText(body.area),
       equipmentType:
         cleanText(
           body.equipmentType
         ) || "Reactor",
       sapCode:
         cleanText(
           body.sapCode
         ),
       moc:
         cleanText(body.moc),
       capacity:
         number(
           body.capacity
         ),
       agitator:
         cleanText(
           body.agitator
         ),
       minVolume:
         body.minVolume ?? "",
       maxVolume:
         body.maxVolume ?? "",
       projectMapped:
         cleanText(
           body.projectMapped
         ),
       status:
         cleanText(
           body.status
         ) || "Available",
       sourceSheet:
         "Manual",
     };
     item.equipmentId = item.equipmentId || item.uid;
     db.equipment.push(
       item
     );
     addAudit(
       db,
       `Added reactor ${id}`
     );
     await writeDB(db);
     res.status(201).json(
       item
     );
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to add reactor."
     );
   }
 }
);
/* =========================================================
  UPDATE REACTOR
  ========================================================= */
app.put(
 "/api/equipment/:uid",
 async (req, res) => {
   try {
     const db =
       await readDB();
     const reactor =
       findEquipmentByUid(
         db,
         req.params.uid
       );
     if (!reactor) {
       return res.status(404).send(
         "Reactor not found."
       );
     }
     const index =
       db.equipment.indexOf(
         reactor
       );
     const old =
       db.equipment[index];
     const requestedId = cleanText(req.body.id || old.id);
     if (!requestedId) return res.status(400).send("Reactor ID is required.");
     const duplicateId = db.equipment.some(item => item.uid !== old.uid && sameText(item.site, req.body.site || old.site) && sameText(item.id, requestedId));
     if (duplicateId) return res.status(409).send("That Reactor ID already exists at the selected site.");
     const next = {
       ...old,
       ...req.body,
       uid: old.uid,
       id: requestedId,
       site: canonicalSite(req.body.site || old.site),
       capacity: req.body.capacity == null || req.body.capacity === "" ? old.capacity : number(req.body.capacity),
     };
     if (requestedId !== old.id || !sameText(next.site, old.site)) {
       for (const mapping of db.mappingTracker || []) {
         const linked = mapping.reactorUid ? String(mapping.reactorUid) === String(old.uid) : sameText(mapping.reactorId, old.id) && sameText(mapping.site, old.site);
         if (linked) { mapping.reactorId = requestedId; mapping.site = next.site; mapping.block = next.block || mapping.block; mapping.area = next.area || mapping.area; }
       }
       for (const item of db.maintenance || []) {
         const linked = item.reactorUid ? String(item.reactorUid) === String(old.uid) : sameText(item.reactorId, old.id) && sameText(item.site, old.site);
         if (linked) { item.reactorId = requestedId; item.site = next.site; }
       }
       for (const item of db.clientInformation || []) {
         const ids = String(item.reactorId || "").split(/\s*,\s*/).filter(Boolean);
         const linkedById = ids.some(id => sameText(id, old.id));
         if (linkedById) {
           item.reactorId = ids.map(id => sameText(id, old.id) ? requestedId : id).join(", ");
           item.site = next.site;
           item.block = next.block || item.block;
           item.area = next.area || item.area;
         }
       }
     }
     /*
       Available = no project.
     */
     if (
       next.status ===
       "Available"
     ) {
       next.projectMapped = "";
     }
     /*
       Mapped should have a project.
     */
     if (
       next.status ===
         "Mapped" &&
       !next.projectMapped
     ) {
       next.projectMapped =
         "Mapped";
     }
     db.equipment[index] =
       next;
     addAudit(
       db,
       `Updated reactor ${old.id}${requestedId !== old.id ? ` → ${requestedId}` : ""}`
     );
     await writeDB(db);
     res.json(next);
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to update reactor."
     );
   }
 }
);
/* =========================================================
  DELETE REACTOR
  ========================================================= */
/* =========================================================

   DELETE REACTOR

   Soft-delete with Undo support

========================================================= */

app.delete("/api/equipment/:uid", async (req, res) => {
 try {
   const db = await readDB();
   const index = db.equipment.findIndex(
     (item) => item.uid === req.params.uid
   );
   if (index === -1) {
     return res.status(404).send("Reactor not found.");
   }
   // Save the complete reactor before deleting it
   const deletedReactor = {
     ...db.equipment[index]
   };
   // Keep the latest deletion for Undo
   db.deletedEquipment = [
     {
       ...deletedReactor,
       deletedAt: now()
     }
   ];
   // Actually delete the reactor
   db.equipment.splice(index, 1);
   addAudit(
     db,
     `Deleted reactor ${deletedReactor.id}`
   );
   await writeDB(db);
   res.json({
     success: true,
     message:
       `Reactor ${deletedReactor.id} deleted successfully.`,
     deleted: deletedReactor
   });
 } catch (error) {
   console.error(
     "Delete equipment error:",
     error
   );
   res.status(500).send(
     "Failed to delete reactor."
   );
 }
});
 
/* =========================================================
  RESERVE
  ========================================================= */
app.post("/api/equipment/undo-delete", async (req, res) => {
 try {
   const db = await readDB();
   if (
     !Array.isArray(db.deletedEquipment) ||
     db.deletedEquipment.length === 0
   ) {
     return res.status(404).send(
       "There is no deleted reactor available to restore."
     );
   }
   // Get the most recently deleted reactor
   const deletedReactor =
     db.deletedEquipment[
       db.deletedEquipment.length - 1
     ];
   // Make sure it has not already been restored
   const alreadyExists = db.equipment.some(
     (item) => item.uid === deletedReactor.uid
   );
   if (alreadyExists) {
     return res.status(409).send(
       "This reactor already exists."
     );
   }
   // Restore the complete original reactor
   const restoredReactor = {
     ...deletedReactor
   };
   // Remove the temporary deletion timestamp
   delete restoredReactor.deletedAt;
   // Put the reactor back into the database
   db.equipment.push(restoredReactor);
   // Clear the Undo storage
   db.deletedEquipment = [];
   addAudit(
     db,
     `Restored deleted reactor ${restoredReactor.id}`
   );
   await writeDB(db);
   res.json({
     success: true,
     message:
       `Reactor ${restoredReactor.id} restored successfully.`,
     restored: restoredReactor
   });
 } catch (error) {
   console.error(
     "Undo delete error:",
     error
   );
   res.status(500).send(
     "Failed to restore deleted reactor."
   );
 }
});
/* =========================================================
  AVAILABILITY
  ========================================================= */
app.get(
 "/api/availability",
 async (req, res) => {
   try {
     const db =
       await readDB();
     const q =
       req.query || {};
     const min =
       q.minCapacity === "" ||
       q.minCapacity == null
         ? null
         : Number(
             q.minCapacity
           );
     const max =
       q.maxCapacity === "" ||
       q.maxCapacity == null
         ? null
         : Number(
             q.maxCapacity
           );
     const site =
       cleanText(q.site);
     const moc =
       cleanText(q.moc)
         .toLowerCase();
     const agitator =
       cleanText(q.agitator)
         .toLowerCase();
     const requestedStart = cleanText(q.startDate);
     const requestedEnd = cleanText(q.endDate);
     const hasDateWindow = Boolean(requestedStart && requestedEnd && validDateRange(requestedStart, requestedEnd));
     const results =
       db.equipment.filter(
         reactor => {
           if (!hasDateWindow) {
             // No planning window: keep reactors visible unless they are under
             // active maintenance. A current mapping is shown as unavailable
             // with its release date rather than disappearing from results.
             if (maintenanceOverlapsRange(db, reactor, localTodayISO(), localTodayISO())) return false;
           } else {
             const mappingConflict = (db.mappingTracker || []).some(mapping => {
               const sameReactor = mapping.reactorUid
                 ? String(mapping.reactorUid) === String(reactor.uid)
                 : sameText(mapping.reactorId, reactor.id);
               return sameReactor && mappingOverlapsRange(mapping, requestedStart, requestedEnd);
             });
             if (mappingConflict || maintenanceOverlapsRange(db, reactor, requestedStart, requestedEnd)) return false;
           }
           if (
             min != null &&
             Number.isFinite(min) &&
             number(
               reactor.capacity
             ) < min
           ) {
             return false;
           }
           if (
             max != null &&
             Number.isFinite(max) &&
             number(
               reactor.capacity
             ) > max
           ) {
             return false;
           }
           if (
             site &&
             site !== "All" &&
             !sameText(
reactor.site,
               site
             )
           ) {
             return false;
           }
           if (
             moc &&
             moc !== "all" &&
             !cleanText(
               reactor.moc
             )
               .toLowerCase()
               .includes(moc)
           ) {
             return false;
           }
           if (
             agitator &&
             agitator !== "all" &&
             !cleanText(
               reactor.agitator
             )
               .toLowerCase()
               .includes(
                 agitator
               )
           ) {
             return false;
           }
           return true;
         }
       );
     const today = localTodayISO();
     const enrichedResults = results.map(reactor => {
       const mappings = (db.mappingTracker || [])
         .filter(mapping => mappingMatchesEquipment(mapping, reactor) && mapping.startDate && mapping.endDate)
         .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
       const activeMapping = mappings.find(mapping => dateRangesOverlap(mapping.startDate, mapping.endDate, today, today));
       const nextMapping = mappings.find(mapping => String(mapping.startDate).slice(0, 10) > today);
       let availabilityLabel = "Available now";
       let availableForRange = true;
       if (!hasDateWindow && activeMapping) {
         const end = String(activeMapping.endDate).slice(0, 10);
         const release = new Date(`${end}T00:00:00`);
         release.setDate(release.getDate() + 1);
         availabilityLabel = `Currently mapped until ${end} · available from ${release.toISOString().slice(0, 10)}`;
         availableForRange = false;
       } else if (!hasDateWindow && nextMapping) {
         availabilityLabel = `Available now · next mapping starts ${String(nextMapping.startDate).slice(0, 10)}`;
       } else if (hasDateWindow) {
         availabilityLabel = `Available for ${requestedStart} → ${requestedEnd}`;
       }
       return { ...reactor, _availableForRange: availableForRange, _availabilityLabel: availabilityLabel };
     });
     res.json(
       enrichedResults
     );
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to load availability."
     );
   }
 }
);
/* =========================================================
SUMMARY
 ========================================================= */
app.get(
 "/api/summary",
 async (_, res) => {
   try {
     const db = await readDB();
     res.json(Array.isArray(db.summary) ? db.summary : []);
   } catch (error) {
     console.error("Summary error:", error);
     res.status(500).json({
       error: "Failed to load Excel summary data."
     });
   }
 }
);
/* =========================================================
  CAPACITY
  ========================================================= */
app.get(
 "/api/capacity",
 async (_, res) => {
   try {
     const db =
       await readDB();
     const siteTotals = buildSiteTotals(db.capacityStructure);
     res.json({ rows: db.capacityStructure, siteTotals, totals: buildCapacityTotals(db.capacityStructure) });
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to load capacity."
     );
   }
 }
);
/* =========================================================
  OPEN-SOURCE LLM MATCH EXPLANATION
  Uses a locally running Ollama model (default: Qwen 2.5 3B).
  The chosen reactor is validated against backend inventory; the LLM
  explains only that verified candidate and cannot create/alter mappings.
  ========================================================= */
app.post("/api/assistant/recommendation", async (req, res) => {
  try {
    const db = await readDB();
    const body = req.body || {};
    const candidateInput = body.candidate || {};
    const candidate = candidateInput.uid
      ? db.equipment.find(row => String(row.uid) === String(candidateInput.uid))
      : findEquipmentById(db, candidateInput.id);
    if (!candidate) return res.status(404).json({ error: "The recommended reactor was not found in the current source inventory." });

    const filters = body.filters || {};
    const capacityKLValue = capacityKL(candidate.capacity);
    const reasons = [];
    const min = filters.minCapacity === "" || filters.minCapacity == null ? null : Number(filters.minCapacity);
    const max = filters.maxCapacity === "" || filters.maxCapacity == null ? null : Number(filters.maxCapacity);
    if (min !== null && Number.isFinite(min)) reasons.push(`Capacity is ${capacityKLValue} kL, meeting the minimum of ${min} kL.`);
    if (max !== null && Number.isFinite(max)) reasons.push(`Capacity is ${capacityKLValue} kL, within the maximum of ${max} kL.`);
    if (cleanText(filters.site) && cleanText(filters.site) !== "All") reasons.push(`Site matches the selected ${cleanText(filters.site)} filter.`);
    else reasons.push(`Site is ${cleanText(candidate.site) || "not recorded"}.`);
    if (cleanText(filters.moc) && cleanText(filters.moc) !== "All") reasons.push(`Material of construction matches ${cleanText(filters.moc)}.`);
    else reasons.push(`Material of construction is ${cleanText(candidate.moc) || "not recorded"}.`);
    if (cleanText(filters.agitator) && cleanText(filters.agitator) !== "All") reasons.push(`Agitator matches ${cleanText(filters.agitator)}.`);
    if (cleanText(filters.startDate) && cleanText(filters.endDate)) reasons.push(`The search is for the requested date window ${cleanText(filters.startDate)} to ${cleanText(filters.endDate)}; the UI has already filtered the candidate results for this window.`);
    const candidateCount = Math.max(0, Number(body.candidateCount) || 0);
    const selectionRule = min !== null && Number.isFinite(min)
      ? "closest capacity to the requested minimum among filtered results"
      : "lowest-capacity option among filtered results, which can preserve larger reactors for future demand";
    reasons.push(`Selection rule: ${selectionRule}. Candidate count after filters: ${candidateCount}.`);

    const verifiedFacts = {
      reactorId: cleanText(candidate.id), site: cleanText(candidate.site), block: cleanText(candidate.block), area: cleanText(candidate.area),
      capacityKL: capacityKLValue, moc: cleanText(candidate.moc), agitator: cleanText(candidate.agitator),
      inventoryStatus: cleanText(candidate.status), projectMapped: cleanText(candidate.projectMapped),
      filters: { minCapacityKL: min, maxCapacityKL: max, site: cleanText(filters.site), moc: cleanText(filters.moc), agitator: cleanText(filters.agitator), startDate: cleanText(filters.startDate), endDate: cleanText(filters.endDate) },
      deterministicReasons: reasons,
    };
    const fallback = `${cleanText(candidate.id)} is recommended as a capacity-efficient option among the ${candidateCount} reactor result(s) that passed your filters. ${min !== null && Number.isFinite(min) ? `It is the closest capacity to your requested minimum of ${min} kL among those results.` : "No minimum capacity was specified, so the lowest-capacity filtered option is suggested to help preserve larger reactors for future demand."} Its source inventory records ${capacityKLValue} kL capacity, ${cleanText(candidate.moc) || "MOC not recorded"} material of construction, site ${cleanText(candidate.site) || "not recorded"}, and block ${cleanText(candidate.block) || "not recorded"}. ${reasons.join(" ")} Verify the timeline and current availability before committing a new mapping.`;
    const ollamaBase = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
    const model = process.env.OLLAMA_MODEL || "qwen2.5:3b";
    try {
      const response = await fetch(`${ollamaBase}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          options: { temperature: 0.15, num_predict: 180 },
          prompt: `You are a careful manufacturing-capacity planning assistant. Explain why the already-selected reactor is a suitable match. Use only the verified JSON facts below. Do not invent availability, certifications, or properties. If a filter field is blank or All, do not claim it was a strict match. Mention capacity and the actual selected constraints. Keep it to 2-4 concise sentences. Do not change the selected reactor or propose unsupported data.\nVERIFIED FACTS:\n${JSON.stringify(verifiedFacts)}`
        }),
        signal: AbortSignal.timeout(18000),
      });
      if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
      const result = await response.json();
      const explanation = cleanText(result.response);
      if (!explanation) throw new Error("Ollama returned an empty explanation");
      return res.json({ ok: true, mode: "ollama", model, explanation, facts: verifiedFacts });
    } catch (modelError) {
      return res.json({ ok: true, mode: "rule-based", model, explanation: fallback, modelMessage: "Local Ollama model not reachable; deterministic source-grounded explanation returned.", facts: verifiedFacts });
    }
  } catch (error) {
    console.error("Planning assistant error:", error);
    return res.status(500).json({ error: "Could not prepare the planning recommendation." });
  }
});

app.get("/api/mapping-options", async (_, res) => {
 try { const db = await readDB(); res.json(buildMappingOptions(db)); }
 catch (error) { console.error(error); res.status(500).send("Failed to load mapping options."); }
});
/* =========================================================
  MAPPINGS
  ========================================================= */
app.get(
 "/api/mappings",
 async (_, res) => {
   try {
     const db =
       await readDB();
     res.json(
       db.mappingTracker
     );
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to load mappings."
     );
   }
 }
);
/* =========================================================
  CREATE MAPPING
  ========================================================= */
app.post(
 "/api/mappings",
 async (req, res) => {
   try {
     const db =
       await readDB();
     const body =
       req.body || {};
     const allowedCategories = new Set(["Confirmed", "High Probable", "Visible"]);
     const requestedStages = Array.isArray(body.stages) ? body.stages.map(cleanText).filter(Boolean) : [cleanText(body.stage)].filter(Boolean);
     if (!requestedStages.length) {
       return res.status(400).send("Select or enter at least one stage.");
     }
     if (!allowedCategories.has(cleanText(body.category))) {
       return res.status(400).send("Select a valid probability category.");
     }
     if (!cleanText(body.productCode)) {
       return res.status(400).send("Product code is required. Enter an existing code or add a new code.");
     }
     if (
       !cleanText(
         body.product
       ) ||
       !(cleanText(body.reactorUid) || cleanText(body.reactorId)) ||
       !cleanText(
         body.startDate
       ) ||
       !cleanText(
         body.endDate
       )
     ) {
       return res.status(400).send(
         "Product, reactor, start date and end date are required."
       );
     }
     /*
       UID is preferred.
     */
     const reactor =
       body.reactorUid
         ? findEquipmentByUid(
             db,
             body.reactorUid
           )
         : findEquipmentById(
             db,
             body.reactorId
           );
     if (!reactor) {
       return res.status(404).send(
         "Selected reactor not found."
       );
     }
     const start = new Date(body.startDate);
     const end = new Date(body.endDate);
     if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
       return res.status(400).send("Start date and end date must be valid, with start on or before end.");
     }
     const overlaps = db.mappingTracker.some(mapping => {
       const sameReactor = mapping.reactorUid
         ? String(mapping.reactorUid) === String(reactor.uid)
         : sameText(mapping.reactorId, reactor.id);
       return sameReactor && mappingOverlapsRange(mapping, body.startDate, body.endDate);
     });
     if (overlaps) {
       return res.status(409).send("The selected reactor already has a mapping that overlaps this date range.");
     }
     if (maintenanceOverlapsRange(db, reactor, body.startDate, body.endDate)) {
       return res.status(409).send("The selected reactor is under maintenance during part of this date range.");
     }
     // Reactor status is historical/current metadata. Availability for a plan is
     // determined by date-range conflicts, so a reactor with a future or expired
     // mapping can be reused outside that occupied period.
     const item = {
       id:
         `MAP-${Date.now()
           .toString()
           .slice(-8)}`,
       createdAt: new Date().toISOString(),
      mappedAt: new Date().toISOString(),
      product:
         cleanText(
           body.product
         ),
       productCode:
         cleanText(body.productCode),
       projectCodes: [cleanText(body.productCode)],
       stage:
         requestedStages[0],
       stages: requestedStages,
       stageCode:
         cleanText(
           body.stageCode
         ),
       category:
         cleanText(
           body.category
         ) || "Confirmed",
       reactorId:
reactor.id,
       equipmentId: reactor.equipmentId || reactor.uid,
       reactorUid:
         reactor.uid,
       startDate:
         cleanText(
           body.startDate
         ),
       endDate:
         cleanText(
           body.endDate
         ),
       site:
canonicalSite(reactor.site || ""),
       block:
         reactor.block || "",
       area:
         reactor.area || "",
       capacity:
         number(
           reactor.capacity
         ),
       moc:
         reactor.moc || "",
       agitator:
         reactor.agitator || "",
       schedule: [],
     };
     db.mappingTracker.unshift(
       item
     );
     reactor.status =
       "Mapped";
     reactor.projectMapped =
       item.product;
     reactor.mappingId =
item.id;
     recalculateDerivedCapacity(db);
     addAudit(
       db,
       `Created equipment mapping ${item.id} for ${item.reactorId}`
     );
     await writeDB(db);
     res.status(201).json(
       item
     );
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to create mapping."
     );
   }
 }
);
/* =========================================================
  UPDATE MAPPING
  ========================================================= */
app.put("/api/mappings/:id", async (req, res) => {
  try {
    const db = await readDB();
    const existing = db.mappingTracker.find(m => String(m.id) === String(req.params.id));
    if (!existing) return res.status(404).send("Mapping not found.");

    const body = req.body || {};
    const allowedCategories = new Set(["Confirmed", "High Probable", "Visible"]);
    const requestedStages = Array.isArray(body.stages)
      ? body.stages.map(cleanText).filter(Boolean)
      : [cleanText(body.stage)].filter(Boolean);
    const product = cleanText(body.product);
    const productCode = cleanText(body.productCode);
    const stage = cleanText(body.stage || requestedStages[0]);
    const stageCode = cleanText(body.stageCode);
    const startDate = cleanText(body.startDate);
    const endDate = cleanText(body.endDate);

    if (!product || !productCode || !stage || !startDate || !endDate) {
      return res.status(400).send("Product, product code, stage and date range are required.");
    }
    if (!allowedCategories.has(cleanText(body.category))) {
      return res.status(400).send("Select a valid probability category.");
    }
    if (!requestedStages.length) return res.status(400).send("Select one or more valid stages.");
    if (!validDateRange(startDate, endDate)) {
      return res.status(400).send("Start date and end date must be valid, with start on or before end.");
    }

    const reactor = body.reactorUid
      ? findEquipmentByUid(db, body.reactorUid)
      : findEquipmentById(db, body.reactorId || existing.reactorId);
    if (!reactor) return res.status(404).send("Selected reactor not found.");

    const overlaps = db.mappingTracker.some(mapping => {
      const sameReactor = mapping.reactorUid
        ? String(mapping.reactorUid) === String(reactor.uid)
        : sameText(mapping.reactorId, reactor.id);
      return sameReactor && mappingOverlapsRange(mapping, startDate, endDate, existing.id);
    });
    if (overlaps) return res.status(409).send("The selected reactor already has another mapping that overlaps this date range.");
    if (maintenanceOverlapsRange(db, reactor, startDate, endDate)) {
      return res.status(409).send("The selected reactor is under maintenance during part of this date range.");
    }

    const updated = {
      ...existing,
      product,
      productCode,
      projectCodes: [productCode],
      stage,
      stages: requestedStages,
      stageCode,
      category: cleanText(body.category),
      reactorId: reactor.id,
      equipmentId: reactor.equipmentId || reactor.uid,
      reactorUid: reactor.uid,
      startDate,
      endDate,
      site: canonicalSite(reactor.site || existing.site || ""),
      block: reactor.block || existing.block || "",
      area: reactor.area || existing.area || "",
      capacity: number(reactor.capacity),
      moc: reactor.moc || existing.moc || "",
      agitator: reactor.agitator || existing.agitator || "",
      updatedAt: now(),
      mappedAt: existing.mappedAt || now(),
    };

    const index = db.mappingTracker.findIndex(m => String(m.id) === String(existing.id));
    db.mappingTracker[index] = updated;

    // Propagate product-name edits by product code across all date intervals and client/project records.
    const productKey = normalizeId(productCode);
    for (const mapping of db.mappingTracker) {
      if (normalizeId(mapping.productCode || mapping.projectCode || "") === productKey) mapping.product = product;
    }
    for (const client of db.clientInformation || []) {
      const keys = [client.projectCode, client.productCode, client.stageCode, client.stage].map(normalizeId).filter(Boolean);
      if (keys.includes(productKey)) client.product = product;
    }

    // Keep the equipment record consistent without making date-based availability permanent.
    const oldReactor = existing.reactorUid
      ? findEquipmentByUid(db, existing.reactorUid)
      : findEquipmentById(db, existing.reactorId);
    if (oldReactor && String(oldReactor.uid) !== String(reactor.uid)) {
      const stillMapped = db.mappingTracker.some(m => mappingMatchesEquipment(m, oldReactor));
      if (!stillMapped && oldReactor.status === "Mapped") {
        const today = new Date().toISOString().slice(0, 10);
        const activeMaintenance = (db.maintenance || []).some(item => {
          const same = item.reactorUid
            ? String(item.reactorUid) === String(oldReactor.uid)
            : sameText(item.reactorId, oldReactor.id);
          const status = cleanText(item.status).toLowerCase();
          return same && !["completed", "cancelled"].includes(status) && item.startDate <= today && item.endDate >= today;
        });
        oldReactor.status = activeMaintenance ? "Maintenance" : "Available";
        oldReactor.projectMapped = "";
        oldReactor.mappingId = "";
      }
    }
    reactor.status = "Mapped";
    reactor.projectMapped = updated.product;
    reactor.mappingId = updated.id;

    recalculateDerivedCapacity(db);
    addAudit(db, `Updated equipment mapping ${updated.id} for ${updated.reactorId}`);
    await writeDB(db);
    res.json(updated);
  } catch (error) {
    console.error("Update mapping error:", error);
    res.status(500).send("Failed to update mapping.");
  }
});

/* =========================================================
  DELETE MAPPING
  ========================================================= */
app.delete(
 "/api/mappings/:id",
 async (req, res) => {
   try {
     const db =
       await readDB();
     const item =
       db.mappingTracker.find(
         mapping =>
           String(mapping.id) ===
           String(req.params.id)
       );
     if (!item) {
       return res.status(404).send(
         "Mapping not found."
       );
     }
     db.mappingTracker =
       db.mappingTracker.filter(
         mapping =>
           String(mapping.id) !==
           String(req.params.id)
       );
     const reactor =
       item.reactorUid
         ? findEquipmentByUid(
             db,
             item.reactorUid
           )
         : findEquipmentById(
             db,
             item.reactorId
           );
     if (reactor) {
       const otherMappings = db.mappingTracker.filter(mapping => mappingMatchesEquipment(mapping, reactor));
       if (!otherMappings.length && reactor.status === "Mapped") {
         const today = new Date().toISOString().slice(0, 10);
         const activeMaintenance = (db.maintenance || []).some(item => {
           const same = item.reactorUid
             ? String(item.reactorUid) === String(reactor.uid)
             : sameText(item.reactorId, reactor.id);
           const status = cleanText(item.status).toLowerCase();
           return same && !["completed", "cancelled"].includes(status) && item.startDate <= today && item.endDate >= today;
         });
         reactor.status = activeMaintenance ? "Maintenance" : "Available";
         reactor.projectMapped = "";
         reactor.mappingId = "";
       } else if (otherMappings.length) {
         const latest = otherMappings[0];
         reactor.status = "Mapped";
         reactor.projectMapped = latest.product || latest.project || "Mapped";
         reactor.mappingId = latest.id || "";
       }
     }
     recalculateDerivedCapacity(db);
     addAudit(
       db,
       `Deleted equipment mapping ${req.params.id}`
     );
     await writeDB(db);
     res.status(204).end();
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to delete mapping."
     );
   }
 }
);
function buildVolumeSummary(rows = []) {
 const output = [];
 for (const row of rows) {
   if (row && !Array.isArray(row) && typeof row === "object" && row.total !== undefined) {
     output.push({
       level: row.level || "Site",
       site: canonicalSite(row.site || ""),
       block: cleanText(row.block),
       total: number(row.total),
       mapped: number(row.mapped),
       utilized: number(row.utilized),
       available: number(row.available),
     });
     continue;
   }
   if (!Array.isArray(row)) continue;
   const label = cleanText(row[3]);
   const total = row[4];
   if (!label || total === null || total === undefined || total === "") continue;
   const normalized = normalizeId(label);
   const isSite = ["cto2","cto3","cto5","cto6","ctosez","mexico","mirfield"].includes(normalized);
   if (isSite) {
     output.push({ level:"Site", site:canonicalSite(label), block:"", total:number(row[4]), mapped:number(row[5]), utilized:number(row[6]), available:number(row[7]) });
   }
 }
 return output;
}

/* =========================================================
  VOLUME
  ========================================================= */
app.get(
 "/api/volume",
 async (_, res) => {
   try {
     const db =
       await readDB();
     res.json(buildVolumeSummary(db.volumeSummary || []));
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to load volume data."
     );
   }
 }
);
/* =========================================================
  MAINTENANCE
  ========================================================= */
app.get(
 "/api/maintenance",
 async (_, res) => {
   try {
     const db =
       await readDB();
     res.json(
       db.maintenance
     );
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to load maintenance."
     );
   }
 }
);
app.post(
 "/api/maintenance",
 async (req, res) => {
   try {
     const db =
       await readDB();
     const body =
       req.body || {};
     const reactor =
       body.reactorUid
         ? findEquipmentByUid(
             db,
             body.reactorUid
           )
         : findEquipmentById(
             db,
             body.reactorId
           );
     const item = {
       id:
         `MNT-${Date.now()
           .toString()
           .slice(-8)}`,
       reactorId:
         reactor?.id ||
         cleanText(
           body.reactorId
         ),
       reactorUid:
         reactor?.uid || "",
       site: reactor?.site || cleanText(body.site),
       moc:
         cleanText(
           body.moc
         ),
       action:
         cleanText(
           body.action
         ),
       status:
  cleanText(
    body.status
  ) || "Scheduled",
startDate:
  cleanText(
    body.startDate
  ),
endDate:
  cleanText(
    body.endDate
  ),
};
     if (!item.startDate || !item.endDate) {
  return res.status(400).send(
    "Start date and End date are required."
  );
}
 
if (item.endDate < item.startDate) {
  return res.status(400).send(
    "End date cannot be before Start date."
  );
}
     if (reactor) {
       if (item.status === "Completed" || item.status === "Cancelled") {
         reactor.status = "Available";
         reactor.projectMapped = "";
       } else {
         reactor.status = "Maintenance";
         reactor.projectMapped = "";
         reactor.maintenanceId = item.id;
       }
     }
     db.maintenance.unshift(
       item
     );
     recalculateDerivedCapacity(db);
     addAudit(
       db,
       `Scheduled maintenance for ${item.reactorId}`
     );
     await writeDB(db);
     res.status(201).json(
       item
     );
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to schedule maintenance."
     );
   }
 }
);
/* =========================================================
  UPDATE MAINTENANCE
  ========================================================= */
app.put("/api/maintenance/:id", async (req, res) => {
  try {
    const db = await readDB();
    const item = db.maintenance.find(x => String(x.id) === String(req.params.id));
    if (!item) return res.status(404).send("Maintenance record not found.");
    const body = req.body || {};
    const nextStatus = cleanText(body.status) || item.status || "Scheduled";
    const nextAction = cleanText(body.action) || item.action;
    if (!nextAction) return res.status(400).send("Required Action is required.");
   item.moc = cleanText(body.moc ?? item.moc);
 
if (body.site !== undefined) {
  item.site = cleanText(body.site);
}
 
const nextStartDate = cleanText(body.startDate ?? item.startDate);
const nextEndDate = cleanText(body.endDate ?? item.endDate);
 
if (!nextStartDate || !nextEndDate) {
  return res.status(400).send(
    "Start date and End date are required."
  );
}
 
if (nextEndDate < nextStartDate) {
  return res.status(400).send(
    "End date cannot be before Start date."
  );
}
 
item.startDate = nextStartDate;
item.endDate = nextEndDate;
item.action = nextAction;
item.status = nextStatus;
item.updatedAt = now();
    const reactor = item.reactorUid ? findEquipmentByUid(db, item.reactorUid) : findEquipmentById(db, item.reactorId);
    if (reactor) {
      if (nextStatus === "Completed" || nextStatus === "Cancelled") {
        reactor.status = "Available";
        reactor.projectMapped = "";
        delete reactor.maintenanceId;
      } else {
        reactor.status = "Maintenance";
        reactor.projectMapped = "";
        reactor.maintenanceId = item.id;
      }
    }
    recalculateDerivedCapacity(db);
    addAudit(db, `Updated maintenance ${item.id} for ${item.reactorId} to ${nextStatus}`);
    await writeDB(db);
    res.json(item);
  } catch (error) {
    console.error("Update maintenance error:", error);
    res.status(500).send("Failed to update maintenance.");
  }
});
/* =========================================================
  DELETE MAINTENANCE
  Removes the maintenance record and returns the reactor to Available.
  ========================================================= */
app.delete("/api/maintenance/:id", async (req, res) => {
  try {
    const db = await readDB();
    const index = db.maintenance.findIndex(x => String(x.id) === String(req.params.id));
    if (index === -1) return res.status(404).send("Maintenance record not found.");

    const [item] = db.maintenance.splice(index, 1);
    const reactor = item.reactorUid
      ? findEquipmentByUid(db, item.reactorUid)
      : findEquipmentById(db, item.reactorId);

    if (reactor && (!reactor.maintenanceId || String(reactor.maintenanceId) === String(item.id))) {
      reactor.status = "Available";
      reactor.projectMapped = "";
      delete reactor.maintenanceId;
    }

    recalculateDerivedCapacity(db);
    addAudit(db, `Deleted maintenance ${item.id} for ${item.reactorId}`);
    await writeDB(db);
    res.json({ deleted: true, id: item.id, reactorId: item.reactorId });
  } catch (error) {
    console.error("Delete maintenance error:", error);
    res.status(500).send("Failed to delete maintenance record.");
  }
});
/* =========================================================
  AUDIT
  ========================================================= */
app.get(
 "/api/audit",
 async (_, res) => {
   try {
     const db =
       await readDB();
     res.json(
       db.audit
     );
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to load audit logs."
     );
   }
 }
);
app.get(
 "/api/audit-logs",
 async (_, res) => {
   try {
     const db =
       await readDB();
     res.json(
       db.audit
     );
   } catch (error) {
     console.error(error);
     res.status(500).send(
       "Failed to load audit logs."
     );
   }
 }
);
/* =========================================================
  EXCEL PARSE / IMPORT
  The browser parses the workbook so the same application can
  accept Excel updates without adding a server-side parser.
  ========================================================= */
app.post("/api/import/workbook-file", express.raw({
  type: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream"
  ],
  limit: "25mb"
}), async (req, res) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).send("No Excel workbook was uploaded.");
    }
    const storageUrl = new URL("./source-data/master-workbook.xlsx", import.meta.url);
    const { writeFile } = await import("fs/promises");
    await writeFile(storageUrl, req.body);
    const filename = cleanText(req.headers["x-workbook-name"]) ? decodeURIComponent(cleanText(req.headers["x-workbook-name"])) : "master-workbook.xlsx";
    const db = await readDB();
    db.meta = { ...(db.meta || {}), sourceWorkbook: filename, uploadedAt: now(), sourceWorkbookPath: "source-data/master-workbook.xlsx" };
    addAudit(db, `Uploaded master Excel workbook ${filename}`);
    await writeDB(db);
    res.json({ success: true, filename, bytes: req.body.length, uploadedAt: db.meta.uploadedAt });
  } catch (error) {
    console.error("Workbook file upload error:", error);
    res.status(500).send("Failed to store the uploaded Excel workbook.");
  }
});

app.post("/api/import/workbook", async (req, res) => {
  try {
    const payload = req.body || {};
    const incomingEquipment = Array.isArray(payload.equipment) ? payload.equipment : [];
    const incomingCapacity = Array.isArray(payload.capacityStructure) ? payload.capacityStructure : [];
    const incomingSummary = Array.isArray(payload.summary) ? payload.summary : [];
    const incomingMappings = Array.isArray(payload.mappingTracker) ? payload.mappingTracker : [];
    const incomingVolume = Array.isArray(payload.volumeSummary) ? payload.volumeSummary : [];
    if (!incomingEquipment.length && !incomingCapacity.length && !incomingMappings.length) {
      return res.status(400).send("The Excel file did not contain usable reactor, capacity, or mapping data.");
    }
    const missingSheets = Array.isArray(payload.validation?.missingSheets) ? payload.validation.missingSheets : [];
    if (missingSheets.length) {
      return res.status(422).json({ error:"Complete master workbook required.", validationErrors:missingSheets.map(name => `Missing required sheet: ${name}`) });
    }

    const db = await readDB();
    const validationErrors = [];
    const seenIdentities = new Set();
    incomingEquipment.forEach((row, index) => {
      const id = cleanText(row.id), site = canonicalSite(row.site), cap = number(row.capacity);
      if (!id) validationErrors.push(`Equipment row ${index + 1}: missing Reactor ID / Equipment ID.`);
      if (!site) validationErrors.push(`Equipment row ${index + 1}: missing site.`);
      if (cap < 0) validationErrors.push(`Equipment row ${index + 1}: capacity cannot be negative.`);
      const identity = `${normalizeId(site)}|${normalizeId(id)}|${normalizeId(row.block)}|${normalizeId(row.area)}`;
      if (id && site && seenIdentities.has(identity)) validationErrors.push(`Duplicate equipment row ${id} at ${site} (${cleanText(row.block)} / ${cleanText(row.area)}).`);
      if (id && site) seenIdentities.add(identity);
    });
    if (validationErrors.length) return res.status(422).json({ error: "Workbook validation failed.", validationErrors });
    const uidByIdentity = new Map();
    const inventoryIdentity = (row) => `${normalizeId(row.site)}|${normalizeId(row.id)}|${normalizeId(row.block)}|${normalizeId(row.area)}`;
    (db.equipment || []).forEach(item => uidByIdentity.set(inventoryIdentity(item), item.uid || randomUUID()));

    const equipment = incomingEquipment.map(raw => {
      const site = canonicalSite(raw.site);
      const id = cleanText(raw.id);
      const identity = `${normalizeId(site)}|${normalizeId(id)}|${normalizeId(raw.block)}|${normalizeId(raw.area)}`;
      const uid = uidByIdentity.get(identity) || randomUUID();
      const projectMapped = cleanText(raw.projectMapped);
      const status = projectMapped ? "Mapped" : "Available";
      return {
        uid, equipmentId: cleanText(raw.equipmentId) || uid, id, site, block: cleanText(raw.block), area: cleanText(raw.area),
        equipmentType: cleanText(raw.equipmentType) || "Reactor", sapCode: cleanText(raw.sapCode), moc: cleanText(raw.moc),
        capacity: number(raw.capacity), agitator: cleanText(raw.agitator),
        minVolume: raw.minVolume ?? "", maxVolume: raw.maxVolume ?? "",
        projectMapped, projectCodes: Array.isArray(raw.projectCodes) ? raw.projectCodes.map(cleanText).filter(Boolean) : splitProjectCodes(projectMapped),
        sourceProjectMapped: projectMapped,
        status, planningStatus: cleanText(raw.planningStatus) || cleanText(raw.status), sourceSheet: cleanText(raw.sourceSheet) || "Imported Excel",
        clientName: cleanText(raw.clientName), product: cleanText(raw.product), stage: cleanText(raw.stage), stageCode: cleanText(raw.stageCode),
        continuousCampaign: cleanText(raw.continuousCampaign), linkedReactors: cleanText(raw.linkedReactors), timeline: cleanText(raw.timeline), remarks: cleanText(raw.remarks),
        sourceColumns: Array.isArray(raw.sourceColumns) ? raw.sourceColumns : [],
        sourceValues: Array.isArray(raw.sourceColumns) ? raw.sourceColumns.map(x => x?.value ?? "") : [],
        rawRecord: raw.rawRecord && typeof raw.rawRecord === "object" ? raw.rawRecord : null,
      };
    }).filter(item => item.id && item.site);

    const reactorByIdentity = new Map(equipment.map(item => [inventoryIdentity(item), item]));
    const findImportedReactor = (site, raw) => reactorByIdentity.get(`${normalizeId(site)}|${normalizeId(raw.reactorId)}|${normalizeId(raw.block)}|${normalizeId(raw.area)}`)
      || equipment.find(item => normalizeId(item.site) === normalizeId(site) && normalizeId(item.id) === normalizeId(raw.reactorId));
    const mappings = incomingMappings.map((raw, index) => {
      const site = canonicalSite(raw.site);
      const reactor = findImportedReactor(site, raw);
      const product = cleanText(raw.product || raw.project || raw.projectName);
      const schedule = Array.isArray(raw.schedule) ? raw.schedule.map(item => ({ date: dateOnly(item.date), value: cleanText(item.value) })).filter(item => item.date && item.value) : [];
      return {
        id: cleanText(raw.id) || `IMP-${String(index + 1).padStart(5, "0")}`,
        product, productCode: cleanText(raw.productCode) || product,
        projectCodes: Array.isArray(raw.projectCodes) ? raw.projectCodes.map(cleanText).filter(Boolean) : splitProjectCodes(cleanText(raw.productCode) || product),
        stage: cleanText(raw.stage) || stageFromProductCode(product), stageCode: cleanText(raw.stageCode),
        category: ["Confirmed", "High Probable", "Visible"].includes(cleanText(raw.category)) ? cleanText(raw.category) : "Workbook",
        reactorId: reactor?.id || cleanText(raw.reactorId), reactorUid: reactor?.uid || "", site,
        block: cleanText(raw.block), area: cleanText(raw.area), capacity: number(raw.capacity),
        moc: cleanText(raw.moc), agitator: cleanText(raw.agitator), firm: cleanText(raw.firm),
        startDate: dateOnly(raw.startDate) || schedule[0]?.date || "", endDate: dateOnly(raw.endDate) || schedule.at(-1)?.date || "", schedule,
      };
    }).filter(item => item.reactorId && item.product);

    // Preserve operational maintenance records, but re-link them to the new reactor UIDs.
    const maintenance = Array.isArray(db.maintenance) ? db.maintenance.map(item => {
      const site = canonicalSite(item.site);
      const reactor = findImportedReactor(site, item);
      return { ...item, reactorUid: reactor?.uid || item.reactorUid || "", site: reactor?.site || site };
    }) : [];

    const mappingByReactor = new Map();
    mappings.forEach(mapping => {
      if (mapping.reactorUid && !mappingByReactor.has(mapping.reactorUid)) mappingByReactor.set(mapping.reactorUid, mapping);
    });
    equipment.forEach(reactor => {
      const activeMaintenance = maintenance.find(item => String(item.reactorUid) === String(reactor.uid) && !["Completed", "Cancelled"].includes(item.status));
      const mapping = mappingByReactor.get(reactor.uid);
      if (activeMaintenance) {
        reactor.status = "Maintenance";
        reactor.projectMapped = "";
        reactor.maintenanceId = activeMaintenance.id;
      } else if (mapping) {
        reactor.status = "Mapped";
        reactor.projectMapped = mapping.product;
        reactor.mappingId = mapping.id;
      }
    });

    db.equipment = equipment;
    db.capacityStructure = incomingCapacity.map(row => ({
      site: canonicalSite(row.site), block: cleanText(row.block), area: cleanText(row.area),
      totalCapacity: number(row.totalCapacity), utilization: number(row.utilization), mapped: number(row.mapped), available: number(row.available),
    })).filter(row => row.site);
    db.summary = incomingSummary;
    db.mappingTracker = mappings;
    db.volumeSummary = incomingVolume;
    db.clientInformation = Array.isArray(payload.clientInformation) ? payload.clientInformation : [];
    db.rawSheets = payload.rawSheets && typeof payload.rawSheets === "object" ? payload.rawSheets : {};
    db.maintenance = maintenance;
    db.meta = {
      ...(db.meta || {}),
      sourceWorkbook: cleanText(payload.meta?.sourceWorkbook) || "Imported Excel workbook",
      sourceSheets: Array.isArray(payload.meta?.sourceSheets) ? payload.meta.sourceSheets : (db.meta?.sourceSheets || []),
      parsedAt: cleanText(payload.meta?.parsedAt) || now(),
      parser: cleanText(payload.meta?.parser) || "browser-workbook-parser-v3",
      capacitySourceLocked: payload.meta?.capacitySourceLocked === true,
      totalReactors: Number(payload.meta?.totalReactors) || equipment.length,
    };
    recalculateDerivedCapacity(db);
    addAudit(db, `Imported and parsed Excel workbook ${db.meta.sourceWorkbook}`);
    await writeDB(db);
    res.json({
      success: true,
      message: "Excel data was parsed and imported successfully.",
      counts: { equipment: equipment.length, capacity: db.capacityStructure.length, mappings: mappings.length, summary: db.summary.length, volume: db.volumeSummary.length, clientInformation: db.clientInformation.length, sheets: Object.keys(db.rawSheets || {}).length },
      parsedAt: db.meta.parsedAt,
      validationWarnings: Array.isArray(payload.validation?.warnings) ? payload.validation.warnings : [],
    });
  } catch (error) {
    console.error("Workbook import error:", error);
    res.status(500).send("Failed to parse and import the Excel workbook.");
  }
});

/* =========================================================
  SOURCE / DOWNLOADS
  ========================================================= */
app.get("/api/client-information", async (_, res) => {
  try { const db = await readDB(); res.json(Array.isArray(db.clientInformation) ? db.clientInformation : []); }
  catch (error) { console.error(error); res.status(500).send("Failed to load client information."); }
});

app.post("/api/client-information", async (req, res) => {
  try {
    const db = await readDB();
    const body = req.body || {};
    const clientName = cleanText(body.clientName);
    const product = cleanText(body.product);
    const projectCode = cleanText(body.projectCode);
    if (!clientName || (!product && !projectCode)) {
      return res.status(400).send("Client and either Product or Project / Product Code are required.");
    }
    const item = {
      id: `CLI-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2,6)}`,
      sourceSheet: "Platform Client Entry",
      site: canonicalSite(body.site),
      reactorId: cleanText(body.reactorId),
      block: cleanText(body.block),
      area: cleanText(body.area),
      clientName,
      product,
      projectCode,
      projectCodes: Array.isArray(body.projectCodes) ? body.projectCodes.map(cleanText).filter(Boolean) : (projectCode ? [projectCode] : []),
      status: cleanText(body.status) || "Planned",
      stage: cleanText(body.stage),
      stageCode: cleanText(body.stageCode),
      continuousCampaign: cleanText(body.continuousCampaign),
      linkedReactors: cleanText(body.linkedReactors),
      timeline: cleanText(body.timeline),
      remarks: cleanText(body.remarks),
      createdAt: now(),
      sourceColumns: Array.isArray(body.sourceColumns) ? body.sourceColumns : [],
    };
    db.clientInformation.unshift(item);
    addAudit(db, `Added client/project ${item.clientName} · ${item.product || item.projectCode}`);
    await writeDB(db);
    res.status(201).json(item);
  } catch (error) {
    console.error("Create client information error:", error);
    res.status(500).send("Failed to add client information.");
  }
});

app.post("/api/client-information/import", async (req, res) => {
  try {
    const db = await readDB();
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).send("No client records were provided.");
    const normalized = rows.map((row, index) => ({
      id: cleanText(row.id) || `CLI-IMP-${Date.now()}-${index + 1}`,
      sourceSheet: cleanText(row.sourceSheet) || "Client Information Upload",
      site: canonicalSite(row.site),
      reactorId: cleanText(row.reactorId),
      block: cleanText(row.block),
      area: cleanText(row.area),
      clientName: cleanText(row.clientName),
      product: cleanText(row.product),
      projectCode: cleanText(row.projectCode),
      projectCodes: Array.isArray(row.projectCodes) ? row.projectCodes.map(cleanText).filter(Boolean) : splitProjectCodes(row.projectCode),
      status: cleanText(row.status) || "Planned",
      stage: cleanText(row.stage),
      stageCode: cleanText(row.stageCode),
      continuousCampaign: cleanText(row.continuousCampaign),
      linkedReactors: cleanText(row.linkedReactors),
      timeline: cleanText(row.timeline),
      remarks: cleanText(row.remarks),
      sourceColumns: Array.isArray(row.sourceColumns) ? row.sourceColumns : [],
    })).filter(row => row.clientName || row.product || row.projectCode || row.reactorId);
    if (!normalized.length) return res.status(400).send("The upload contained no usable client/project rows.");
    db.clientInformation = [...normalized, ...(db.clientInformation || [])];
    addAudit(db, `Imported ${normalized.length} client/project records`);
    await writeDB(db);
    res.status(201).json({ imported: normalized.length, total: db.clientInformation.length, rows: normalized });
  } catch (error) {
    console.error("Import client information error:", error);
    res.status(500).send("Failed to import client information.");
  }
});

app.get("/api/source-info", async (_, res) => {
  try {
    const db = await readDB();
    res.json({
      workbook: db.meta?.sourceWorkbook || "ReactorPlan source workbook",
      sheets: db.meta?.sourceSheets || [],
      parsedAt: db.meta?.parsedAt || null,
      counts: {
        equipment: db.equipment.length,
        capacity: db.capacityStructure.length,
        mappings: db.mappingTracker.length,
        volume: db.volumeSummary.length,
        summary: db.summary.length,
        clientInformation: db.clientInformation.length,
        rawSheets: Object.keys(db.rawSheets || {}).length,
      },
    });
  } catch (error) {
    console.error("Source info error:", error);
    res.status(500).json({ error: "Failed to load source workbook information." });
  }
});

app.get("/api/download/source-workbook", async (_, res) => {
  try {
    const db = await readDB();
    const requestedPath = db.meta?.sourceWorkbookPath;
    const allowedPath = requestedPath === "source-data/platform-schedule.xlsx"
      ? "source-data/platform-schedule.xlsx"
      : "source-data/master-workbook.xlsx";
    const workbookPath = new URL(`./${allowedPath}`, import.meta.url);
    const workbook = readFileSync(workbookPath);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ReactorPlan-Source-Workbook.xlsx"'
    );
    res.setHeader("Content-Length", workbook.length);
    res.send(workbook);
  } catch (error) {
    console.error("Source workbook download error:", error);
    res.status(404).send("Source workbook is not available.");
  }
});


app.get("/api/health", async (_, res) => {
  try {
    const db = await readDB();
    res.json({ ok:true, service:"ReactorPlan Backend", timestamp:now(), equipment:db.equipment.length, mappings:db.mappingTracker.length });
  } catch (error) { res.status(500).json({ ok:false, error:"Database unavailable" }); }
});
app.get("/", (_req, res) => {
  const frontendUrl = process.env.REACTORPLAN_FRONTEND_URL || "http://localhost:5173";
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ReactorPlan API</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7fa;color:#182230;margin:0;display:grid;place-items:center;min-height:100vh}.card{max-width:640px;background:#fff;border:1px solid #dfe5ec;border-radius:16px;padding:32px;box-shadow:0 12px 35px rgba(15,23,42,.08)}h1{margin:0 0 8px}p{line-height:1.55;color:#536273}.ok{display:inline-block;padding:6px 10px;border-radius:999px;background:#e8f5ed;color:#17663a;font-weight:700;font-size:13px}a{display:inline-block;background:#246bce;color:#fff;text-decoration:none;padding:11px 16px;border-radius:9px;font-weight:700;margin-top:10px}.code{font-family:ui-monospace,monospace;background:#f1f4f7;padding:2px 6px;border-radius:5px}</style></head>
<body><main class="card"><span class="ok">API ONLINE</span><h1>ReactorPlan Backend</h1><p>The backend API is running correctly on port ${PORT}. The application interface runs on the frontend development server.</p><a href="${frontendUrl}">Open ReactorPlan application</a><p>API health: <span class="code">/api/health</span></p></main></body></html>`);
});

async function startBackend() {
  // Fail fast before announcing the API is online. This catches broken database
  // files and missing runtime helpers at startup instead of returning a vague
  // 500 from the health endpoint after the frontend has already launched.
  try {
    const db = await readDB();
    const server = app.listen(PORT, HOST, () => {
      console.log(`[backend] ReactorPlan API is ready at http://${HOST}:${PORT}`);
      console.log(`[backend] Loaded ${db.equipment.length} reactor records and ${db.mappingTracker.length} planning intervals.`);
      console.log(`[backend] Health check: http://${HOST}:${PORT}/api/health`);
    });
    server.on("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        console.error(`[backend] Port ${PORT} is already in use. Stop the other process using port ${PORT}, then restart ReactorPlan.`);
      } else {
        console.error("[backend] Failed to start the HTTP server:", error);
      }
      process.exitCode = 1;
    });
  } catch (error) {
    console.error("[backend] Startup check failed. Verify backend/database/mock-db.json and the installed dependencies.");
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}

startBackend();