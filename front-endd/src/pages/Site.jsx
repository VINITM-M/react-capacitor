import { resolveStageCode } from "../utils/unknownUtils";
import { useMemo, useState } from "react";
import Modal from "../components/Modal";
import Table from "../components/Table";
import StatCard from "../components/StatCard";
import { buildInventoryMetrics } from "../utils/inventoryMetrics";

export default function Site({ site, equipment, capacityRows, mappings, onCreateReactor }) {
  const key = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const items = useMemo(() => equipment.filter(e => key(e.site) === key(site)), [equipment,site]);
  const caps = capacityRows.filter(x => key(x.site) === key(site) && Number(x.totalCapacity||0) > 0);
  const groupedCaps = useMemo(() => {
    const groups = new Map();
    caps.forEach(row => {
      const block = row.block || "Unspecified block";
      if (!groups.has(block)) groups.set(block, []);
      groups.get(block).push(row);
    });
    return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
  }, [caps]);
  const inventoryMetrics = useMemo(() => buildInventoryMetrics(items, mappings), [items, mappings]);
  const mapped = inventoryMetrics.counts.Mapped;
  const maintenance = inventoryMetrics.counts.Maintenance;
  const cap = caps.reduce((s,e)=>s+(Number(e.totalCapacity)||0),0);
  const mappedCap = caps.reduce((s,e)=>s+(Number(e.mapped)||0),0);
  const utilizedCap = caps.reduce((s,e)=>s+(Number(e.utilization)||0),0);
  const availableCap = caps.reduce((s,e)=>s+(Number(e.available)||0),0);
  const [inventorySearch,setInventorySearch]=useState("");
  const [inventoryMoc,setInventoryMoc]=useState("All MOC");
  const [inventoryAgitator,setInventoryAgitator]=useState("All agitators");
  const [inventorySort,setInventorySort]=useState("id");
  const [inventoryDirection,setInventoryDirection]=useState("asc");
  const mocs=[...new Set(items.map(x=>String(x.moc||"").trim()).filter(Boolean))].sort();
  const agitators=[...new Set(items.map(x=>String(x.agitator||"").trim()).filter(Boolean))].sort();
  const visibleItems=useMemo(()=>{
    const q=inventorySearch.trim().toLowerCase();
    const rows=items.filter(r=>{
      const relatedMappings=(mappings||[]).filter(m=>key(m.reactorUid||m.reactorId||m.reactor||"")===key(r.uid||r.id||""));
      const mappingValues=relatedMappings.flatMap(m=>Object.values(m||{}));
      // Universal site search: include every source-backed equipment and mapping field,
      // not just the handful of fields currently visible as table columns.
      const hay=[...Object.values(r||{}),...mappingValues].filter(v=>v!==null&&v!==undefined).map(v=>v instanceof Date?v.toISOString():String(v)).join(" ").toLowerCase();
      return (!q||hay.includes(q))&&(inventoryMoc==="All MOC"||key(r.moc)===key(inventoryMoc))&&(inventoryAgitator==="All agitators"||key(r.agitator)===key(inventoryAgitator));
    });
    return rows.sort((a,b)=>{const mappingA=(mappings||[]).find(m=>key(m.reactorUid||m.reactorId||"")===key(a.uid||a.id||""))||{};const mappingB=(mappings||[]).find(m=>key(m.reactorUid||m.reactorId||"")===key(b.uid||b.id||""))||{};const av=inventorySort==="product"?(mappingA.product||""):(a[inventorySort]??"");const bv=inventorySort==="product"?(mappingB.product||""):(b[inventorySort]??"");const cmp=inventorySort==="capacity"?(Number(av)||0)-(Number(bv)||0):String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:"base"});return inventoryDirection==="asc"?cmp:-cmp;});
  },[items,mappings,inventorySearch,inventoryMoc,inventoryAgitator,inventorySort,inventoryDirection]);
  const visibleMappings=useMemo(()=>{
    const q=inventorySearch.trim().toLowerCase();
    return (mappings||[]).filter(m=>key(m.site)===key(site)).filter(m=>{
      const reactor=(items||[]).find(r=>key(r.uid||r.id||"")===key(m.reactorUid||m.reactorId||m.reactor||""));
      const hay=[...Object.values(m||{}),...(reactor?Object.values(reactor):[])].filter(v=>v!==null&&v!==undefined).map(v=>v instanceof Date?v.toISOString():String(v)).join(" ").toLowerCase();
      return !q||hay.includes(q);
    });
  },[mappings,items,site,inventorySearch]);
  const [open,setOpen]=useState(false);
  const [activeCategory,setActiveCategory]=useState("");
  const [form,setForm]=useState({id:"",block:"",area:"",capacity:"",moc:"",agitator:""});
  const [busy,setBusy]=useState(false);
  const statusOf = reactor => inventoryMetrics.statusFor(reactor).toLowerCase();
  const categoryReactors = useMemo(() => {
    if (activeCategory === "Equipment") return items;
    if (activeCategory === "Mapped") return items.filter(r => statusOf(r) === "mapped");
    if (activeCategory === "Available") return items.filter(r => statusOf(r) === "available");
    if (activeCategory === "Maintenance") return items.filter(r => statusOf(r).includes("maintenance"));
    return [];
  }, [items, activeCategory, inventoryMetrics]);
  const toggleCategory = category => setActiveCategory(current => current === category ? "" : category);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const submit=async e=>{e.preventDefault(); if(!form.id||form.capacity==="")return alert("Reactor ID and Capacity are required."); const litres=Number(form.capacity)*1000; if(!Number.isFinite(litres)||litres<0)return alert("Capacity must be a valid kL value."); setBusy(true); try{await onCreateReactor?.({...form,site,capacity:litres,status:"Available",projectMapped:""});setOpen(false);setForm({id:"",block:"",area:"",capacity:"",moc:"",agitator:""});}finally{setBusy(false);}};
  return <section>
    <div className="page-heading-row"><div><h1>{site}</h1><p className="subtitle">Site-level equipment, capacity structure and project mapping.</p></div><button onClick={()=>setOpen(true)}>+ Add Reactor to {site}</button></div>
    <div className="stats-grid site-stats-grid">
      <StatCard label="Total Reactors" value={items.length} onClick={() => toggleCategory("Equipment")} />
      <StatCard label="Mapped Reactors" value={mapped} onClick={() => toggleCategory("Mapped")} />
      <StatCard label="Available Reactors" value={inventoryMetrics.counts.Available} onClick={() => toggleCategory("Available")} />
      <StatCard label="Maintenance Reactors" value={maintenance} onClick={() => toggleCategory("Maintenance")} />
      <StatCard label="Total Capacity" value={`${cap.toLocaleString(undefined,{maximumFractionDigits:3})} kL`} hint={`${mappedCap.toLocaleString(undefined,{maximumFractionDigits:3})} kL mapped · ${availableCap.toLocaleString(undefined,{maximumFractionDigits:3})} kL available`} />
      <StatCard label="Utilized Capacity" value={`${utilizedCap.toLocaleString(undefined,{maximumFractionDigits:3})} kL`} hint={`${availableCap.toLocaleString(undefined,{maximumFractionDigits:3})} kL available`} />
    </div>
    {activeCategory && <div className="panel site-category-panel" aria-live="polite">
      <div className="site-category-heading">
        <div><h2>{activeCategory} Reactors — {site}</h2><p className="muted">{categoryReactors.length} reactor{categoryReactors.length === 1 ? "" : "s"} in this category.</p></div>
        <button type="button" className="secondary site-category-close" onClick={() => setActiveCategory("")} aria-label="Close reactor details">Close ×</button>
      </div>
      <Table rows={categoryReactors} columns={[
        {key:"id",label:"Reactor ID",render:r=><strong>{r.id}</strong>},
        {key:"block",label:"Block",render:r=>r.block||"Unknown"},
        {key:"area",label:"Area",render:r=>r.area||"Unknown"},
        {key:"capacity",label:"Capacity",render:r=>r.capacity!=null?`${(Number(r.capacity)/1000).toLocaleString(undefined,{maximumFractionDigits:3})} kL`:"Unknown"},
        {key:"status",label:"Status",render:r=><span className={`status-badge status-${statusOf(r).replace(/[^a-z0-9]+/g,"-")}`}>{inventoryMetrics.statusFor(r)}</span>},
        {key:"product",label:"Product Name",render:r=>(mappings||[]).find(m=>r.uid?m.reactorUid===r.uid:(key(m.reactorId)===key(r.id||r.equipmentId)&&key(m.site)===key(r.site)))?.product||r.product||"Unknown"}
      ]} empty={`No ${activeCategory.toLowerCase()} reactors are listed for this site.`} />
    </div>}
    <div className="panel site-capacity-structure"><h2>Capacity Structure — {site}</h2><p className="muted">Capacity is grouped by block. Zero-capacity entries are excluded from this installed-capacity view.</p>{groupedCaps.length ? groupedCaps.map(([block, blockRows])=><section className="capacity-block-group" key={block}><h3>{block}</h3><Table rows={blockRows} columns={[{key:"area",label:"Intermediate / Clean Room"},{key:"totalCapacity",label:"Total Capacity (kL)"},{key:"utilization",label:"Utilized Capacity (kL)"},{key:"mapped",label:"Mapped (kL)"},{key:"available",label:"Available (kL)"}]}/></section>):<div className="empty-panel">No capacity-summary rows with installed capacity for this site.</div>}</div>
    <div className="panel site-equipment-inventory"><div className="panel-title-row"><div><h2>Equipment Inventory — {site}</h2><p className="muted">Search and sort by reactor, block, MOC, agitator, Product Name, client or capacity.</p></div><span className="result-count">{visibleItems.length} of {items.length}</span></div>
      <div className="filter-grid site-inventory-filters"><input type="search" value={inventorySearch} onChange={e=>setInventorySearch(e.target.value)} placeholder="Search reactor, Product Name, Stage Code, client, dates, status, MOC…" aria-label={`Search all equipment and mapping fields for ${site}`}/><select value={inventoryMoc} onChange={e=>setInventoryMoc(e.target.value)}><option>All MOC</option>{mocs.map(x=><option key={x}>{x}</option>)}</select><select value={inventoryAgitator} onChange={e=>setInventoryAgitator(e.target.value)}><option>All agitators</option>{agitators.map(x=><option key={x}>{x}</option>)}</select></div>
      <Table rows={visibleItems} columns={[{key:"id",label:"Reactor ID",render:r=><strong>{r.id}</strong>},{key:"block",label:"Block",render:r=>r.block||"Unknown"},{key:"area",label:"Area",render:r=>r.area||"Unknown"},{key:"capacity",label:"Capacity",render:r=>r.capacity!=null?`${(Number(r.capacity)/1000).toLocaleString(undefined,{maximumFractionDigits:3})} kL`:"Unknown"},{key:"moc",label:"MOC"},{key:"agitator",label:"Agitator"},{key:"product",label:"Product Name",render:r=>(mappings||[]).find(m=>r.uid?m.reactorUid===r.uid:(key(m.reactorId)===key(r.id||r.equipmentId)&&key(m.site)===key(r.site)))?.product||r.product||"Unknown"}]}/></div>
    <div className="panel"><div className="panel-title-row"><div><h2>Mappings for {site}</h2><p className="muted">Search covers Client Name, Product Name, Stage Code, status, category, reactor, site and planning dates.</p></div><span className="result-count">{visibleMappings.length} matches</span></div><Table rows={visibleMappings} columns={[{key:"reactorId",label:"Reactor ID"},{key:"product",label:"Product Name"},{key:"stageCode",label:"Stage Code",render:row=>resolveStageCode(row)},{key:"startDate",label:"Start"},{key:"endDate",label:"End"},{key:"category",label:"Category"}]}/></div>
    {open&&<Modal title={`Add Reactor — ${site}`} onClose={()=>!busy&&setOpen(false)}><form onSubmit={submit}><div className="form-grid"><input required placeholder="Reactor ID" value={form.id} onChange={e=>set("id",e.target.value)}/><input placeholder="Block" value={form.block} onChange={e=>set("block",e.target.value)}/><input placeholder="Intermediate / Clean Room" value={form.area} onChange={e=>set("area",e.target.value)}/><input required type="number" min="0" step="any" placeholder="Capacity (kL)" value={form.capacity} onChange={e=>set("capacity",e.target.value)}/><input placeholder="MOC" value={form.moc} onChange={e=>set("moc",e.target.value)}/><input placeholder="Agitator" value={form.agitator} onChange={e=>set("agitator",e.target.value)}/></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button disabled={busy}>{busy?"Adding…":"Add Reactor"}</button></div></form></Modal>}
  </section>;
}
