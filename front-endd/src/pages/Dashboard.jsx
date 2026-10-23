import { useMemo, useState } from "react";
import StatCard from "../components/StatCard";
import Modal from "../components/Modal";
import ProductPlayCard from "../components/ProductPlayCard";
import { cleanKnownText, resolveStageCode } from "../utils/unknownUtils";
import { buildInventoryMetrics } from "../utils/inventoryMetrics";

const number = v => Number(v) || 0;
const fmtKL = v => `${number(v).toLocaleString(undefined, { maximumFractionDigits: 3 })} kL`;
const clean = v => cleanKnownText(v);
const canonical = v => clean(v).toLowerCase().replace(/[^a-z0-9]/g, "");
const scopedReactorKey = row => {
  const uid = canonical(row?.reactorUid ?? row?.uid);
  if (uid) return `uid:${uid}`;
  const id = canonical(row?.reactorId ?? row?.id ?? row?.equipmentId);
  return id ? `record:${canonical(row?.site)}|${id}|${canonical(row?.block)}|${canonical(row?.area)}` : "";
};
const statusClass = v => clean(v).toLowerCase().replace(/[^a-z]+/g, "-");
const categories = [
  { category: "Confirmed", definition: "Green-filled planning cells.", cellColor: "green" },
  { category: "High Probable", definition: "Yellow-filled planning cells.", cellColor: "yellow" },
  { category: "Visible", definition: "Amber/orange planning cells.", cellColor: "amber" },
];

export default function Dashboard({ data, mappings = [], audit = [], onNavigate }) {
  const equipment = data?.equipment || [];
  const sites = data?.siteTotals || [];
  const source = data?.dashboard?.sourceCapacity || {};
  const totalCapacity = number(source.total);
  const utilizedCapacity = number(source.utilized);
  const availableCapacity = number(source.available);
  const mappedCapacity = number(source.mapped);
  const inventoryCapacityKL = equipment.reduce((sum, row) => sum + number(row.capacity), 0) / 1000;
  const inventoryCapacityDelta = inventoryCapacityKL - totalCapacity;
  const utilizationPct = number(source.utilizationPercent) || (totalCapacity ? utilizedCapacity / totalCapacity * 100 : 0);
  const inventoryMetrics = useMemo(() => buildInventoryMetrics(equipment, mappings), [equipment, mappings]);
  const counts = inventoryMetrics.counts;
  const mocCounts = equipment.reduce((r, row) => { const m = clean(row.moc) || "Unknown"; r[m] = (r[m] || 0) + 1; return r; }, {});
  // Show every MOC bucket, including Unknown, so category counts sum to total inventory.
  const topMoc = Object.entries(mocCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // Count physical inventory records with assignments (stable UID), not repeated schedule intervals or repeated visible reactor IDs.
  const mappedReactorCount = counts.Mapped;
  const targetDate = useMemo(() => {
    const dates = (Array.isArray(mappings) ? mappings : []).flatMap(m => [m.endDate, m.updatedAt, m.updated_at, m.startDate]).filter(Boolean).map(v => new Date(v)).filter(d => Number.isFinite(d.getTime()));
    if (!dates.length) return "Unknown";
    const latest = new Date(Math.max(...dates.map(d => d.getTime())));
    return latest.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
  }, [mappings]);
  const productInformation = useMemo(() => {
    const groups = new Map();
    (Array.isArray(mappings) ? mappings : []).forEach(m => {
      const sourceName = clean(m.product);
      const sourceCode = clean(m.productCode || m.projectCode);
      const resolvedStage = resolveStageCode(m);
      const displayStageCode = resolvedStage !== "Unknown" ? resolvedStage : sourceCode;
      if (!sourceName && !sourceCode && !displayStageCode) return;
      const name = sourceName || "Unknown";
      // Keep the source code internally for matching details; only one Stage Code is displayed.
      const groupKey = name.toLowerCase();
      if (!groups.has(groupKey)) groups.set(groupKey, { name, code: displayStageCode || sourceCode, stageCodes: new Map(), reactorIds: new Set(), sites: new Set(), clients: new Set(), projects: new Set() });
      const g = groups.get(groupKey);
      if (displayStageCode && displayStageCode !== "Unknown") g.stageCodes.set(canonical(displayStageCode), displayStageCode);
      if (m.reactorId) g.reactorIds.add(scopedReactorKey(m) || canonical(m.reactorId));
      if (m.clientName) g.clients.add(clean(m.clientName));
      if (sourceCode) g.projects.add(sourceCode);
      if (m.site) g.sites.add(clean(m.site));
    });
    return [...groups.values()].map(g => ({
      name:g.name,
      code:g.code,
      stageCode:g.code,
      stageCodes:[...g.stageCodes.values()].sort((a,b) => a.localeCompare(b, undefined, { numeric:true, sensitivity:"base" })),
      reactors:g.reactorIds.size,
      stages:g.stageCodes.size,
      sites:[...g.sites],
      clients:[...g.clients],
      projects:[...g.projects],
    })).sort((a,b)=>a.name.localeCompare(b.name));
  }, [mappings]);
  const mappedProductCount = productInformation.length;
  const [utilOpen, setUtilOpen] = useState(false);
  const [probOpen, setProbOpen] = useState(null);
  const [cardDetail, setCardDetail] = useState(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailSite, setDetailSite] = useState("");
  const openCardDetail = (type, title) => {
    setDetailSearch("");
    setDetailSite("");
    setCardDetail({ type, title });
  };
  const siteRows = useMemo(() => sites.map(site => {
    const reactors = equipment.filter(r => clean(r.site) === clean(site.site));
    const total = number(site.totalCapacity);
    const utilized = Math.min(number(site.utilizedCapacity), total);
    const mapped = Math.min(number(site.mappedCapacity), total);
    const mappedNotUtilized = Math.max(mapped - utilized, 0);
    const maintenanceRaw = reactors.filter(r => clean(r.status).toLowerCase() === "maintenance").reduce((sum, r) => sum + number(r.capacity) / 1000, 0);
    const maintenance = Math.min(maintenanceRaw, number(site.availableCapacity));
    const available = Math.max(number(site.availableCapacity) - maintenance, 0);
    // Preserve source workbook values. Do not invent a reconciliation category.
    // Utilized capacity is shown explicitly; mapped-not-utilized = mapped minus utilized.
    return { ...site, reactors, totalCapacity: total, utilizedCapacity: utilized, mappedNotUtilized, availableCapacity: available, maintenanceCapacity: maintenance, utilizationPercent: total ? utilized / total * 100 : 0 };
  }), [sites, equipment]);
  // The workbook API returns Mapping Tracker rows directly (it does not add a
  // sourceType field). Count physical reactor/site pairs, not repeated schedule
  // rows, and exclude records without a reactor ID.
  const probability = useMemo(() => {
    const categoryResults = categories.map(meta => {
    const rows = (Array.isArray(mappings) ? mappings : []).filter(m =>
      clean(m.category).toLowerCase() === meta.category.toLowerCase() && canonical(m.reactorId)
    );
    const reactorMap = new Map();
    let scheduleCells = 0;
    rows.forEach(m => {
      scheduleCells += Array.isArray(m.schedule) ? m.schedule.filter(cell => clean(cell?.value)).length : 0;
      const key = scopedReactorKey(m);
      if (!key) return;
      const existing = reactorMap.get(key);
      const projectLabel = `${clean(m.product) || "Unknown"} / ${clean(m.productCode) || "Unknown"}`;
      const stageCode = resolveStageCode(m); const stages = clean(stageCode) ? [stageCode] : [];
      if (!existing) {
        reactorMap.set(key, {
          uid: m.reactorUid || m.uid || "", reactorUid: m.reactorUid || m.uid || "",
          reactorId: clean(m.reactorId), site: clean(m.site), block: clean(m.block), area: clean(m.area),
          capacity: m.capacity, moc: clean(m.moc), agitator: clean(m.agitator),
          projects: new Set((m.product || m.productCode) ? [projectLabel] : []),
          stages: new Set(stages),
          startDate: m.startDate, endDate: m.endDate,
          scheduleCells: Array.isArray(m.schedule) ? m.schedule.filter(cell => clean(cell?.value)).length : 0,
        });
      } else {
        if (m.product || m.productCode) existing.projects.add(projectLabel);
        stages.forEach(stage => existing.stages.add(stage));
        existing.startDate = existing.startDate && m.startDate ? (existing.startDate < m.startDate ? existing.startDate : m.startDate) : (existing.startDate || m.startDate);
        existing.endDate = existing.endDate && m.endDate ? (existing.endDate > m.endDate ? existing.endDate : m.endDate) : (existing.endDate || m.endDate);
        existing.scheduleCells += Array.isArray(m.schedule) ? m.schedule.filter(cell => clean(cell?.value)).length : 0;
      }
    });
    const reactors = [...reactorMap.values()].map(r => ({ ...r, projects: [...r.projects], stages: [...r.stages] }))
      .sort((a,b) => `${a.site}-${a.reactorId}`.localeCompare(`${b.site}-${b.reactorId}`));
    return { ...meta, rows, reactors, reactorCount: reactors.length, scheduleCells };
    });

    // Present an exclusive confidence breakdown so the displayed categories
    // reconcile to physical inventory. If a reactor appears in multiple
    // schedule categories, retain its highest confidence: Confirmed > High
    // Probable > Visible. The detailed schedule itself is not modified.
    const rank = new Map([['Confirmed', 3], ['High Probable', 2], ['Visible', 1]]);
    const bestByReactor = new Map();
    categoryResults.forEach(item => item.reactors.forEach(reactor => {
      const key = scopedReactorKey(reactor);
      if (!key) return;
      const current = bestByReactor.get(key);
      if (!current || rank.get(item.category) > rank.get(current.category)) bestByReactor.set(key, { category: item.category, reactor });
    }));
    const exclusive = categoryResults.map(item => {
      const reactors = [...bestByReactor.entries()].filter(([, value]) => value.category === item.category).map(([, value]) => value.reactor);
      return { ...item, reactors, reactorCount: reactors.length };
    });
    const totalPhysical = equipment.length;
    const knownPhysicalKeys = new Set(equipment.map(scopedReactorKey).filter(Boolean));
    const assignedPhysicalKeys = new Set([...bestByReactor.keys()].filter(key => knownPhysicalKeys.has(key)));
    const unplannedReactors = equipment.filter(row => {
      const key = scopedReactorKey(row);
      return !key || !assignedPhysicalKeys.has(key);
    }).map(row => ({
      uid: row.uid || row.reactorUid || "", reactorUid: row.uid || row.reactorUid || "",
      reactorId: clean(row.id || row.reactorId || row.equipmentId), site: clean(row.site),
      block: clean(row.block), area: clean(row.area), capacity: row.capacity,
      moc: clean(row.moc), agitator: clean(row.agitator), projects: [], stages: [],
      startDate: "", endDate: "", scheduleCells: 0,
    }));
    return [...exclusive, {
      category: 'No scheduled confidence',
      definition: 'Physical reactors without a Confirmed, High Probable, or Visible planning assignment.',
      cellColor: 'neutral', rows: [], reactors: unplannedReactors, reactorCount: unplannedReactors.length, scheduleCells: 0,
    }];
  }, [mappings, equipment]);

  // Source-level records used by the clickable KPI drill-downs. Keep mapped
  // details grouped by reactor ID to match the mapped-reactor KPI semantics.
  const clientInformation = Array.isArray(data?.clientInformation) ? data.clientInformation : [];
  const equipmentDetails = useMemo(() => {
    const mappingByKey = new Map();
    (Array.isArray(mappings) ? mappings : []).forEach(m => {
      const key = scopedReactorKey(m);
      if (!key) return;
      if (!mappingByKey.has(key)) mappingByKey.set(key, []);
      mappingByKey.get(key).push(m);
    });
    const clientByKey = new Map();
    clientInformation.forEach(c => {
      const ids = [c.reactorId, ...(String(c.linkedReactors || "").match(/[A-Za-z0-9-]{4,}/g) || [])];
      ids.filter(Boolean).forEach(id => {
        const key = `${canonical(c.site)}|${canonical(id)}`;
        if (!clientByKey.has(key)) clientByKey.set(key, []);
        clientByKey.get(key).push(c);
      });
    });
    return equipment.map(r => {
      const key = scopedReactorKey(r);
      const relatedMappings = mappingByKey.get(key) || [];
      const relatedClients = clientByKey.get(`${canonical(r.site)}|${canonical(r.id || r.equipmentId)}`) || [];
      return {
        ...r,
        _inventoryStatus: inventoryMetrics.statusFor(r),
        _relatedMappings: relatedMappings,
        _relatedClients: relatedClients,
        _products: [...new Set([...relatedMappings.map(m => clean(m.product)), ...relatedClients.map(c => clean(c.product))].filter(Boolean))],
        _projects: [...new Set([...relatedMappings.map(m => clean(m.productCode || m.projectCode)), ...relatedClients.map(c => clean(c.projectCode || c.productCode)), ...relatedClients.flatMap(c => Array.isArray(c.projectCodes) ? c.projectCodes : [])].filter(Boolean))],
        _stageCodes: [...new Set([...relatedMappings.map(m => resolveStageCode(m)), ...relatedClients.map(c => resolveStageCode(c)), resolveStageCode(r)].filter(value => clean(value) && value !== "Unknown"))],
      };
    });
  }, [equipment, mappings, clientInformation, inventoryMetrics]);
  const mappedReactorDetails = useMemo(() => {
    const groups = new Map();
    (Array.isArray(mappings) ? mappings : []).forEach(m => {
      const id = scopedReactorKey(m);
      if (!id) return;
      if (!groups.has(id)) groups.set(id, { key: id, reactorId: clean(m.reactorId), sites: new Set(), blocks: new Set(), areas: new Set(), products: new Set(), productCodes: new Set(), stages: new Set(), categories: new Set(), startDate: m.startDate || "", endDate: m.endDate || "", capacity: m.capacity, moc: clean(m.moc), agitator: clean(m.agitator) });
      const g = groups.get(id);
      if (m.site) g.sites.add(clean(m.site));
      if (m.block) g.blocks.add(clean(m.block));
      if (m.area) g.areas.add(clean(m.area));
      if (m.product) g.products.add(clean(m.product));
      if (m.productCode || m.projectCode) g.productCodes.add(clean(m.productCode || m.projectCode));
      const resolvedStageCode = resolveStageCode(m);
      const stageCode = resolvedStageCode !== "Unknown" ? resolvedStageCode : clean(m.productCode || m.projectCode);
      if (clean(stageCode)) g.stages.add(stageCode);
      if (m.category) g.categories.add(clean(m.category));
      if (m.startDate && (!g.startDate || m.startDate < g.startDate)) g.startDate = m.startDate;
      if (m.endDate && (!g.endDate || m.endDate > g.endDate)) g.endDate = m.endDate;
      if (m.capacity !== undefined && m.capacity !== null && m.capacity !== "") g.capacity = m.capacity;
      if (!g.moc && m.moc) g.moc = clean(m.moc);
      if (!g.agitator && m.agitator) g.agitator = clean(m.agitator);
    });
    return [...groups.values()].map(g => ({ ...g, sites: [...g.sites], blocks: [...g.blocks], areas: [...g.areas], products: [...g.products], productCodes: [...g.productCodes], stages: [...g.stages], categories: [...g.categories] })).sort((a,b) => a.reactorId.localeCompare(b.reactorId, undefined, { numeric:true }));
  }, [mappings]);
  const detailQuery = canonical(detailSearch);
  const detailsMatch = row => !detailQuery || canonical([
    row.id, row.equipmentId, row.site, row.block, row.area, row.moc, row.agitator, row._inventoryStatus, row.status,
    row.product, row.productMapped, row.clientName, row.stage, row._products?.join(" "), row._projects?.join(" "),
    row.reactorId, row.sites?.join(" "), row.products?.join(" "), row.productCodes?.join(" "), row.stages?.join(" "), row.categories?.join(" "),
  ].filter(Boolean).join(" ")).includes(detailQuery);
  const detailEquipment = equipmentDetails.filter(r => (!detailSite || clean(r.site) === detailSite) && detailsMatch(r));
  const detailMapped = mappedReactorDetails.filter(r => (!detailSite || r.sites.includes(detailSite)) && detailsMatch(r));
  const segWidth = (v, total) => `${total > 0 ? Math.max(0, Math.min(100, number(v) / total * 100)) : 0}%`;

  return <section>
    <div className="hero dashboard-hero"><div><h1>Operations Dashboard</h1><p className="subtitle">A consolidated view of reactor inventory, planning assignments, and site capacity.</p></div></div>
    <div className="stats-grid dashboard-stats dashboard-stats-six">
      <StatCard label="Total Reactors" value={String(equipment.length)} hint="All physical inventory records · View details" onClick={() => openCardDetail("total-reactors", "Total Reactors — Inventory Details")} />
      <StatCard label="Mapped Reactors" value={String(mappedReactorCount)} hint="Physical inventory records with assignments · View details" onClick={() => openCardDetail("mapped-reactors", "Mapped Reactors — Mapping Details")} />
      <StatCard label="Total Capacity" value={fmtKL(totalCapacity)} hint="Capacity summary · View details" onClick={() => openCardDetail("total-capacity", "Total Capacity — Site Breakdown")} />
      <StatCard label="Mapped Capacity" value={fmtKL(mappedCapacity)} hint="Assigned capacity · View details" onClick={() => openCardDetail("mapped-capacity", "Mapped Capacity — Site Breakdown")} />
      <StatCard label="Utilized Capacity" value={fmtKL(utilizedCapacity)} hint={`${utilizationPct.toFixed(1)}% of total capacity · View details`} onClick={() => openCardDetail("utilized-capacity", "Utilized Capacity — Site Breakdown")} />
      <StatCard label="Available Capacity" value={fmtKL(availableCapacity)} hint="Remaining site capacity · View details" onClick={() => openCardDetail("available-capacity", "Available Capacity — Site Breakdown")} />
      <StatCard label="Maintenance Reactors" value={String(counts.Maintenance || 0)} hint="Part of Total Reactors · View details" onClick={() => openCardDetail("maintenance-reactors", "Maintenance Reactors — Inventory Details")} />
    </div>

    <div className="panel total-capacity-overview-panel">
      <div className="panel-title-row"><div><h2>Total Capacity Overview</h2><p className="muted">One consolidated capacity view using the site-capacity summary. Utilized capacity is included within mapped capacity.</p></div><span className="metric-chip">{fmtKL(totalCapacity)} total capacity</span></div>
      {(() => {
        const total = Math.max(totalCapacity, 0);
        const utilized = Math.min(utilizedCapacity, total);
        const mappedUnused = Math.min(Math.max(mappedCapacity - utilized, 0), Math.max(total - utilized, 0));
        const maintenance = Math.min(siteRows.reduce((sum, site) => sum + number(site.maintenanceCapacity), 0), Math.max(total - utilized - mappedUnused, 0));
        const available = Math.min(availableCapacity, Math.max(total - utilized - mappedUnused - maintenance, 0));
        const segments = [
          { key:"utilized", label:"Utilized capacity", value:utilized, color:"#1976D2" },
          { key:"mapped-unused", label:"Mapped, not utilized", value:mappedUnused, color:"#F28C28" },
          { key:"available", label:"Available", value:available, color:"#2E9E55" },
          { key:"maintenance", label:"Maintenance", value:maintenance, color:"#F2C230" },
        ];
        return <><div className="total-capacity-value"><strong>{fmtKL(total)}</strong><span>Across all sites and blocks</span></div>
          <div className="total-capacity-track" role="img" aria-label={segments.map(x => `${x.label}: ${fmtKL(x.value)}`).join("; ")}>
            {segments.filter(x => x.value > 0).map(x => <span key={x.key} className={`total-capacity-segment ${x.key}`} style={{width:`${total ? x.value / total * 100 : 0}%`,background:x.color}} title={`${x.label}: ${fmtKL(x.value)}`} />)}
          </div>
          <div className="total-capacity-legend">{segments.map(x => <div key={x.key}><span className="total-capacity-dot" style={{background:x.color}}/><span>{x.label}</span><strong>{fmtKL(x.value)}</strong><small>{total ? (x.value / total * 100).toFixed(1) : "0.0"}%</small></div>)}</div>
        </>;
      })()}
    </div>

    <div className="panel site-utilization-panel">
      <div className="panel-title-row"><div><h2>Capacity Utilization By Site</h2><p className="muted">Each bar is scaled to that site's total capacity. Utilized capacity is part of mapped capacity; the bar separates it from mapped-but-not-utilized capacity to avoid double counting.</p></div><span className="metric-chip">{fmtKL(totalCapacity)} total</span></div>
      <div className="capacity-legend">
        <span><i className="capacity-swatch utilized"/>Utilized</span><span><i className="capacity-swatch mapped-unused"/>Mapped, not utilized</span><span><i className="capacity-swatch available"/>Available</span><span><i className="capacity-swatch maintenance"/>Maintenance</span>
      </div>
      <div className="site-utilization-list">{siteRows.map(site => <button key={site.site} type="button" className="site-utilization-row segmented-capacity-row" onClick={() => onNavigate(`site:${site.site}`)}>
        <span className={`site-name site-label site-${String(site.site || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{site.site}</span>
        <div className="site-utilization-track segmented-capacity-track" role="img" aria-label={`${site.site}: utilized ${fmtKL(site.utilizedCapacity)}, mapped not utilized ${fmtKL(site.mappedNotUtilized)}, available ${fmtKL(site.availableCapacity)}, maintenance ${fmtKL(site.maintenanceCapacity)}`}>
          <i className="capacity-segment utilized" style={{ width: segWidth(site.utilizedCapacity, site.totalCapacity) }}/>
          <i className="capacity-segment mapped-unused" style={{ width: segWidth(site.mappedNotUtilized, site.totalCapacity) }}/>
          <i className="capacity-segment available" style={{ width: segWidth(site.availableCapacity, site.totalCapacity) }}/>
          <i className="capacity-segment maintenance" style={{ width: segWidth(site.maintenanceCapacity, site.totalCapacity) }}/>
        </div>
        <strong>{site.utilizationPercent.toFixed(1)}%</strong><small>{fmtKL(site.utilizedCapacity)} / {fmtKL(site.totalCapacity)}</small>
        <div className="capacity-breakdown"><span>Utilized <b>{fmtKL(site.utilizedCapacity)}</b></span><span>Mapped not utilized <b>{fmtKL(site.mappedNotUtilized)}</b></span><span>Available <b>{fmtKL(site.availableCapacity)}</b></span><span>Maintenance <b>{fmtKL(site.maintenanceCapacity)}</b></span></div>
      </button>)}</div>
    </div>



    <div className="panel planning-confidence-panel"><div className="panel-title-row"><div><h2>Planning Confidence</h2><div className="confidence-legend" aria-label="Planning confidence color legend"><span><i className="confidence-dot confirmed"/>Confirmed</span><span><i className="confidence-dot high-probable"/>High Probable</span><span><i className="confidence-dot visible"/>Visible</span><span><i className="confidence-dot no-scheduled"/>No Scheduled Confidence</span></div></div></div>
      <div className="probability-planning-meta"><div><span>Total Reactors</span><strong>{equipment.length.toLocaleString()}</strong></div><div><span>Mapped Reactors</span><strong>{mappedReactorCount.toLocaleString()}</strong></div><div><span>Latest Planning Date</span><strong>{targetDate}</strong></div></div>
      
      <div className="probability-cards">{probability.map(x => <button key={x.category} type="button" className={`probability-card ${statusClass(x.category)}`} onClick={() => setProbOpen(x)}><span>{x.category}</span><strong>{x.reactorCount}</strong></button>)}</div>
    </div>

    <ProductPlayCard mappedCount={mappedReactorCount} productCount={mappedProductCount} date={targetDate} products={productInformation} mappings={mappings} clientInformation={clientInformation} equipment={equipment} confidenceCards={probability} />

    <div className="panel moc-full-width-panel"><div className="panel-title-row"><div><h2>Material Of Construction</h2><p className="muted">Material-of-construction distribution across all {equipment.length.toLocaleString()} reactor records.</p></div><span className="metric-chip">{equipment.length.toLocaleString()} Reactors</span></div><div className="compact-bars">{topMoc.map(([moc, count]) => <div className="compact-bar-row" key={moc}><span>{moc}</span><div><i style={{ width: `${equipment.length ? count / equipment.length * 100 : 0}%` }}/></div><strong>{count}</strong></div>)}</div></div>
    <div className="panel"><div className="panel-title-row"><div><h2>Recent operations</h2><p className="muted">Latest application activity.</p></div></div><div className="table-scroll"><table><thead><tr><th>Timestamp</th><th>User</th><th>Activity</th></tr></thead><tbody>{audit.slice(0, 6).map(row => <tr key={row.id}><td>{row.timestamp}</td><td>{row.user}</td><td>{row.action}</td></tr>)}</tbody></table></div></div>
    {cardDetail && <Modal title={cardDetail.title} onClose={() => setCardDetail(null)} className="dashboard-detail-modal">
      <div className="dashboard-detail-toolbar">
        <input type="search" value={detailSearch} onChange={e => setDetailSearch(e.target.value)} placeholder="Search Reactor ID, Site, Product Name, Stage Code or Client…" aria-label="Search detail records" />
        {cardDetail.type.includes("capacity") && <select value={detailSite} onChange={e => setDetailSite(e.target.value)} aria-label="Filter capacity details by site"><option value="">All sites</option>{sites.map(site => <option key={site.site} value={site.site}>{site.site}</option>)}</select>}
        {detailSite && <button type="button" className="secondary" onClick={() => setDetailSite("")}>Clear site</button>}
      </div>
      {cardDetail.type.includes("capacity") && <>
        <p className="muted dashboard-detail-note">Capacity totals follow the approved site summary. Individual reactor capacities are shown separately in kL and are not substituted for aggregate totals.</p>
        <div className="table-scroll"><table><thead><tr><th>Site</th><th>Total capacity</th><th>Mapped capacity</th><th>Utilized capacity</th><th>Available capacity</th><th>Utilization</th><th>Inventory</th></tr></thead><tbody>
          {sites.filter(site => !detailSite || clean(site.site) === detailSite).map(site => <tr key={site.site}><td><button type="button" className="dashboard-inline-link" onClick={() => setDetailSite(site.site)}>{site.site}</button></td><td>{fmtKL(site.totalCapacity)}</td><td>{fmtKL(site.mappedCapacity)}</td><td>{fmtKL(site.utilizedCapacity)}</td><td>{fmtKL(site.availableCapacity)}</td><td>{number(site.totalCapacity) ? `${(number(site.utilizedCapacity) / number(site.totalCapacity) * 100).toFixed(1)}%` : "Unknown"}</td><td>{equipment.filter(r => clean(r.site) === clean(site.site)).length}</td></tr>)}
        </tbody></table></div>
        <div className="dashboard-detail-section-heading"><h3>{detailSite ? `${detailSite} Reactor Inventory` : "Reactor Inventory by Site"}</h3><span>{detailEquipment.length.toLocaleString()} equipment records</span></div>
      </>}
      {(cardDetail.type === "total-reactors" || cardDetail.type === "maintenance-reactors" || cardDetail.type.includes("capacity")) && <div className="table-scroll"><table><thead><tr><th>Reactor ID</th><th>Site</th><th>Block</th><th>Capacity (kL)</th><th>MOC</th><th>Agitator</th><th>Status</th><th>Product Name</th><th>Stage Code</th><th>Client Name</th></tr></thead><tbody>
        {(cardDetail.type === "maintenance-reactors" ? detailEquipment.filter(r => ["maintenance", "under maintenance"].includes(clean(r._inventoryStatus).toLowerCase())) : detailEquipment).map((r, i) => <tr key={`${scopedReactorKey(r)}-${i}`}><td><strong>{r.id || r.equipmentId || "Unknown"}</strong></td><td>{r.site || "Unknown"}</td><td>{r.block || "Unknown"}</td><td>{r.capacity != null && r.capacity !== "" ? fmtKL(number(r.capacity) / 1000) : "Unknown"}</td><td>{r.moc || "Unknown"}</td><td>{r.agitator || "Unknown"}</td><td>{r._inventoryStatus || "Unknown"}</td><td>{r._products?.join(", ") || r.product || r.productMapped || "Unknown"}</td><td>{r._stageCodes?.join(", ") || resolveStageCode(r) || "Unknown"}</td><td>{[...new Set((r._relatedClients || []).map(c => clean(c.clientName)).filter(Boolean))].join(", ") || r.clientName || "Unknown"}</td></tr>)}
      </tbody></table></div>}
      {cardDetail.type === "mapped-reactors" && <div className="table-scroll"><table><thead><tr><th>Reactor ID</th><th>Site</th><th>Block</th><th>Product Name(s)</th><th>Stage Code</th><th>Planning Category</th><th>Start</th><th>End</th></tr></thead><tbody>
        {detailMapped.map(r => <tr key={r.key}><td><strong>{r.reactorId || "Unknown"}</strong></td><td>{r.sites.join(", ") || "Unknown"}</td><td>{r.blocks.join(", ") || "Unknown"}</td><td>{r.products.join(", ") || "Unknown"}</td><td>{r.stages.join(", ") || "Unknown"}</td><td>{r.categories.join(", ") || "Unknown"}</td><td>{r.startDate || "Unknown"}</td><td>{r.endDate || "Unknown"}</td></tr>)}
      </tbody></table></div>}
      <div className="dashboard-detail-footer"><span className="muted">{(cardDetail.type === "mapped-reactors" ? detailMapped.length : cardDetail.type === "maintenance-reactors" ? detailEquipment.filter(r => ["maintenance", "under maintenance"].includes(clean(r._inventoryStatus).toLowerCase())).length : detailEquipment.length).toLocaleString()} matching reactor(s). Search applies to reactor and related details.</span><button type="button" className="secondary" onClick={() => { setCardDetail(null); onNavigate(cardDetail.type === "mapped-reactors" ? "availability" : "reactors"); }}>Open full inventory</button></div>
    </Modal>}

    {probOpen && <Modal title={`${probOpen.category} Reactors`} onClose={() => setProbOpen(null)}>
      <p className="muted">{probOpen.definition} This count is exclusive and reconciles with the other confidence cards to total physical inventory. Matching schedule cells: <strong>{probOpen.scheduleCells.toLocaleString()}</strong>.</p>
      <div className="table-scroll probability-reactor-table"><table><thead><tr><th>Reactor ID</th><th>Site</th><th>Block</th><th>Product Name</th><th>Stage Code</th><th>Planning Dates</th></tr></thead><tbody>
      {probOpen.reactors.map((r, i) => <tr key={`${r.site}-${r.reactorId}-${i}`}><td><strong>{r.reactorId || "Unknown"}</strong></td><td>{r.site || "Unknown"}</td><td>{r.block || "Unknown"}</td><td>{r.projects.join(", ") || "Unknown"}</td><td>{r.stages.join(", ") || "Unknown"}</td><td>{r.startDate || "Unknown"} → {r.endDate || "Unknown"}</td></tr>)}
      </tbody></table></div>
      </Modal>}
    {utilOpen && <Modal title="Capacity Reconciliation" onClose={() => setUtilOpen(false)}><div className="reconciliation-summary"><div><span>Total capacity</span><strong>{fmtKL(totalCapacity)}</strong></div><div><span>Utilized capacity</span><strong>{fmtKL(utilizedCapacity)}</strong></div><div><span>Mapped capacity</span><strong>{fmtKL(mappedCapacity)}</strong></div><div><span>Available capacity</span><strong>{fmtKL(availableCapacity)}</strong></div></div><p className="muted">Capacity summary values are retained as supplied and are not replaced by estimates from individual reactor statuses.</p><div className="table-scroll"><table><thead><tr><th>Site</th><th>Total</th><th>Utilized</th><th>Mapped</th><th>Available</th></tr></thead><tbody>{siteRows.map((r, i) => <tr key={`${r.site}-${i}`}><td>{r.site}</td><td>{fmtKL(r.totalCapacity)}</td><td>{fmtKL(r.utilizedCapacity)}</td><td>{fmtKL(r.mappedCapacity)}</td><td>{fmtKL(r.availableCapacity)}</td></tr>)}</tbody></table></div><p className="muted">Maintenance is shown as a separate operational measure and is not added to capacity totals.</p></Modal>}
  </section>;
}
