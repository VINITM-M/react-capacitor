import * as XLSX from "xlsx-js-style";
import { normalizeDashMarkers, resolveStageCode, cleanKnownText } from "./unknownUtils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

const NUMBER_KEYS = /capacity|utilization|mapped|available|volume|count|total|percent|percentage/i;
const isHiddenExportColumn = key => false;
const EXPORT_LABELS = {
  uid: "Record ID", id: "Reactor ID", site: "Site", block: "Block", area: "Area",
  equipmentType: "Equipment Type", equipmentId: "Equipment ID", sapCode: "SAP Code", moc: "MOC", capacity: "Capacity (kL)", agitator: "Agitator",
  minVolume: "Minimum Volume (L)", maxVolume: "Maximum Volume (L)", projectMapped: "Project Mapped",
  sourceSheet: "Source Sheet", status: "Status", totalCapacity: "Total Capacity (kL)",
  utilization: "Utilization (kL)", mapped: "Mapped (kL)", available: "Available (kL)",
  totalCapacityKL: "Total Capacity (kL)", totalReactors: "Total Reactors", reactorId: "Reactor ID",
  reactorUid: "Reactor UID", firm: "Firm", product: "Product Name", productCode: "Stage Code", projectCode: "Stage Code", productCodes: "Stage Code", projectCodes: "Stage Code",
  stage: "Stage Code", stageCode: "Stage Code", category: "Probability", mappingId: "Mapping ID",
  date: "Date", timestamp: "Timestamp", user: "User", action: "Action", metric: "Metric",
  value: "Value", unit: "Unit", period: "Period", mappedReactors: "Mapped Reactors",
  occupiedReactors: "Occupied Reactors", idealReactors: "Ideal Reactors", activeMappings: "Active Mappings",
  activeMaintenance: "Active Maintenance"
};

function exportColumnLabel(key) {
  const raw = String(key ?? "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return EXPORT_LABELS[key] || raw.replace(/\b\w/g, c => c.toUpperCase());
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : null;
}

function cleanValue(value, key = "") {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" && /^\s*[-‐‑‒–—−]\s*$/u.test(value)) return "Unknown";
  if (typeof value === "number") return value;
  if (value instanceof Date) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "object") return JSON.stringify(normalizeDashMarkers(value));
  const parsed = NUMBER_KEYS.test(key) ? parseNumber(value) : null;
  return parsed !== null && String(value).trim() !== "" ? parsed : String(value);
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  const legacyCodeFields = new Set(["stage", "stages", "productCode", "projectCode", "productCodes", "projectCodes"]);
  return rows.map(row => {
    const source = row || {};
    const output = {};
    Object.entries(source).forEach(([key, value]) => {
      if (isHiddenExportColumn(key) || legacyCodeFields.has(key)) return;
      output[key] = cleanValue(value, key);
    });
    // Exports expose one canonical Stage Code column, while the source object keeps all legacy
    // fields internally for compatibility. Prefer Stage Code; use a source product/project code
    // only when no Stage Code is populated, so a missing stage value is never silently blank.
    const hasAnyCodeField = ["stageCode", "stage", "stages", "productCode", "projectCode", "productCodes", "projectCodes"]
      .some(key => Object.prototype.hasOwnProperty.call(source, key));
    if (hasAnyCodeField) {
      const resolved = resolveStageCode(source);
      const fallbackCodes = [source.productCode, source.projectCode, source.productCodes, source.projectCodes]
        .flatMap(value => Array.isArray(value) ? value : [value])
        .map(cleanKnownText).filter(Boolean);
      const canonicalStageCode = resolved !== "Unknown" ? resolved : [...new Set(fallbackCodes)].join(", ") || "Unknown";
      output.stageCode = cleanValue(canonicalStageCode, "stageCode");
    }
    return output;
  });
}

function columnsFor(data) {
  return Array.from(new Set(data.flatMap(row => Object.keys(row))));
}

function downloadCSV(rows, filename) {
  const data = normalizeRows(rows);
  if (!data.length) throw new Error("There is no data to download.");
  const columns = columnsFor(data);
  const escapeCSV = value => {
    const text = value instanceof Date ? value.toISOString() : String(value ?? "");
    return /[,"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    columns.map(column => escapeCSV(exportColumnLabel(column))).join(","),
    ...data.map(row => columns.map(column => escapeCSV(row[column])).join(","))
  ];
  triggerDownload(new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" }), filename);
}

function downloadJSON(rows, filename) {
  const data = normalizeRows(rows);
  if (!data.length) throw new Error("There is no data to download.");
  triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8;" }), filename);
}

function buildWorksheet(rows) {
  const data = normalizeRows(rows);
  if (!data.length) return null;
  const columns = columnsFor(data);
  const worksheet = XLSX.utils.json_to_sheet(data, { cellDates: true });
  // Master-data workbook palette (matched to the supplied source workbook)
  const headerFill = "7030A0";
  const mappedFill = "92D050";
  const warningFill = "FFFF00";
  const visibleFill = "0070C0";
  const maintenanceFill = "FF0000";
  const summaryFill = "009999";
  const headerText = "FFFFFF";
  const statusFill = {
    Confirmed: mappedFill,
    "High Probable": warningFill,
    Visible: visibleFill,
    Maintenance: maintenanceFill,
    Available: mappedFill,
    Mapped: mappedFill
  };
  const statusFont = {
    Confirmed: "000000",
    "High Probable": "000000",
    Visible: "FFFFFF",
    Maintenance: "FFFFFF",
    Available: "000000",
    Mapped: "000000"
  };
  // Bright, high-visibility site colours used consistently across exports.
  const siteFill = {
    "CTO-2": "00B0F0",
    "CTO-3": "70AD47",
    "CTO-5": "FFC000",
    "CTO-6": "A64DFF",
    "CTO-SEZ": "00B8A9",
    Mexico: "ED7D31",
    Mirfield: "4472C4"
  };
  const siteFont = {
    "CTO-2": "FFFFFF", "CTO-3": "FFFFFF", "CTO-5": "000000",
    "CTO-6": "FFFFFF", "CTO-SEZ": "FFFFFF", Mexico: "FFFFFF", Mirfield: "FFFFFF"
  };

  columns.forEach((column, c) => {
    const header = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (header) {
      header.v = exportColumnLabel(column);
      header.t = "s";
      header.s = {
        fill: { fgColor: { rgb: headerFill } },
        font: { bold: true, color: { rgb: headerText } },
        alignment: { vertical: "center", horizontal: "left", wrapText: true },
        border: { bottom: { style: "thin", color: { rgb: "D9E3EA" } } }
      };
    }
  });

  for (let r = 1; r <= data.length; r += 1) {
    const row = data[r - 1];
    const rawStatus = String(row.status ?? row.category ?? row.probability ?? row.availability ?? "").trim();
    const statusKey = rawStatus.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    const statusAliases = {
      "confirmed": "Confirmed",
      "high probable": "High Probable",
      "high probability": "High Probable",
      "visible": "Visible",
      "under maintenance": "Maintenance",
      "maintenance": "Maintenance",
      "available": "Available",
      "mapped": "Mapped"
    };
    const normalizedStatus = statusAliases[statusKey] || rawStatus;
    const statusColor = statusFill[normalizedStatus];
    const statusColorFont = statusFont[normalizedStatus];
    const siteColor = siteFill[String(row.site || "")];

    columns.forEach((column, c) => {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) return;
      const lower = String(column).toLowerCase();
      const statusColumn = lower === "status" || lower === "category" || lower === "probability" || lower === "availability";
      const mappingColumn = /project|product|mapped|mapping/.test(lower);
      let fill = null;
      let fontColor = "000000";
      const cellStatusKey = String(cell.v ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
      const cellStatus = statusAliases[cellStatusKey];
      const cellStatusColor = cellStatus ? statusFill[cellStatus] : null;
      const cellStatusFont = cellStatus ? statusFont[cellStatus] : null;
      if (statusColumn && cellStatusColor) {
        fill = cellStatusColor;
        fontColor = cellStatusFont || "000000";
      } else if (statusColor && statusColumn) {
        fill = statusColor;
        fontColor = statusColorFont || "000000";
      } else if (mappingColumn && String(cell.v ?? "").trim()) {
        // The master workbook uses green for mapped/project-populated cells.
        fill = mappedFill;
      } else if (siteColor && lower === "site") {
        fill = siteColor;
        fontColor = siteFont[String(row.site || "")] || "FFFFFF";
      }
      const isEvenDataRow = r % 2 === 0;
      const style = {
        alignment: { vertical: "center", horizontal: typeof cell.v === "number" ? "right" : "left", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "E2E8ED" } },
          bottom: { style: "thin", color: { rgb: "E2E8ED" } },
          left: { style: "thin", color: { rgb: "E2E8ED" } },
          right: { style: "thin", color: { rgb: "E2E8ED" } }
        },
        font: { name: "Aptos", sz: 10, color: { rgb: "263746" } }
      };
      if (isEvenDataRow && !fill) style.fill = { fgColor: { rgb: "F8FAFC" } };
      if (fill) {
        style.fill = { fgColor: { rgb: fill } };
        style.font = { name: "Aptos", sz: 10, bold: true, color: { rgb: fontColor } };
        if (statusColumn && cellStatusColor) {
          style.border = {
            top: { style: "medium", color: { rgb: "000000" } },
            bottom: { style: "medium", color: { rgb: "000000" } },
            left: { style: "medium", color: { rgb: "000000" } },
            right: { style: "medium", color: { rgb: "000000" } }
          };
        }
      }
      cell.s = style;
    });
  }

  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  worksheet["!rows"] = [{ hpt: 34 }];
  for (let r = 1; r <= data.length; r += 1) worksheet["!rows"][r] = { hpt: 22 };
  worksheet["!cols"] = columns.map(column => {
    const max = Math.max(
      String(column).length,
      ...data.slice(0, 500).map(row => String(row[column] ?? "").length)
    );
    return { wch: Math.min(Math.max(max + 2, 10), 42) };
  });

  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const key = columns[c];
    for (let r = range.s.r + 1; r <= range.e.r; r += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      if (typeof cell.v === "number") {
        if (/capacity|utilization|mapped|available|volume|kl/i.test(key)) cell.z = "#,##0.000";
        else if (/percent|percentage/i.test(key)) cell.z = "0.0";
        else cell.z = "#,##0.00";
      }
    }
  }
  return worksheet;
}

function buildColourLegendWorksheet() {
  const rows = [
    { Status: "Confirmed", Description: "Confirmed mapping / project", Colour: "Green" },
    { Status: "High Probable", Description: "High probability mapping", Colour: "Yellow" },
    { Status: "Visible", Description: "Visible / identified", Colour: "Blue" },
    { Status: "Under Maintenance", Description: "Reactor under maintenance", Colour: "Red" }
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const fills = { Confirmed:"92D050", "High Probable":"FFFF00", Visible:"0070C0", "Under Maintenance":"FF0000" };
  const fonts = { Confirmed:"000000", "High Probable":"000000", Visible:"FFFFFF", "Under Maintenance":"FFFFFF" };
  ["Status","Description","Colour"].forEach((_, c) => {
    const cell = ws[XLSX.utils.encode_cell({r:0,c})];
    if (cell) cell.s = { fill:{fgColor:{rgb:"7030A0"}}, font:{bold:true,color:{rgb:"FFFFFF"}}, alignment:{vertical:"center",wrapText:true} };
  });
  rows.forEach((row, r) => {
    const fill=fills[row.Status], color=fonts[row.Status];
    [0,2].forEach(c => { const cell=ws[XLSX.utils.encode_cell({r:r+1,c})]; if(cell) cell.s={fill:{fgColor:{rgb:fill}},font:{bold:true,color:{rgb:color}},alignment:{vertical:"center"}}; });
  });
  ws["!cols"]=[{wch:22},{wch:36},{wch:14}]; ws["!freeze"]={xSplit:0,ySplit:1};
  return ws;
}

function normalKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function uniqueSheetName(workbook, baseName) {
  const used = new Set(workbook.SheetNames.map(name => name.toLowerCase()));
  let candidate = String(baseName || "Sheet").slice(0, 31);
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    const tail = ` ${suffix++}`;
    candidate = `${String(baseName).slice(0, 31 - tail.length)}${tail}`;
  }
  return candidate;
}

function getCategoryBreakdown(rows) {
  const data = normalizeRows(rows);
  if (data.length < 2) return null;
  const columns = columnsFor(data);
  const preferredKeys = [
    "site", "status", "category", "probability", "availability", "moc",
    "materialofconstruction", "agitator", "stage", "product", "productcode",
    "project", "projectcode", "client", "customer", "block", "area", "sourcesheet"
  ];
  const candidates = preferredKeys.map(key => columns.find(column => normalKey(column) === key)).filter(Boolean);
  for (const column of candidates) {
    const bucket = new Map();
    data.forEach(row => {
      const raw = row[column];
      const label = raw === null || raw === undefined || String(raw).trim() === "" ? "Blank / missing" : String(raw).trim();
      bucket.set(label, (bucket.get(label) || 0) + 1);
    });
    const unique = bucket.size;
    const sensibleLimit = Math.max(5, Math.min(40, Math.ceil(data.length * 0.75)));
    if (unique < 2 || unique > sensibleLimit) continue;
    let items = [...bucket.entries()].map(([label, value]) => ({ label, value, note: `${value.toLocaleString()} records in this category` })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    if (items.length > 12) {
      const top = items.slice(0, 11);
      const remainder = items.slice(11).reduce((sum, item) => sum + item.value, 0);
      items = [...top, { label: "Other categories", value: remainder, note: `${remainder.toLocaleString()} records across the remaining source categories` }];
    }
    return { categoryLabel: exportColumnLabel(column), totalRecords: data.length, items };
  }
  return null;
}

function appendVisualAnalysisSheets(workbook, { title = "Visual Analysis", subtitle = "Workbook-backed summary", categoryLabel = "Category", items = [] } = {}) {
  if (!Array.isArray(items) || items.length < 2) return [];
  const palette = ["2563EB", "06B6D4", "10B981", "F59E0B", "8B5CF6", "EF4444", "F97316", "EC4899", "14B8A6", "6366F1", "84CC16", "0EA5E9"];
  const tints = ["DBEAFE", "CFFAFE", "D1FAE5", "FEF3C7", "EDE9FE", "FEE2E2", "FFEDD5", "FCE7F3", "CCFBF1", "E0E7FF", "ECFCCB", "E0F2FE"];
  const total = items.reduce((sum, item) => sum + Math.max(0, Number(item.value) || 0), 0);
  const chartSpecs = [];
  const variants = [
    { name: uniqueSheetName(workbook, title), type: "bar", heading: title, subtitle, message: "Bar chart colours identify categories; source records and category counts are preserved below." },
    { name: uniqueSheetName(workbook, "Category Mix"), type: "pie", heading: "Category Mix", subtitle: `Share of exported records by ${categoryLabel.toLowerCase()}.`, message: "Pie segments show each category's share of the exported record count." }
  ];
  variants.forEach((variant) => {
    const aoa = [
      [variant.heading],
      [variant.subtitle],
      [variant.message],
      [categoryLabel, "Record count", "Share of records", "Analysis note"]
    ];
    items.forEach(item => aoa.push([item.label, Number(item.value) || 0, total ? (Number(item.value) || 0) / total : 0, item.note || `${Number(item.value) || 0} records`]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }
    ];
    ws["!cols"] = [{ wch: 31 }, { wch: 17 }, { wch: 18 }, { wch: 52 }];
    ws["!rows"] = [{ hpt: 34 }, { hpt: 30 }, { hpt: 25 }, { hpt: 24 }, ...items.map(() => ({ hpt: 24 }))];
    ws["!freeze"] = { xSplit: 0, ySplit: 4 };
    for (let r = 0; r < aoa.length; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        const accent = palette[Math.max(0, r - 4) % palette.length];
        const tint = tints[Math.max(0, r - 4) % tints.length];
        let fill = r === 0 ? "123F78" : r === 1 ? "EAF4FF" : r === 2 ? "DCEAFE" : r === 3 ? "1769AA" : (r % 2 ? "FFFFFF" : "F7FAFC");
        let font = r === 0 ? { name: "Aptos Display", sz: 18, bold: true, color: { rgb: "FFFFFF" } }
          : r === 3 ? { name: "Aptos", sz: 10, bold: true, color: { rgb: "FFFFFF" } }
          : { name: "Aptos", sz: 10, color: { rgb: "19324D" }, bold: c === 0 };
        if (r >= 4 && c === 0) { fill = tint; font = { name: "Aptos", sz: 10, bold: true, color: { rgb: accent } }; }
        if (r >= 4 && c === 1) font = { name: "Aptos", sz: 11, bold: true, color: { rgb: accent } };
        if (r >= 4 && c === 2) font = { name: "Aptos", sz: 10, bold: true, color: { rgb: accent } };
        cell.s = {
          fill: { fgColor: { rgb: fill } }, font,
          alignment: { vertical: "center", wrapText: true, horizontal: c === 1 || c === 2 ? "right" : "left" },
          border: { bottom: { style: "thin", color: { rgb: "D5E2EF" } } }
        };
        if (r >= 4 && c === 1) cell.z = "#,##0";
        if (r >= 4 && c === 2) cell.z = "0.0%";
      }
    }
    XLSX.utils.book_append_sheet(workbook, ws, variant.name);
    const sheetId = workbook.SheetNames.length;
    chartSpecs.push({ sheetId, title: variant.type === "pie" ? `${categoryLabel} distribution` : `${categoryLabel} record count`, type: variant.type, firstRow: 5, lastRow: items.length + 4, hasData: true });
  });
  return chartSpecs;
}

function downloadWorkbookWithCharts(workbook, chartSpecs, filename) {
  const raw = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true });
  const result = chartSpecs?.length ? injectNativeExcelCharts(raw, chartSpecs) : raw;
  triggerDownload(new Blob([result], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

function downloadExcel(rows, filename, sheetName, title) {
  const worksheet = buildWorksheet(rows);
  if (!worksheet) throw new Error("There is no data to download.");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "Data");
  XLSX.utils.book_append_sheet(workbook, buildColourLegendWorksheet(), "Colour Legend");
  const breakdown = getCategoryBreakdown(rows);
  const chartSpecs = breakdown ? appendVisualAnalysisSheets(workbook, {
    title: "Visual Analysis",
    subtitle: `${breakdown.totalRecords.toLocaleString()} exported records grouped by ${breakdown.categoryLabel.toLowerCase()}.`,
    categoryLabel: breakdown.categoryLabel,
    items: breakdown.items
  }) : [];
  workbook.Props = {
    Title: title || "ReactorPlan Data Export",
    Subject: "ReactorPlan operational data with source-derived visual analysis",
    CreatedDate: new Date()
  };
  downloadWorkbookWithCharts(workbook, chartSpecs, filename);
}

export function exportWorkbook({ sheets, filename = "reactorplan-complete", title = "ReactorPlan Complete Export" }) {
  const workbook = XLSX.utils.book_new();
  let appended = 0;
  const usedNames = new Set();
  const sheetMetrics = [];

  (sheets || []).forEach(sheet => {
    const worksheet = buildWorksheet(sheet.rows || []);
    if (!worksheet) return;
    let name = String(sheet.name || `Sheet${appended + 1}`).slice(0, 31) || `Sheet${appended + 1}`;
    let candidate = name;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${name.slice(0, Math.max(1, 31 - String(suffix).length - 1))}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(candidate);
    XLSX.utils.book_append_sheet(workbook, worksheet, candidate);
    const rowCount = normalizeRows(sheet.rows || []).length;
    sheetMetrics.push({ label: candidate, value: rowCount, note: `${rowCount.toLocaleString()} records exported to ${candidate}` });
    appended += 1;
  });

  if (!appended) throw new Error("There is no data to download.");
  XLSX.utils.book_append_sheet(workbook, buildColourLegendWorksheet(), "Colour Legend");
  const chartSpecs = appendVisualAnalysisSheets(workbook, {
    title: "Export Overview",
    subtitle: "Source-preserving overview of records included in each exported worksheet.",
    categoryLabel: "Export worksheet",
    items: sheetMetrics.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
  });
  workbook.Props = {
    Title: title,
    Subject: "ReactorPlan complete operational export with visual worksheet summary",
    CreatedDate: new Date()
  };
  downloadWorkbookWithCharts(workbook, chartSpecs, `${filename}.xlsx`);
}

function downloadPDF(rows, filename, title) {
  const data = normalizeRows(rows);
  if (!data.length) throw new Error("There is no data to download.");
  const columns = columnsFor(data);
  const body = data.map(row => columns.map(column => String(row[column] ?? "")));
  const doc = new jsPDF({
    orientation: columns.length > 8 ? "landscape" : "portrait",
    unit: "mm",
    format: "a4"
  });
  doc.setFontSize(16);
  doc.text(title || "ReactorPlan Data Export", 14, 15);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
  autoTable(doc, {
    head: [columns.map(exportColumnLabel)],
    body,
    startY: 28,
    styles: { fontSize: columns.length > 10 ? 5 : 7, cellPadding: 2 },
    headStyles: { fontSize: 7 },
    margin: { left: 8, right: 8 },
    theme: "grid"
  });
  doc.save(filename);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportData({
  rows,
  format = "xlsx",
  filename = "reactorplan-export",
  sheetName = "Data",
  title = "ReactorPlan Data Export"
}) {
  const extension = String(format).toLowerCase();
  if (extension === "csv") return downloadCSV(rows, `${filename}.csv`);
  if (extension === "json") return downloadJSON(rows, `${filename}.json`);
  if (extension === "xlsx") return downloadExcel(rows, `${filename}.xlsx`, sheetName, title);
  if (extension === "pdf") return downloadPDF(rows, `${filename}.pdf`, title);
  throw new Error(`Unsupported export format: ${format}`);
}


function xmlEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function chartXml({ title, type = "bar", sheetName, firstRow = 5, lastRow = 5, anchor = "F2" }) {
  const safeSheet = `'${String(sheetName).replace(/'/g, "''")}'`;
  const catFormula = `${safeSheet}!$A$${firstRow}:$A$${lastRow}`;
  const valFormula = `${safeSheet}!$B$${firstRow}:$B$${lastRow}`;
  const isPie = type === "pie";
  const palette = ["2563EB", "06B6D4", "10B981", "F59E0B", "8B5CF6", "EF4444", "F97316", "EC4899", "14B8A6", "6366F1", "84CC16", "0EA5E9"];
  const pointCount = Math.max(0, Number(lastRow) - Number(firstRow) + 1);
  const dataPointStyles = Array.from({ length: pointCount }, (_, index) => {
    const color = palette[index % palette.length];
    return `<c:dPt><c:idx val="${index}"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:dPt>`;
  }).join("");
  const labels = isPie
    ? (pointCount <= 6
      ? `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showPercent val="1"/><c:showCategoryName val="1"/><c:showLeaderLines val="1"/></c:dLbls>`
      : `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showPercent val="1"/><c:showCategoryName val="0"/><c:showLeaderLines val="1"/></c:dLbls>`)
    : `<c:dLbls><c:showVal val="1"/></c:dLbls>`;
  const plot = isPie
    ? `<c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${xmlEscape(title)}</c:v></c:tx>${dataPointStyles}${labels}<c:cat><c:strRef><c:f>${xmlEscape(catFormula)}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${xmlEscape(valFormula)}</c:f></c:numRef></c:val></c:ser><c:firstSliceAng val="270"/></c:pieChart>`
    : `<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${xmlEscape(title)}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>${dataPointStyles}${labels}<c:cat><c:strRef><c:f>${xmlEscape(catFormula)}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${xmlEscape(valFormula)}</c:f></c:numRef></c:val></c:ser><c:gapWidth val="55"/><c:overlap val="0"/><c:axId val="123456"/><c:axId val="123457"/></c:barChart><c:catAx><c:axId val="123456"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:tickLblPos val="nextTo"/><c:crossAx val="123457"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="123457"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="DCE6F1"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="#,##0.##" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="123456"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  const legend = isPie ? `<c:legend><c:legendPos val="b"/><c:layout/><c:overlay val="0"/></c:legend>` : "";
  const [col, row] = anchor.match(/[A-Z]+|\d+/g);
  const colNumber = col.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rowNumber = Number(row) - 1;
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:lang val="en-US"/><c:style val="10"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1500" b="1"><a:solidFill><a:srgbClr val="123F78"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="en-US"/><a:t>${xmlEscape(title)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:plotArea><c:layout/>${plot}<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="D5E2EF"/></a:solidFill></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings></c:chartSpace>`;
  return { colNumber, rowNumber, xml };
}
function injectNativeExcelCharts(workbookBytes, chartSpecs) {
  const files = unzipSync(new Uint8Array(workbookBytes));
  const read = (path) => files[path] ? strFromU8(files[path]) : "";
  const write = (path, value) => { files[path] = strToU8(value); };
  let contentTypes = read("[Content_Types].xml");
  let chartNo = 1;
  chartSpecs.forEach((spec, index) => {
    const sheetPath = `xl/worksheets/sheet${spec.sheetId}.xml`;
    let sheetXml = read(sheetPath);
    if (!sheetXml || !spec.hasData) return;
    const drawingId = `rIdEDAChart${spec.sheetId}`;
    sheetXml = sheetXml.replace("</worksheet>", `<drawing r:id="${drawingId}"/></worksheet>`);
    write(sheetPath, sheetXml);
    const relPath = `xl/worksheets/_rels/sheet${spec.sheetId}.xml.rels`;
    let relXml = read(relPath);
    if (!relXml) relXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    relXml = relXml.replace("</Relationships>", `<Relationship Id="${drawingId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${spec.sheetId}.xml"/></Relationships>`);
    write(relPath, relXml);
    const chart = chartXml({ ...spec, anchor: "F2" });
    const chartId = chartNo++;
    const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${chart.colNumber}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.rowNumber}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${chart.colNumber + 9}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.rowNumber + 18}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${chartId}" name="${xmlEscape(spec.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
    write(`xl/drawings/drawing${spec.sheetId}.xml`, drawing);
    write(`xl/drawings/_rels/drawing${spec.sheetId}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartId}.xml"/></Relationships>`);
    write(`xl/charts/chart${chartId}.xml`, chart.xml);
    contentTypes = contentTypes.replace("</Types>", `<Override PartName="/xl/drawings/drawing${spec.sheetId}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart${chartId}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
  });
  write("[Content_Types].xml", contentTypes);
  return zipSync(files, { level: 6 });
}

export function exportEdaVisualWorkbook({ overview = [], sites = [], status = [], planning = [], quality = [], products = [], capacityBands = [], filename = "reactorplan-eda-visual" }) {
  const wb = XLSX.utils.book_new();
  const navy = "123F78", blue = "1769AA", cyan = "00A6D6", pale = "EAF4FF", green = "DDF7E5";
  const rowPalette = ["2563EB", "06B6D4", "10B981", "F59E0B", "8B5CF6", "EF4444", "F97316", "EC4899", "14B8A6", "6366F1", "84CC16", "0EA5E9"];
  const rowTints = ["DBEAFE", "CFFAFE", "D1FAE5", "FEF3C7", "EDE9FE", "FEE2E2", "FFEDD5", "FCE7F3", "CCFBF1", "E0E7FF", "ECFCCB", "E0F2FE"];
  const makeSheet = (title, subtitle, items, kind = "bars") => {
    const aoa = [[title], [subtitle], ["SOURCE-ALIGNED VISUAL SUMMARY"], ["Metric / category", "Source value", "Visual bar", "Interpretation"]];
    items.forEach((item, i) => {
      const label = normalizeDashMarkers(item.label ?? item.site ?? item.status ?? item.metric ?? item.field ?? item.month ?? `Item ${i+1}`);
      const value = Number(item.value ?? item.totalCapacity ?? item.count ?? item.missing ?? item.mapped ?? 0) || 0;
      const max = Math.max(...items.map(x => Number(x.value ?? x.totalCapacity ?? x.count ?? x.missing ?? x.mapped ?? 0) || 0), 1);
      const ratio = Math.max(0, Math.min(1, value / max));
      aoa.push([label, value, "█".repeat(Math.max(1, Math.round(ratio * 30))), normalizeDashMarkers(item.note || `${(ratio*100).toFixed(1)}% of largest category`)]);
    });
    if (aoa.length === 4) aoa.push(["No source values available", "", "", "No values were supplied for this section."]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [{s:{r:0,c:0},e:{r:0,c:3}},{s:{r:1,c:0},e:{r:1,c:3}},{s:{r:2,c:0},e:{r:2,c:3}}];
    ws["!cols"] = [{wch:30},{wch:18},{wch:34},{wch:48}];
    ws["!rows"] = [{hpt:34},{hpt:32},{hpt:22},{hpt:25},...items.map(()=>({hpt:27}))];
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let r=0;r<=range.e.r;r++) for(let c=0;c<=3;c++) {
      const cell = ws[XLSX.utils.encode_cell({r,c})]; if(!cell) continue;
      const itemIndex = Math.max(0, r - 4);
      const accent = rowPalette[itemIndex % rowPalette.length];
      const tint = rowTints[itemIndex % rowTints.length];
      const fill = r===0 ? navy : r===1 ? pale : r===2 || r===3 ? blue : (r%2===0 ? "F7FAFC" : "FFFFFF");
      const font = r===0 ? {name:"Aptos Display",sz:18,bold:true,color:{rgb:"FFFFFF"}} : r===2 || r===3 ? {bold:true,color:{rgb:"FFFFFF"}} : {name:"Aptos",sz:11,color:{rgb:"19324D"},bold:c===0};
      cell.s = {fill:{fgColor:{rgb:fill}},font,alignment:{vertical:"center",wrapText:true},border:{bottom:{style:"thin",color:{rgb:"D5E2EF"}}}};
      if(r>=4 && c===0) cell.s = {...cell.s,fill:{fgColor:{rgb:tint}},font:{name:"Aptos",sz:11,bold:true,color:{rgb:accent}}};
      if(r>=4 && c===1 && typeof cell.v === "number") { cell.z = "#,##0.00"; cell.s = {...cell.s,font:{name:"Aptos",sz:11,bold:true,color:{rgb:accent}},alignment:{vertical:"center",horizontal:"right"}}; }
      if(r>=4 && c===2) cell.s = {...cell.s,font:{name:"Aptos",sz:12,bold:true,color:{rgb:accent}},fill:{fgColor:{rgb:tint}},alignment:{vertical:"center",wrapText:false}};
    }
    ws["!freeze"]={xSplit:0,ySplit:4};
    XLSX.utils.book_append_sheet(wb, ws, title);
    return { sheetId: wb.SheetNames.length, title, lastRow: Math.max(5, items.length + 4), hasData: items.length > 0 };
  };
  makeSheet("Executive Summary", "Workbook-backed KPI snapshot. Numeric source values are retained alongside the visual comparison bars.", overview.map(x=>({label:x.metric,value:x.value,note:x.unit}))); 
  const siteSheet = makeSheet("Site Capacity", "Capacity by site; chart bars compare total capacity using the workbook-backed site summary.", sites.map(x=>({label:x.site,value:x.totalCapacity,note:`Utilization ${Number(x.utilizationPercent||0).toFixed(1)}%`})));
  const statusSheet = makeSheet("Reactor Status", "Equipment status distribution from the current workbook-backed reactor records.", status.map(x=>({label:x.status,value:x.count,note:`${Number(x.percentage||0).toFixed(1)}% of reactor records`})));
  const planningSheet = makeSheet("Planning Trends", "Monthly schedule metrics. Blank or unavailable source periods are not invented.", planning.map(x=>({label:x.month,value:x.mapped,note:`Occupied ${x.occupied||0}; ideal ${x.ideal||0}`})));
  const qualitySheet = makeSheet("Data Quality", "Missing-field indicators calculated from the currently available equipment records.", quality.map(x=>({label:x.field,value:x.missing,note:`${Number(x.missingPercentage||0).toFixed(1)}% missing`})));
  const productSheet = makeSheet("Product Information", "Product Names ranked by distinct reactor allocation. Labels and counts originate from Excel-backed mapping records.", products.map(x=>({label:x.product,value:x.reactors,note:`${x.mappingRecords} mapping records · ${x.projects} projects · ${x.stages} Stage Codes`})));
  const capacityBandSheet = makeSheet("Reactor Size Profile", "Distribution of reactors across capacity bands. Capacity thresholds are expressed in the source model's capacity unit (litres) and shown as kL labels.", capacityBands.map(x=>({label:x.label,value:x.count,note:`${x.count} reactors in this band`})));
  wb.Props = { Title:"ReactorPlan Exploratory Data Analysis — Chart Workbook", Subject:"Workbook-backed analysis with native Excel charts", CreatedDate:new Date() };
  const raw = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });
  const charts = [
    {...siteSheet, type:"bar", title:"Capacity by site"},
    {...statusSheet, type:"pie", title:"Reactor status distribution"},
    {...planningSheet, type:"bar", title:"Mapped reactors by planning month"},
    {...qualitySheet, type:"bar", title:"Missing fields by data-quality measure"},
    {...productSheet, type:"bar", title:"Product Names by distinct reactor count"},
    {...capacityBandSheet, type:"bar", title:"Reactor capacity band distribution"},
  ].map(spec => ({...spec, firstRow:5}));
  const result = injectNativeExcelCharts(raw, charts);
  const blob = new Blob([result], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${filename}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportAnalyticsPdf({ rows = [], timeSeries = [], quality = [], status = [], filename = "reactorplan-analytics", title = "ReactorPlan Analytics" }) {
  const data = normalizeRows(rows);
  if (!data.length) throw new Error("There is no analytics data to download.");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const navy = [18,63,120], blue = [23,105,170], cyan = [0,166,214], grey = [225,232,237];
  const pageTitle = (heading, subtitle, page) => {
    doc.setFillColor(...navy); doc.rect(0,0,297,28,"F");
    doc.setTextColor(255,255,255); doc.setFontSize(18); doc.text(title,14,12);
    doc.setFontSize(11); doc.text(heading,14,22);
    doc.setTextColor(65,82,100); doc.setFontSize(9); doc.text(subtitle,14,36);
    doc.setTextColor(35,55,70); doc.setFontSize(8); doc.text(`Page ${page} of 5 · Generated ${new Date().toLocaleDateString()}`, 282, 202, {align:"right"});
  };
  const barChart = (heading, items, getLabel, getValue, x=18, y=54, width=245, maxRows=10) => {
    doc.setFontSize(13); doc.setTextColor(...navy); doc.text(heading,x,y); y+=10;
    const visible = items.slice(0,maxRows); const max = Math.max(...visible.map(r=>Number(getValue(r))||0),1);
    visible.forEach((row,i)=>{
      const value=Number(getValue(row))||0, yy=y+i*11;
      doc.setFontSize(8); doc.setTextColor(35,55,70); doc.text(String(getLabel(row)).slice(0,32),x,yy+4);
      doc.setDrawColor(...grey); doc.setFillColor(240,245,249); doc.rect(x+58,yy,width-82,5,"F");
      doc.setFillColor(...(i%2?cyan:blue)); doc.rect(x+58,yy,Math.max(0.5,(width-82)*value/max),5,"F");
      doc.setFontSize(8); doc.text(value.toLocaleString(undefined,{maximumFractionDigits:2}),x+width,yy+4,{align:"right"});
    });
  };
  const sites = data.filter(r=>r.site);
  pageTitle("1. Executive overview","A visual summary of workbook-backed site capacity and utilization metrics.",1);
  const kpis=[ ["Sites analysed",sites.length], ["Total capacity",sites.reduce((s,r)=>s+(Number(r.totalCapacity)||0),0)], ["Average site utilization",sites.length?sites.reduce((s,r)=>s+(Number(r.utilizationPercent)||0),0)/sites.length:0], ["Planning periods",timeSeries.length] ];
  kpis.forEach((k,i)=>{const x=18+i*68;doc.setFillColor(234,244,255);doc.roundedRect(x,52,60,30,3,3,"F");doc.setTextColor(...navy);doc.setFontSize(9);doc.text(k[0],x+4,61);doc.setFontSize(16);doc.text(Number(k[1]).toLocaleString(undefined,{maximumFractionDigits:2}),x+4,74);});
  barChart("Capacity by site",sites,r=>r.site,r=>r.totalCapacity,18,100,250,8);
  doc.addPage(); pageTitle("2. Site capacity and utilization","Compare source capacity totals and utilization percentage by site.",2);
  barChart("Total capacity by site",sites,r=>r.site,r=>r.totalCapacity,18,53,250,10);
  barChart("Utilization percentage by site",[...sites].sort((a,b)=>(Number(b.utilizationPercent)||0)-(Number(a.utilizationPercent)||0)),r=>r.site,r=>r.utilizationPercent,18,135,250,5);
  doc.addPage(); pageTitle("3. Planning timeline","Time-series coverage from the supplied workbook-backed schedule data.",3);
  if(timeSeries.length){
    const vals=timeSeries.map(r=>Number(r.mapped)||0), max=Math.max(...vals,1), x0=22,y0=150,w=250,h=85;
    doc.setDrawColor(...grey); for(let g=0;g<=4;g++)doc.line(x0,y0-h*g/4,x0+w,y0-h*g/4);
    doc.setDrawColor(...blue); doc.setLineWidth(1.2);
    vals.forEach((v,i)=>{if(i===0)return;const px1=x0+(i-1)*w/Math.max(vals.length-1,1),px2=x0+i*w/Math.max(vals.length-1,1),py1=y0-vals[i-1]/max*h,py2=y0-v/max*h;doc.line(px1,py1,px2,py2);});
    timeSeries.forEach((r,i)=>{if(i%2===0||i===timeSeries.length-1){const x=x0+i*w/Math.max(timeSeries.length-1,1);doc.setFontSize(7);doc.setTextColor(65,82,100);doc.text(String(r.label||r.period||"").slice(0,10),x,y0+7,{align:"center"});}});
    doc.setTextColor(...navy);doc.setFontSize(12);doc.text("Mapped reactor trend",18,54);
  } else {doc.setFontSize(12);doc.text("No time-series observations were supplied by the source data.",18,58);}
  doc.addPage(); pageTitle("4. Data coverage and quality","Coverage indicators are calculated from fields currently available in the exported source data.",4);
  const counts=(quality || []).map(r=>({label:r.field,value:Number(r.missing)||0,note:`${Number(r.missingPercentage||0).toFixed(1)}% missing`}));
  if (counts.length) barChart("Missing-field indicators",counts,r=>r.label,r=>r.value,18,60,250,8);
  else { doc.setFontSize(11); doc.text("Data-quality fields were not supplied to this export; no missing-field totals are inferred.",18,62,{maxWidth:250}); }
  if (status?.length) barChart("Status distribution",status,r=>r.status,r=>r.count,18,115,250,6);
  doc.setFontSize(10);doc.setTextColor(65,82,100);doc.text("Interpretation: a zero indicates no missing values in the available measure, not a guarantee that every source workbook sheet has been audited.",18,160,{maxWidth:255});
  doc.addPage(); pageTitle("5. Operational priorities","Ranked views to support review of site capacity, utilization and planning coverage.",5);
  barChart("Highest-capacity sites",[...sites].sort((a,b)=>(Number(b.totalCapacity)||0)-(Number(a.totalCapacity)||0)),r=>r.site,r=>r.totalCapacity,18,55,250,8);
  barChart("Highest-utilization sites",[...sites].sort((a,b)=>(Number(b.utilizationPercent)||0)-(Number(a.utilizationPercent)||0)),r=>r.site,r=>r.utilizationPercent,18,145,250,4);
  doc.save(`${filename}.pdf`);
}

// Update the uploaded master workbook while retaining its layout and source sheet order.
// The exported copy uses consistent Product Name / Stage Code headers and normalizes dash placeholders.
export function exportUpdatedMasterWorkbook({ sourceArrayBuffer, data, filename = "ReactorPlan-Updated-Master-Workbook.xlsx" }) {
  if (!sourceArrayBuffer) throw new Error("The uploaded master workbook is not available.");
  const workbook = XLSX.read(sourceArrayBuffer, { type: "array", cellStyles: true, cellDates: true, cellNF: true, bookVBA: true });
  const equipment = Array.isArray(data?.equipment) ? data.equipment : [];
  const mappings = Array.isArray(data?.mappings) ? data.mappings : [];
  const canonical = v => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const headerKey = v => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const findHeaderRow = ws => {
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let r = 0; r <= Math.min(range.e.r, 20); r += 1) {
      const values = [];
      for (let c = range.s.c; c <= range.e.c; c += 1) values.push(headerKey(ws[XLSX.utils.encode_cell({r,c})]?.v));
      if (values.includes("site") && (values.includes("reactor no") || values.includes("reactor number")) && values.some(v => v.includes("capacity"))) return r;
    }
    return -1;
  };
  const headerColumns = (ws, row) => {
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    const map = {};
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const h = headerKey(ws[XLSX.utils.encode_cell({r:row,c})]?.v);
      if (h && map[h] == null) map[h] = c;
    }
    return map;
  };
  const col = (map, names) => { for (const name of names) { const k=headerKey(name); if (map[k] != null) return map[k]; } return -1; };
  const setCell = (ws,r,c,value,templateRow) => {
    if (c < 0) return;
    const addr=XLSX.utils.encode_cell({r,c});
    const old=ws[addr];
    const template=templateRow != null ? ws[XLSX.utils.encode_cell({r:templateRow,c})] : null;
    const type = value instanceof Date ? "d" : typeof value === "number" ? "n" : typeof value === "boolean" ? "b" : "s";
    ws[addr] = old ? {...old,v:value,t:type} : {v:value,t:type};
    if (template?.s) ws[addr].s = JSON.parse(JSON.stringify(template.s));
  };
  const siteSheets = new Set(["CTO-2","CTO-3","CTO-5","CTO-6","CTO-SEZ","Mexico","Mirfield"]);

  // Normalize the source client/site-tab headers independently of the equipment-table schema.
  // These source tabs do not include the equipment-capacity columns used by findHeaderRow().
  for (const sheetName of workbook.SheetNames.filter(n => siteSheets.has(n))) {
    const ws = workbook.Sheets[sheetName]; if (!ws) continue;
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let r = range.s.r; r <= Math.min(range.e.r, 15); r++) {
      const headers = [];
      for (let c = range.s.c; c <= range.e.c; c++) headers.push(headerKey(ws[XLSX.utils.encode_cell({r,c})]?.v));
      const productCol = headers.findIndex(v => v === "product" || v === "product name");
      const stageCol = headers.findIndex(v => v === "stage");
      const stageCodeCol = headers.findIndex(v => v === "stage code");
      if (productCol < 0 || (stageCol < 0 && stageCodeCol < 0)) continue;
      const productAddr = XLSX.utils.encode_cell({r,c:range.s.c + productCol});
      if (ws[productAddr]) ws[productAddr] = {...ws[productAddr], v:"Product Name", t:"s"};
      const effectiveStageCol = stageCodeCol >= 0 ? stageCodeCol : stageCol;
      const stageAddr = XLSX.utils.encode_cell({r,c:range.s.c + effectiveStageCol});
      if (ws[stageAddr]) ws[stageAddr] = {...ws[stageAddr], v:"Stage Code", t:"s"};
      if (stageCol >= 0 && stageCodeCol >= 0 && stageCol !== stageCodeCol) {
        const legacyAddr = XLSX.utils.encode_cell({r,c:range.s.c + stageCol});
        if (ws[legacyAddr]) ws[legacyAddr] = {...ws[legacyAddr], v:"Stage Code (legacy, hidden)", t:"s"};
        ws["!cols"] ||= [];
        const absoluteColumn = range.s.c + stageCol;
        ws["!cols"][absoluteColumn] = {...(ws["!cols"][absoluteColumn] || {}), hidden:true};
      }
      break;
    }
  }

  for (const sheetName of workbook.SheetNames.filter(n => siteSheets.has(n))) {
    const ws=workbook.Sheets[sheetName]; const hr=findHeaderRow(ws); if(hr<0) continue;
    const map=headerColumns(ws,hr); const range=XLSX.utils.decode_range(ws["!ref"]||"A1");
    const idCol=col(map,["reactor no","reactor number"]); const eqCol=col(map,["equipment type"]); const siteCol=col(map,["site"]);
    const blockCol=col(map,["block"]), areaCol=col(map,["intermediate / clean room","area"]), mocCol=col(map,["moc"]), capCol=col(map,["capacity","capacity (l)","capacity (kl)"]), agitatorCol=col(map,["agitator"]), minCol=col(map,["min vol","minimum sensible volume","minimum volume"]), maxCol=col(map,["max vol","maximum volume"]), sapCodeCol=col(map,["sap code","sapcode","sap"]), equipmentIdCol=col(map,["equipment id","equipment identifier","equipment code"]), projectCol=col(map,["project mapped"]), clientCol=col(map,["customer name","customer","client name"]), productCol=col(map,["product name","product"]), statusCol=col(map,["status"]), stageCol=col(map,["stage"]), stageCodeCol=col(map,["stage code"]), area2Col=col(map,["area"]), continuousCol=col(map,["continuous/campaign","continuous campaign"]), linkedCol=col(map,["reactors"]), timelineCol=col(map,["timeline"]), remarksCol=col(map,["remarks","remark"]);
    const stageOutputCol=stageCodeCol>=0?stageCodeCol:stageCol;
    if(productCol>=0){const addr=XLSX.utils.encode_cell({r:hr,c:productCol});if(ws[addr])ws[addr]={...ws[addr],v:"Product Name",t:"s"};}
    if(stageOutputCol>=0){const addr=XLSX.utils.encode_cell({r:hr,c:stageOutputCol});if(ws[addr])ws[addr]={...ws[addr],v:"Stage Code",t:"s"};}
    if(stageCol>=0 && stageCodeCol>=0 && stageCol!==stageCodeCol){
      // Keep legacy source information intact but hide the duplicate Stage column in the exported copy.
      const addr=XLSX.utils.encode_cell({r:hr,c:stageCol});if(ws[addr])ws[addr]={...ws[addr],v:"Stage Code (legacy, hidden)",t:"s"};
      ws["!cols"] ||= []; ws["!cols"][stageCol]={...(ws["!cols"][stageCol]||{}),hidden:true};
    }
    const rowsById=new Map();
    for(let r=hr+1;r<=range.e.r;r++){
      const primary=String(ws[XLSX.utils.encode_cell({r,c:idCol})]?.v??"").trim();
      const eq=String(ws[XLSX.utils.encode_cell({r,c:eqCol})]?.v??"").trim();
      const id=(/^(reactor|equipment|equipment type)$/i.test(primary) && eq) ? eq : primary;
      if(id) rowsById.set(canonical(id),r);
    }
    const siteRows=equipment.filter(e=>canonical(e.site)===canonical(sheetName));
    for(const e of siteRows){
      let r=rowsById.get(canonical(e.id));
      if(r==null){
        r=range.e.r+1; range.e.r=r;
        const template=r-1;
        // Copy the previous row's styles/number formats across the entire used width.
        for(let c=range.s.c;c<=range.e.c;c++){const from=ws[XLSX.utils.encode_cell({r:template,c})];if(from) ws[XLSX.utils.encode_cell({r,c})]={...from,v:from.v};}
        rowsById.set(canonical(e.id),r);
      }
      const normalizedStageCode=resolveStageCode(e);
      const valueMap=[[siteCol,e.site],[blockCol,e.block],[areaCol,e.area],[mocCol,e.moc],[capCol,e.capacity],[agitatorCol,e.agitator],[minCol,e.minVolume],[maxCol,e.maxVolume],[projectCol,e.projectMapped],[clientCol,e.clientName],[productCol,e.product],[statusCol,e.planningStatus||e.status],[stageOutputCol,normalizedStageCode],[sapCodeCol,e.sapCode],[equipmentIdCol,e.equipmentId],[area2Col,e.area],[continuousCol,e.continuousCampaign],[linkedCol,e.linkedReactors],[timelineCol,e.timeline],[remarksCol,e.remarks]];
      valueMap.forEach(([c,v])=>setCell(ws,r,c,v,r-1));
      // Preserve the workbook's unusual CTO-2 data alignment where Equipment Type contains the reactor ID and Reactor No. contains "Reactor".
      if(eqCol>=0 && idCol>=0){
        const existing=String(ws[XLSX.utils.encode_cell({r,c:idCol})]?.v??"").trim();
        const existingEq=String(ws[XLSX.utils.encode_cell({r,c:eqCol})]?.v??"").trim();
        if(/^reactor$/i.test(existing) || /^equipment$/i.test(existing) || /^equipment type$/i.test(existingEq)) { setCell(ws,r,eqCol,e.id,r-1); setCell(ws,r,idCol,"Reactor",r-1); }
        else setCell(ws,r,idCol,e.id,r-1);
      } else if(idCol>=0) setCell(ws,r,idCol,e.id,r-1);
    }
    ws["!ref"]=XLSX.utils.encode_range(range);
  }

  // Recalculate and write the derived Capacity Summary without changing the source sheet layout.
  const capacitySheet = workbook.Sheets["Capacity Summary"];
  if (capacitySheet && Array.isArray(data?.capacity)) {
    const range = XLSX.utils.decode_range(capacitySheet["!ref"] || "A1");
    let hr=-1;
    for(let r=0;r<=Math.min(range.e.r,20);r++){const vals=[];for(let c=range.s.c;c<=range.e.c;c++)vals.push(headerKey(capacitySheet[XLSX.utils.encode_cell({r,c})]?.v));if(vals.includes("site")&&vals.some(v=>v.includes("total capacity"))){hr=r;break;}}
    if(hr>=0){
      const map=headerColumns(capacitySheet,hr); const siteCol=col(map,["site"]), blockCol=col(map,["block"]), areaCol=col(map,["intermediate / clean room","intermediate/clean room"]), totalCol=col(map,["total capacity"]), utilCol=col(map,["utilization"]), mappedCol=col(map,["mapped"]), availCol=col(map,["available"]);
      const keyOf=(site,block,area)=>`${canonical(site)}|${canonical(block)}|${canonical(area)}`;
      const sourceRows=new Map();
      for(let r=hr+1;r<=range.e.r;r++){const site=capacitySheet[XLSX.utils.encode_cell({r,c:siteCol})]?.v;if(site)sourceRows.set(keyOf(site,capacitySheet[XLSX.utils.encode_cell({r,c:blockCol})]?.v,capacitySheet[XLSX.utils.encode_cell({r,c:areaCol})]?.v),r);}
      for(const row of data.capacity){const r=sourceRows.get(keyOf(row.site,row.block,row.area));if(r==null)continue;[[siteCol,row.site],[blockCol,row.block],[areaCol,row.area],[totalCol,row.totalCapacity],[utilCol,row.utilization],[mappedCol,row.mapped],[availCol,row.available]].forEach(([c,v])=>setCell(capacitySheet,r,c,v,r));}
    }
  }

  // Add/update a client register while leaving every original workbook sheet intact.
  if (Array.isArray(data?.clientInformation)) {
    const clientRows = data.clientInformation.map(row => {
      const stageCode = resolveStageCode(row);
      return {
        "Client Name": row.clientName || "",
        "Product Name": row.product || "",
        "Stage Code": stageCode !== "Unknown" ? stageCode : cleanKnownText(row.projectCode || row.productCode) || "Unknown",
        "Reactor ID": row.reactorId || "",
        "Site": row.site || "",
        "Block": row.block || "",
        "Area": row.area || "",
        "Plan Type": row.continuousCampaign || "",
        "Timeline": row.timeline || "",
        "Status": row.status || "",
        "Linked Reactors": row.linkedReactors || "",
        "Remarks": row.remarks || ""
      };
    });
    const ws = XLSX.utils.json_to_sheet(clientRows);
    ws["!cols"] = Object.keys(clientRows[0] || {}).map(k => ({wch: Math.min(Math.max(k.length+4,12),34)}));
    if (workbook.SheetNames.includes("Client Information")) workbook.Sheets["Client Information"] = ws;
    else XLSX.utils.book_append_sheet(workbook, ws, "Client Information");
  }

  // Update the Mapping Tracker using its weekly date columns. Existing formatting is retained.
  const tracker=workbook.Sheets["Mapping Tracker"];
  if(tracker){
    const range=XLSX.utils.decode_range(tracker["!ref"]||"A1");
    let headerRow=-1;
    for(let r=0;r<=Math.min(range.e.r,10);r++){
      const vals=[];for(let c=range.s.c;c<=range.e.c;c++)vals.push(headerKey(tracker[XLSX.utils.encode_cell({r,c})]?.v));
      if(vals.includes("site")&&vals.includes("reactor")&&vals.includes("firm")){headerRow=r;break;}
    }
    if(headerRow>=0){
      const map=headerColumns(tracker,headerRow); const siteCol=col(map,["site"]), blockCol=col(map,["block"]), areaCol=col(map,["intermediate / clean room"]), reactorCol=col(map,["reactor"]), mocCol=col(map,["moc"]), capCol=col(map,["capacity"]), agitatorCol=col(map,["agitator"]), firmCol=col(map,["firm"]);
      const dateRow=headerRow+1; const dates=[]; for(let c=firmCol+1;c<=range.e.c;c++){const v=tracker[XLSX.utils.encode_cell({r:dateRow,c})]?.v;const d=v instanceof Date?v:new Date(v);if(!Number.isNaN(d.getTime())) dates.push({c,date:d});}
      const existing=new Map(); for(let r=headerRow+2;r<=range.e.r;r++){const id=String(tracker[XLSX.utils.encode_cell({r,c:reactorCol})]?.v??"").trim();if(id) existing.set(canonical(id),r);}
      for(const m of mappings){let r=existing.get(canonical(m.reactorId));if(r==null){r=range.e.r+1;range.e.r=r;const template=r-1;for(let c=range.s.c;c<=range.e.c;c++){const from=tracker[XLSX.utils.encode_cell({r:template,c})];if(from) tracker[XLSX.utils.encode_cell({r,c})]={...from,v:from.v};}existing.set(canonical(m.reactorId),r);} [[siteCol,m.site],[blockCol,m.block],[areaCol,m.area],[reactorCol,m.reactorId],[mocCol,m.moc],[capCol,m.capacity],[agitatorCol,m.agitator],[firmCol,m.firm]].forEach(([c,v])=>setCell(tracker,r,c,v,r-1)); for(const item of dates){const day=item.date;const s=new Date(`${String(m.startDate||"").slice(0,10)}T00:00:00`),e=new Date(`${String(m.endDate||"").slice(0,10)}T00:00:00`);if(!Number.isNaN(s.getTime())&&!Number.isNaN(e.getTime())&&day>=s&&day<=e)setCell(tracker,r,item.c,m.productCode||m.product||"",r-1);}}
      tracker["!ref"]=XLSX.utils.encode_range(range);
    }
  }
  // Normalize any standalone dash marker in any sheet, including retained source sheets.
  const dashOnly = /^\s*[-‐‑‒–—−]\s*$/u;
  workbook.SheetNames.forEach(sheetName => {
    const ws=workbook.Sheets[sheetName]; if(!ws) return;
    const range=XLSX.utils.decode_range(ws["!ref"]||"A1");
    for(let r=range.s.r;r<=range.e.r;r++) for(let c=range.s.c;c<=range.e.c;c++){
      const addr=XLSX.utils.encode_cell({r,c}); const cell=ws[addr];
      if(cell && typeof cell.v === "string" && dashOnly.test(cell.v)){
        const replacement={...cell,v:"Unknown",t:"s"};
        // Do not let a formula recalculate and reintroduce the dash placeholder.
        delete replacement.f; delete replacement.F; delete replacement.w;
        ws[addr]=replacement;
      }
    }
  });
  XLSX.writeFile(workbook, filename, { bookType: "xlsx", compression: true, cellStyles: true });
}
