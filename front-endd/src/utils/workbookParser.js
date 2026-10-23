import * as XLSX from "xlsx";
import { normalizeDashMarkers } from "./unknownUtils";

const SITE_NAMES = ["CTO-2", "CTO-3", "CTO-5", "CTO-6", "CTO-SEZ", "Mexico", "Mirfield"];
const clean = value => { const text = String(value ?? "").trim(); return /^[-‐‑‒–—−]$/u.test(text) ? "" : text; };
const key = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Project Mapped is a multi-value Excel field. Keep the raw value for audit/export,
// but also expose each individual project/product code for the live mapping catalogue.
// Examples in the master workbook include: "CMDO-6 and E4-STG3",
// "CTPM-2, CSOS1i" and "CMDO-5/CORP2".
const splitProjectCodes = value => {
  const raw = clean(value);
  if (!raw) return [];
  const parts = raw
    .split(/\s*(?:,|;|&|\band\b|\/)\s*/i)
    .map(clean)
    .filter(Boolean);
  return [...new Map(parts.map(part => [key(part), part])).values()];
};
const number = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = clean(value);
  if (!raw) return 0;
  const isParentheticalNegative = /^\(.*\)$/.test(raw.trim());
  raw = raw.replace(/[,$₹€£%\s]/g, "").replace(/[()]/g, "");
  // Accept only a complete numeric token; do not parse malformed values partially.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? (isParentheticalNegative ? -Math.abs(parsed) : parsed) : 0;
};
const dateValue = value => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const canonicalSite = value => {
  const normalized = key(value).replace(/\s/g, "");
  const map = { cto2:"CTO-2", cto3:"CTO-3", cto5:"CTO-5", cto6:"CTO-6", ctosez:"CTO-SEZ", mexico:"Mexico", mirfield:"Mirfield" };
  return map[normalized] || clean(value);
};
const stageFromProductCode = code => {
  const match = clean(code).match(/(?:STG|STEP)[-_ ]*(\d+(?:\.\d+)?)/i);
  return match ? `${/^STEP/i.test(match[0]) ? "Step" : "Stage"} ${match[1]}` : "";
};
const normalizeStatus = value => {
  const raw = clean(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (raw === "confirmed") return "Confirmed";
  if (raw === "high probable" || raw === "high probability" || raw === "highly probable") return "High Probable";
  if (raw === "visible") return "Visible";
  return clean(value);
};
const isGenericEquipmentValue = value => ["reactor", "equipment", "equipment type", "reactor type"].includes(key(value));
const looksLikeId = value => /^\d{4,}$/.test(clean(value));

function fillMergedCells(worksheet, rows) {
  const out = rows.map(row => [...row]);
  for (const merge of worksheet["!merges"] || []) {
    const source = out[merge.s.r]?.[merge.s.c];
    if (source === undefined || source === null || source === "") continue;
    for (let r = merge.s.r; r <= merge.e.r; r += 1) {
      for (let c = merge.s.c; c <= merge.e.c; c += 1) {
        out[r] ||= [];
        if (out[r][c] === undefined || out[r][c] === "") out[r][c] = source;
      }
    }
  }
  return out;
}

function headerMap(row) {
  const result = {};
  row.forEach((value, index) => {
    const normalized = key(value);
    if (normalized && result[normalized] === undefined) result[normalized] = index;
  });
  return result;
}
function findColumn(headers, variants) {
  const entries = Object.entries(headers);
  const normalizedVariants = variants.map(key);
  const exact = entries.find(([h]) => normalizedVariants.includes(h));
  if (exact) return exact[1];
  const partial = entries.find(([h]) => normalizedVariants.some(v => h.includes(v)));
  return partial?.[1] ?? -1;
}
function findHeaderRow(rows, requiredSets) {
  return rows.findIndex(row => requiredSets.every(set => set.some(term => row.map(key).some(cell => cell.includes(key(term))))));
}
function sourceColumns(headers, row) {
  return headers.map((header, index) => ({
    index,
    header: clean(header) || `Column ${index + 1}`,
    value: row[index] ?? "",
    normalizedHeader: key(header) || `column ${index + 1}`,
  }));
}
function valueByHeader(headers, row, variants) {
  const col = findColumn(headerMap(headers), variants);
  return col >= 0 ? row[col] : "";
}

function parseEquipmentSheet(name, rows) {
  const headerRow = findHeaderRow(rows, [["site"], ["capacity"], ["reactor", "equipment"]]);
  if (headerRow < 0) return { equipment: [], clients: [] };
  const headers = rows[headerRow] || [];
  const h = headerMap(headers);
  const siteCol = findColumn(h, ["site"]);
  const blockCol = findColumn(h, ["block"]);
  const areaCol = findColumn(h, ["intermediate / clean room", "intermediate/clean room", "area"]);
  let reactorCol = findColumn(h, ["reactor no", "reactor number", "reactor"]);
  const sapCodeCol = findColumn(h, ["sap code", "sapcode", "sap"]);
  const equipmentIdCol = findColumn(h, ["equipment id", "equipment identifier", "equipment code"]);
  const equipmentTypeCol = findColumn(h, ["equipment type"]);
  const capacityCol = findColumn(h, ["capacity", "capacity (l)", "capacity (kl)"]);
  const mocCol = findColumn(h, ["moc", "material of construction"]);
  const agitatorCol = findColumn(h, ["agitator"]);
  const minCol = findColumn(h, ["min vol", "minimum sensible volume", "minimum volume", "min volume"]);
  const maxCol = findColumn(h, ["max vol", "maximum volume", "max volume"]);
  const projectCol = findColumn(h, ["project mapped", "mapped project", "project"]);
  const customerCol = findColumn(h, ["customer name", "customer", "client name", "client"]);
  const productCol = findColumn(h, ["product"]);
  const statusCol = findColumn(h, ["status"]);
  const stageCol = findColumn(h, ["stage"]);
  const stageCodeCol = findColumn(h, ["stage code"]);
  const continuousCol = findColumn(h, ["continuous/campaign", "continuous campaign"]);
  const linkedReactorsCol = findColumn(h, ["reactors", "reactor"]);
  const timelineCol = findColumn(h, ["timeline"]);
  const remarksCol = findColumn(h, ["remarks", "remark"]);
  const result = [];
  const clients = [];
  const dataRows = rows.slice(headerRow + 1).filter(row => row.some(v => clean(v)));

  if (reactorCol < 0 && equipmentTypeCol >= 0) reactorCol = equipmentTypeCol;
  const sample = dataRows.slice(0, 40).map(row => row[reactorCol]).filter(v => clean(v));
  if (sample.length && sample.filter(isGenericEquipmentValue).length / sample.length > 0.5 && equipmentTypeCol >= 0) reactorCol = equipmentTypeCol;

  dataRows.forEach((row, index) => {
    const reactorId = clean(row[reactorCol]);
    const site = canonicalSite(row[siteCol] || name);
    const clientName = clean(row[customerCol]);
    const product = clean(row[productCol]);
    const projectMapped = clean(row[projectCol]);
    const status = normalizeStatus(row[statusCol]) || (projectMapped ? "Mapped" : "Available");
    const stage = clean(row[stageCol]);
    const source = sourceColumns(headers, row);
    const operational = {
      id: reactorId,
      equipmentId: clean(row[equipmentIdCol]) || "",
      sapCode: clean(row[sapCodeCol]) || "",
      sourceReactorNo: clean(row[findColumn(h, ["reactor no", "reactor number"])]) || "",
      sourceEquipmentType: clean(row[equipmentTypeCol]),
      site,
      block: clean(row[blockCol]),
      area: clean(row[areaCol]),
      equipmentType: clean(row[equipmentTypeCol]) && !isGenericEquipmentValue(row[equipmentTypeCol]) && !looksLikeId(row[equipmentTypeCol]) ? clean(row[equipmentTypeCol]) : "Reactor",
      moc: clean(row[mocCol]),
      capacity: number(row[capacityCol]),
      agitator: clean(row[agitatorCol]),
      minVolume: row[minCol] ?? "",
      maxVolume: row[maxCol] ?? "",
      projectMapped,
      projectCodes: splitProjectCodes(projectMapped),
      status: projectMapped ? "Mapped" : "Available",
      planningStatus: status,
      sourceSheet: name,
      clientName,
      product,
      stage,
      stageCode: clean(row[stageCodeCol]),
      continuousCampaign: clean(row[continuousCol]),
      linkedReactors: clean(row[linkedReactorsCol]),
      timeline: clean(row[timelineCol]),
      remarks: clean(row[remarksCol]),
      sourceColumns: source,
      sourceValues: source.map(x => x.value),
      rawRecord: Object.fromEntries(source.map(x => [x.header, x.value])),
    };
    // A row without a reactor ID is still valuable client/project information and is retained in clientInformation.
    if (reactorId && !isGenericEquipmentValue(reactorId)) result.push(operational);
    if (clientName || product || stage || projectMapped) {
      clients.push({
        id: `${name}-${index + 1}`,
        sourceSheet: name,
        site,
        reactorId,
        block: clean(row[blockCol]),
        area: clean(row[areaCol]),
        clientName,
        product,
        projectCode: projectMapped,
        projectCodes: splitProjectCodes(projectMapped),
        status,
        stage,
        stageCode: clean(row[stageCodeCol]),
        continuousCampaign: clean(row[continuousCol]),
        linkedReactors: clean(row[linkedReactorsCol]),
        timeline: clean(row[timelineCol]),
        remarks: clean(row[remarksCol]),
        sourceColumns: source,
        sourceValues: source.map(x => x.value),
        rawRecord: Object.fromEntries(source.map(x => [x.header, x.value])),
      });
    }
  });
  return { equipment: result, clients };
}

// The latest 14-Oct workbook stores the physical inventory in the Mapping Tracker
// sheet. Site-named sheets are client/project schedules, not equipment-master sheets.
function parseTrackerInventory(rows, mappingTracker = [], clientInformation = []) {
  const headerRow = findHeaderRow(rows, [["site"], ["capacity"], ["reactor"]]);
  if (headerRow < 0) return [];
  const headers = rows[headerRow] || [];
  const h = headerMap(headers);
  const siteCol = findColumn(h, ["site"]);
  const blockCol = findColumn(h, ["block"]);
  const areaCol = findColumn(h, ["intermediate / clean room", "intermediate/clean room", "area"]);
  const reactorCol = findColumn(h, ["reactor", "reactor id", "reactor no"]);
  const mocCol = findColumn(h, ["moc", "material of construction"]);
  const capacityCol = findColumn(h, ["capacity"]);
  const agitatorCol = findColumn(h, ["agitator"]);
  const firmCol = findColumn(h, ["firm"]);
  const dateRow = rows[headerRow + 1] || [];
  const scheduleColumns = [];
  for (let c = Math.max(0, firmCol + 1); c < dateRow.length; c += 1) {
    const date = dateValue(dateRow[c]);
    if (date) scheduleColumns.push(c);
  }
  const clientMatches = (site, id) => clientInformation.filter(client => {
    if (key(client.site) !== key(site)) return false;
    const ids = [...(String(client.reactorId || "").match(/\d{4,}/g) || []), ...(String(client.linkedReactors || "").match(/\d{4,}/g) || [])];
    return ids.some(value => key(value) === key(id));
  });
  const seen = new Set();
  return rows.slice(headerRow + 2).filter(row => row.some(value => clean(value))).flatMap((row, index) => {
    const id = clean(row[reactorCol]);
    const site = canonicalSite(row[siteCol]);
    if (!id || !site || isGenericEquipmentValue(id)) return [];
    // Reactor IDs can legitimately repeat at one site in different areas/blocks.
    // Preserve each source row and only deduplicate exact physical identities.
    const identity = `${key(site)}|${key(id)}|${key(clean(row[blockCol]))}|${key(clean(row[areaCol]))}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    const source = sourceColumns(headers, row);
    const trackerRows = mappingTracker.filter(mapping => key(mapping.site) === key(site) && key(mapping.reactorId) === key(id));
    const clientRows = clientMatches(site, id);
    const client = clientRows[0] || {};
    const scheduledCodes = [...new Set(trackerRows.map(mapping => clean(mapping.productCode || mapping.product)).filter(Boolean))];
    const projectMapped = clean(client.product) || scheduledCodes[0] || "";
    const projectCodes = scheduledCodes.length ? scheduledCodes : (client.projectCode ? [clean(client.projectCode)] : []);
    const scheduleCategories = trackerRows.map(mapping => clean(mapping.category)).filter(category => ["Confirmed", "High Probable", "Visible"].includes(category));
    return [{
      uid: `EXCEL-${String(seen.size).padStart(4, "0")}`,
      equipmentId: clean(row[reactorCol]),
      id,
      site,
      block: clean(row[blockCol]),
      area: clean(row[areaCol]),
      equipmentType: "Reactor",
      sapCode: "",
      moc: clean(row[mocCol]),
      capacity: number(row[capacityCol]),
      agitator: clean(row[agitatorCol]),
      minVolume: "",
      maxVolume: "",
      projectMapped,
      sourceProjectMapped: projectMapped,
      projectCodes,
      status: projectMapped ? "Mapped" : "Available",
      planningStatus: scheduleCategories[0] || normalizeStatus(client.status) || "",
      sourceSheet: "Mapping Tracker",
      sourceExcelRow: headerRow + index + 3,
      clientName: clean(client.clientName),
      product: clean(client.product),
      stage: clean(client.stage),
      stageCode: clean(client.stageCode),
      continuousCampaign: clean(client.continuousCampaign),
      linkedReactors: clean(client.linkedReactors),
      timeline: clean(client.timeline),
      remarks: clean(client.remarks),
      sourceColumns: source,
      sourceValues: source.map(item => item.value),
      rawRecord: Object.fromEntries(source.map(item => [item.header, item.value])),
    }];
  });
}

// Parse the site-named tabs as client/project registers. They do not have
// equipment capacity columns, so treating them as reactor master sheets drops data.
function parseClientProjectSheet(name, rows) {
  const headerRow = findHeaderRow(rows, [["customer name", "customer"], ["product"], ["stage"], ["reactor", "reactors"]]);
  if (headerRow < 0) return [];
  const headers = rows[headerRow] || [];
  const h = headerMap(headers);
  const col = variants => findColumn(h, variants);
  const clientCol = col(["customer name", "customer", "client name", "client"]);
  const productCol = col(["product"]);
  const statusCol = col(["status"]);
  const stageCol = col(["stage"]);
  const areaCol = col(["area"]);
  const campaignCol = col(["continuous/campaign", "continuous campaign"]);
  const reactorCol = col(["reactor", "reactors"]);
  const timelineCol = col(["timeline"]);
  const blockCol = col(["block"]);
  return rows.slice(headerRow + 1).flatMap((row, index) => {
    if (!row.some(value => clean(value))) return [];
    const clientName = clean(row[clientCol]);
    const product = clean(row[productCol]);
    const stage = clean(row[stageCol]);
    const linkedReactors = clean(row[reactorCol]);
    if (!clientName && !product && !stage && !linkedReactors) return [];
    const reactorIds = [...new Set(linkedReactors.match(/\d{4,}/g) || [])];
    const source = sourceColumns(headers, row);
    return [{
      id: `${name}-${headerRow + index + 2}`,
      sourceSheet: name,
      site: canonicalSite(name),
      clientName,
      product,
      projectCode: stage,
      projectCodes: stage ? [stage] : [],
      productCode: "",
      status: normalizeStatus(row[statusCol]) || "Planned",
      stage,
      stageCode: stage,
      reactorId: reactorIds.join(", "),
      linkedReactors,
      block: clean(row[blockCol]),
      area: clean(row[areaCol]),
      continuousCampaign: clean(row[campaignCol]),
      timeline: clean(row[timelineCol]),
      remarks: "",
      sourceColumns: source,
      sourceValues: source.map(item => item.value),
      rawRecord: Object.fromEntries(source.map(item => [item.header, item.value])),
    }];
  });
}

function parseCapacitySummary(rows) {
  const headerRow = findHeaderRow(rows, [["site"], ["total capacity"], ["utilization"]]);
  if (headerRow < 0) return [];
  const h = headerMap(rows[headerRow]);
  const siteCol = findColumn(h, ["site"]), blockCol = findColumn(h, ["block"]), areaCol = findColumn(h, ["intermediate / clean room", "intermediate/clean room"]);
  const totalCol = findColumn(h, ["total capacity"]), utilCol = findColumn(h, ["utilization"]), mappedCol = findColumn(h, ["mapped"]), availableCol = findColumn(h, ["available"]);
  return rows.slice(headerRow + 1).filter(row => clean(row[siteCol])).map(row => ({
    site: canonicalSite(row[siteCol]), block: clean(row[blockCol]), area: clean(row[areaCol]),
    totalCapacity: number(row[totalCol]) / (key(rows[headerRow][totalCol]).includes("kl") ? 1 : 1000),
    utilization: number(row[utilCol]) / (key(rows[headerRow][utilCol]).includes("kl") ? 1 : 1000),
    mapped: number(row[mappedCol]) / (key(rows[headerRow][mappedCol]).includes("kl") ? 1 : 1000),
    available: number(row[availableCol]) / (key(rows[headerRow][availableCol]).includes("kl") ? 1 : 1000),
  }));
}

function parseSummary(rows) {
  const headerRow = rows.findIndex(row => row.some(v => key(v) === "site") && row.some(v => key(v).includes("total reactors")));
  if (headerRow < 0 || !rows[headerRow + 1]) return [];
  const base = rows[headerRow], months = rows[headerRow + 1], h = headerMap(base);
  const siteCol = findColumn(h, ["site"]), blockCol = findColumn(h, ["block"]), areaCol = findColumn(h, ["intermediate/clean room", "intermediate / clean room"]), capCol = findColumn(h, ["total capacity"]), totalReactorsCol = findColumn(h, ["total reactors"]);
  const groupStart = {
    mapped: base.findIndex(v => key(v).includes("mapped reactors")),
    occupied: base.findIndex(v => key(v).includes("occupied reactors")),
    ideal: base.findIndex(v => key(v).includes("ideal reactors")),
  };
  return rows.slice(headerRow + 2).filter(row => clean(row[siteCol])).map(row => {
    const out = { site: canonicalSite(row[siteCol]), block: clean(row[blockCol]), area: clean(row[areaCol]), totalCapacity: number(row[capCol]) / (key(base[capCol]).includes("kl") ? 1 : 1000), totalReactors: number(row[totalReactorsCol]) };
    Object.entries(groupStart).forEach(([metric, start]) => {
      if (start < 0) return;
      for (let offset = 0; offset < 12; offset += 1) {
        const colIndex = start + offset;
        const month = clean(months[colIndex]);
        if (month) out[`${metric}_${month.slice(0, 3)}`] = number(row[colIndex]);
      }
    });
    return out;
  });
}

function parseMappingTracker(rows, worksheet) {
  const headerRow = findHeaderRow(rows, [["site"], ["reactor"], ["capacity"]]);
  if (headerRow < 0) return [];
  const headers = rows[headerRow], h = headerMap(headers);
  const siteCol = findColumn(h,["site"]), blockCol = findColumn(h,["block"]), areaCol = findColumn(h,["intermediate / clean room","intermediate/clean room"]), reactorCol = findColumn(h,["reactor"]), mocCol = findColumn(h,["moc"]), capacityCol = findColumn(h,["capacity"]), agitatorCol = findColumn(h,["agitator"]), firmCol = findColumn(h,["firm"]);
  const dateHeaderRow = rows[headerRow + 1] || [], scheduleColumns = [];
  const firstScheduleCol = Math.max(siteCol, blockCol, areaCol, reactorCol, mocCol, capacityCol, agitatorCol) + 1;
  for (let c = firstScheduleCol; c < Math.max(dateHeaderRow.length, headers.length); c += 1) {
    const date = dateValue(dateHeaderRow[c]);
    if (date) scheduleColumns.push({ col: c, date });
  }
  const cellCategory = (rowIndex, colIndex) => {
    const cell = worksheet?.[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
    const fill = cell?.s?.fill?.fgColor || cell?.s?.fgColor || cell?.fill?.fgColor || cell?.style?.fill?.fgColor || {};
    const rgb = clean(fill.rgb || "").toUpperCase().replace(/^#/, "");
    const theme = Number(fill.theme);
    const tint = Number(fill.tint ?? 0);
    if (rgb === "FF92D050" || rgb === "92D050") return "Confirmed";
    if (rgb === "FFFFFF00" || rgb === "FFFF00") return "High Probable";
    if (["FFFFD966", "FFD966", "FFFFE699", "FFE699", "FFFFF2CC", "FFF2CC"].includes(rgb)) return "Visible";
    if (theme === 7 && [0.4, 0.6, 0.8].some(expected => Math.abs(tint - expected) < 0.03)) return "Visible";
    return "";
  };
  const output = [];
  rows.slice(headerRow + 2).forEach((row, index) => {
    const reactorId = clean(row[reactorCol]);
    if (!reactorId) return;
    const site = canonicalSite(row[siteCol]);
    const block = clean(row[blockCol]), area = clean(row[areaCol]);
    const moc = clean(row[mocCol]), capacity = number(row[capacityCol]), agitator = clean(row[agitatorCol]), firm = clean(row[firmCol]);
    const schedule = scheduleColumns.map(item => ({ date: item.date, value: clean(row[item.col]), category: cellCategory(headerRow + 2 + index, item.col) }))
      .filter(item => item.value && item.category);
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const last = new Date(`${run[run.length - 1].date}T00:00:00Z`);
      last.setUTCDate(last.getUTCDate() + 6);
      const code = run[0].value;
      const clientRows = [];
      const stageMatch = code.match(/(?:STG|STEP)[-_ ]*(\d+(?:\.\d+)?)/i);
      const stage = stageMatch ? `${/^STEP/i.test(stageMatch[0]) ? "Step" : "Stage"} ${stageMatch[1]}` : "";
      output.push({
        id: `WB-${String(output.length + 1).padStart(5, "0")}`,
        sourceType: "Workbook schedule", site, block, area, reactorId, moc, capacity, agitator, firm,
        product: code, productCode: code, projectCodes: [code], stage, stages: stage ? [stage] : [], stageCode: "",
        category: run[0].category, startDate: run[0].date, endDate: last.toISOString().slice(0, 10),
        schedule: run.map(item => ({ date: item.date, value: item.value, category: item.category })),
        sourceExcelRow: headerRow + index + 3,
      });
      run = [];
    };
    schedule.forEach(entry => {
      if (!run.length) { run = [entry]; return; }
      const prev = run[run.length - 1];
      const gap = (new Date(`${entry.date}T00:00:00Z`) - new Date(`${prev.date}T00:00:00Z`)) / 86400000;
      if (entry.value === prev.value && entry.category === prev.category && gap === 7) run.push(entry);
      else { flush(); run = [entry]; }
    });
    flush();
  });
  return output;
}

function parseVolumeSummary(rows) {
  const headerRow = rows.findIndex(row => ["total", "mapped", "utilized", "available"].every(term => row.map(key).some(cell => cell === term)));
  if (headerRow < 0) return [];
  const h = headerMap(rows[headerRow]);
  const cols = ["total", "mapped", "utilized", "available"].map(name => findColumn(h, [name]));
  // Some Excel tabs have a used range beginning at column D, so row arrays are
  // relative to that range. The label is the column immediately before Total.
  const firstMetricCol = Math.min(...cols.filter(index => index >= 0));
  const labelCol = Math.max(0, firstMetricCol - 1);
  return rows.slice(headerRow + 1).map(row => {
    const label = clean(row[labelCol]);
    if (!label || !cols.some(c => c >= 0 && clean(row[c]))) return null;
    return { level: SITE_NAMES.includes(canonicalSite(label)) ? "Site" : "Block", site: canonicalSite(label), block: "", total: number(row[cols[0]]), mapped: number(row[cols[1]]), utilized: number(row[cols[2]]), available: number(row[cols[3]]) };
  }).filter(Boolean);
}


function parsePlatformSheet(rows, fileName, worksheet) {
  const clean = value => { const text = String(value ?? "").trim(); return /^[-‐‑‒–—−]$/u.test(text) ? "" : text; };
  const number = value => { if (typeof value === "number" && Number.isFinite(value)) return value; const m = clean(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : 0; };
  const siteName = value => { const k = key(value).replace(/\s/g, ""); return ({cto2:"CTO-2",cto3:"CTO-3",cto5:"CTO-5",cto6:"CTO-6",ctosez:"CTO-SEZ",mexico:"Mexico",mirfield:"Mirfield"})[k] || clean(value); };
  const iso = value => { if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10); if (typeof value === "number") { const d = XLSX.SSF.parse_date_code(value); if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`; } return ""; };
  const sourceRows = rows.map(row => [...row]);
  // Excel's final row continues weekly codes for the last equipment row and has no repeated ID.
  if (sourceRows.length > 274) for (let c=17;c<77;c++) if (clean(sourceRows[274]?.[c]) && !clean(sourceRows[273]?.[c])) sourceRows[273][c] = sourceRows[274][c];
  const monthNumbers = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
  const scheduleHeaderDate = (() => {
    const out = {}; let current = null;
    for (let c = 17; c < 77; c += 1) {
      const label = clean(sourceRows?.[0]?.[c]);
      const match = label.match(/^([A-Za-z]+)[\'’]?(\d{2,4})/);
      if (match) {
        const month = monthNumbers[match[1].toLowerCase()];
        let year = Number(match[2]); if (year < 100) year += 2000;
        if (month) current = { month, year };
      }
      out[c] = current;
    }
    return out;
  })();
  const sourceScheduleDate = c => {
    const raw = sourceRows?.[1]?.[c];
    const base = raw instanceof Date ? raw : (typeof raw === "number" ? XLSX.SSF.parse_date_code(raw) : null);
    const header = scheduleHeaderDate[c];
    if (!base || !header) return iso(raw);
    const year = header.year;
    return `${year}-${String(header.month).padStart(2,"0")}-${String(base instanceof Date ? base.getDate() : base.d).padStart(2,"0")}`;
  };
  const cellCategory = (r, c) => {
    const cell = worksheet?.[XLSX.utils.encode_cell({ r, c })];
    const fill =
      cell?.s?.fill?.fgColor ||
      cell?.s?.fgColor ||
      cell?.fill?.fgColor ||
      cell?.style?.fill?.fgColor ||
      {};
    const rgb = clean(fill.rgb || "").toUpperCase().replace(/^#/, "");
    const theme = Number(fill.theme);
    const tint = Number(fill.tint ?? 0);

    // The workbook uses explicit RGB fills for green and yellow cells.
    if (rgb === "FF92D050" || rgb === "92D050") return "Confirmed";
    if (rgb === "FFFFFF00" || rgb === "FFFF00") return "High Probable";

    // Amber/Visible cells may be stored as either RGB or an Excel theme colour.
    if (["FFFFD966", "FFD966", "FFFFE699", "FFE699", "FFFFF2CC", "FFF2CC"].includes(rgb)) {
      return "Visible";
    }
    // In the uploaded workbook, amber schedule fills are Theme 7 with tint
    // values around 0.4, 0.6, or 0.8 rather than an explicit RGB value.
    if (theme === 7 && [0.4, 0.6, 0.8].some((expected) => Math.abs(tint - expected) < 0.03)) {
      return "Visible";
    }
    return "";
  };
  const sites = Array.from({length:7},(_,i)=>siteName(sourceRows[0]?.[i+1]));
  const capacityStructure = sites.map((site,i)=>({site,block:"",area:"",totalCapacity:number(sourceRows[1]?.[i+1]),mapped:number(sourceRows[2]?.[i+1]),utilization:number(sourceRows[3]?.[i+1]),available:number(sourceRows[4]?.[i+1])}));
  const dates = Array.from({length:60},(_,i)=>({col:17+i,date:sourceScheduleDate(17+i)}));
  const equipment=[]; const mappingTracker=[];
  for (let ri=2;ri<Math.min(274,sourceRows.length);ri++) {
    const row=sourceRows[ri]||[]; const id=clean(row[12]); const site=siteName(row[9]); if(!id||!site) continue;
    const uid=`EXCEL-${String(equipment.length+1).padStart(4,"0")}`; const schedule=[];
    dates.forEach(d=>{const value=clean(row[d.col]); if(value&&d.date) schedule.push({date:d.date,value,category:cellCategory(ri,d.col)});});
    const projectCodes=[...new Set(schedule.map(x=>x.value))];
    const sourceColumns=sourceRows[0].map((h,index)=>({index,header:clean(h)||`Column ${index+1}`,value:row[index]??"",normalizedHeader:key(h)||`column ${index+1}`}));
    const item={uid,equipmentId:uid,id,site,block:clean(row[10]),area:clean(row[11]),equipmentType:"Reactor",sapCode:"",moc:clean(row[13]),capacity:number(row[14]),agitator:clean(row[15]),firm:clean(row[16]),projectMapped:projectCodes.join(", "),sourceProjectMapped:projectCodes.join(", "),projectCodes,status:projectCodes.length?"Mapped":"Available",planningStatus:"",sourceSheet:"data for the platform",sourceExcelRow:ri+1,sourceColumns,sourceValues:sourceColumns.map(x=>x.value),rawRecord:Object.fromEntries(sourceColumns.map(x=>[x.header,x.value]))};
    equipment.push(item);
    let run=[];
    const flush=()=>{if(!run.length)return;const last=new Date(`${run[run.length-1].date}T00:00:00Z`);last.setUTCDate(last.getUTCDate()+6);const code=run[0].value;const category=run[0].category || "Workbook";const stageMatch=clean(code).match(/(?:STG|STEP)[-_ ]*(\\d+(?:\\.\\d+)?)/i);const stage=stageMatch ? `${/^STEP/i.test(stageMatch[0]) ? "Step" : "Stage"} ${stageMatch[1]}` : "";mappingTracker.push({id:`WB-${String(mappingTracker.length+1).padStart(5,"0")}`,sourceType:"Workbook schedule",site,block:item.block,area:item.area,reactorId:id,reactorUid:uid,equipmentId:uid,moc:item.moc,capacity:item.capacity,agitator:item.agitator,firm:item.firm,product:code,productCode:code,projectCodes:[code],stage,stages:stage?[stage]:[],stageCode:"",category,startDate:run[0].date,endDate:last.toISOString().slice(0,10),schedule:run.map(x=>({date:x.date,value:x.value})),sourceExcelRow:ri+1});run=[];};
    schedule.forEach(entry=>{if(!entry.category){if(run.length)flush();return;}if(!run.length){run=[entry];return;}const prev=run[run.length-1];const gap=(new Date(`${entry.date}T00:00:00Z`)-new Date(`${prev.date}T00:00:00Z`))/86400000;if(entry.value===prev.value&&entry.category===prev.category&&gap===7)run.push(entry);else{flush();run=[entry];}});flush();
  }
  const siteTotals=capacityStructure.map(row=>({site:row.site,totalCapacity:row.totalCapacity,utilizedCapacity:row.utilization,mappedCapacity:row.mapped,availableCapacity:row.available,blocks:0,areas:[],capacityRows:1,utilizationPercent:row.totalCapacity?Number((row.utilization/row.totalCapacity*100).toFixed(1)):0}));
  const probabilityCells = { Confirmed: 0, "High Probable": 0, Visible: 0 };
  const probabilityReactors = { Confirmed: new Set(), "High Probable": new Set(), Visible: new Set() };
  mappingTracker.forEach(m => { if (probabilityCells[m.category] !== undefined) { probabilityCells[m.category] += m.schedule.length; probabilityReactors[m.category].add(`${m.site}|${m.reactorId}`); } });
  const planningProbability = Object.fromEntries(Object.keys(probabilityCells).map(k => [k, { scheduleCells: probabilityCells[k], reactorCount: probabilityReactors[k].size }]));
  return {meta:{sourceWorkbook:fileName,sourceSheets:["data for the platform"],parsedAt:new Date().toISOString(),parser:"platform-sheet-source-of-truth-v2",totalReactors:equipment.length,capacitySourceLocked:true},validation:{valid:equipment.length===272,warnings:[],missingSheets:[],rowWarnings:[]},rawSheets:{"data for the platform":normalizeDashMarkers(sourceRows)},equipment,clientInformation:[],capacityStructure,siteTotals,summary:siteTotals.map(r=>({site:r.site,totalCapacity:r.totalCapacity,totalReactors:equipment.filter(e=>e.site===r.site).length})),mappingTracker,volumeSummary:[],counts:{sheets:1,equipment:equipment.length,capacity:capacityStructure.length,mappings:mappingTracker.length,summary:siteTotals.length,volume:0,clientInformation:0},planningProbability};
}

export async function parseWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, cellNF: false, cellText: false, cellStyles: true, bookVBA: true });
  const sheets = {};
  const sheetRows = {};
  workbook.SheetNames.forEach(name => {
    const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: true });
    const rows = fillMergedCells(workbook.Sheets[name], rawRows);
    sheets[name] = rows;
    sheetRows[name] = rows;
  });

  if (workbook.SheetNames.length === 1 && key(workbook.SheetNames[0]) === "data for the platform") {
    const singleRows = sheetRows[workbook.SheetNames[0]] || [];
    return parsePlatformSheet(singleRows, file.name, workbook.Sheets[workbook.SheetNames[0]]);
  }
  const requiredSheets = ["Capacity Summary", "Summary", "Mapping Tracker", "Volume summary", ...SITE_NAMES];
  const missingSheets = requiredSheets.filter(name => !workbook.SheetNames.includes(name));
  const validationWarnings = missingSheets.map(name => `Required source sheet is missing: ${name}. The upload was not accepted as a complete master workbook.`);
  const validationRowWarnings = [];
  const equipmentResults = workbook.SheetNames.flatMap(name => SITE_NAMES.some(site => key(name).replace(/\s/g, "") === key(site).replace(/\s/g, "") ) ? [parseEquipmentSheet(name, sheets[name])] : []);
  let equipment = equipmentResults.flatMap(x => x.equipment);
  let clientInformation = equipmentResults.flatMap(x => x.clients);
  const mappingTracker = parseMappingTracker(sheets["Mapping Tracker"] || [], workbook.Sheets["Mapping Tracker"]);
  // In the latest workbook, equipment inventory is in Mapping Tracker and the
  // site tabs contain client/project information. Parse client tabs first so the
  // inventory can be enriched with product, stage and timeline from the source.
  if (!clientInformation.length) {
    clientInformation = workbook.SheetNames.flatMap(name => SITE_NAMES.some(site => key(name).replace(/\s/g, "") === key(site).replace(/\s/g, "")) ? parseClientProjectSheet(name, sheets[name]) : []);
  }
  if (!equipment.length) equipment = parseTrackerInventory(sheets["Mapping Tracker"] || [], mappingTracker, clientInformation);
  // Enrich schedule rows with the product/client/stage recorded on the site tabs.
  const reactorTokens = value => [...new Set(String(value || "").match(/\d{4,}/g) || [])].map(key);
  mappingTracker.forEach(mapping => {
    const matched = clientInformation.find(client => key(client.site) === key(mapping.site) && (
      key(client.reactorId).split(/[^a-z0-9]+/).includes(key(mapping.reactorId)) ||
      reactorTokens(client.linkedReactors).includes(key(mapping.reactorId))
    ));
    if (matched) {
      mapping.clientName = mapping.clientName || matched.clientName || "";
      mapping.product = matched.product || mapping.product;
      mapping.stage = matched.stage || mapping.stage;
      mapping.stages = matched.stage ? [matched.stage] : (mapping.stages || []);
      mapping.stageCode = matched.stageCode || mapping.stageCode;
      mapping.timeline = matched.timeline || "";
      mapping.clientStatus = matched.status || "";
    }
  });
  equipment.forEach((row, index) => {
    if (!clean(row.id)) validationRowWarnings.push(`Equipment row ${index + 1}: missing Reactor ID / Equipment ID.`);
    if (number(row.capacity) < 0) validationRowWarnings.push(`Equipment row ${index + 1}: negative capacity.`);
  });
  const equipmentIdentitySet = new Set(equipment.map(row => `${key(row.site)}|${key(row.id)}|${key(row.block)}|${key(row.area)}`));
  mappingTracker.forEach((row, index) => {
    const exactIdentity = `${key(row.site)}|${key(row.reactorId)}|${key(row.block)}|${key(row.area)}`;
    const siteIdIdentity = `${key(row.site)}|${key(row.reactorId)}`;
    const hasSiteId = equipment.some(item => `${key(item.site)}|${key(item.id)}` === siteIdIdentity);
    if (row.reactorId && !equipmentIdentitySet.has(exactIdentity) && !hasSiteId) validationRowWarnings.push(`Mapping row ${index + 1}: Reactor ID ${row.reactorId} at ${row.site} does not match an equipment record.`);
  });
  const capacityStructure = parseCapacitySummary(sheets["Capacity Summary"] || []);
  const summary = parseSummary(sheets.Summary || []);
  const volumeSummary = parseVolumeSummary(sheets["Volume summary"] || []);
  const inventoryCapacityKL = equipment.reduce((sum, row) => sum + number(row.capacity), 0) / 1000;
  const capacitySummaryKL = capacityStructure.reduce((sum, row) => sum + number(row.totalCapacity), 0);
  const capacityDiscrepancy = Math.abs(inventoryCapacityKL - capacitySummaryKL);
  const capacityWarnings = capacityDiscrepancy > 0.001
    ? [`Source workbook capacity discrepancy: individual inventory rows sum to ${inventoryCapacityKL.toFixed(3)} kL while Capacity Summary totals ${capacitySummaryKL.toFixed(3)} kL (difference ${capacityDiscrepancy.toFixed(3)} kL). Both source values are preserved.`]
    : [];
  const uniqueEquipment = [];
  const seen = new Set();
  equipment.forEach(item => {
    const identity = `${key(item.site)}|${key(item.id)}|${key(item.block)}|${key(item.area)}`;
    if (!seen.has(identity)) { seen.add(identity); uniqueEquipment.push(item); }
  });
  const equipmentByIdentity = new Map(uniqueEquipment.map(item => [`${key(item.site)}|${key(item.id)}|${key(item.block)}|${key(item.area)}`, item]));
  const probabilityValues = ["Confirmed", "High Probable", "Visible"];
  mappingTracker.forEach(mapping => {
    const match = equipmentByIdentity.get(`${key(mapping.site)}|${key(mapping.reactorId)}|${key(mapping.block)}|${key(mapping.area)}`)
      || uniqueEquipment.find(item => key(item.site) === key(mapping.site) && key(item.id) === key(mapping.reactorId));
    if (match) {
      // The schedule-cell fill determines each interval's probability category.
      // Do not replace it with the equipment row's first/overall status.
      if (!mapping.block) mapping.block = clean(match.block);
      if (!mapping.area) mapping.area = clean(match.area);
      if (!mapping.moc) mapping.moc = clean(match.moc);
      if (!mapping.agitator) mapping.agitator = clean(match.agitator);
      if (!mapping.capacity) mapping.capacity = number(match.capacity);
      if (!mapping.product && match.projectMapped) mapping.product = clean(match.projectMapped);
      if (!mapping.productCode && match.projectMapped) mapping.productCode = clean(match.projectMapped);
      if (!mapping.stage && match.stage) mapping.stage = clean(match.stage);
      if ((!mapping.stages || !mapping.stages.length) && match.stage) mapping.stages = [clean(match.stage)];
      if (!mapping.stageCode && match.stageCode) mapping.stageCode = clean(match.stageCode);
    }
  });

  return {
    meta: { sourceWorkbook: file.name, sourceSheets: workbook.SheetNames, parsedAt: new Date().toISOString(), parser: "browser-workbook-parser-v7-mapping-tracker-inventory-colour-runs", requiredSheets, capacitySourceLocked: true, totalReactors: uniqueEquipment.length },
    validation: { valid: equipment.length > 0 && missingSheets.length === 0 && validationRowWarnings.length === 0, missingSheets, warnings: [...validationWarnings, ...validationRowWarnings, ...capacityWarnings], rowWarnings: validationRowWarnings },
    // Complete sheet payload: no sheet, row or column is discarded during upload.
    rawSheets: normalizeDashMarkers(sheetRows),
    equipment: uniqueEquipment,
    clientInformation,
    capacityStructure,
    summary,
    mappingTracker,
    volumeSummary,
    counts: { sheets: workbook.SheetNames.length, equipment: uniqueEquipment.length, capacity: capacityStructure.length, mappings: mappingTracker.length, summary: summary.length, volume: volumeSummary.length, clientInformation: clientInformation.length },
  };
}
