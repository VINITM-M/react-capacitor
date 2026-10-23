import { useMemo, useState } from "react";
import StatCard from "../components/StatCard";
import { exportEdaVisualWorkbook, exportAnalyticsPdf } from "../utils/exportUtils";

import { resolveStageCode, cleanKnownText } from "../utils/unknownUtils";
import { buildInventoryMetrics, inventoryRecordKey } from "../utils/inventoryMetrics";
const n = (value) => Number(value) || 0;
const fmt = (value, digits = 3) => n(value).toLocaleString(undefined, { maximumFractionDigits: digits });
const pct = (value) => `${n(value).toFixed(1)}%`;

const STATUS_META = [
  ["Mapped", "#1769aa"],
  ["Available", "#2d8b52"],
  ["Maintenance", "#9a6b00"],
];

function Donut({ counts, total }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="eda-donut-wrap">
      <svg className="eda-donut" viewBox="0 0 150 150" role="img" aria-label="Reactor status distribution">
        <circle cx="75" cy="75" r={radius} fill="none" stroke="#e9eef2" strokeWidth="20" />
        {STATUS_META.map(([label, color]) => {
          const value = counts[label] || 0;
          const length = total ? value / total * circumference : 0;
          const circle = (
            <circle
              key={label}
              cx="75"
              cy="75"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="20"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 75 75)"
            />
          );
          offset += length;
          return circle;
        })}
        <text x="75" y="71" textAnchor="middle" className="eda-donut-total">{total}</text>
        <text x="75" y="87" textAnchor="middle" className="eda-donut-label">reactors</text>
      </svg>
      <div className="eda-status-list">
        {STATUS_META.map(([label, color]) => {
          const value = counts[label] || 0;
          return (
            <div className="eda-status-row" key={label}>
              <span><i style={{ background: color }} />{label}</span>
              <strong>{value}</strong>
              <small>{total ? pct(value / total * 100) : "0.0%"}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SiteBars({ sites }) {
  const max = Math.max(...sites.map((x) => x.total), 1);
  return (
    <div className="eda-site-bars">
      {sites.map((site) => (
        <div className="eda-site-row" key={site.site}>
          <div className={`eda-site-name site-label site-${String(site.site || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} title={site.site}>{site.site}</div>
          <div className="eda-site-track">
            <i style={{ width: `${Math.max(2, site.total / max * 100)}%` }} />
            <b style={{ width: `${Math.max(0, Math.min(100, site.pct))}%` }} />
          </div>
          <strong>{fmt(site.total)} KL</strong>
          <small>{pct(site.pct)}</small>
        </div>
      ))}
      <div className="eda-chart-key"><span><i className="key-total" />Total capacity</span><span><i className="key-util" />Utilization</span></div>
    </div>
  );
}

function Histogram({ values }) {
  const bins = [0, 1000, 2500, 5000, 7500, 10000, 15000, 20000];
  const labels = ["0–1k", "1–2.5k", "2.5–5k", "5–7.5k", "7.5–10k", "10–15k", "15–20k"];
  const counts = labels.map((_, index) => {
    const lo = bins[index];
    const hi = bins[index + 1];
    return values.filter((v) => v >= lo && (index === labels.length - 1 ? v <= hi : v < hi)).length;
  });
  const max = Math.max(...counts, 1);
  return (
    <div className="eda-histogram" aria-label="Reactor capacity distribution">
      {counts.map((count, index) => (
        <div className="eda-hist-bin" key={labels[index]}>
          <span className="eda-hist-count">{count}</span>
          <div className="eda-hist-track"><i style={{ height: `${count / max * 100}%` }} /></div>
          <small>{labels[index]}</small>
        </div>
      ))}
    </div>
  );
}

function buildTimeSeries({ summary = [], mappings = [], maintenance = [] }) {
  // Keep a real monthly axis from Apr-2026 through Dec-2028. Workbook schedule
  // cells are the source for activity; months without source activity remain 0.
  const periods = [];
  for (let year = 2026, month = 3; year < 2029 && !(year === 2028 && month > 11); ) {
    const date = new Date(Date.UTC(year, month, 1));
    periods.push({
      label: date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      month: date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toLowerCase(),
      year,
      monthIndex: month,
    });
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  const activeInMonth = (row, key) => {
    const start = String(row.startDate || row.date || "").slice(0, 7);
    const end = String(row.endDate || row.date || row.startDate || "").slice(0, 7);
    if (start && end) return start <= key && end >= key;
    return (row.schedule || []).some(cell => String(cell.date || "").slice(0, 7) === key && String(cell.value || "").trim());
  };
  return periods.map(period => {
    const monthlySummary = summary.reduce((acc, row) => {
      acc.mapped += n(row[`mapped_${period.month}`]);
      acc.occupied += n(row[`occupied_${period.month}`]);
      acc.ideal += n(row[`ideal_${period.month}`]);
      return acc;
    }, { mapped: 0, occupied: 0, ideal: 0 });
    const monthMappings = mappings.filter(row => activeInMonth(row, period.key));
    const uniqueReactors = new Set(monthMappings.map(inventoryRecordKey).filter(Boolean));
    const monthMaintenance = maintenance.filter(row => activeInMonth(row, period.key) && !["completed", "cancelled"].includes(String(row.status || "").toLowerCase()));
    const withinSummaryFY = period.key >= "2026-04" && period.key <= "2027-03";
    const sourceScheduleAvailable = period.key <= "2027-09";
    const summaryHasMonthlyValues = summary.some(row => ["mapped", "occupied", "ideal"].some(metric => row[`${metric}_${period.month}`] != null && row[`${metric}_${period.month}`] !== ""));
    return {
      label: period.label,
      key: period.key,
      mapped: withinSummaryFY && summaryHasMonthlyValues ? monthlySummary.mapped : (sourceScheduleAvailable ? uniqueReactors.size : null),
      occupied: withinSummaryFY && summaryHasMonthlyValues ? monthlySummary.occupied : (sourceScheduleAvailable ? uniqueReactors.size : null),
      ideal: withinSummaryFY && summaryHasMonthlyValues ? monthlySummary.ideal : null,
      activeMappings: sourceScheduleAvailable ? uniqueReactors.size : null,
      maintenance: sourceScheduleAvailable ? monthMaintenance.length : null,
      sourceAvailable: sourceScheduleAvailable,
    };
  });
}

function LongRangeTrend({ rows, metric, horizon }) {
  const metrics = {
    mapped: { label: "Mapped Reactors", colorClass: "eda-line-mapped" },
    occupied: { label: "Occupied Reactors", colorClass: "eda-line-occupied" },
    ideal: { label: "Ideal reactors", colorClass: "eda-line-ideal" },
    activeMappings: { label: "Active mappings", colorClass: "eda-line-active" },
    maintenance: { label: "Maintenance Records", colorClass: "eda-line-maintenance" },
  };
  const meta = metrics[metric] || metrics.mapped;
  const horizonMonths = horizon === 1 ? 12 : horizon === 2 ? 24 : 33;
  const axisRows = rows.slice(0, horizonMonths);
  const plottedRows = axisRows.filter(row => row[metric] !== null && row[metric] !== undefined && Number.isFinite(Number(row[metric])));
  const values = plottedRows.map(row => n(row[metric]));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const width = 900;
  const height = 300;
  const pad = { l: 48, r: 24, t: 26, b: 48 };
  const x = i => pad.l + i * ((width - pad.l - pad.r) / Math.max(axisRows.length - 1, 1));
  const y = value => height - pad.b - ((value - min) / range) * (height - pad.t - pad.b);
  const plottedPoints = plottedRows.map(row => ({ row, index: axisRows.findIndex(item => item.key === row.key) }));
  const path = plottedPoints.map((point, i) => `${i ? "L" : "M"}${x(point.index).toFixed(1)},${y(n(point.row[metric])).toFixed(1)}`).join(" ");
  const area = plottedPoints.length > 1 ? `${path} L ${x(plottedPoints.at(-1).index).toFixed(1)},${height - pad.b} L ${x(plottedPoints[0].index).toFixed(1)},${height - pad.b} Z` : "";
  const first = plottedRows[0]?.label || "No source period";
  const last = plottedRows.at(-1)?.label || "No source period";
  const coverage = plottedRows.length ? `${first} – ${last}` : "No planning timeline available";
  const horizonLabel = horizon === 3 ? "Apr 2026 – Dec 2028" : `First ${horizon} year${horizon > 1 ? "s" : ""}`;
  const indexed = values.length && values[0] !== 0 ? values.map(v => +(v / values[0] * 100).toFixed(1)) : [];
  const latestValue = values.length ? values.at(-1) : null;
  return (
    <div className="eda-longrange">
      <div className="eda-trend-headline">
        <div><strong>{meta.label}</strong><span>{coverage}</span></div>
        <div className="eda-trend-stats"><span>Latest <b>{latestValue === null ? "Unknown" : latestValue.toLocaleString()}</b></span><span>Peak <b>{Math.max(...values, 0).toLocaleString()}</b></span><span>Low <b>{(values.length ? Math.min(...values) : 0).toLocaleString()}</b></span></div>
      </div>
      <div className="eda-range-note"><span>{horizonLabel}</span><span>Timeline: {axisRows.length} months · planning coverage: {plottedRows.length} months</span><span>{horizon === 3 ? "Timeline extends through December 2028; the trend line ends at the last period with schedule information." : "Choose 3Y to view through December 2028."}</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} className="eda-trend eda-longrange-chart" role="img" aria-label={`${meta.label}, ${horizonLabel}, planning coverage ${coverage}`}>
        {[0, .25, .5, .75, 1].map(step => <g key={step}><line x1={pad.l} x2={width - pad.r} y1={y(min + range * step)} y2={y(min + range * step)} className="eda-gridline"/><text x={pad.l - 8} y={y(min + range * step) + 3} textAnchor="end" className="eda-y-label">{Math.round(min + range * step).toLocaleString()}</text></g>)}
        {area && <path d={area} className="eda-area" />}
        {path && <path d={path} className={`eda-line ${meta.colorClass}`} />}
        {axisRows.map((row, i) => <g key={`${row.label}-${i}`}>{row[metric] !== null && row[metric] !== undefined && <circle cx={x(i)} cy={y(n(row[metric]))} r="4" className="eda-point"/>}<text x={x(i)} y={height - 18} textAnchor="middle" className="eda-axis-label">{axisRows.length <= 12 ? row.label.slice(0, 3) : (i % 3 === 0 || i === axisRows.length - 1 ? `${row.label.slice(0, 3)} '${row.label.slice(-2)}` : "")}</text></g>)}
      </svg>
      <div className="eda-navigator" aria-label="Time series navigator">
        <div className="eda-navigator-track"><i style={{ width: `${plottedRows.length ? Math.max(4, Math.min(100, plottedRows.length / Math.max(horizonMonths, 1) * 100)) : 0}%` }} /></div>
        <div className="eda-navigator-labels"><span>{plottedRows[0]?.label || "Start"}</span><span>{plottedRows.at(-1)?.label || "No planning data"}</span></div>
      </div>
      {indexed.length > 1 && <div className="eda-indexed-strip"><span>Indexed movement from first available period</span><strong>{indexed.at(-1)} / 100</strong><small>100 = first source period</small></div>}
    </div>
  );
}
function buildAnalyticsData({ equipment, capacity, summary, mappings, maintenance, sites, blocks, counts, dataQuality }) {
  const overview = [{
    metric: "Total reactors", value: equipment.length, unit: "count"
  }, {
    metric: "Total capacity", value: capacity.reduce((s, r) => s + n(r.totalCapacity), 0), unit: "KL"
  }, {
    metric: "Utilized capacity", value: capacity.reduce((s, r) => s + n(r.utilization), 0), unit: "KL"
  }, {
    metric: "Mapped capacity", value: capacity.reduce((s, r) => s + n(r.mapped), 0), unit: "KL"
  }, {
    metric: "Available capacity", value: capacity.reduce((s, r) => s + n(r.available), 0), unit: "KL"
  }];
  const status = STATUS_META.map(([label]) => ({ status: label, count: counts[label] || 0, percentage: equipment.length ? +((counts[label] || 0) / equipment.length * 100).toFixed(2) : 0 }));
  const planning = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map(month => ({
    month,
    mapped: summary.reduce((s, r) => s + n(r[`mapped_${month}`]), 0),
    occupied: summary.reduce((s, r) => s + n(r[`occupied_${month}`]), 0),
    ideal: summary.reduce((s, r) => s + n(r[`ideal_${month}`]), 0),
  }));
  const quality = [
    ["Project mapping", dataQuality.missingProject],
    ["MOC", dataQuality.missingMoc],
    ["Agitator", dataQuality.missingAgitator],
    ["Minimum / Maximum Volume", dataQuality.missingVolume],
  ].map(([field, missing]) => ({ field, missing, missingPercentage: equipment.length ? +((missing / equipment.length) * 100).toFixed(2) : 0 }));
  const exportSites = sites.map(row => ({ ...row, totalCapacity: row.totalCapacity ?? row.total, utilization: row.utilization ?? row.utilized, utilizationPercent: row.utilizationPercent ?? row.pct }));
  return { overview, sites: exportSites, status, planning, timeSeries: buildTimeSeries({ summary, mappings, maintenance }), blocks, quality };
}

export default function Analytics({ equipment = [], mappings = [], capacity = [], summary = [], maintenance = [] }) {
  const [downloadMessage, setDownloadMessage] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [timeSeriesMetric, setTimeSeriesMetric] = useState("mapped");
  const [timeSeriesHorizon, setTimeSeriesHorizon] = useState(3);

  const totalReactors = equipment.length;
  const inventoryMetrics = useMemo(() => buildInventoryMetrics(equipment, mappings), [equipment, mappings]);
  const counts = inventoryMetrics.counts;

  const capTotal = capacity.reduce((sum, row) => sum + n(row.totalCapacity), 0);
  const utilization = capacity.reduce((sum, row) => sum + n(row.utilization), 0);
  const utilizationPct = capTotal ? utilization / capTotal * 100 : 0;
  const mappedCapacity = capacity.reduce((sum, row) => sum + n(row.mapped), 0);
  const availableCapacity = capacity.reduce((sum, row) => sum + n(row.available), 0);
  const reactorCapacity = equipment.reduce((sum, row) => sum + n(row.capacity), 0);
  const avgReactorCapacity = totalReactors ? reactorCapacity / totalReactors : 0;

  const sites = useMemo(() => {
    const result = {};
    capacity.forEach((row) => {
      const site = row.site || "Unknown";
      const current = result[site] || { site, total: 0, utilized: 0, mapped: 0, available: 0 };
      current.total += n(row.totalCapacity);
      current.utilized += n(row.utilization);
      current.mapped += n(row.mapped);
      current.available += n(row.available);
      result[site] = current;
    });
    return Object.values(result).map((row) => ({ ...row, pct: row.total ? row.utilized / row.total * 100 : 0 })).sort((a, b) => b.total - a.total);
  }, [capacity]);

  const capacityValues = useMemo(() => equipment.map((row) => n(row.capacity)).filter((v) => v > 0), [equipment]);
  const blocks = useMemo(() => {
    const result = {};
    equipment.forEach((row) => {
      const block = row.block || "Unknown";
      result[block] = (result[block] || 0) + n(row.capacity);
    });
    return Object.entries(result).map(([block, value]) => ({ block, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [equipment]);

  const timeSeries = useMemo(() => buildTimeSeries({ summary, mappings, maintenance }), [summary, mappings, maintenance]);
  const productStats = useMemo(() => {
    const grouped = new Map();
    (mappings || []).forEach(row => {
      const product = String(row.product || "").trim() || "Unknown";
      if (!grouped.has(product)) grouped.set(product, { product, mappingRecords: 0, reactorIds: new Set(), projects: new Set(), stages: new Set() });
      const item = grouped.get(product);
      item.mappingRecords += 1;
      const reactor = String(row.reactorUid || row.reactorId || row.reactor || "").trim();
      const project = String(row.projectCode || row.productCode || "").trim();
      const stage = resolveStageCode(row);
      const physicalKey = inventoryRecordKey(row);
      if (physicalKey) item.reactorIds.add(physicalKey);
      if (project) item.projects.add(project);
      if (cleanKnownText(stage)) item.stages.add(stage);
    });
    return [...grouped.values()].map(x => ({ product: x.product, mappingRecords: x.mappingRecords, reactors: x.reactorIds.size, projects: x.projects.size, stages: x.stages.size }))
      .sort((a,b) => b.reactors-a.reactors || b.mappingRecords-a.mappingRecords || a.product.localeCompare(b.product)).slice(0,12);
  }, [mappings]);
  const capacityBands = useMemo(() => {
    const bands = [{label:"≤ 1 kL",min:0,max:1000,count:0},{label:"> 1–3 kL",min:1000,max:3000,count:0},{label:"> 3–5 kL",min:3000,max:5000,count:0},{label:"> 5–10 kL",min:5000,max:10000,count:0},{label:"> 10 kL",min:10000,max:Infinity,count:0}];
    equipment.forEach(row => { const v=n(row.capacity); if(v<=0)return; const band=bands.find((b,i)=>i===0?v<=b.max:i===bands.length-1?v>b.min:v>b.min&&v<=b.max); if(band)band.count+=1; });
    return bands.map(({label,count})=>({label,count}));
  }, [equipment]);

  const dataQuality = {
    missingProject: equipment.filter((r) => !r.projectMapped).length,
    missingMoc: equipment.filter((r) => !r.moc).length,
    missingAgitator: equipment.filter((r) => !r.agitator).length,
    missingVolume: equipment.filter((r) => r.minVolume == null || r.maxVolume == null).length,
  };

  const topBlock = blocks[0];

  return (
    <section className="eda-page">
      <div className="page-heading-row">
        <div>
          <h1>Exploratory Data Analytics</h1>
          <p className="subtitle">Explore capacity, reactor status, product allocation, and planning trends across all sites.</p>
        </div>
        <div className="eda-scope"><span>{totalReactors.toLocaleString()} reactors</span><span>{capacity.length} site capacity entries</span><span>{mappings.length.toLocaleString()} planning intervals</span></div>
      </div>

      <div className="panel eda-download-panel">
        <div>
          <h2>Analytics downloads</h2>
          <p className="muted">Download a visual workbook with graphical summaries or a five-page presentation-ready analysis PDF.</p>
        </div>
        <div className="eda-download-actions">
          <button type="button" className="secondary" disabled={downloading} onClick={() => {
            setDownloading(true); setDownloadMessage("");
            try {
              const analytics = buildAnalyticsData({ equipment, capacity, summary, mappings, maintenance, sites, blocks, counts, dataQuality });
              exportEdaVisualWorkbook({
                overview: analytics.overview,
                sites: analytics.sites,
                status: analytics.status,
                planning: analytics.planning,
                quality: analytics.quality,
                products: productStats,
                capacityBands,
                filename: `reactorplan-eda-visual-${new Date().toISOString().slice(0, 10)}`
              });
              setDownloadMessage("EDA workbook downloaded successfully.");
            } catch (e) { setDownloadMessage(e.message || "EDA workbook download failed."); }
            finally { setDownloading(false); }
          }}>Download Visual EDA Excel</button>
          <button type="button" disabled={downloading} onClick={() => {
            setDownloading(true); setDownloadMessage("");
            try {
              const analytics = buildAnalyticsData({ equipment, capacity, summary, mappings, maintenance, sites, blocks, counts, dataQuality });
              exportAnalyticsPdf({
                rows: analytics.sites,
                timeSeries: analytics.timeSeries,
                quality: analytics.quality,
                status: analytics.status,
                filename: `reactorplan-eda-charts-${new Date().toISOString().slice(0, 10)}`,
                title: "ReactorPlan Exploratory Data Analytics"
              });
              setDownloadMessage("EDA chart PDF downloaded successfully.");
            } catch (e) { setDownloadMessage(e.message || "EDA PDF download failed."); }
            finally { setDownloading(false); }
          }}>Download Charts PDF</button>
          {downloadMessage && <span className="eda-download-message">{downloadMessage}</span>}
        </div>
      </div>

      <div className="stats-grid analytics-stats eda-kpis">
        <StatCard label="Total Capacity" value={`${fmt(capTotal)} KL`} hint="All sites combined" />
        <StatCard label="Utilized Capacity" value={`${fmt(utilization)} KL`} hint={`${pct(utilizationPct)} utilization`} />
        <StatCard label="Mapped Capacity" value={`${fmt(mappedCapacity)} KL`} hint={`${pct(capTotal ? mappedCapacity / capTotal * 100 : 0)} of total`} />
        <StatCard label="Available Capacity" value={`${fmt(availableCapacity)} KL`} hint={`${pct(capTotal ? availableCapacity / capTotal * 100 : 0)} of total`} />
        <StatCard label="Average Reactor Capacity" value={`${fmt(avgReactorCapacity / 1000, 2)} kL`} hint={`${fmt(reactorCapacity / 1000, 2)} kL across all equipment`} />
      </div>

      <div className="eda-grid eda-grid-main">
        <div className="panel eda-panel eda-wide">
          <div className="panel-title-row"><div><h2>Capacity Utilization by Site</h2><p className="muted">Total capacity is shown by bar length; the darker overlay shows utilized capacity.</p></div></div>
          <SiteBars sites={sites} />
        </div>
        <div className="panel eda-panel">
          <div className="panel-title-row"><div><h2>Reactor Status Distribution</h2><p className="muted">Current equipment status in the live dataset.</p></div></div>
          <Donut counts={counts} total={totalReactors} />
        </div>
      </div>

      <div className="eda-grid">
        <div className="panel eda-panel eda-wide eda-time-series-panel">
          <div className="panel-title-row"><div><h2>Long-Range Planning Trends</h2><p className="muted">Compare the selected operational metric across one-, two-, and three-year horizons. The navigator highlights periods with planning data.</p></div><div className="eda-series-controls"><select className="eda-series-select" value={timeSeriesMetric} onChange={e => setTimeSeriesMetric(e.target.value)}><option value="mapped">Mapped Reactors</option><option value="occupied">Occupied Reactors</option><option value="ideal">Ideal Reactors</option><option value="activeMappings">Active mappings</option><option value="maintenance">Maintenance Reactors</option></select><div className="eda-horizon-toggle" role="group" aria-label="Time series horizon">{[1,2,3].map(years => <button key={years} type="button" className={timeSeriesHorizon === years ? "active" : ""} onClick={() => setTimeSeriesHorizon(years)}>{years}Y</button>)}</div></div></div>
          <LongRangeTrend rows={timeSeries} metric={timeSeriesMetric} horizon={timeSeriesHorizon} />
        </div>
        <div className="panel eda-panel">
          <div className="panel-title-row"><div><h2>Reactor Capacity Distribution</h2><p className="muted">How reactor sizes are distributed across the equipment master data.</p></div></div>
          <Histogram values={capacityValues} />
        </div>
      </div>

      <div className="eda-grid">
        <div className="panel eda-panel eda-wide">
          <div className="panel-title-row"><div><h2>Largest Equipment Blocks</h2><p className="muted">Blocks with the highest reactor capacity.</p></div></div>
          <div className="eda-block-list">
            {blocks.map((row) => {
              const max = topBlock?.value || 1;
              return <div className="eda-block-row" key={row.block}><span title={row.block}>{row.block}</span><div><i style={{ width: `${row.value / max * 100}%` }} /></div><strong>{fmt(row.value / 1000, 1)} kL</strong></div>;
            })}
          </div>
        </div>

      </div>

      <div className="panel eda-panel eda-product-analysis">
        <div className="panel-title-row"><div><h2>Product Allocation</h2><p className="muted">Compare reactor allocation and Stage Code coverage by Product Name. Missing Product Names are shown as Unknown.</p></div><span className="result-count">{productStats.length} leading Product Names</span></div>
        <div className="eda-product-grid">
          {productStats.slice(0,8).map((product,index)=>{
            const max=productStats[0]?.reactors||1;
            return <article key={product.product} className="eda-product-item"><div className="eda-product-title"><strong title={product.product}>{product.product}</strong><span>{product.reactors.toLocaleString()} reactors</span></div><div className="eda-product-track"><i style={{width:`${Math.max(product.reactors?2:0,product.reactors/max*100)}%`}}/></div><div className="eda-product-meta"><span>{product.mappingRecords} Planning Intervals</span><span>{product.reactors} Reactors</span><span>{product.stages} Stage Codes</span></div></article>;
          })}
          {!productStats.length && <p className="muted">No Product Name-level mapping data is available for the current filters.</p>}
        </div>
      </div>

      <div className="eda-insight-strip">
        <div><span>Mapped reactor rate</span><strong>{pct(totalReactors ? counts.Mapped / totalReactors * 100 : 0)}</strong></div>
        <div><span>Largest site by capacity</span><strong>{sites[0]?.site || "Unknown"}</strong></div>
        <div><span>Largest block</span><strong>{topBlock?.block || "Unknown"}</strong></div>
        <div><span>Capacity range</span><strong>{capacityValues.length ? `${fmt(Math.min(...capacityValues) / 1000, 1)}–${fmt(Math.max(...capacityValues) / 1000, 1)} kL` : "Unknown"}</strong></div>
      </div>

      <div className="panel eda-panel eda-findings-panel">
        <div className="panel-title-row"><div><h2>Key Findings</h2><p className="muted">Evidence-led observations calculated from the current dataset. These are descriptive findings, not forecasts.</p></div></div>
        <div className="eda-findings-grid">
          <article><span>Capacity utilization</span><strong>{pct(utilizationPct)}</strong><p>{fmt(utilization)} KL utilized out of {fmt(capTotal)} KL total capacity. {utilizationPct >= 80 ? "Utilization is high relative to the available capacity base." : utilizationPct >= 50 ? "More than half of the capacity base is utilized." : "A substantial portion of capacity remains outside current utilization."}</p></article>
          <article><span>Available capacity share</span><strong>{pct(capTotal ? availableCapacity / capTotal * 100 : 0)}</strong><p>{fmt(availableCapacity)} KL is recorded as available. Compare this with mapped capacity and the planning timeline before assigning new work.</p></article>
          <article><span>Site concentration</span><strong>{sites[0]?.site || "Unknown"}</strong><p>{sites[0] && capTotal ? `${pct(sites[0].total / capTotal * 100)} of total capacity is at the largest site (${fmt(sites[0].total)} KL).` : "Site-level capacity concentration cannot be calculated from the available source values."}</p></article>
          <article><span>Data completeness signals</span><strong>{fmt(dataQuality.missingProject + dataQuality.missingMoc + dataQuality.missingAgitator + dataQuality.missingVolume)}</strong><p>Missing-field instances across project mapping, MOC, agitator, and minimum/maximum volume checks. A record can contribute to more than one field check.</p></article>
        </div>
      </div>
    </section>
  );
}
