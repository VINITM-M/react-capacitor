const API_BASE = import.meta.env.VITE_API_BASE || "";
/* =========================================================
  COMMON REQUEST FUNCTION
  ========================================================= */
async function request(url, options = {}) {
const response = await fetch(
   `${API_BASE}${url}`,
   {
     ...options,
     headers: {
       "Content-Type": "application/json",
       ...(options.headers || {}),
     },
   }
 );
 if (!response.ok) {
const text =
     await response.text();
   throw new Error(
     text ||
     `Request failed (${response.status})`
   );
 }
 /*
   DELETE requests can return 204.
 */
 if (response.status === 204) {
   return null;
 }
 return response.json();
}
/* =========================================================
  API
  ========================================================= */
export const api = {
 /* =======================================================
    DASHBOARD
    ======================================================= */
 dashboard: () =>
   request(
     "/api/dashboard"
   ),
 importWorkbook: (data) =>
   request("/api/import/workbook", {
     method: "POST",
     body: JSON.stringify(data),
   }),
 uploadWorkbookFile: async (file) => {
   const response = await fetch(`${API_BASE}/api/import/workbook-file`, {
     method: "POST",
     headers: {
       "Content-Type": file.type || "application/octet-stream",
       "X-Workbook-Name": encodeURIComponent(file.name),
     },
     body: file,
   });
   if (!response.ok) throw new Error((await response.text()) || `Upload failed (${response.status})`);
   return response.json();
 },
 sourceWorkbookArrayBuffer: async () => {
   const response = await fetch(`${API_BASE}/api/download/source-workbook`);
   if (!response.ok) throw new Error((await response.text()) || `Request failed (${response.status})`);
   return response.arrayBuffer();
 },
 downloadSourceWorkbook: async () => {
   const response = await fetch(`${API_BASE}/api/download/source-workbook`);
   if (!response.ok) throw new Error((await response.text()) || `Request failed (${response.status})`);
   const blob = await response.blob();
   const url = URL.createObjectURL(blob);
   const link = document.createElement("a");
   link.href = url;
   link.download = "ReactorPlan-Source-Workbook.xlsx";
   document.body.appendChild(link);
   link.click();
   link.remove();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
   return true;
 },
 /* =======================================================
    EQUIPMENT / REACTORS
    ======================================================= */
 equipment: () =>
   request(
     "/api/equipment"
   ),
 reactors: () =>
   request(
     "/api/reactors"
   ),
 /* =======================================================
    CAPACITY
    ======================================================= */
 capacity: () =>
   request(
     "/api/capacity"
   ),
 /* =======================================================
    SUMMARY
    ======================================================= */
 summary: () =>
   request(
     "/api/summary"
   ),
 /* =======================================================
    MAPPINGS
    ======================================================= */
 mappings: () =>
   request(
     "/api/mappings"
   ),
 mappingOptions: () =>
   request("/api/mapping-options"),
 /* =======================================================
    MAINTENANCE
    ======================================================= */
 maintenance: () =>
   request(
     "/api/maintenance"
   ),
 clientInformation: () => request("/api/client-information"),
 createClientInformation: (data) => request("/api/client-information", { method: "POST", body: JSON.stringify(data) }),
 importClientInformation: (rows) => request("/api/client-information/import", { method: "POST", body: JSON.stringify({ rows }) }),
 /* =======================================================
    AUDIT
    ======================================================= */
 audit: () =>
   request(
     "/api/audit"
   ),
 auditLogs: () =>
   request(
     "/api/audit-logs"
   ),
 /* =======================================================
    CREATE EQUIPMENT
    ======================================================= */
 createEquipment: (data) =>
   request(
     "/api/equipment",
     {
       method: "POST",
       body:
         JSON.stringify(data),
     }
   ),
 /* =======================================================
    UPDATE EQUIPMENT
    IMPORTANT:
    Uses UID instead of reactor ID because the imported
    workbook contains duplicate reactor IDs.
    ======================================================= */
 updateEquipment: (uid, data) =>
   request(
     `/api/equipment/${encodeURIComponent(uid)}`,
     {
       method: "PUT",
       body:
         JSON.stringify(data),
     }
   ),
 /* =======================================================
    DELETE EQUIPMENT
    Uses UID.
    ======================================================= */
 deleteEquipment: (uid) =>
   request(
     `/api/equipment/${encodeURIComponent(uid)}`,
     {
       method: "DELETE",
     }
   ),
   undoDeleteEquipment: () =>
 request(
   "/api/equipment/undo-delete",
   {
     method: "POST"
   }
 ),
 /* =======================================================
    AVAILABILITY
    ======================================================= */
 availability: (params = {}) => {
const query =
     new URLSearchParams();
   Object.entries(params)
     .forEach(
       ([key, value]) => {
         if (
           value !== undefined &&
           value !== null
         ) {
           query.set(
             key,
             value
           );
         }
       }
     );
   return request(
     `/api/availability?${query.toString()}`
   );
 },
 assistantRecommendation: (payload) => request("/api/assistant/recommendation", { method: "POST", body: JSON.stringify(payload) }),
  /* =======================================================
    CREATE MAPPING
    ======================================================= */
 createMapping: (data) =>
   request(
     "/api/mappings",
     {
       method: "POST",
       body:
         JSON.stringify(data),
     }
   ),
 /* =======================================================
    UPDATE MAPPING
    ======================================================= */
 updateMapping: (id, data) =>
   request(
     `/api/mappings/${encodeURIComponent(id)}`,
     {
       method: "PUT",
       body: JSON.stringify(data),
     }
   ),
 /* =======================================================
    DELETE MAPPING
    ======================================================= */
 deleteMapping: (id) =>
   request(
     `/api/mappings/${encodeURIComponent(id)}`,
     {
       method: "DELETE",
     }
   ),
 /* =======================================================
    CREATE MAINTENANCE
    ======================================================= */
 createMaintenance: (data) =>
   request(
     "/api/maintenance",
     {
       method: "POST",
       body:
         JSON.stringify(data),
     }
   ),
 updateMaintenance: (id, data) =>
   request(`/api/maintenance/${encodeURIComponent(id)}`, {
     method: "PUT",
     body: JSON.stringify(data),
   }),
 deleteMaintenance: (id) =>
   request(`/api/maintenance/${encodeURIComponent(id)}`, {
     method: "DELETE",
   }),
};
/* =========================================================
  OPTIONAL DEFAULT EXPORT
  ========================================================= */
export default api;