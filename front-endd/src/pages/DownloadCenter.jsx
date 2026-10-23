import { useEffect, useMemo, useRef, useState } from "react";
import StatCard from "../components/StatCard";
import { api } from "../api";
import { exportAnalyticsPdf, exportData, exportWorkbook, exportUpdatedMasterWorkbook, exportEdaVisualWorkbook } from "../utils/exportUtils";
import { parseWorkbook } from "../utils/workbookParser";
import { matchesSearch } from "../utils/searchUtils";
import { resolveStageCode, cleanKnownText } from "../utils/unknownUtils";

const CTO_SITES = ["CTO-2", "CTO-3", "CTO-5", "CTO-6", "CTO-SEZ", "Mexico", "Mirfield"];

const LABELS = {
  uid: "Record ID", id: "Reactor ID", site: "Site", block: "Block", area: "Area",
  equipmentType: "Equipment Type", equipmentId: "Equipment ID", sapCode: "SAP Code", projectMapped: "Project Mapped",
  moc: "MOC", capacity: "Capacity (kL)", agitator: "Agitator", minVolume: "Minimum Volume (L)",
  maxVolume: "Maximum Volume (L)", status: "Status", totalCapacity: "Total Capacity (kL)",
  utilization: "Utilization (kL)", mapped: "Mapped (kL)", available: "Available (kL)",
  totalCapacityKL: "Total Capacity (kL)", totalReactors: "Reactors", startDate: "Start Date", endDate: "End Date",
  reactorId: "Reactor ID", reactorUid: "Reactor UID", firm: "Firm", product: "Product Name", stage: "Stage Code",
  stageCode: "Stage Code", category: "Category", date: "Date", timestamp: "Timestamp", user: "User", action: "Activity",
};

const INTERNAL_SOURCE_FIELDS = new Set(["sourceSheet", "sourceColumns", "sourceValues", "rawRecord"]);
const cleanKey = key => INTERNAL_SOURCE_FIELDS.has(String(key));
const label = key => LABELS[key] || String(key).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const text = value => String(value ?? "").trim().toLowerCase();
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function normalize(rows) {
  return (rows || []).map(row => {
    const output = Object.fromEntries(Object.entries(row || {}).filter(([key]) => !cleanKey(key) && key !== "stage" && key !== "stages"));
    const hasStageField = ["stageCode", "stage", "stages"].some(key => Object.prototype.hasOwnProperty.call(row || {}, key));
    const stageCode = resolveStageCode(row);
    if (hasStageField && stageCode && !cleanKnownText(output.stageCode)) output.stageCode = stageCode;
    return output;
  });
}
function dateOk(row, from, to) {
  if (!from && !to) return true;
  const values = [row.startDate, row.endDate, row.date, row.timestamp, row.mappingDate].filter(Boolean).map(v => new Date(v)).filter(d => !Number.isNaN(d.getTime()));
  if (!values.length) return true;
  const min = from ? new Date(`${from}T00:00:00`) : null;
  const max = to ? new Date(`${to}T23:59:59`) : null;
  return values.some(d => (!min || d >= min) && (!max || d <= max));
}

function capacityInKL(row) {
  const value = Number(row?.capacity);
  if (!Number.isFinite(value)) return row?.capacity;
  return +(value / 1000).toFixed(3);
}
function prepareExportRow(row, dataset) {
  if (["reactors", "availability", "cto-site", "ctos-all", "all"].includes(dataset) && row && Object.prototype.hasOwnProperty.call(row, "capacity")) {
    return { ...row, capacity: capacityInKL(row) };
  }
  return row;
}

function filterRows(rows, filters) {
  return rows.filter(row => {
    if (filters.site !== "All" && text(row.site) !== text(filters.site)) return false;
    if (filters.status !== "All" && text(row.status) !== text(filters.status)) return false;
    if (filters.query && !matchesSearch(row, filters.query)) return false;
    return dateOk(row, filters.from, filters.to);
  });
}

function statusRows(equipment) {
  const counts = {};
  equipment.forEach(r => { const s = r.status || "Available"; counts[s] = (counts[s] || 0) + 1; });
  return Object.entries(counts).map(([status, count]) => ({ status, count }));
}
function dashboardRows(data) {
  const source = data?.dashboard?.sourceCapacity || {};
  return [
    { metric: "Total reactors", value: data.equipment?.length || 0, unit: "records" },
    { metric: "Total capacity", value: num(source.total), unit: "KL" },
    { metric: "Utilized capacity", value: num(source.utilized), unit: "KL" },
    { metric: "Available capacity", value: num(source.available), unit: "KL" },
    { metric: "Capacity utilization", value: num(source.utilizationPercent), unit: "%" },
    ...((data.siteTotals || []).map(s => ({ metric: `${s.site} utilization`, value: num(s.utilizationPercent), unit: "%" }))),
  ];
}
function reportRows(data) {
  const dashboard = dashboardRows(data);
  const availability = (data.equipment || []).reduce((acc, r) => { const s = r.status || "Available"; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
  const mapped = (data.mappings || []).length;
  return [
    ...dashboard,
    { metric: "Active equipment mappings", value: mapped, unit: "records" },
    ...Object.entries(availability).map(([status, count]) => ({ metric: `${status} reactors`, value: count, unit: "records" })),
  ];
}

function analyticsRows(data) {
  const capacity = data.capacity || [];
  const bySite = {};
  capacity.forEach(row => {
    const site = row.site || "Unknown";
    bySite[site] ||= { site, totalCapacity: 0, utilization: 0 };
    bySite[site].totalCapacity += num(row.totalCapacity);
    bySite[site].utilization += num(row.utilization);
  });
  return Object.values(bySite).map(row => ({ ...row, utilizationPercent: row.totalCapacity ? +(row.utilization / row.totalCapacity * 100).toFixed(2) : 0 }));
}
function analyticsTimeSeriesRows(data) {
  const months = [
    ["Apr 2026", "Apr"], ["May 2026", "May"], ["Jun 2026", "Jun"], ["Jul 2026", "Jul"],
    ["Aug 2026", "Aug"], ["Sep 2026", "Sep"], ["Oct 2026", "Oct"], ["Nov 2026", "Nov"],
    ["Dec 2026", "Dec"], ["Jan 2027", "Jan"], ["Feb 2027", "Feb"], ["Mar 2027", "Mar"],
  ];
  const summary = data.summary || [];
  const mappings = data.mappings || [];
  const maintenance = data.maintenance || [];
  return months.map(([label, key]) => ({
    period: label,
    mappedReactors: summary.reduce((sum, row) => sum + num(row[`mapped_${key}`]), 0),
    occupiedReactors: summary.reduce((sum, row) => sum + num(row[`occupied_${key}`]), 0),
    idealReactors: summary.reduce((sum, row) => sum + num(row[`ideal_${key}`]), 0),
    activeMappings: mappings.filter(row => String(row.startDate || "").slice(0, 7) <= key && String(row.endDate || "").slice(0, 7) >= key).length,
    activeMaintenance: maintenance.filter(row => {
      const start = String(row.startDate || row.date || "").slice(0, 7);
      const end = String(row.endDate || row.date || "").slice(0, 7);
      return start && end && start <= key && end >= key && row.status !== "Completed" && row.status !== "Cancelled";
    }).length,
  }));
}

const PRESETS = {
  capacity: { title: "Capacity Summary", sheet: "Capacity Summary", rows: d => d.capacity || [] },
  availability: { title: "Availability", sheet: "Availability", rows: d => (d.equipment || []).filter(r => ["Available", "Mapped", "Maintenance"].includes(r.status)) },
  mapping: { title: "Mapping", sheet: "Mapping", rows: d => d.mappings || [] },
  calendar: { title: "Planning Calendar", sheet: "Planning Calendar", rows: d => d.mappings || [] },
  reactors: { title: "Reactor Master Data", sheet: "Reactor Master", rows: d => d.equipment || [] },
  dashboard: { title: "Dashboard", sheet: "Dashboard", rows: dashboardRows },
  analytics: { title: "Analytics", sheet: "Analytics", rows: analyticsRows },
  report: { title: "Operational Report", sheet: "Operational Report", rows: reportRows },
  clients: { title: "Client Information", sheet: "Client Information", rows: d => d.clientInformation || [] },
};

export default function DownloadCenter({ data, preset = "reactors" }) {
  const initial = preset.startsWith("cto-") ? "cto-site" : preset === "ctos-all" ? "ctos-all" : preset;
  const [dataset, setDataset] = useState(initial);
  const [ctoSite, setCtoSite] = useState(preset.startsWith("cto-") ? preset.slice(4) : "CTO-2");
  const [format, setFormat] = useState("xlsx");
  const [query, setQuery] = useState("");
  const [site, setSite] = useState("All");
  const [status, setStatus] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedColumns, setSelectedColumns] = useState(null);
  const [message, setMessage] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (preset.startsWith("cto-")) { setDataset("cto-site"); setCtoSite(preset.slice(4)); }
    else if (preset === "ctos-all") setDataset("ctos-all");
    else setDataset(preset === "all" ? "all" : preset);
    setSelectedColumns(null); setMessage("");
  }, [preset]);

  const rawRows = useMemo(() => {
    if (dataset === "cto-site") return (data.equipment || []).filter(r => text(r.site) === text(ctoSite));
    if (dataset === "ctos-all") return (data.equipment || []).filter(r => CTO_SITES.map(text).includes(text(r.site)));
    if (dataset === "all") return data.equipment || [];
    return PRESETS[dataset]?.rows(data) || [];
  }, [data, dataset, ctoSite]);
  const cleanRows = useMemo(() => normalize(rawRows), [rawRows]);
  const columns = useMemo(() => Array.from(new Set(cleanRows.flatMap(r => Object.keys(r)))).filter(k => !cleanKey(k)), [cleanRows]);
  const effectiveColumns = selectedColumns?.filter(c => columns.includes(c)) || columns;
  const sites = useMemo(() => ["All", ...Array.from(new Set(rawRows.map(r => r.site).filter(Boolean))).sort()], [rawRows]);
  const statuses = useMemo(() => ["All", ...Array.from(new Set(rawRows.map(r => r.status).filter(Boolean))).sort()], [rawRows]);
  const filteredRows = useMemo(() => filterRows(cleanRows, { query: text(query), site, status, from, to }), [cleanRows, query, site, status, from, to]);
  const exportRows = useMemo(() => filteredRows.map(r => { const prepared = prepareExportRow(r, dataset); return Object.fromEntries(effectiveColumns.map(c => [c, prepared[c]])); }), [filteredRows, effectiveColumns, dataset]);

  const datasetTitle = dataset === "cto-site" ? ctoSite : dataset === "ctos-all" ? "All CTOs" : PRESETS[dataset]?.title || "Complete Reactor Data";
  const toggle = c => setSelectedColumns(current => { const active = current || columns; if (active.includes(c)) return active.length === 1 ? active : active.filter(x => x !== c); return [...active, c]; });
  const reset = () => { setQuery(""); setSite("All"); setStatus("All"); setFrom(""); setTo(""); setSelectedColumns(null); setMessage(""); };

  const download = () => {
    setDownloading(true); setMessage("");
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (dataset === "analytics" && format === "xlsx") {
        const siteRows = analyticsRows(data);
        const equipmentRows = data.equipment || [];
        const statusCounts = statusRows(equipmentRows);
        const totalEquipment = equipmentRows.length || 1;
        const quality = [
          ["Project mapping", equipmentRows.filter(r => !r.projectMapped).length],
          ["Material of construction", equipmentRows.filter(r => !r.moc).length],
          ["Agitator", equipmentRows.filter(r => !r.agitator).length],
          ["Minimum / maximum volume", equipmentRows.filter(r => r.minVolume == null || r.maxVolume == null).length],
        ].map(([field, missing]) => ({ field, missing, missingPercentage: missing / totalEquipment * 100 }));
        const productMap = new Map();
        (data.mappings || []).forEach(r => {
          const product = String(r.product || "").trim() || "Unknown";
          if (!productMap.has(product)) productMap.set(product, { product, reactors: new Set(), mappingRecords: 0, projects: new Set(), stages: new Set() });
          const item = productMap.get(product); item.mappingRecords += 1;
          const reactor = String(r.reactorId || r.reactorUid || r.reactor || "").trim();
          if (reactor) item.reactors.add(`${r.site || ""}|${reactor}`);
          if (r.projectCode || r.productCode || r.project) item.projects.add(r.projectCode || r.productCode || r.project);
          const stageCode = resolveStageCode(r); if (cleanKnownText(stageCode)) item.stages.add(stageCode);
        });
        const products = [...productMap.values()].map(x => ({ product:x.product, reactors:x.reactors.size, mappingRecords:x.mappingRecords, projects:x.projects.size, stages:x.stages.size })).sort((a,b)=>b.reactors-a.reactors).slice(0,12);
        const bands = [{label:"≤ 1 kL",min:0,max:1000,count:0},{label:"> 1–3 kL",min:1000,max:3000,count:0},{label:"> 3–5 kL",min:3000,max:5000,count:0},{label:"> 5–10 kL",min:5000,max:10000,count:0},{label:"> 10 kL",min:10000,max:Infinity,count:0}];
        equipmentRows.forEach(r=>{const v=num(r.capacity);if(v<=0)return;const b=bands.find((x,i)=>i===0?v<=x.max:i===bands.length-1?v>x.min:v>x.min&&v<=x.max);if(b)b.count+=1;});
        exportEdaVisualWorkbook({
          overview: dashboardRows(data).map(r=>({metric:r.metric,value:r.value,unit:r.unit})),
          sites: siteRows.map(r=>({...r,totalCapacity:r.totalCapacity})),
          status: statusCounts.map(r=>({status:r.status,count:r.count,percentage:r.count/totalEquipment*100})),
          planning: analyticsTimeSeriesRows(data).map(r=>({month:r.period,mapped:r.mappedReactors,occupied:r.occupiedReactors,ideal:r.idealReactors})),
          quality,
          products,
          capacityBands: bands.map(({label,count})=>({label,count})),
          filename: `reactorplan-analytics-charts-${stamp}`
        });
        setMessage("Visual analytics workbook downloaded with native Excel bar and pie charts.");
      } else if (dataset === "analytics" && format === "pdf") {
        exportAnalyticsPdf({ rows: exportRows, filename: `reactorplan-analytics-${stamp}`, title: "ReactorPlan Analytics" });
      } else if (dataset === "dashboard" && format === "pdf") {
        exportAnalyticsPdf({ rows: exportRows, filename: `reactorplan-dashboard-${stamp}`, title: "ReactorPlan Dashboard" });
      } else {
        exportData({ rows: exportRows, format, filename: `reactorplan-${datasetTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp}`, sheetName: datasetTitle, title: `ReactorPlan - ${datasetTitle}` });
      }
      setMessage(`${exportRows.length.toLocaleString()} records exported successfully.`);
    } catch (e) { setMessage(e.message || "Export failed."); } finally { setDownloading(false); }
  };

  const downloadUpdatedMaster = async () => {
    setDownloading(true); setMessage("");
    try {
      const buffer = await api.sourceWorkbookArrayBuffer();
      exportUpdatedMasterWorkbook({
        sourceArrayBuffer: buffer,
        data,
        filename: `ReactorPlan-Updated-Master-${new Date().toISOString().slice(0,10)}.xlsx`,
      });
      setMessage("Updated master workbook downloaded. Original sheet order, headers and source formatting are retained while current platform data is written back.");
    } catch (e) { setMessage(e.message || "Updated master workbook download failed."); } finally { setDownloading(false); }
  };

  const downloadAll = () => {
    setDownloading(true); setMessage("");
    try {
      const sheets = [
        { name: "Dashboard", rows: dashboardRows(data) },
        { name: "Capacity Summary", rows: data.capacity || [] },
        { name: "Availability", rows: PRESETS.availability.rows(data).map(r => prepareExportRow(r, "availability")) },
        { name: "Mapping", rows: data.mappings || [] },
        { name: "Planning Calendar", rows: data.mappings || [] },
        { name: "Analytics", rows: analyticsRows(data) },
        { name: "Analytics Time Series", rows: analyticsTimeSeriesRows(data) },
        { name: "Client Information", rows: data.clientInformation || [] },
        { name: "Reactor Master", rows: (data.equipment || []).map(r => prepareExportRow(r, "reactors")) },
        ...CTO_SITES.map(site => ({ name: site, rows: (data.equipment || []).filter(r => text(r.site) === text(site)).map(r => prepareExportRow(r, "cto-site")) })),
      ];
      exportWorkbook({ sheets, filename: `reactorplan-everything-${new Date().toISOString().slice(0, 10)}`, title: "ReactorPlan Complete Operational Export" });
      setMessage("Complete workbook exported with dashboard, capacity, availability, mapping, calendar, analytics, reactor master and every CTO sheet.");
    } catch (e) { setMessage(e.message || "Workbook export failed."); } finally { setDownloading(false); }
  };

  const oneClick = (key, formatOverride = "xlsx") => {
    setDataset(key); setFormat(formatOverride); setSelectedColumns(null); setQuery(""); setSite("All"); setStatus("All"); setFrom(""); setTo("");
  };

  const parseAndImport = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setParsing(true); setMessage(""); setParseResult(null);
    try {
      const parsed = await parseWorkbook(file);
      const result = await api.importWorkbook(parsed);
      // Store the original uploaded bytes only after the parsed platform import succeeds.
      const stored = await api.uploadWorkbookFile(file);
      setParseResult({ ...result, stored, fileName: file.name });
      const warningText = parsed.validation?.warnings?.length ? ` Imported with ${parsed.validation.warnings.length} sheet warning(s); available sheets were preserved.` : "";
      setMessage((result.message || "Excel data was parsed and imported successfully.") + warningText);
      window.dispatchEvent(new CustomEvent("reactorplan:data-imported"));
    } catch (e) {
      setMessage(e.message || "Could not parse the Excel file.");
    } finally { setParsing(false); }
  };

  return <section>
    <div className="hero">
      <div><h1>Download Center</h1><p className="subtitle">Download operational data by function, CTO site, dashboard, or analytics format.</p></div>
      <span className="source-badge">{filteredRows.length.toLocaleString()} matching records</span>
    </div>

    <div className="download-presets download-category-grid">
      <button className="download-preset" onClick={() => oneClick("capacity")}><span>Capacity Summary</span><small>Source capacity and utilization</small></button>
      <button className="download-preset" onClick={() => setDataset("cto-site")}><span>CTO</span><small>Choose one CTO or all CTOs</small></button>
      <button className="download-preset" onClick={() => oneClick("availability")}><span>Availability</span><small>Available, mapped, and maintenance data</small></button>
      <button className="download-preset" onClick={() => oneClick("mapping")}><span>Mapping</span><small>Project-to-reactor mappings</small></button>
      <button className="download-preset" onClick={() => oneClick("calendar")}><span>Planning Calendar</span><small>Scheduled mapping records</small></button>
      <button className="download-preset" onClick={() => oneClick("analytics")}><span>Analytics</span><small>Excel data or chart PDF</small></button>
      <button className="download-preset" onClick={() => oneClick("reactors")}><span>Reactor Master Data</span><small>Complete reactor inventory</small></button>
      <button className="download-preset" onClick={() => oneClick("dashboard")}><span>Dashboard</span><small>KPI and site summary</small></button>
      <button className="download-preset" onClick={() => oneClick("clients")}><span>Client Information</span><small>Client Name, Product Name and Stage Code data</small></button>
      <button className="download-preset" onClick={downloadAll}><span>Everything</span><small>All operational sheets</small></button>
    </div>

    <div className="stats-grid compact"><StatCard label="Available records" value={rawRows.length.toLocaleString()} /><StatCard label="Filtered records" value={filteredRows.length.toLocaleString()} /><StatCard label="Selected columns" value={effectiveColumns.length.toLocaleString()} /><StatCard label="Export format" value={format.toUpperCase()} /></div>

    <div className="download-layout">
      <div className="panel">
        <div className="panel-title-row"><div><h2>Custom Export — {datasetTitle}</h2><p className="muted">Select the rows and columns you need.</p></div></div>
        <div className="download-form-grid">
          <label>Dataset<select value={dataset} onChange={e => { setDataset(e.target.value); setSelectedColumns(null); }}>{Object.entries(PRESETS).map(([k,v]) => <option key={k} value={k}>{v.title}</option>)}<option value="cto-site">Individual CTO</option><option value="ctos-all">All CTOs</option></select></label>
          {dataset === "cto-site" && <label>CTO site<select value={ctoSite} onChange={e => { setCtoSite(e.target.value); setSelectedColumns(null); }}>{CTO_SITES.map(s => <option key={s}>{s}</option>)}</select></label>}
          <label>Format<select value={format} onChange={e => setFormat(e.target.value)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option><option value="json">JSON (.json)</option><option value="pdf">PDF / charts (.pdf)</option></select></label>
          <label>Search<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search records..." /></label>
          <label>Site<select value={site} onChange={e => setSite(e.target.value)}>{sites.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Status<select value={status} onChange={e => setStatus(e.target.value)}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        </div>

        <div className="column-picker"><div className="column-picker-header"><div><strong>Columns</strong><span>{effectiveColumns.length} of {columns.length} selected</span></div><div className="inline-actions"><button className="secondary" type="button" onClick={() => setSelectedColumns(columns)}>Select all</button><button className="secondary" type="button" onClick={() => setSelectedColumns(columns.slice(0, 4))}>Keep essentials</button></div></div><div className="column-grid">{columns.map(c => <label className="column-option" key={c} title={label(c)}><input type="checkbox" checked={effectiveColumns.includes(c)} onChange={() => toggle(c)} /><span>{label(c)}</span></label>)}</div></div>
        <div className="download-actions"><button className="secondary" onClick={reset}>Reset filters</button><button onClick={download} disabled={downloading || !exportRows.length}>{downloading ? "Preparing…" : `Download ${format.toUpperCase()}`}</button></div>
        {message && <div className="download-message">{message}</div>}
      </div>

      <div className="panel download-side-panel"><h2>Quick downloads</h2><p className="muted">Direct exports for the most common operational needs.</p>
        <button className="download-card-button" onClick={() => oneClick("analytics", "pdf")}><strong>Analytics charts</strong><span>Download analytics as a presentation-ready PDF</span></button>
        <button className="download-card-button" onClick={() => oneClick("report", "pdf")}><strong>Operational report — PDF</strong><span>Executive-ready status, capacity and mapping report</span></button>
        <button className="download-card-button" onClick={downloadAll}><strong>Everything — Excel</strong><span>Dashboard, capacity, availability, mapping, calendar, analytics, reactor master and every CTO</span></button>
        <button className="download-card-button" onClick={downloadAll}><strong>Current Platform Excel</strong><span>Export the latest platform data, including your updates.</span></button>
        <button className="download-card-button" onClick={() => api.downloadSourceWorkbook()}><strong>Master Excel — Exact Uploaded File</strong><span>Downloads the latest uploaded workbook byte-for-byte, including all sheets, formatting, formulas and source content.</span></button>
        <button className="download-card-button" onClick={downloadUpdatedMaster}><strong>Updated Master Excel — Current Platform Data</strong><span>Writes new reactors, mappings, client/project fields and planning changes back into the master workbook layout.</span></button>
        <div className="download-note">The Master Excel is preserved exactly as uploaded. Current Platform Excel / Everything contains the latest operational data after platform updates. SAP Code remains excluded from generated operational exports.</div>
      </div>
    </div>

    <div className="panel workbook-sync-panel">
      <div className="panel-title-row"><div><h2>Excel Parsing and Data Sync</h2><p className="muted">Upload an Excel workbook to parse and sync reactor, capacity, summary, mapping, and volume data into the platform.</p></div><span className="source-badge">{parsing ? "Parsing…" : "Ready"}</span></div>
      <div className="workbook-sync-actions">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={parseAndImport} hidden />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={parsing}>{parsing ? "Parsing Excel…" : "Choose Excel File"}</button>
        <span className="muted">After import, the platform refreshes automatically. Future Current Platform Excel downloads include the imported data and later platform updates.</span>
      </div>
      {parseResult && <div className="workbook-sync-result"><strong>{parseResult.fileName}</strong><span>{parseResult.counts?.equipment ?? 0} reactors · {parseResult.counts?.capacity ?? 0} capacity entries · {parseResult.counts?.mappings ?? 0} planning intervals · {parseResult.counts?.summary ?? 0} summary entries</span><small>Imported data is retained · {parseResult.validation?.missingSheets?.length || 0} expected sheet(s) not found · original workbook available for download</small></div>}
    </div>

  </section>;
}
