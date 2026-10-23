import { useMemo, useState } from "react";
import Modal from "../components/Modal";
import Table from "../components/Table";
import PageHeader from "../components/PageHeader";
import { matchesSearch, normalizeSearchText } from "../utils/searchUtils";

const CTO_SITES = ["CTO-2", "CTO-3", "CTO-5", "CTO-6", "CTO-SEZ", "Mexico", "Mirfield"];
const initial = {
  reactorUid:"",
  reactorId:"",
  site:"",
  moc:"",
  action:"",
  status:"Scheduled",
  startDate:"",
  endDate:""
};

export default function Admin({ maintenance = [], audit = [], equipment = [], mappings = [], clientInformation = [], onCreate, onUpdate, onDelete }) {
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(initial);
  const [site,setSite]=useState("All");
  const [cto,setCto]=useState("All");
  const [maintenanceSearch,setMaintenanceSearch]=useState("");
  const [maintenanceSearchBy,setMaintenanceSearchBy]=useState("Everything");
  const [maintenanceSearchValue,setMaintenanceSearchValue]=useState("");
  const [activeOnly,setActiveOnly]=useState(true);
  const sites = useMemo(() => Array.from(new Set(equipment.map(r => r.site).filter(Boolean))).sort(), [equipment]);
  const reactors = useMemo(() => [...equipment].sort((a,b)=>String(a.id).localeCompare(String(b.id))), [equipment]);
  const metadataByReactor = useMemo(() => {
    const map = new Map();
    const add = (id, data) => { const key=String(id||"").trim().toLowerCase(); if(key && !map.has(key)) map.set(key,data); };
    (mappings || []).forEach(m => add(m.reactorUid || m.reactorId, { ...m }));
    (clientInformation || []).forEach(c => {
      const ids=[c.reactorId, ...(String(c.linkedReactors||"").match(/\b\d{5,}\b/g)||[])];
      ids.filter(Boolean).forEach(id => { const key=String(id).trim().toLowerCase(); const prior=map.get(key)||{}; map.set(key,{...prior,_client:c}); });
    });
    return map;
  }, [mappings, clientInformation]);
  const maintenanceRows = useMemo(() => maintenance.map(item => ({ ...item, _meta: metadataByReactor.get(String(item.reactorUid || item.reactorId || "").trim().toLowerCase()) || {} })), [maintenance, metadataByReactor]);
  const maintenanceSearchValues = useMemo(() => {
    // Search selectors are populated from the complete operational data set,
    // not only from currently-maintained reactors. This keeps the second
    // dropdown useful even when there are zero maintenance records for the
    // selected field/site.
    const values = new Set();
    const add = value => {
      const text = String(value ?? "").trim();
      if (text && text !== "-" && text !== "Unknown") values.add(text);
    };
    const addMany = valuesList => (valuesList || []).forEach(add);

    if (maintenanceSearchBy === "Everything") {
      const rows = [
        ...equipment,
        ...maintenance,
        ...mappings,
        ...clientInformation
      ];
      rows.forEach(row => {
        Object.values(row || {}).forEach(value => {
          if (Array.isArray(value)) value.forEach(add);
          else if (value && typeof value === "object") Object.values(value).forEach(add);
          else add(value);
        });
      });
    } else if (maintenanceSearchBy === "Reactor ID") {
      addMany(equipment.flatMap(r => [r.id, r.reactorId, r.uid]));
      addMany(maintenance.flatMap(r => [r.reactorId, r.reactorUid]));
      addMany(clientInformation.flatMap(c => [c.reactorId, ...(String(c.linkedReactors || "").match(/\b\d{5,}\b/g) || [])]));
    } else if (maintenanceSearchBy === "Stage Code") {
      addMany(mappings.flatMap(m => [m.stageCode, m.stage, m.productCode, m.projectCode, m.product]));
      addMany(equipment.flatMap(r => [r.stageCode, r.productCode, r.projectCode, r.projectMapped]));
      addMany(clientInformation.flatMap(c => [c.stageCode, c.stage, c.productCode, c.projectCode, c.projectMapped, c.product]));
    } else if (maintenanceSearchBy === "Product Name") {
      addMany(mappings.flatMap(m => [m.product, m.productCode]));
      addMany(clientInformation.flatMap(c => [c.product, c.productCode]));
      addMany(equipment.flatMap(r => [r.productMapped, r.projectMapped]));
    } else if (maintenanceSearchBy === "Client") {
      addMany(clientInformation.flatMap(c => [c.clientName, c.client]));
      addMany(mappings.flatMap(m => [m.clientName, m.client]));
    } else if (maintenanceSearchBy === "Site") {
      addMany(equipment.map(r => r.site));
      addMany(clientInformation.map(c => c.site));
      addMany(maintenance.map(r => r.site));
    } else if (maintenanceSearchBy === "MOC") {
      addMany(equipment.map(r => r.moc));
      addMany(maintenance.map(r => r.moc));
    } else if (maintenanceSearchBy === "Action") {
      addMany(maintenance.map(r => r.action));
    } else if (maintenanceSearchBy === "Status") {
      addMany(equipment.map(r => r.status));
      addMany(maintenance.map(r => r.status));
      ["Available", "Mapped", "Maintenance", "Confirmed", "High Probable", "Visible"].forEach(add);
    }
    return [...values].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"}));
  }, [maintenanceSearchBy, equipment, maintenance, mappings, clientInformation]);
  const matchesMaintenanceSearch = item => {
    const m=item._meta||{}, c=m._client||{}; const all=[item.reactorId,item.site,item.moc,item.action,item.status,m.product,m.productCode,m.projectCode,m.project,m.stage,m.stageCode,m.clientName,c.product,c.projectCode,c.stage,c.stageCode,c.clientName].filter(Boolean).join(" ").toLowerCase();
    const q=maintenanceSearch.trim(); const selected=normalizeSearchText(maintenanceSearchValue);
    const field=maintenanceSearchBy==="Reactor ID"?item.reactorId:maintenanceSearchBy==="Stage Code"?[m.stageCode,m.stage,m.productCode,m.projectCode,m.project,c.stageCode,c.stage,c.productCode,c.projectCode,c.project,c.projectMapped,item.projectMapped].filter(Boolean).join(" "):maintenanceSearchBy==="Product Name"?(m.product||c.product):maintenanceSearchBy==="Client"?(m.clientName||c.clientName):maintenanceSearchBy==="Site"?item.site:maintenanceSearchBy==="MOC"?item.moc:maintenanceSearchBy==="Action"?item.action:maintenanceSearchBy==="Status"?item.status:all;
    const selectedMatches = !selected || (maintenanceSearchBy === "Everything" ? matchesSearch(all, selected) : maintenanceSearchBy === "Stage Code" ? matchesSearch(field, selected) : normalizeSearchText(field) === selected);
    return (!q || matchesSearch(all, q)) && selectedMatches;
  };
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const activeMaintenance = useMemo(() => maintenance.filter(item => !["Completed", "Cancelled"].includes(String(item.status || ""))), [maintenance]);
  const visible = useMemo(() => maintenanceRows.filter(item => {
    const matchesSite = site === "All" || item.site === site;
    const matchesCto = cto === "All" || item.site === cto;
    const haystack = [item.reactorId, item.site, item.moc, item.action, item.status, item.reactorUid].map(v => String(v ?? "").toLowerCase()).join(" ");
    const matchesSearch = matchesMaintenanceSearch(item);
    const matchesActive = !activeOnly || !["Completed", "Cancelled"].includes(String(item.status || ""));
    return matchesSite && matchesCto && matchesSearch && matchesActive;
  }), [maintenanceRows, site, cto, maintenanceSearch, maintenanceSearchBy, maintenanceSearchValue, activeOnly]);
  const grouped = useMemo(() => {
    const groups = CTO_SITES.map(name => ({ name, rows: visible.filter(item => item.site === name) }));
    const other = visible.filter(item => !CTO_SITES.includes(item.site));
    if (other.length) groups.push({ name:"Other sites", rows:other });
    return groups;
  }, [visible]);

  const openCreate=()=>{setEditing(null);setForm({...initial,site:site !== "All" ? site : (cto !== "All" ? cto : sites[0] || "")});setOpen(true);};
const openEdit=item=>{setEditing(item);setForm({
  reactorUid:item.reactorUid||"",
  reactorId:item.reactorId||"",
  site:item.site||"",
  moc:item.moc||"",
  action:item.action||"",
  status:item.status||"Scheduled",
  startDate:item.startDate||"",
  endDate:item.endDate||""
});setOpen(true);};  
const submit=async e=>{
  e.preventDefault();
 
  if ((!form.reactorUid && !form.reactorId) || !form.site || !form.action) {
    alert("Select a site, reactor and required action.");
    return;
  }
 
  if (!form.startDate || !form.endDate) {
    alert("Start date and End date are required.");
    return;
  }
 
  if (form.endDate < form.startDate) {
    alert("End date cannot be before Start date.");
    return;
  }
 
  if(editing) {
    await onUpdate?.(editing.id, form);
  } else {
    await onCreate?.(form);
  }
 
  setOpen(false);
  setEditing(null);
  setForm(initial);
};
  const reactorOptions = reactors.filter(r => !form.site || r.site === form.site);

  const columns = [
    {key:"reactorId",label:"Reactor ID",render:r=><strong>{r.reactorId}</strong>},
    {key:"site",label:"Site"},
    {key:"moc",label:"MOC"},
    {key:"action",label:"Required action"},
    {key:"status",label:"Status",render:r=><span className={`badge maintenance-status-${String(r.status||"").toLowerCase().replace(/\s+/g,"-")}`}>{r.status}</span>},
    {key:"actions",label:"Actions",render:r=><div className="row-actions"><button className="small" onClick={()=>openEdit(r)}>Edit</button><button className="small danger" onClick={async()=>{ if(window.confirm(`Delete maintenance record ${r.id} for ${r.reactorId}? The reactor will be returned to Available.`)){ await onDelete?.(r.id); } }}>Delete</button></div>}
  ];

  return <section>
    <PageHeader title="Admin & Maintenance" subtitle="Manage maintenance by CTO site and keep reactor status accurate." action={<button onClick={openCreate}>+ Update Maintenance</button>} />
    <div className="panel maintenance-guidance"><div><span className="eyebrow">Operational status</span><h2>Maintenance control</h2><p className="muted">Choose a CTO below to see only its maintenance records. Maintenance reactors are red throughout the application.</p></div><div className="mapping-status-legend"><span className="legend maintenance">Maintenance</span><span className="legend visible">Available / visible</span></div></div>

    <div className="panel maintenance-filter">
      <div className="maintenance-search-row maintenance-advanced-search">
        <label><span>Search by</span><select value={maintenanceSearchBy} onChange={e=>{setMaintenanceSearchBy(e.target.value);setMaintenanceSearchValue("");setMaintenanceSearch("");}}><option>Everything</option><option>Reactor ID</option><option>Product Name</option><option>Stage Code</option><option>Client</option><option>Site</option><option>MOC</option><option>Action</option><option>Status</option></select></label>
        <label className="maintenance-search-field"><span>{maintenanceSearchBy === "Everything" ? "Value" : `${maintenanceSearchBy} value`}</span><select value={maintenanceSearchValue} onChange={e=>setMaintenanceSearchValue(e.target.value)}><option value="">All {maintenanceSearchBy === "Everything" ? "values" : `${maintenanceSearchBy.toLowerCase()}s`}</option>{maintenanceSearchValues.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <button type="button" className={`maintenance-active-toggle ${activeOnly ? "active" : ""}`} onClick={()=>setActiveOnly(v=>!v)}>{activeOnly ? "● Active maintenance only" : "All maintenance records"}</button>
        {(maintenanceSearch || maintenanceSearchValue) && <button type="button" className="secondary small" onClick={()=>{setMaintenanceSearch("");setMaintenanceSearchValue("");}}>Clear</button>}
      </div>
      <div className="cto-maintenance-tabs" role="tablist" aria-label="Maintenance by CTO">
        {["All", ...CTO_SITES].map(name => <button key={name} type="button" className={`maintenance-cto-tab ${cto===name?"active":""}`} onClick={()=>{setCto(name);setSite("All");}}>{name}<span>{name==="All" ? activeMaintenance.length : activeMaintenance.filter(x=>x.site===name).length}</span></button>)}
      </div>
      <label>Site<select value={site} onChange={e=>{setSite(e.target.value);setCto(e.target.value!=="All" && CTO_SITES.includes(e.target.value) ? e.target.value : "All");}}><option>All</option>{sites.map(s=><option key={s}>{s}</option>)}</select></label>
      <div className="maintenance-filter-meta">
        <span className="muted">Select a field, then choose an exact value from the next dropdown.</span>
        {maintenanceSearchBy !== "Everything" && <span className="muted">{maintenanceSearchValues.length} available {maintenanceSearchBy.toLowerCase()} values</span>}
        <span className="muted">Showing {visible.length} {activeOnly ? "active " : ""}record{visible.length===1?"":"s"}</span>
      </div>
    </div>

    <div className="maintenance-search-results panel">
      <div className="panel-title-row"><div><h2>Reactors under maintenance</h2><p className="muted">Search by Reactor ID, CTO/site, MOC, action or maintenance status.</p></div><strong className="maintenance-result-count">{visible.length}</strong></div>
      {visible.length ? <div className="maintenance-result-list">{visible.map(item => <button type="button" className="maintenance-result-card" key={item.id} onClick={()=>openEdit(item)}><span className="maintenance-result-icon">!</span><span className="maintenance-result-main"><strong>{item.reactorId || item.reactorUid}</strong><small>{item.site || "Site not specified"} · {item.moc || "MOC not specified"}</small></span><span className="maintenance-result-action">{item.action || "Maintenance required"}</span><span className="badge maintenance-status-active">{item.status || "Maintenance"}</span></button>)}</div> : <div className="maintenance-empty"><strong>No matching maintenance reactors</strong><span>Try another Reactor ID, CTO or action, or switch to all maintenance records.</span></div>}
    </div>
    <div className="maintenance-cto-grid">
      {grouped.map(group => <div className="panel maintenance-cto-card" key={group.name}>
        <div className="panel-title-row"><div><h2>{group.name}</h2><p className="muted">{group.rows.length} maintenance record{group.rows.length===1?"":"s"}</p></div><span className="metric-chip">{group.rows.filter(x=>["Scheduled","In Progress","Pending"].includes(x.status)).length} active</span></div>
        <Table rows={group.rows} columns={columns} empty="No maintenance records for this CTO." />
      </div>)}
    </div>

    <div className="panel"><h2>Maintenance status rules</h2><div className="role-list"><div><strong>Scheduled / In Progress</strong><span>The reactor remains in Maintenance status.</span></div><div><strong>Pending</strong><span>The reactor remains in Maintenance status.</span></div><div><strong>Completed</strong><span>The reactor becomes Available.</span></div><div><strong>Cancelled</strong><span>The reactor becomes Available.</span></div></div></div>
    <div className="panel"><h2>Platform security audit logs</h2><Table rows={audit} columns={[{key:"timestamp",label:"Timestamp"},{key:"user",label:"User"},{key:"action",label:"Action taken"}]}/></div>

    {open && <Modal title={editing ? `Update Maintenance — ${editing.reactorId}` : "Schedule Maintenance"} onClose={()=>setOpen(false)}><form onSubmit={submit}><div className="form-grid">
      <label>CTO / Site<select required value={form.site} disabled={!!editing} onChange={e=>{set("site",e.target.value);set("reactorUid","");set("reactorId","");}}><option value="">Select CTO / site</option>{sites.map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Reactor<select required value={form.reactorUid} disabled={!!editing} onChange={e=>{const r=reactorOptions.find(x=>x.uid===e.target.value);set("reactorUid",e.target.value);set("reactorId",r?.id||"");set("moc",r?.moc||form.moc);}}><option value="">Select reactor</option>{reactorOptions.map(r=><option key={r.uid} value={r.uid}>{r.id} · {r.capacity ? (Number(r.capacity)/1000).toLocaleString(undefined,{maximumFractionDigits:3}) : "Unknown"} kL · {r.status}</option>)}</select></label>
      <label>MOC<input placeholder="MOC type" value={form.moc} onChange={e=>set("moc",e.target.value)} /></label>
      <label>Required action<input required placeholder="Required action" value={form.action} onChange={e=>set("action",e.target.value)} /></label>
      <label>Status<select value={form.status} onChange={e=>set("status",e.target.value)}><option>Scheduled</option><option>In Progress</option><option>Pending</option><option>Completed</option><option>Cancelled</option></select></label>
      <label>
  Start date
  <input
    type="date"
    required
    value={form.startDate}
    onChange={e=>set("startDate",e.target.value)}
  />
</label>
 
<label>
  End date
  <input
    type="date"
    required
    min={form.startDate || undefined}
    value={form.endDate}
    onChange={e=>set("endDate",e.target.value)}
  />
</label>
    </div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button>{editing?"Save maintenance update":"Schedule maintenance"}</button></div></form></Modal>}
  </section>;
}
