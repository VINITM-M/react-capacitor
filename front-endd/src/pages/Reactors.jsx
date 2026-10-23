import { useMemo, useState } from "react";
import Modal from "../components/Modal";
import Table from "../components/Table";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { matchesSearch, normalizeSearchText } from "../utils/searchUtils";
import { buildInventoryMetrics } from "../utils/inventoryMetrics";
import { resolveStageCode } from "../utils/unknownUtils";

const blank = { id: "", site: "", block: "", area: "", capacity: "", moc: "", agitator: "", status: "Available", projectMapped: "" };

export default function Reactors({ equipment, mappings = [], clientInformation = [], globalSearch, onCreate, onUpdate, onDelete }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [site, setSite] = useState("All");
  const [moc, setMoc] = useState("All MOC");
  const [agitator, setAgitator] = useState("All agitators");
  const [sortBy] = useState("id");
  const [sortDirection] = useState("asc");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const norm = v => normalizeSearchText(v);
  const inventoryMetrics = useMemo(() => buildInventoryMetrics(equipment, mappings), [equipment, mappings]);
  const fmtKL = value => `${(Number(value) || 0) / 1000 >= 100 ? ((Number(value) || 0) / 1000).toLocaleString(undefined,{maximumFractionDigits:1}) : ((Number(value) || 0) / 1000).toLocaleString(undefined,{maximumFractionDigits:3})} kL`;
  const sites = [...new Set(equipment.map(x => x.site).filter(Boolean))].sort();
  const mocs = [...new Set(equipment.map(x => String(x.moc || "").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const agitators = [...new Set(equipment.map(x => String(x.agitator || "").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const mappingByReactor = useMemo(() => {
    const map = new Map();
    (mappings || []).forEach(m => {
      const key = String(m.reactorUid || m.reactorId || "").trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, m);
    });
    return map;
  }, [mappings]);
  const clientByReactor = useMemo(() => {
    const map = new Map();
    (clientInformation || []).forEach(item => {
      const ids = [item.reactorId, ...(String(item.linkedReactors || "").match(/\b\d{5,}\b/g) || [])];
      ids.filter(Boolean).forEach(id => { const key = String(id).trim().toLowerCase(); if (!map.has(key)) map.set(key, item); });
    });
    return map;
  }, [clientInformation]);
  const reactorSearchRows = useMemo(() => equipment.map(r => ({ ...r, _inventoryStatus: inventoryMetrics.statusFor(r), _mapping: mappingByReactor.get(String(r.uid || r.id || "").trim().toLowerCase()) || null, _client: clientByReactor.get(String(r.id || "").trim().toLowerCase()) || null })), [equipment, mappingByReactor, clientByReactor, inventoryMetrics]);
  const matchesReactorSearch = (r) => {
    const q = query.trim().toLowerCase();
    const global = String(globalSearch || "").trim().toLowerCase();
    const m = r._mapping || {}; const c = r._client || {};
    const everything = [r.id, r.equipmentId, r.sapCode, r.site, r.block, r.area,
      r.moc, r.agitator, r.status, r.projectMapped, m.product, m.productCode,
      m.projectCode, m.project, m.stage, m.stageCode, m.clientName,
      c.projectCode, c.clientName, c.product].filter(Boolean).join(" ");
    return (!q || matchesSearch(everything, q)) && (!global || matchesSearch(everything, global));
  };
  const filtered = useMemo(() => {
    const rows = reactorSearchRows.filter(r => matchesReactorSearch(r)
      && (status === "All statuses" || norm(r._inventoryStatus) === norm(status))
      && (site === "All" || r.site === site)
      && (moc === "All MOC" || norm(r.moc) === norm(moc))
      && (agitator === "All agitators" || norm(r.agitator) === norm(agitator)));
    const valueFor = r => {
      const m = r._mapping || {}; const c = r._client || {};
      const fields = { id:r.id, site:r.site, block:r.block, area:r.area, capacity:Number(r.capacity)||0, moc:r.moc, agitator:r.agitator, status:r._inventoryStatus, stageCode:resolveStageCode(m || c || r), product:m.product || c.product || "" };
      return fields[sortBy] ?? "";
    };
    return rows.sort((a,b) => {
      const av=valueFor(a), bv=valueFor(b);
      const result = typeof av === "number" && typeof bv === "number" ? av-bv : String(av).localeCompare(String(bv), undefined, {numeric:true,sensitivity:"base"});
      return sortDirection === "asc" ? result : -result;
    });
  }, [reactorSearchRows, query, globalSearch, status, site, moc, agitator, sortBy, sortDirection]);

  const openAdd = () => { setForm(blank); setModal("add"); };
  const openEdit = r => { setForm({ ...blank, ...r, capacity: r.capacity == null || r.capacity === "" ? "" : Number(r.capacity) / 1000 }); setModal("edit"); };
  const change = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const submit = async e => {
    e.preventDefault();
    if (!form.id || !form.site || form.capacity === "") return alert("Reactor ID, Site and Capacity are required.");
    const capacityLitres = Number(form.capacity) * 1000;
    if (!Number.isFinite(capacityLitres) || capacityLitres < 0) return alert("Capacity must be a valid kL value.");
    if (modal === "add") await onCreate({ ...form, capacity: capacityLitres });
    else await onUpdate(form.uid, { ...form, capacity: capacityLitres });
    setModal(null);
  };

  return <section>
    <PageHeader title="Reactor Inventory" subtitle="Browse physical reactor records, assignments, and specifications." action={<button onClick={openAdd}>+ Add Reactor</button>} />
    <div className="stats-grid compact">
      <StatCard label="Total Reactors" value={equipment.length} />
      <StatCard label="Filtered Reactors" value={filtered.length} />
      <StatCard label="Available Reactors" value={inventoryMetrics.counts.Available} hint="No planning assignment linked" />
      <StatCard label="Mapped Reactors" value={inventoryMetrics.counts.Mapped} hint="At least one planning assignment linked" />
    </div>
    <div className="panel reactor-search-panel">
      <div className="panel-title-row"><div><h2>Find a reactor</h2><p className="muted">Search reactor specifications, Product Name, Stage Code, Client Name, site, status, specifications, and planning dates across all sites.</p></div></div>
      <div className="filter-grid reactor-search-grid">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search all reactor fields..." aria-label="Search all reactor fields" />
        <select value={status} onChange={e => setStatus(e.target.value)}><option>All statuses</option><option>Available</option><option>Mapped</option><option>Maintenance</option></select>
        <select value={site} onChange={e => setSite(e.target.value)}><option value="All">All sites</option>{sites.map(s => <option key={s}>{s}</option>)}</select>
        <select value={moc} onChange={e=>setMoc(e.target.value)}><option>All MOC</option>{mocs.map(v=><option key={v}>{v}</option>)}</select>
        <select value={agitator} onChange={e=>setAgitator(e.target.value)}><option>All agitators</option>{agitators.map(v=><option key={v}>{v}</option>)}</select>
        
      </div>
    </div>
    <div className="panel">
      <Table rows={filtered} columns={[
        { key: "id", label: "Reactor ID", render: r => <strong>{r.id}</strong> },
        { key: "site", label: "Site" }, { key: "block", label: "Block", render: r => r.block || "Unknown" }, { key: "area", label: "Area", render: r => r.area || "Unknown" },
        { key: "capacity", label: "Capacity", render: r => r.capacity !== "" && r.capacity != null ? fmtKL(r.capacity) : "Unknown" },
        { key: "moc", label: "MOC" }, { key: "agitator", label: "Agitator" },
        { key: "product", label: "Product Name", render: r => r._mapping?.product || r._client?.product || "Unknown" },
        { key: "stageCode", label: "Stage Code", render: r => resolveStageCode(r._mapping || r._client || r) },
        { key: "status", label: "Status", render: r => <span className={`badge ${norm(r._inventoryStatus)}`}>{r._inventoryStatus}</span> },
        { key: "actions", label: "Actions", render: r => <div className="row-actions"><button className="small" onClick={() => openEdit(r)}>Edit</button><button type="button" className="icon-action danger" title={`Delete reactor ${r.id}`} aria-label={`Delete reactor ${r.id}`} onClick={() => setDeleteTarget(r)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 10v7m4-7v7"/></svg></button></div> }
      ]} />
    </div>
    {deleteTarget && <Modal title="Confirm reactor deletion" onClose={() => setDeleteTarget(null)} className="delete-confirm-modal"><div className="delete-confirm-content"><span className="delete-confirm-icon">!</span><p>Are you sure you want to delete reactor <strong>{deleteTarget.id}</strong>? This action cannot be undone.</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" className="danger" onClick={() => { onDelete(deleteTarget.uid); setDeleteTarget(null); }}>Delete reactor</button></div></div></Modal>}
    {modal && <Modal title={modal === "add" ? "Add New Reactor" : "Edit Reactor"} onClose={() => setModal(null)}><form onSubmit={submit}>
      <div className="form-grid">
        <input required placeholder="Reactor ID / name" value={form.id} onChange={e => change("id", e.target.value)} />
        <input required placeholder="Site" value={form.site} onChange={e => change("site", e.target.value)} />
        <input placeholder="Block" value={form.block} onChange={e => change("block", e.target.value)} />
        <input placeholder="Intermediate / Clean Room" value={form.area} onChange={e => change("area", e.target.value)} />
        <input required type="number" min="0" step="any" placeholder="Capacity (kL)" value={form.capacity} onChange={e => change("capacity", e.target.value)} />
        <input placeholder="MOC" value={form.moc} onChange={e => change("moc", e.target.value)} />
        <input placeholder="Agitator" value={form.agitator} onChange={e => change("agitator", e.target.value)} />
        <select value={form.status} onChange={e => change("status", e.target.value)}><option>Available</option><option>Mapped</option><option>Maintenance</option></select>
        <input placeholder="Mapped Project" value={form.projectMapped} onChange={e => change("projectMapped", e.target.value)} />
      </div>
      <div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button>{modal === "add" ? "Add Reactor" : "Save Changes"}</button></div>
    </form></Modal>}
  </section>;
}
