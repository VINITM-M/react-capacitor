import { useMemo, useState } from "react";
import Table from "../components/Table";
import StatCard from "../components/StatCard";
import { matchesSearch } from "../utils/searchUtils";

const n = x => Number(x) || 0;

export default function Capacity({ rows, siteTotals, totals: sourceTotals, globalSearch, onNavigate }) {
  const [site, setSite] = useState("All");
  const sites = [...new Set(rows.map(x=>x.site).filter(Boolean))].sort();
  const q = globalSearch.trim().toLowerCase();

  const filtered = useMemo(() => rows.filter(r => Number(r.totalCapacity || 0) > 0 &&
    (site==="All" || r.site===site) &&
    matchesSearch(r, q)
  ), [rows,site,q]);

  const groupedBlocks = useMemo(() => {
    const groups = new Map();
    filtered.forEach(row => {
      const label = `${row.site || "Unspecified site"} · ${row.block || "Unspecified block"}`;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(row);
    });
    return [...groups.entries()].sort(([a],[b]) => a.localeCompare(b, undefined, {numeric:true}));
  }, [filtered]);

  const calculated = filtered.reduce((a,r)=>({
    total:a.total+n(r.totalCapacity), util:a.util+n(r.utilization), mapped:a.mapped+n(r.mapped), avail:a.avail+n(r.available)
  }), {total:0,util:0,mapped:0,avail:0});
  const totals = site === "All" && !q && sourceTotals ? { total:n(sourceTotals.total), util:n(sourceTotals.utilization), mapped:n(sourceTotals.mapped), avail:n(sourceTotals.available) } : calculated;

  return (
    <section>
      <h1>Capacity Summary</h1>
      <p className="subtitle">Capacity by site, block, and area.</p>

      <div className="stats-grid">
        <StatCard label="Total Capacity" value={`${totals.total.toFixed(3)} kL`} onClick={()=>onNavigate?.("reactors")} />
        <StatCard label="Total Utilized Capacity" value={`${totals.util.toFixed(3)} kL`} onClick={()=>onNavigate?.("reactors")} />
        <StatCard label="Mapped Capacity" value={`${totals.mapped.toFixed(3)} kL`} onClick={()=>onNavigate?.("availability")} />
        <StatCard label="Available Capacity" value={`${totals.avail.toFixed(3)} kL`} onClick={()=>onNavigate?.("availability")} />
      </div>

      <div className="panel">
        <div className="filter-grid single-small">
          <select value={site} onChange={e=>setSite(e.target.value)}>
            <option>All</option>{sites.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="panel capacity-structure-groups">
        <div className="panel-title-row"><div><h2>Capacity Structure</h2><p className="muted">Capacity rows grouped under clear Site and Block headings. Capacity is shown in kL; zero is allowed and there is no artificial upper limit.</p></div><span className="result-count">{groupedBlocks.length} site/block groups</span></div>
        {groupedBlocks.length ? groupedBlocks.map(([label, blockRows]) => (
          <section className="capacity-block-group" key={label}>
            <h3>{label}</h3>
            <Table rows={blockRows} columns={[
              {key:"area",label:"Intermediate / Clean Room"},
              {key:"totalCapacity",label:"Total Capacity (kL)"},
              {key:"utilization",label:"Utilization (kL)"},
              {key:"mapped",label:"Mapped (kL)"},
              {key:"available",label:"Available (kL)"}
            ]}/>
          </section>
        )) : <div className="empty-panel">No capacity structure rows match these filters.</div>}
      </div>

      <div className="panel">
        <h2>Site-wise Capacity</h2>
        <Table rows={siteTotals} columns={[
          {key:"site",label:"Site"},
          {key:"totalCapacity",label:"Total Capacity"},
          {key:"mappedCapacity",label:"Mapped Capacity"},
          {key:"utilizedCapacity",label:"Utilized Capacity"},
          {key:"availableCapacity",label:"Available Capacity"}
        ]}/>
      </div>
    </section>
  );
}
