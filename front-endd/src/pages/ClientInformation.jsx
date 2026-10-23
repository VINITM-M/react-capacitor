import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { matchesSearch } from "../utils/searchUtils";
import StatCard from "../components/StatCard";
import Modal from "../components/Modal";
import MapEquipment from "../components/MapEquipment";
import { cleanKnownText, resolveStageCode } from "../utils/unknownUtils";
import { buildInventoryMetrics } from "../utils/inventoryMetrics";

const norm = v => cleanKnownText(v).toLowerCase();
const clean = v => cleanKnownText(v);
const key = v => norm(v).replace(/[^a-z0-9]+/g, "");
const fmtKL = v => `${(Number(v || 0) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} kL`;
const PRODUCT_PAGE_SIZE = 6;
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (date, days) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const emptyClient = {
  clientName: "", product: "", projectCode: "", stage: "", stageCode: "",
  reactorId: "", site: "", block: "", area: "", continuousCampaign: "",
  timeline: "", status: "Planned", linkedReactors: "", remarks: ""
};

const emptyMapping = {
  reactorUid: "", product: "", productCode: "", stage: "", stages: [],
  stageCode: "", category: "Confirmed", startDate: today(), endDate: plusDays(today(), 7)
};

const headerKey = v => norm(v).replace(/[^a-z0-9]+/g, " ").trim();
const pick = (row, names) => {
  const entries = Object.entries(row || {});
  const found = entries.find(([k]) => names.includes(headerKey(k)));
  return found ? found[1] : "";
};

const mappingMatchesClient = (mapping, client) => {
  const reactorMatch = mapping.reactorId && client.reactorId && key(mapping.reactorId) === key(client.reactorId);
  const project = mapping.productCode || mapping.product || mapping.projectCode;
  const clientProject = client.projectCode || client.product || client.projectMapped;
  const projectMatch = project && clientProject && key(project) === key(clientProject);
  return reactorMatch || projectMatch;
};

export default function ClientInformation({
  rows = [],
  mappings = [],
  equipment = [],
  mappingOptions = {},
  onCreate,
  onImport,
  onCreateMapping,
}) {
  const [query, setQuery] = useState("");
  const [client, setClient] = useState("All");
  const [open, setOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [form, setForm] = useState(emptyClient);
  const [mapForm, setMapForm] = useState(emptyMapping);
  const [busy, setBusy] = useState(false);
  const [productPage, setProductPage] = useState(0);
  const [selectedProductName, setSelectedProductName] = useState(null);
  const fileRef = useRef(null);
  const inventoryMetrics = useMemo(() => buildInventoryMetrics(equipment, mappings), [equipment, mappings]);

  const clients = useMemo(
 () => [
   "All",
   ...Array.from(
     new Set(
       rows
         .map(r => r.clientName || equipment.find(e => key(e.id) === key(r.reactorId))?.clientName)
         .filter(Boolean)
     )
   ).sort()
 ],
 [rows, equipment]
);

  const clientByReactor = useMemo(() => {
    const map = new Map();
    rows.forEach(row => {
      if (row.reactorId) map.set(key(row.reactorId), row);
    });
    return map;
  }, [rows]);

  const clientByProject = useMemo(() => {
    const map = new Map();
    rows.forEach(row => {
      [row.projectCode, row.projectMapped, row.product].filter(Boolean).forEach(value => {
        const k = key(value);
        if (!map.has(k)) map.set(k, row);
      });
    });
    return map;
  }, [rows]);

  const mappingRegister = useMemo(() => {
    return mappings.map(mapping => {
      const client = clientByReactor.get(key(mapping.reactorId)) ||
        clientByProject.get(key(mapping.productCode || mapping.product)) || {};
      const equipmentRow = equipment.find(r =>
        (mapping.reactorUid && String(r.uid) === String(mapping.reactorUid)) ||
        key(r.id) === key(mapping.reactorId)
      );
      return {
        ...mapping,
        clientName: client.clientName || mapping.clientName || "Unknown",
        product: mapping.product || client.product || "",
        projectCode: mapping.productCode || client.projectCode || "",
        reactorId: mapping.reactorId || equipmentRow?.id || "",
        site: mapping.site || equipmentRow?.site || client.site || "",
        block: mapping.block || equipmentRow?.block || client.block || "",
        area: mapping.area || equipmentRow?.area || client.area || "",
        capacity: mapping.capacity ?? equipmentRow?.capacity ?? 0,
        stage: mapping.stages?.length ? mapping.stages.join(", ") : (mapping.stage || client.stage || ""),
        stageCode: resolveStageCode(mapping) !== "Unknown" ? resolveStageCode(mapping) : resolveStageCode(client) !== "Unknown" ? resolveStageCode(client) : resolveStageCode(equipmentRow),
        probability: mapping.category === "Workbook" ? (client.status || "Workbook") : (mapping.category || client.status || "Visible"),
        timeline: mapping.startDate && mapping.endDate ? `${mapping.startDate} → ${mapping.endDate}` : (client.timeline || ""),
        source: mapping.category === "Workbook" ? "Planning Tracker" : "Platform mapping",
      };
    });
  }, [mappings, clientByReactor, clientByProject, equipment]);

  const filteredRegister = useMemo(() => {
    const q = query.trim();
    return mappingRegister.filter(row => {
      if (client !== "All" && row.clientName !== client) return false;
      return matchesSearch(row, q);
    });
  }, [mappingRegister, query, client]);

  const groupedRows = useMemo(() => {
 /*
  * Excel → Client Information reconciliation
  *
  * Some versions of the imported database store the project code
  * as "projectMapped" instead of "projectCode".
  *
  * We also use the Equipment record as a fallback for Client/Product
  * when the Client Information row itself is blank.
  */
 const equipmentByUid = new Map();
 const equipmentBySiteAndId = new Map();
 const equipmentById = new Map();
 equipment.forEach(item => {
   const id = key(item.id || item.equipmentId);
   const uid = key(item.uid || item.reactorUid);
   if (uid) equipmentByUid.set(uid, item);
   if (id) {
     const composite = `${key(item.site)}|${id}|${key(item.block)}|${key(item.area)}`;
     equipmentBySiteAndId.set(composite, item);
     if (!equipmentById.has(id)) equipmentById.set(id, []);
     equipmentById.get(id).push(item);
   }
 });
 const findEquipmentForClient = row => {
   const uid = key(row.reactorUid);
   if (uid && equipmentByUid.has(uid)) return equipmentByUid.get(uid);
   const id = key(row.reactorId);
   if (!id) return null;
   if (row.site) {
     const prefix = `${key(row.site)}|${id}|`;
     const exact = [...equipmentBySiteAndId.entries()].find(([composite]) => composite.startsWith(prefix));
     if (exact) return exact[1];
   }
   const candidates = equipmentById.get(id) || [];
   return candidates.length === 1 ? candidates[0] : null;
 };
 const enrichedRows = rows.map(row => {
   const equipmentRow = findEquipmentForClient(row);
   return {
     ...row,
     // Client fallback from Equipment
     clientName:
       clean(row.clientName) ||
       clean(equipmentRow?.clientName),
     // Product fallback from Equipment
     product:
       clean(row.product) ||
       clean(equipmentRow?.product),
     // Legacy project-mapped values are resolved to the single Stage Code field.
     projectCode:
       clean(row.projectCode) ||
       clean(row.projectMapped) ||
       clean(equipmentRow?.projectMapped),
     // Additional fallbacks
     stage:
       clean(row.stage) ||
       clean(equipmentRow?.stage),
     stageCode: resolveStageCode(row) !== "Unknown" ? resolveStageCode(row) : resolveStageCode(equipmentRow),
     site:
       clean(row.site) ||
       clean(equipmentRow?.site),
     block:
       clean(row.block) ||
       clean(equipmentRow?.block),
     area:
       clean(row.area) ||
       clean(equipmentRow?.area),
     status:
       clean(row.status) ||
       clean(equipmentRow?.planningStatus) ||
       clean(equipmentRow?.status)
   };
 });
 const filtered = enrichedRows.filter(row => {
   if (client !== "All" && row.clientName !== client) return false;
   if (!query) return true;
   return matchesSearch(row, query);
 });
 const groups = new Map();
 filtered.forEach(row => {
   const groupKey = [
     row.clientName,
     row.product,
     resolveStageCode(row),
     row.site,
     row.area
   ]
     .map(v => norm(v))
     .join("|");
   if (!groups.has(groupKey)) {
     groups.set(groupKey, {
       ...row,
       _reactorIds: new Set(),
       _blocks: new Set(),
       _sourceCount: 0
     });
   }
   const item = groups.get(groupKey);
   item._sourceCount += 1;
   if (row.reactorId) {
     item._reactorIds.add(String(row.reactorId));
   }
   if (row.block) {
     item._blocks.add(String(row.block));
   }
 });
 return [...groups.values()].map(row => ({
   ...row,
   reactorId:
     [...row._reactorIds].join(", ") ||
     row.reactorId ||
     "",
   block:
     [...row._blocks].join(", ") ||
     row.block ||
     ""
 }));
}, [rows, equipment, client, query]);

  const clientRows = useMemo(
    () => [...groupedRows].sort((a, b) => clean(a.clientName).localeCompare(clean(b.clientName)) || clean(a.product).localeCompare(clean(b.product)) || resolveStageCode(a).localeCompare(resolveStageCode(b))),
    [groupedRows]
  );

  const productGroups = useMemo(() => {
    const groups = new Map();
    filteredRegister.forEach(row => {
      const name = clean(row.product) || "Unknown";
      const resolvedStage = resolveStageCode(row);
      const stageCode = resolvedStage !== "Unknown" ? resolvedStage : clean(row.projectCode || row.productCode) || "Unknown";
      const groupKey = `${key(name)}|${name === "Unknown" ? key(stageCode) : ""}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { name, stageCodes: new Map(), reactors: new Set(), sites: new Set(), clients: new Set(), blocks: new Set(), capacity: 0 });
      }
      const group = groups.get(groupKey);
      if (stageCode && stageCode !== "Unknown") group.stageCodes.set(key(stageCode), stageCode);
      if (row.reactorId) String(row.reactorId).split(",").map(v => v.trim()).filter(Boolean).forEach(v => group.reactors.add(v));
      if (row.site) group.sites.add(row.site);
      if (row.block) String(row.block).split(",").map(v => v.trim()).filter(Boolean).forEach(v => group.blocks.add(v));
      if (row.clientName && row.clientName !== "Unknown") group.clients.add(row.clientName);
      group.capacity += Number(row.capacity) || 0;
    });
    return [...groups.values()].map(group => ({
      ...group,
      stageCodes: [...group.stageCodes.values()].sort((a,b) => a.localeCompare(b)),
    })).sort((a,b) => a.name.localeCompare(b.name));
  }, [filteredRegister]);

  useEffect(() => {
    setProductPage(current => Math.min(current, Math.max(0, Math.ceil(productGroups.length / PRODUCT_PAGE_SIZE) - 1)));
  }, [productGroups.length]);
  const productPageCount = Math.max(1, Math.ceil(productGroups.length / PRODUCT_PAGE_SIZE));
  const visibleProductGroups = productGroups.slice(productPage * PRODUCT_PAGE_SIZE, (productPage + 1) * PRODUCT_PAGE_SIZE);
  const selectedProductRows = useMemo(() => {
    if (!selectedProductName) return [];
    return mappingRegister.filter(row => key(row.product || "Unknown") === key(selectedProductName));
  }, [mappingRegister, selectedProductName]);
  const selectedProductReactorKeys = useMemo(() => new Set(selectedProductRows.map(row => key(row.reactorUid) || `${key(row.site)}|${key(row.reactorId)}|${key(row.block)}|${key(row.area)}`).filter(value => value && !value.endsWith("||"))), [selectedProductRows]);
  const selectedProductEquipment = useMemo(() => equipment.filter(row => selectedProductReactorKeys.has(key(row.uid || row.reactorUid) || `${key(row.site)}|${key(row.id || row.equipmentId)}|${key(row.block)}|${key(row.area)}`)), [equipment, selectedProductReactorKeys]);

  const availableEquipment = useMemo(() => equipment
    .filter(r => inventoryMetrics.statusFor(r) === "Available")
    .slice()
    .sort((a, b) => clean(a.site).localeCompare(clean(b.site)) || clean(a.id || a.equipmentId).localeCompare(clean(b.id || b.equipmentId), undefined, { numeric: true })), [equipment, inventoryMetrics]);

  const totalReactors = equipment.length;
  const uniqueMappedReactors = inventoryMetrics.counts.Mapped;
  const uniqueStageCodes = new Set(mappings.map(m => { const value = resolveStageCode(m); return value !== "Unknown" ? key(value) : key(m.productCode || m.projectCode); }).filter(Boolean)).size;
  const availableReactors = inventoryMetrics.counts.Available;

  const products = Array.isArray(mappingOptions.products) ? mappingOptions.products : [];
  const codes = Array.isArray(mappingOptions.productCodes) ? mappingOptions.productCodes : [];
  const stages = Array.isArray(mappingOptions.stages) ? mappingOptions.stages : [];
  const catalog = Array.isArray(mappingOptions.catalog) ? mappingOptions.catalog : [];

  const selectedFamily = products.find(p => p.product === mapForm.product);
  const availableCodes = selectedFamily?.codes?.length ? selectedFamily.codes : codes;
  const selectedCatalog = catalog.find(c => c.code === mapForm.productCode);
  const productSpecificStages = selectedCatalog?.stagesByProduct?.[String(mapForm.product || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")] || [];
  const availableStages = productSpecificStages.length || selectedFamily?.stages?.length
    ? (productSpecificStages.length ? productSpecificStages : selectedFamily.stages)
    : ["Unknown"];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setMap = (k, v) => setMapForm(f => ({ ...f, [k]: v }));

  const openCreate = () => { setForm(emptyClient); setOpen(true); };

  const openMapping = (preferredReactor = null) => {
    const reactor = preferredReactor || availableEquipment[0] || null;
    const product = products[0]?.product || "";
    const code = products[0]?.codes?.[0] || codes[0] || "";
    const cat = catalog.find(c => c.code === code);
    const productKey = String(product || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const stage = cat?.stagesByProduct?.[productKey]?.[0] || products[0]?.stages?.[0] || stages[0] || "Unknown";
    setMapForm({
      ...emptyMapping,
      reactorUid: reactor?.uid || "",
      product,
      productCode: code,
      stage,
      stages: [stage],
      stageCode: code,
    });
    setMappingOpen(true);
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.clientName || (!form.product && !form.projectCode)) {
      alert("Client Name and Product Name or Stage Code are required.");
      return;
    }
    setBusy(true);
    try {
      await onCreate?.(form);
      setOpen(false);
    } catch (err) {
      alert(err.message || "Could not save client information.");
    } finally {
      setBusy(false);
    }
  };

  const submitMapping = async e => {
    e.preventDefault();
    if (!mapForm.reactorUid || !mapForm.product || !mapForm.productCode || !mapForm.stages?.length || !mapForm.stageCode || !mapForm.startDate || !mapForm.endDate) {
      alert("Select a reactor, Product Name, Stage Code and dates.");
      return;
    }
    if (mapForm.startDate > mapForm.endDate) {
      alert("Start date must be before end date.");
      return;
    }
    setBusy(true);
    try {
      await onCreateMapping?.(mapForm);
      setMappingOpen(false);
      setMapForm(emptyMapping);
    } catch (err) {
      alert(err.message || "Could not create mapping.");
    } finally {
      setBusy(false);
    }
  };

  const importClientFile = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const preferred = wb.SheetNames.find(n => headerKey(n) === "client information") || wb.SheetNames[0];
      const ws = wb.Sheets[preferred];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true });
      const mapped = raw.map((r, i) => ({
        id: `CLI-UP-${Date.now()}-${i + 1}`,
        sourceSheet: preferred,
        clientName: String(pick(r, ["client", "client name", "customer", "customer name"]) || "").trim(),
        product: String(pick(r, ["product"]) || "").trim(),
        projectCode: String(pick(r, ["project", "project code", "project product code", "product code"]) || "").trim(),
        stage: String(pick(r, ["stage"]) || "").trim(),
        stageCode: String(pick(r, ["stage code"]) || "").trim(),
        reactorId: String(pick(r, ["reactor", "reactor id", "reactor no", "reactor number"]) || "").trim(),
        site: String(pick(r, ["site"]) || "").trim(),
        block: String(pick(r, ["block"]) || "").trim(),
        area: String(pick(r, ["area", "intermediate clean room"]) || "").trim(),
        continuousCampaign: String(pick(r, ["continuous campaign", "continuous/campaign"]) || "").trim(),
        timeline: String(pick(r, ["timeline"]) || "").trim(),
        status: String(pick(r, ["status"]) || "Planned").trim(),
        linkedReactors: String(pick(r, ["linked reactors", "reactors"]) || "").trim(),
        remarks: String(pick(r, ["remarks", "remark"]) || "").trim()
      })).filter(r => r.clientName || r.product || r.projectCode || r.reactorId);
      if (!mapped.length) throw new Error("The selected file contains no usable client or product information.");
      await onImport?.(mapped);
      alert(`${mapped.length} client information record(s) imported.`);
    } catch (err) {
      alert(err.message || "Client upload failed.");
    }
  };

  return <section className="client-information-page">
    <div className="hero">
      <div>
        <h1>Client Information</h1>
        <p className="subtitle">Client and planning details are linked by Reactor ID, Product Name, and Stage Code where available.</p>
      </div>
      <div className="inline-actions client-information-actions">
        <button className="action-upload" onClick={() => fileRef.current?.click()}>Upload Client Excel</button>
        <button className="action-mapping" onClick={openMapping} disabled={!availableReactors}>+ Create Mapping</button>
        <button className="action-client" onClick={openCreate}>+ Add Client Information</button>
      </div>
    </div>
    <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={importClientFile}/>

    <div className="stats-grid compact">
      <StatCard label="Total Reactors" value={totalReactors} hint="Physical inventory records" />
      <StatCard label="Planning Intervals" value={mappings.length} hint="Scheduled assignment records" />
      <StatCard label="Mapped Reactors" value={uniqueMappedReactors} hint="Physical inventory records with assignments" />
      <StatCard label="Stage Codes" value={uniqueStageCodes} hint="Distinct code values" />
      <StatCard label="Available Reactors" value={availableReactors} hint="Physical inventory without assignments" />
    </div>

    <div className="panel client-register-panel">
      <div className="panel-title-row">
        <div><h2>Client Information</h2><p className="muted">Client Name comes first, followed by Product Name, Stage Code, reactors, site, and planning details.</p></div>
        <span className="result-count">{clientRows.length.toLocaleString()} records</span>
      </div>
      <div className="filter-grid client-information-filters">
        <input type="search" value={query} onChange={e => { setQuery(e.target.value); setProductPage(0); }} placeholder="Search Client Name, Product Name, Stage Code, reactor, site or status…" aria-label="Search client information" />
        <select value={client} onChange={e => { setClient(e.target.value); setProductPage(0); }} aria-label="Filter by client"><option value="All">All clients</option>{clients.filter(x => x !== "All").map(x => <option key={x} value={x}>{x}</option>)}</select>
      </div>
      <div className="table-scroll client-information-records">
        <table>
          <thead><tr><th>Client Name</th><th>Product Name</th><th>Stage Code</th><th>Reactor ID(s)</th><th>Site</th><th>Block</th><th>Area</th><th>Status</th><th>Timeline</th></tr></thead>
          <tbody>
            {clientRows.length ? clientRows.map((row, index) => {
              const stageCode = resolveStageCode(row) !== "Unknown" ? resolveStageCode(row) : clean(row.projectCode) || "Unknown";
              return <tr key={`${key(row.clientName)}-${key(row.product)}-${key(stageCode)}-${key(row.site)}-${index}`}>
                <td><strong>{clean(row.clientName) || "Unknown"}</strong></td>
                <td>{clean(row.product) || "Unknown"}</td>
                <td>{stageCode}</td>
                <td>{clean(row.reactorId) || "Unknown"}</td>
                <td>{clean(row.site) || "Unknown"}</td>
                <td>{clean(row.block) || "Unknown"}</td>
                <td>{clean(row.area) || "Unknown"}</td>
                <td>{clean(row.status) || "Unknown"}</td>
                <td>{clean(row.timeline) || (row.startDate || row.endDate ? `${row.startDate || "Unknown"} → ${row.endDate || "Unknown"}` : "Unknown")}</td>
              </tr>;
            }) : <tr><td colSpan={9} className="empty-cell">No client information matches the current search.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>

    <MapEquipment
      items={availableEquipment}
      totalEquipment={equipment.length}
      pageSize={1}
      renderItem={item => <div className="map-equipment-carousel-item">
        <div className="map-equipment-details-grid">
          <div><span>Reactor ID</span><strong>{clean(item.id || item.equipmentId) || "Unknown"}</strong></div>
          <div><span>Site</span><strong>{clean(item.site) || "Unknown"}</strong></div>
          <div><span>Block</span><strong>{clean(item.block) || "Unknown"}</strong></div>
          <div><span>Capacity</span><strong>{item.capacity !== undefined && item.capacity !== null && item.capacity !== "" ? fmtKL(item.capacity) : "Unknown"}</strong></div>
          <div><span>MOC</span><strong>{clean(item.moc) || "Unknown"}</strong></div>
          <div><span>Agitator</span><strong>{clean(item.agitator) || "Unknown"}</strong></div>
        </div>
        <div className="map-equipment-carousel-actions"><span className="muted">Available for mapping.</span><button type="button" onClick={() => openMapping(item)}>Map this reactor</button></div>
      </div>}
    />

    <div className="panel product-register-panel">
      <div className="panel-title-row product-information-title-row">
        <div><h2>Product Information</h2><p className="muted">Browse Product Names and their linked Stage Codes, reactors, clients and sites. Use the arrows to move through the product list.</p></div>
        <div className="product-information-pager" aria-label="Product Information navigation">
          <button type="button" className="carousel-arrow" aria-label="Previous Product Information page" title="Previous products" disabled={productPage === 0} onClick={() => setProductPage(page => Math.max(0, page - 1))}>←</button>
          <span aria-live="polite">{productGroups.length ? `${productPage * PRODUCT_PAGE_SIZE + 1}–${Math.min((productPage + 1) * PRODUCT_PAGE_SIZE, productGroups.length)} of ${productGroups.length}` : "0 Product Names"}</span>
          <button type="button" className="carousel-arrow" aria-label="Next Product Information page" title="Next products" disabled={productPage >= productPageCount - 1 || !productGroups.length} onClick={() => setProductPage(page => Math.min(productPageCount - 1, page + 1))}>→</button>
        </div>
      </div>
      <div className="product-information-grid">
        {visibleProductGroups.map(group => <button type="button" className="product-information-item product-information-button" key={`${key(group.name)}-${group.stageCodes.map(key).join("-")}`} onClick={() => setSelectedProductName(group.name)} aria-label={`View details for ${group.name}`}>
          <strong>{group.name}</strong>
          <span>Stage Code: {group.stageCodes.length ? group.stageCodes.join(", ") : "Unknown"}</span>
          <div><span>{group.reactors.size} Reactors</span><span>{group.clients.size} Clients</span><span>{group.sites.size} Sites</span></div>
          <span className="product-card-open-link">View client and reactor details →</span>
        </button>)}
      </div>
      {!productGroups.length && <div className="empty-panel">No Product Name associations match the current search.</div>}
    </div>

    {selectedProductName && <Modal title={`${selectedProductName} — Product Information`} onClose={() => setSelectedProductName(null)} className="product-detail-modal">
      <div className="product-detail-summary">
        <div><span>Stage Code</span><strong>{[...new Set(selectedProductRows.map(row => resolveStageCode(row)).filter(code => code && code !== "Unknown"))].join(", ") || "Unknown"}</strong></div>
        <div><span>Planning Intervals</span><strong>{selectedProductRows.length.toLocaleString()}</strong></div>
        <div><span>Distinct reactors</span><strong>{selectedProductReactorKeys.size.toLocaleString()}</strong></div>
        <div><span>Client Names</span><strong>{new Set(selectedProductRows.map(row => key(row.clientName)).filter(Boolean)).size.toLocaleString()}</strong></div>
      </div>
      <div className="dashboard-detail-section-heading"><h3>Client Information</h3><span>{selectedProductRows.length.toLocaleString()} related records</span></div>
      {selectedProductRows.length ? <div className="table-scroll"><table><thead><tr><th>Client Name</th><th>Product Name</th><th>Stage Code</th><th>Reactor ID(s)</th><th>Site</th><th>Block</th><th>Status</th><th>Timeline</th></tr></thead><tbody>
        {selectedProductRows.map((row, index) => <tr key={`${row.id || "product-client"}-${index}`}><td><strong>{clean(row.clientName) || "Unknown"}</strong></td><td>{clean(row.product) || "Unknown"}</td><td>{resolveStageCode(row)}</td><td>{clean(row.reactorId) || "Unknown"}</td><td>{clean(row.site) || "Unknown"}</td><td>{clean(row.block) || "Unknown"}</td><td>{clean(row.status) || "Unknown"}</td><td>{clean(row.timeline) || "Unknown"}</td></tr>)}
      </tbody></table></div> : <p className="muted">No client or planning records are linked to this Product Name.</p>}
      <div className="dashboard-detail-section-heading"><h3>Related reactor inventory</h3><span>{selectedProductEquipment.length.toLocaleString()} reactor(s)</span></div>
      {selectedProductEquipment.length ? <div className="table-scroll"><table><thead><tr><th>Reactor ID</th><th>Site</th><th>Block</th><th>Capacity</th><th>MOC</th><th>Agitator</th><th>Status</th></tr></thead><tbody>
        {selectedProductEquipment.map((row, index) => <tr key={`${row.uid || row.id || "equipment"}-${index}`}><td><strong>{clean(row.id || row.equipmentId) || "Unknown"}</strong></td><td>{clean(row.site) || "Unknown"}</td><td>{clean(row.block) || "Unknown"}</td><td>{row.capacity !== undefined && row.capacity !== null && row.capacity !== "" ? fmtKL(row.capacity) : "Unknown"}</td><td>{clean(row.moc) || "Unknown"}</td><td>{clean(row.agitator) || "Unknown"}</td><td>{clean(row.status) || "Unknown"}</td></tr>)}
      </tbody></table></div> : <p className="muted">No inventory records are linked to the selected Product Name.</p>}
    </Modal>}

    {open && <Modal title="Add Client Information" onClose={() => !busy && setOpen(false)}><form onSubmit={submit}><div className="form-grid">
      <input required placeholder="Client name" value={form.clientName} onChange={e => set("clientName", e.target.value)}/>
      <input placeholder="Product Name" value={form.product} onChange={e => set("product", e.target.value)}/>
      <input placeholder="Stage Code" list="client-form-stage-codes" value={form.stageCode || form.projectCode || form.productCode} onChange={e => setForm(f => ({...f, projectCode:e.target.value, productCode:e.target.value, stage:e.target.value, stageCode:e.target.value}))}/>
      <datalist id="client-form-stage-codes">{[...new Set([...codes, ...stages])].filter(Boolean).sort().map(code=><option key={code} value={code}/>)}</datalist>
      <select value={form.reactorId} onChange={e => {const r=equipment.find(x=>String(x.id)===e.target.value);setForm(f=>({...f,reactorId:e.target.value,site:r?.site||f.site,block:r?.block||f.block,area:r?.area||f.area}));}}><option value="">Select reactor</option>{equipment.map(r=><option key={r.uid} value={r.id}>{r.id} · {r.site}</option>)}</select>
      <input placeholder="Site" value={form.site} onChange={e => set("site", e.target.value)}/>
      <input placeholder="Block" value={form.block} onChange={e => set("block", e.target.value)}/>
      <input placeholder="Area" value={form.area} onChange={e => set("area", e.target.value)}/>
      <input placeholder="Continuous / Campaign" value={form.continuousCampaign} onChange={e => set("continuousCampaign", e.target.value)}/>
      <input placeholder="Timeline" value={form.timeline} onChange={e => set("timeline", e.target.value)}/>
      <select value={form.status} onChange={e => set("status", e.target.value)}><option>Planned</option><option>Confirmed</option><option>High Probable</option><option>Visible</option></select>
      <input placeholder="Linked reactors" value={form.linkedReactors} onChange={e => set("linkedReactors", e.target.value)}/>
      <textarea className="full-span" placeholder="Remarks" value={form.remarks} onChange={e => set("remarks", e.target.value)}/>
    </div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button disabled={busy}>{busy ? "Saving…" : "Add Client Information"}</button></div></form></Modal>}

    {mappingOpen && <Modal title="Create Mapping Tracker Entry" onClose={() => !busy && setMappingOpen(false)}><form onSubmit={submitMapping}><div className="form-grid">
      <label>Available reactor<select required value={mapForm.reactorUid} onChange={e => setMap("reactorUid", e.target.value)}><option value="">Select reactor</option>{availableEquipment.map(r => <option key={r.uid} value={r.uid}>{r.id} · {r.site} · {fmtKL(r.capacity)}</option>)}</select></label>
      <label>Product Name<input required list="client-map-products" value={mapForm.product} placeholder="Select or enter Product Name" onChange={e=>{const product=e.target.value;const family=products.find(p=>p.product===product);if(!family){setMapForm(f=>({...f,product,productCode:"",stage:"",stages:[]}));return;}const code=family.codes?.[0]||"";const cat=catalog.find(c=>c.code===code);const productKey=product.toLowerCase().replace(/[^a-z0-9]/g,"");const stage=cat?.stagesByProduct?.[productKey]?.[0]||family?.stages?.[0]||"";setMapForm(f=>({...f,product,productCode:code,projectCode:code,stage,stages:stage?[stage]:[],stageCode:code}));}}/><datalist id="client-map-products">{products.map(p=><option key={p.product} value={p.product}/>)}</datalist></label>
      <label>Stage Code<input required list="client-map-codes" value={mapForm.productCode || mapForm.stageCode || ""} placeholder="Select or enter Stage Code" onChange={e=>{const code=e.target.value;const cat=catalog.find(c=>c.code===code);const currentProduct=mapForm.product;const codeProducts=cat?.products||[];const product=cat ? (codeProducts.includes(currentProduct)?currentProduct:(cat.product||codeProducts[0]||currentProduct)) : currentProduct;const family=products.find(p=>p.product===product);const productKey=product.toLowerCase().replace(/[^a-z0-9]/g,"");const stage=cat?.stagesByProduct?.[productKey]?.[0]||family?.stages?.[0]||code;setMapForm(f=>({...f,product,productCode:code,projectCode:code,stage,stages:stage?[stage]:[],stageCode:code}));}}/><datalist id="client-map-codes">{[...new Set(availableCodes.filter(Boolean))].map(c=><option key={c} value={c}/>)}</datalist><small className="field-help">One Stage Code field is used throughout ReactorPlan.</small></label>
      
      <label>Probability<select value={mapForm.category} onChange={e => setMap("category", e.target.value)}><option>Confirmed</option><option>High Probable</option><option>Visible</option></select></label>
      <label>Start date<input required type="date" value={mapForm.startDate} onChange={e => setMap("startDate", e.target.value)}/></label>
      <label>End date<input required type="date" value={mapForm.endDate} onChange={e => setMap("endDate", e.target.value)}/></label>
    </div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setMappingOpen(false)}>Cancel</button><button disabled={busy}>{busy ? "Saving…" : "Create mapping"}</button></div></form></Modal>}
  </section>;
}
