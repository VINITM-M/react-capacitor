import { useMemo, useState } from "react";
import Modal from "../components/Modal";
import { matchesSearch } from "../utils/searchUtils";
import { cleanKnownText, resolveStageCode } from "../utils/unknownUtils";
import { buildInventoryMetrics } from "../utils/inventoryMetrics";

const CTO_SITES = ["CTO-2", "CTO-3", "CTO-5", "CTO-6", "CTO-SEZ"];
const VIEWS = ["Overall", ...CTO_SITES, "Mexico", "Mirfield"];
const CATEGORIES = ["Confirmed", "High Probable", "Visible"];
const clean = v => cleanKnownText(v);
const norm = v => clean(v).toLowerCase();
const canonicalId = v => norm(v).replace(/[^a-z0-9]/g, "");
const reactorPairKey = m => {
  const uid = canonicalId(m?.reactorUid || m?.uid);
  if (uid) return `uid:${uid}`;
  const id = canonicalId(m?.reactorId);
  return id ? `record:${canonicalId(m?.site)}|${id}|${canonicalId(m?.block)}|${canonicalId(m?.area)}` : "";
};
const confidenceRank = new Map([['Confirmed', 3], ['High Probable', 2], ['Visible', 1]]);
const exclusiveConfidenceCounts = rows => {
  const bestByReactor = new Map();
  (rows || []).forEach(m => {
    const key = reactorPairKey(m);
    const confidence = category(m);
    const rank = confidenceRank.get(confidence);
    if (!key || !rank) return;
    const current = bestByReactor.get(key);
    if (!current || rank > current.rank) bestByReactor.set(key, { confidence, rank });
  });
  return CATEGORIES.reduce((counts, confidence) => {
    counts[confidence] = [...bestByReactor.values()].filter(item => item.confidence === confidence).length;
    return counts;
  }, {});
};
const toDate = v => { const d = new Date(`${String(v || "").slice(0, 10)}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const fmt = d => d.toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" });
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const monthLabel = d => d.toLocaleDateString(undefined, { month:"long", year:"numeric" });
const category = m => {
  const value = clean(m?.category);
  if (CATEGORIES.includes(value)) return value;
  if (value.toLowerCase() === "workbook") return "Source";
  return "Maintenance";
};
const cls = v => clean(v).toLowerCase().replace(/[^a-z]+/g, "-");
const today = () => new Date().toISOString().slice(0,10);
const plusDays = (date, days) => iso(addDays(toDate(date) || new Date(), days));

export default function Calendar({ mappings = [], equipment = [], mappingOptions = {}, onCreateMapping }) {
  const weeks = useMemo(() => {
    const starts = [];
    const normalizeWeekStart = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const day = d.getDay();
      const offset = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + offset);
      return d;
    };
    // The latest workbook starts in April 2026. Keep the calendar continuously
    // navigable through December 2028 even where the workbook has no planned cells.
    const horizonStart = normalizeWeekStart(new Date("2026-04-01T00:00:00"));
    const horizonEnd = normalizeWeekStart(new Date("2028-12-31T00:00:00"));
    for (let d = new Date(horizonStart); d <= horizonEnd; d = addDays(d, 7)) {
      starts.push(new Date(d));
    }
    return starts;
  }, []);

  const monthOptions = useMemo(() => {
    const map = new Map();
    weeks.forEach(w => map.set(monthKey(w), monthLabel(w)));
    return [...map.entries()];
  }, [weeks]);

  const quarterKey = d => `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  const quarterLabel = d => `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  const quarterOptions = useMemo(() => {
    const map = new Map();
    weeks.forEach(w => map.set(quarterKey(w), quarterLabel(w)));
    return [...map.entries()];
  }, [weeks]);

  const yearOptions = useMemo(() => [...new Set(weeks.map(w => String(w.getFullYear())))], [weeks]);
  const defaultMonth = monthOptions.find(([value]) => value === monthKey(new Date()))?.[0] || monthOptions[0]?.[0] || "2026-08";
  const defaultQuarter = quarterOptions.find(([value]) => value === quarterKey(new Date()))?.[0] || quarterOptions[0]?.[0] || "2026-Q3";
  const defaultYear = yearOptions.includes(String(new Date().getFullYear())) ? String(new Date().getFullYear()) : yearOptions[0];

  const [view, setView] = useState("Overall");
  const [query, setQuery] = useState("");
  const [periodMode, setPeriodMode] = useState("month");
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedQuarter, setSelectedQuarter] = useState(defaultQuarter);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [filter, setFilter] = useState("All");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  const periodWeeks = useMemo(() => {
    if (periodMode === "quarter") return weeks.filter(w => quarterKey(w) === selectedQuarter);
    if (periodMode === "year") return weeks.filter(w => String(w.getFullYear()) === String(selectedYear));
    return selectedMonth ? weeks.filter(w => monthKey(w) === selectedMonth) : weeks;
  }, [weeks, periodMode, selectedMonth, selectedQuarter, selectedYear]);

  const monthWeeks = periodWeeks;
  const visibleWeeks = useMemo(
    () => selectedWeek === "all" ? periodWeeks : periodWeeks.filter(w => iso(w) === selectedWeek),
    [periodWeeks, selectedWeek]
  );

  const baseFiltered = useMemo(() => {
    const q = query.trim();
    return mappings.filter(m => {
      const siteOk = view === "Overall" || clean(m.site) === view;
      const hay = [m.reactorId, m.product, m.productCode, m.projectCode, m.stage, ...(m.stages || []), m.stageCode, m.site, m.clientName, m.block, m.area, m.category, m.startDate, m.endDate];
      return siteOk && matchesSearch(hay, q);
    });
  }, [mappings, view, query]);

  const filtered = useMemo(() => baseFiltered.filter(m => filter === "All" || category(m) === filter), [baseFiltered, filter]);
  const confidenceCounts = useMemo(() => exclusiveConfidenceCounts(baseFiltered), [baseFiltered]);

  const inWeek = (m, week) => {
    const keyDate = iso(week);
    const exact = (m.schedule || []).find(x => String(x.date).slice(0,10) === keyDate);
    if (exact) return Boolean(clean(exact.value));
    const s = toDate(m.startDate), e = toDate(m.endDate);
    if (!s || !e) return false;
    const end = addDays(week, 6);
    return s <= end && e >= week;
  };

  const cellValue = (m, week) => {
    const exact = (m.schedule || []).find(x => String(x.date).slice(0,10) === iso(week));
    return clean(exact?.value) || (inWeek(m, week) ? clean(m.productCode || m.product || "Plan") : "");
  };

  const rows = useMemo(() => filtered.map(m => ({
    ...m,
    cells: visibleWeeks.map(w => ({ active: inWeek(m, w), value: cellValue(m, w) }))
  })), [filtered, visibleWeeks]);

  const inventoryMetrics = useMemo(() => buildInventoryMetrics(equipment, mappings), [equipment, mappings]);
  const available = useMemo(() => equipment.filter(r => inventoryMetrics.statusFor(r) === "Available"), [equipment, inventoryMetrics]);
  const products = Array.isArray(mappingOptions.products) ? mappingOptions.products : [];
  const codes = Array.isArray(mappingOptions.productCodes) ? mappingOptions.productCodes : [];
  const stages = Array.isArray(mappingOptions.stages) ? mappingOptions.stages : [];
  const catalog = Array.isArray(mappingOptions.catalog) ? mappingOptions.catalog : [];

  const [form, setForm] = useState({
    reactorUid:"", product:"", productCode:"", stage:"", stages:[], stageCode:"",
    category:"Confirmed", startDate: today(), endDate: plusDays(today(), 7)
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedFamily = products.find(p => p.product === form.product);
  const availableCodes = selectedFamily?.codes?.length ? selectedFamily.codes : codes;
  const selectedCatalog = catalog.find(c => c.code === form.productCode);
  const productSpecificStages = selectedCatalog?.stagesByProduct?.[String(form.product || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")] || [];
  const availableStages = productSpecificStages.length || selectedFamily?.stages?.length
    ? (productSpecificStages.length ? productSpecificStages : selectedFamily.stages)
    : ["Unknown"];

  const openPlan = () => {
    const reactor = available[0];
    const product = products[0]?.product || "";
    const code = products[0]?.codes?.[0] || codes[0] || "";
    const cat = catalog.find(c => c.code === code);
    const productKey = String(product || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""); const stage = cat?.stagesByProduct?.[productKey]?.[0] || products[0]?.stages?.[0] || stages[0] || "Unknown";
    const firstWeek = monthWeeks[0] || weeks[0] || new Date();
    setForm({ reactorUid: reactor?.uid || "", product, productCode: code, stage, stages:[stage], stageCode:code, category:"Confirmed", startDate:iso(firstWeek), endDate:iso(addDays(firstWeek, 6)) });
    setModal(true);
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.reactorUid || !form.product || !form.productCode || !form.stages?.length || !form.startDate || !form.endDate) {
      alert("Complete reactor, Product Name, Stage Code, and dates.");
      return;
    }
    if (form.startDate > form.endDate) { alert("Start date must be before end date."); return; }
    setBusy(true);
    try { await onCreateMapping?.(form); setModal(false); } catch (err) { alert(err.message || "Could not create the plan."); } finally { setBusy(false); }
  };

  return <section className="calendar-page">
    <div className="page-heading-row">
      <div><h1>Planning Calendar</h1><p className="subtitle">Browse planning assignments by month, quarter, or year. Browse monthly, quarterly, and yearly planning assignments through December 2028.</p></div>
      <button onClick={openPlan} disabled={!available.length}>+ Plan New Reactor</button>
    </div>

    <div className="panel calendar-toolbar">
      <div className="calendar-view-tabs">{VIEWS.map(v => <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v}</button>)}</div>
      <div className="calendar-search-row">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search reactor, Client Name, Product Name, Stage Code, site or date…"/>
        <select aria-label="Date view" value={periodMode} onChange={e => { setPeriodMode(e.target.value); setSelectedWeek("all"); }}>
          <option value="month">Month-wise</option><option value="quarter">Quarter-wise</option><option value="year">Year-wise</option>
        </select>
        {periodMode === "month" && <select aria-label="Select month" value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setSelectedWeek("all"); }}><option value="">All months</option>{monthOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>}
        {periodMode === "quarter" && <select aria-label="Select quarter" value={selectedQuarter} onChange={e => { setSelectedQuarter(e.target.value); setSelectedWeek("all"); }}>{quarterOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>}
        {periodMode === "year" && <select aria-label="Select year" value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setSelectedWeek("all"); }}>{yearOptions.map(y => <option key={y} value={y}>{y}</option>)}</select>}
        <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}><option value="all">All weeks in selected {periodMode}</option>{periodWeeks.map(w => <option key={iso(w)} value={iso(w)}>Week of {fmt(w)}</option>)}</select>
        <select value={filter} onChange={e => setFilter(e.target.value)}><option>All</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
        <button className="secondary" onClick={() => { const now = new Date(); const found = weeks.find(w => w <= now && addDays(w, 6) >= now) || weeks.find(w => w >= now) || weeks[0]; if (found) { setPeriodMode("month"); setSelectedMonth(monthKey(found)); setSelectedWeek(iso(found)); } }}>Current week</button>
      </div>
    </div>

    <div className="panel week-navigation">
      <strong>{periodMode === "month" ? (monthOptions.find(x => x[0] === selectedMonth)?.[1] || "All months") : periodMode === "quarter" ? (quarterOptions.find(x => x[0] === selectedQuarter)?.[1] || selectedQuarter) : selectedYear}</strong>
      <span className="muted">{visibleWeeks.length} weeks displayed · {rows.length} planning intervals · through Dec 2028</span>
    </div>

<div className="calendar-legend clickable-legend">
 { ["All", ...CATEGORIES].map(c =>
<button
     key={c}
     className={`legend ${c === "All" ? "all-categories" : cls(c)} ${filter === c ? "selected" : ""}`}
     onClick={() => setFilter(c)}
>
     {c}
     {c !== "All" && <span>{(confidenceCounts[c] || 0).toLocaleString()} reactors</span>}
</button>
 )}
</div>
    <p className="muted calendar-confidence-note">The calendar legend uses the same exclusive highest-confidence counts rule as the Dashboard: distinct reactors with at least one matching planning period is counted once at its highest assigned level — Confirmed, then High Probable, then Visible. These totals reconcile across both views.</p>
    <div className="panel excel-calendar-panel" role="region" aria-label="Scrollable planning calendar" tabIndex="0">
      <div className="calendar-grid-header" style={{ "--calendar-week-count": Math.max(1, visibleWeeks.length) }}>
        <div className="calendar-fixed-col">Reactor / Product Name</div>
        {visibleWeeks.map(w => <div key={iso(w)} className="calendar-week-head"><strong>{w.toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"})}</strong><span>Week of {fmt(w)}</span></div>)}
      </div>
      <div className="excel-calendar-body" style={{ "--calendar-week-count": Math.max(1, visibleWeeks.length) }}>
        {rows.map(m => <div className="calendar-grid-row" key={m.id}>
          <div className="calendar-fixed-cell"><button type="button" className="calendar-reactor-link" onClick={() => setSelectedAssignment(m)} aria-label={`View planning details for reactor ${m.reactorId || "Unknown"}`}>{m.reactorId || "Unknown"}</button><button type="button" className="calendar-product-link" onClick={() => setSelectedAssignment(m)}>Product Name: {clean(m.product) || "Unknown"}</button><small>Stage Code: {resolveStageCode(m)} · Site: {clean(m.site) || "Unknown"}</small></div>
          {m.cells.map((cell, i) => <button key={i} type="button" className={`calendar-week-cell ${cell.active ? `active-${cls(category(m))}` : ""}`} title={cell.active ? `Product Name: ${clean(m.product) || "Unknown"} · Stage Code: ${resolveStageCode(m)} · Reactor ${m.reactorId || "Unknown"}` : ""} aria-label={cell.active ? `View Product Name ${clean(m.product) || "Unknown"}, Stage Code ${resolveStageCode(m)}, reactor ${m.reactorId || "Unknown"}` : "No assignment for this week"} disabled={!cell.active} onClick={() => cell.active && setSelectedAssignment(m)}>{cell.active && <span>Product Name: {clean(m.product) || "Unknown"} · Stage Code: {resolveStageCode(m)}</span>}</button>)}
        </div>)}
        {!rows.length && <div className="empty-cell">No planning records match the selected period, week and search filters. The calendar horizon remains available through December 2028.</div>}
      </div>
    </div>

    <div className="panel">
      <div className="panel-title-row"><div><h2>Selected week details</h2><p className="muted">This table follows the month/week selectors above.</p></div><span className="result-count">{visibleWeeks.length === 1 ? fmt(visibleWeeks[0]) : `${visibleWeeks.length} weeks`}</span></div>
      <div className="table-scroll"><table><thead><tr><th>Reactor ID</th><th>Site</th><th>Product Name</th><th>Stage Code</th><th>Status</th><th>Start</th><th>End</th></tr></thead><tbody>
        {filtered.filter(m => visibleWeeks.some(w => inWeek(m, w))).map(m => <tr key={m.id}><td><strong>{m.reactorId || "Unknown"}</strong></td><td>{m.site || "Unknown"}</td><td><button type="button" className="calendar-product-link" onClick={() => setSelectedAssignment(m)}>{m.product || "Unknown"}</button></td><td>{resolveStageCode(m)}</td><td><span className="badge">{category(m)}</span></td><td>{m.startDate || "Unknown"}</td><td>{m.endDate || "Unknown"}</td></tr>)}
      </tbody></table></div>
    </div>

    {selectedAssignment && <Modal title="Planning assignment details" onClose={() => setSelectedAssignment(null)}>
      {(() => {
        const current = selectedAssignment;
        const sameReactor = mappings.filter(x => String(x.id) !== String(current.id) && ((current.reactorUid && x.reactorUid && String(x.reactorUid) === String(current.reactorUid)) || clean(x.reactorId).toLowerCase().replace(/[^a-z0-9]/g, "") === clean(current.reactorId).toLowerCase().replace(/[^a-z0-9]/g, "")))
          .filter(x => clean(x.startDate) && clean(x.endDate)).map(x => ({...x, start:toDate(x.startDate), end:toDate(x.endDate)})).filter(x => x.start && x.end).sort((a,b) => a.start - b.start);
        let occupiedUntil = toDate(current.endDate);
        const currentStart = toDate(current.startDate);
        if (occupiedUntil && currentStart) {
          let changed = true;
          while (changed) {
            changed = false;
            for (const other of sameReactor) {
              if (other.start <= addDays(occupiedUntil, 1) && other.end >= currentStart && other.end > occupiedUntil) { occupiedUntil = other.end; changed = true; }
            }
          }
        }
        const availableAgain = occupiedUntil ? fmt(addDays(occupiedUntil, 1)) : "Unknown";
        return <div className="assignment-details">
          <div><span>Product Name</span><strong>{clean(current.product) || "Unknown"}</strong></div>
          <div><span>Reactor ID</span><strong>{current.reactorId || "Unknown"}</strong></div>
          <div><span>Site</span><strong>{clean(current.site) || "Unknown"}</strong></div>
          <div><span>Block</span><strong>{clean(current.block) || "Unknown"}</strong></div>
          <div><span>Stage Code</span><strong>{resolveStageCode(current)}</strong></div>
          <div><span>Mapped timeline</span><strong>{current.startDate || "Unknown"} to {current.endDate || "Unknown"}</strong></div>
          <div><span>Planning status</span><strong>{category(current)}</strong></div>
          <div><span>Available again from</span><strong>{availableAgain}</strong></div>
          <p className="muted">Availability is estimated from this reactor's recorded mapping dates in the current platform dataset. Confirm source schedule changes before assigning it again.</p>
        </div>;
      })()}
    </Modal>}
    {modal && <Modal title="Plan New Reactor" onClose={() => !busy && setModal(false)}><form onSubmit={submit}><div className="form-grid">
      <label>Reactor<select required value={form.reactorUid} onChange={e => set("reactorUid", e.target.value)}><option value="">Select reactor</option>{available.map(r => <option key={r.uid} value={r.uid}>{r.id} · {r.site} · {(Number(r.capacity || 0) / 1000).toLocaleString(undefined,{maximumFractionDigits:3})} kL</option>)}</select></label>
      <label>Product Name<input required list="calendar-products" value={form.product} placeholder="Select or enter Product Name" onChange={e => {const product=e.target.value;const family=products.find(p=>p.product===product);if(!family){setForm(f=>({...f,product,productCode:"",stage:"",stages:[],stageCode:""}));return;}const code=family?.codes?.[0]||"";const cat=catalog.find(c=>c.code===code);const productKey=product.toLowerCase().replace(/[^a-z0-9]/g,"");const stage=cat?.stagesByProduct?.[productKey]?.[0]||family?.stages?.[0]||stages[0]||"";setForm(f=>({...f,product,productCode:code,stage,stages:stage?[stage]:[],stageCode:code}));}}/><datalist id="calendar-products">{products.map(p => <option key={p.product} value={p.product}>{p.codeCount || p.codes?.length || 0} codes</option>)}</datalist></label>
      <label>Stage Code<input required list="calendar-product-codes" value={form.productCode} placeholder="Select or enter Stage Code" onChange={e => {const code=e.target.value;const cat=catalog.find(c=>c.code===code);const currentProduct=form.product;const codeProducts=cat?.products||[];const product=cat ? (codeProducts.includes(currentProduct)?currentProduct:(cat.product||codeProducts[0]||currentProduct)) : currentProduct;const family=products.find(p=>p.product===product);const productKey=product.toLowerCase().replace(/[^a-z0-9]/g,"");const stage=cat?.stagesByProduct?.[productKey]?.[0]||family?.stages?.[0]||form.stage||"";setForm(f=>({...f,product,productCode:code,stage,stages:stage?[stage]:f.stages,stageCode:code}));}}/><datalist id="calendar-product-codes">{availableCodes.map(c => <option key={c} value={c}/>)}</datalist></label>

      <label>Probability<select value={form.category} onChange={e => set("category", e.target.value)}><option>Confirmed</option><option>High Probable</option><option>Visible</option></select></label>
      <label>Start date<input required type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)}/></label>
      <label>End date<input required type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)}/></label>
    </div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(false)}>Cancel</button><button disabled={busy}>{busy ? "Saving…" : "Add to planning calendar"}</button></div></form></Modal>}
  </section>;
}
