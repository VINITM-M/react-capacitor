import { cleanKnownText } from "./unknownUtils";

const norm = value => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const uidOf = row => String(row?.reactorUid ?? row?.uid ?? "").trim();

// The equipment UID is the stable identity. Reactor ID alone is not unique in this workbook.
export const inventoryRecordKey = row => {
  const uid = uidOf(row);
  if (uid) return `uid:${norm(uid)}`;
  const id = String(row?.reactorId ?? row?.reactor ?? row?.equipmentId ?? row?.id ?? "").trim();
  if (!id) return "";
  return `record:${norm(row?.site)}|${norm(id)}|${norm(row?.block)}|${norm(row?.area)}`;
};

export const buildInventoryMetrics = (equipment = [], mappings = [], maintenance = []) => {
  const mappedKeys = new Set();
  (Array.isArray(mappings) ? mappings : []).forEach(row => {
    const key = inventoryRecordKey(row);
    if (key) mappedKeys.add(key);
  });
  const maintenanceKeys = new Set();
  (Array.isArray(maintenance) ? maintenance : []).forEach(row => {
    const status = String(row?.status ?? "").trim().toLowerCase();
    if (["completed", "cancelled"].includes(status)) return;
    const key = inventoryRecordKey(row);
    if (key) maintenanceKeys.add(key);
  });
  const statusFor = row => {
    const key = inventoryRecordKey(row);
    const rawStatus = String(row?.status ?? "").trim().toLowerCase();
    if (maintenanceKeys.has(key) || rawStatus === "maintenance" || rawStatus === "under maintenance") return "Maintenance";
    if (key && mappedKeys.has(key)) return "Mapped";
    // Older/manual records may carry a project assignment before a tracker interval exists.
    if (cleanKnownText(row?.sourceProjectMapped || row?.projectMapped)) return "Mapped";
    return "Available";
  };
  const counts = (Array.isArray(equipment) ? equipment : []).reduce((out, row) => {
    out[statusFor(row)] += 1;
    return out;
  }, { Mapped: 0, Available: 0, Maintenance: 0 });
  return { mappedKeys, maintenanceKeys, statusFor, counts, total: Array.isArray(equipment) ? equipment.length : 0 };
};
