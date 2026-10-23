import { useEffect, useMemo, useState } from "react";

export default function MapEquipment({ items = [], renderItem, pageSize = 1, totalEquipment = 0 }) {
  const safeItems = Array.isArray(items) ? items : [];
  const size = Math.max(1, Number(pageSize) || 1);
  const pageCount = Math.max(1, Math.ceil(safeItems.length / size));
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [safeItems.length]);
  const currentPage = Math.min(page, pageCount - 1);
  const visible = useMemo(() => safeItems.slice(currentPage * size, currentPage * size + size), [safeItems, currentPage, size]);
  return <section className="panel map-equipment-panel" aria-label="Map Equipment">
    <div className="panel-title-row">
      <div className="map-equipment-heading">
        <div><h2>Map Equipment</h2><p className="muted">Browse available reactors to create planning assignments. {Number(totalEquipment).toLocaleString()} total reactors in inventory.</p></div>
        <div className="equipment-pager" aria-label="Map Equipment navigation">
          <button type="button" className="carousel-arrow" aria-label="Previous equipment" title="Previous equipment" disabled={currentPage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>←</button>
          <span className="equipment-pager-count" aria-live="polite"><strong>{safeItems.length ? `${currentPage * size + 1}–${Math.min((currentPage + 1) * size, safeItems.length)} of ${safeItems.length} Available` : "0 Available"}</strong><small>{Number(totalEquipment).toLocaleString()} Total Reactors</small></span>
          <button type="button" className="carousel-arrow" aria-label="Next equipment" title="Next equipment" disabled={currentPage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>→</button>
        </div>
      </div>
    </div>
    <div className="map-equipment-content">{visible.map((item, index) => <div key={item.uid || item.id || `${currentPage}-${index}`}>{renderItem ? renderItem(item) : <div><strong>{item.id || item.equipmentId || "Unnamed Equipment"}</strong><span>{item.site || "Unknown"} · {item.status || "Unknown"}</span></div>}</div>)}</div>
  </section>;
}
