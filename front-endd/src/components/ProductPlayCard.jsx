import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { cleanKnownText, resolveStageCode } from "../utils/unknownUtils";
import { buildInventoryMetrics } from "../utils/inventoryMetrics";

const clean = value => cleanKnownText(value);
const key = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const fmtKL = value => value === undefined || value === null || value === "" ? "Unknown" : `${(Number(value) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} kL`;
const PRODUCT_PAGE_SIZE = 6;
const stageDisplay = row => { const stage = resolveStageCode(row); return stage !== "Unknown" ? stage : clean(row?.productCode || row?.projectCode) || "Unknown"; };

function productMatches(row, product) {
  const rowCode = key(row.productCode || row.projectCode || row.stageCode || row.stage);
  const rowName = key(row.product);
  const wantedCodes = [...(Array.isArray(product.stageCodes) ? product.stageCodes : []), product.code].map(key).filter(Boolean);
  const wantedName = key(product.name);
  const nameMatches = Boolean(wantedName && rowName === wantedName);
  const codeMatches = Boolean(rowCode && wantedCodes.includes(rowCode));
  if (nameMatches) return !wantedCodes.length || !rowCode || codeMatches;
  return codeMatches && (!wantedName || !rowName || wantedName === rowName);
}

export default function ProductPlayCard({ mappedCount = 0, date = "Unknown", productCount = 0, products = [], mappings = [], clientInformation = [], equipment = [], confidenceCards = [] }) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [productPage, setProductPage] = useState(0);
  const inventoryMetrics = useMemo(() => buildInventoryMetrics(equipment, mappings), [equipment, mappings]);
  useEffect(() => {
    setProductPage(current => Math.min(current, Math.max(0, Math.ceil(products.length / PRODUCT_PAGE_SIZE) - 1)));
  }, [products.length]);
  const productPageCount = Math.max(1, Math.ceil(products.length / PRODUCT_PAGE_SIZE));
  const visibleProducts = products.slice(productPage * PRODUCT_PAGE_SIZE, (productPage + 1) * PRODUCT_PAGE_SIZE);

  const detail = useMemo(() => {
    if (!selectedProduct) return null;
    const matchingMappings = mappings.filter(row => productMatches(row, selectedProduct));
    const ids = new Set(matchingMappings.map(row => key(row.reactorId)).filter(Boolean));
    const siteReactorKeys = new Set(matchingMappings.map(row => `${key(row.site)}|${key(row.reactorId)}`).filter(value => !value.endsWith("|")));
    const codes = new Set([selectedProduct.code, ...(selectedProduct.stageCodes || []), ...matchingMappings.map(row => row.productCode), ...matchingMappings.map(row => row.projectCode)].map(key).filter(Boolean));
    const matchingClients = clientInformation.filter(row => {
      const clientCodes = [row.productCode, row.projectCode, ...(Array.isArray(row.projectCodes) ? row.projectCodes : [])].map(key).filter(Boolean);
      const nameMatches = key(row.product) && key(row.product) === key(selectedProduct.name);
      const codeMatches = clientCodes.some(code => codes.has(code));
      const reactorMatches = key(row.reactorId) && ids.has(key(row.reactorId));
      return codeMatches || (nameMatches && (!selectedProduct.code || clientCodes.length === 0 || codeMatches)) || reactorMatches;
    });
    const matchingEquipment = equipment.filter(row => {
      const reactorId = key(row.id || row.equipmentId);
      const siteReactorKey = `${key(row.site)}|${reactorId}`;
      const linked = siteReactorKeys.has(siteReactorKey) || (!key(row.site) && ids.has(reactorId)) || matchingMappings.some(m => key(m.reactorUid) && key(m.reactorUid) === key(row.uid));
      const productSame = key(row.product) === key(selectedProduct.name) || key(row.projectMapped) === key(selectedProduct.name);
      const codeSame = [row.projectCode, row.productCode, row.stageCode, row.stage].some(code => codes.has(key(code)));
      return linked || productSame || (selectedProduct.code && codeSame);
    }).map(row => ({ ...row, _inventoryStatus: inventoryMetrics.statusFor(row) }));
    return { matchingMappings, matchingClients, matchingEquipment };
  }, [selectedProduct, mappings, clientInformation, equipment, inventoryMetrics]);

  const q = key(detailSearch);
  const visibleMappings = (detail?.matchingMappings || []).filter(row => !q || key([
    row.reactorId, row.reactorUid, row.site, row.block, row.product, row.productCode,
    row.projectCode, row.stageCode, row.category, row.startDate, row.endDate,
  ].join(" ")).includes(q));
  const visibleClients = (detail?.matchingClients || []).filter(row => !q || key([
    row.clientName, row.site, row.product, row.projectCode, row.productCode,
    row.stageCode, row.reactorId, row.linkedReactors, row.status, row.remarks,
  ].join(" ")).includes(q));
  const visibleEquipment = (detail?.matchingEquipment || []).filter(row => !q || key([
    row.id, row.equipmentId, row.site, row.block, row.area, row._inventoryStatus, row.status, row.moc,
    row.agitator, row.clientName, row.product, row.projectMapped, row.stageCode,
  ].join(" ")).includes(q));

  return (
    <section className="panel product-play-card" aria-label="Product Information">
      <div className="panel-title-row product-information-title-row">
        <div><h2>Product Information</h2><p className="muted">Browse Product Names and open a card to review related clients, reactor assignments, sites, and planning dates.</p></div>
        <div className="product-information-pager" aria-label="Product Information navigation">
          <button type="button" className="carousel-arrow" aria-label="Previous Product Information page" title="Previous products" disabled={productPage === 0} onClick={() => setProductPage(page => Math.max(0, page - 1))}>←</button>
          <span aria-live="polite">{products.length ? `${productPage * PRODUCT_PAGE_SIZE + 1}–${Math.min((productPage + 1) * PRODUCT_PAGE_SIZE, products.length)} of ${products.length}` : "0 Product Names"}</span>
          <button type="button" className="carousel-arrow" aria-label="Next Product Information page" title="Next products" disabled={productPage >= productPageCount - 1 || !products.length} onClick={() => setProductPage(page => Math.min(productPageCount - 1, page + 1))}>→</button>
        </div>
      </div>
      <div className="product-play-metrics">
        <div><span>Mapped Reactors</span><strong>{Number(mappedCount || 0).toLocaleString()}</strong></div>
        <div><span>Mapped Product Names</span><strong>{Number(productCount || 0).toLocaleString()}</strong></div>
        <div><span>Latest Planning Date</span><strong>{date || "Unknown"}</strong></div>
      </div>
      <div className="product-confidence-cards" aria-label="Planning confidence summary">
        {confidenceCards.map(item => <div key={item.category} className={`product-confidence-card ${String(item.category).toLowerCase().replace(/[^a-z]+/g, "-")}`}>
          <span>{item.category}</span>
          <strong>{Number(item.reactorCount || 0).toLocaleString()}</strong>
          <small>Reactors</small>
        </div>)}
      </div>
      {products.length > 0 ? <div className="product-information-grid">
        {visibleProducts.map(product => <button type="button" className="product-information-item product-information-button" key={`${product.name}-${product.code}`} onClick={() => { setSelectedProduct(product); setDetailSearch(""); }} aria-label={`View details for ${product.name || "Unknown"}`}>
          <strong>{product.name || "Unknown"}</strong>
          <span>{`Stage Code: ${(product.stageCodes || []).join(", ") || product.stageCode || product.code || "Unknown"}`}</span>
          <div><span>{product.reactors} Reactors</span><span>{product.sites?.length || 0} Sites</span><span>{product.clients?.length || 0} Clients</span></div>
          <span className="product-card-open-link">View client & reactor details →</span>
        </button>)}
      </div> : <p className="muted">No Product Name-to-reactor associations match the current filters.</p>}

      {selectedProduct && detail && <Modal title={`${selectedProduct.name || "Unknown"} — Product Information`} onClose={() => setSelectedProduct(null)} className="product-detail-modal">
        <div className="product-detail-summary">
          <div><span>Stage Code</span><strong>{(selectedProduct.stageCodes || []).join(", ") || selectedProduct.stageCode || selectedProduct.code || "Unknown"}</strong></div>
          <div><span>Planning Intervals</span><strong>{detail.matchingMappings.length.toLocaleString()}</strong></div>
          <div><span>Distinct Reactors</span><strong>{new Set(detail.matchingMappings.map(row => key(row.reactorUid) || `${key(row.site)}|${key(row.reactorId)}|${key(row.block)}|${key(row.area)}`).filter(value => !value.endsWith("|"))).size.toLocaleString()}</strong></div>
          <div><span>Client Records</span><strong>{detail.matchingClients.length.toLocaleString()}</strong></div>
        </div>
        <div className="dashboard-detail-toolbar">
          <input type="search" value={detailSearch} onChange={e => setDetailSearch(e.target.value)} placeholder="Search client, reactor, site, Product Name, Stage Code or status…" aria-label="Search product information details" />
        </div>
        <div className="dashboard-detail-section-heading"><h3>Client Information</h3><span>{visibleClients.length.toLocaleString()} record(s)</span></div>
        {visibleClients.length ? <div className="table-scroll"><table><thead><tr><th>Client Name</th><th>Site</th><th>Product Name</th><th>Stage Code</th><th>Reactor ID(s)</th><th>Status</th><th>Planning Category</th></tr></thead><tbody>
          {visibleClients.map((row, i) => <tr key={`${row.id || "client"}-${i}`}><td><strong>{row.clientName || "Unknown"}</strong></td><td>{row.site || "Unknown"}</td><td>{row.product || "Unknown"}</td><td>{stageDisplay(row)}</td><td>{[row.reactorId, row.linkedReactors].filter(Boolean).join(", ") || "Unknown"}</td><td>{row.status || "Unknown"}</td><td>{row.category || row.planningStatus || "Unknown"}</td></tr>)}
        </tbody></table></div> : <p className="muted">No client details are linked to this Product Name. Related planning and inventory details are shown below.</p>}

        <div className="dashboard-detail-section-heading"><h3>Reactor Mapping &amp; Planning</h3><span>{visibleMappings.length.toLocaleString()} Planning Interval(s)</span></div>
        <div className="table-scroll"><table><thead><tr><th>Reactor ID</th><th>Site</th><th>Block</th><th>Capacity</th><th>Product Name</th><th>Stage Code</th><th>Planning Category</th><th>Start</th><th>End</th></tr></thead><tbody>
          {visibleMappings.map((row, i) => <tr key={`${row.id || "mapping"}-${i}`}><td><strong>{row.reactorId || "Unknown"}</strong></td><td>{row.site || "Unknown"}</td><td>{row.block || "Unknown"}</td><td>{fmtKL(row.capacity)}</td><td>{row.product || "Unknown"}</td><td>{resolveStageCode(row)}</td><td>{row.category || "Unknown"}</td><td>{row.startDate || "Unknown"}</td><td>{row.endDate || "Unknown"}</td></tr>)}
        </tbody></table></div>

        <div className="dashboard-detail-section-heading"><h3>Related Reactor Inventory</h3><span>{visibleEquipment.length.toLocaleString()} record(s)</span></div>
        <div className="table-scroll"><table><thead><tr><th>Reactor ID</th><th>Site</th><th>Block</th><th>Capacity (kL)</th><th>MOC</th><th>Agitator</th><th>Inventory Status</th><th>Client</th></tr></thead><tbody>
          {visibleEquipment.map((row, i) => <tr key={`${row.uid || row.id || "equipment"}-${i}`}><td><strong>{row.id || row.equipmentId || "Unknown"}</strong></td><td>{row.site || "Unknown"}</td><td>{row.block || "Unknown"}</td><td>{fmtKL(row.capacity)}</td><td>{row.moc || "Unknown"}</td><td>{row.agitator || "Unknown"}</td><td>{row._inventoryStatus || "Unknown"}</td><td>{row.clientName || "Unknown"}</td></tr>)}
        </tbody></table></div>
      </Modal>}
    </section>
  );
}
