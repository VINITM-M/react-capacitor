import {
 useCallback,
 useEffect,
 useMemo,
 useState,
 useRef,
} from "react";
import Layout from "./components/Layout";
import { api } from "./api";
import { matchesSearch } from "./utils/searchUtils";
import { normalizeDashMarkers, cleanKnownText } from "./utils/unknownUtils";
import Dashboard from "./pages/Dashboard";
import Reactors from "./pages/Reactors";
import Availability from "./pages/Availability";
import Calendar from "./pages/Calendar";
import Analytics from "./pages/Analytics";
import Capacity from "./pages/Capacity";
import Site from "./pages/Site";
import Admin from "./pages/Admin";
import DownloadCenter from "./pages/DownloadCenter";
import ClientInformation from "./pages/ClientInformation";
/* =========================================================
  EMPTY APPLICATION DATA
========================================================= */
const EMPTY = {
 dashboard: {},
 equipment: [],
 capacity: [],
 siteTotals: [],
 summary: [],
 mappings: [],
 maintenance: [],
 clientInformation: [],
 audit: [],
  mappingOptions: { products: [], productCodes: [], stages: [], catalog: [] },
  capacityTotals: { total: 0, utilization: 0, mapped: 0, available: 0 },
};
/* =========================================================
  SEARCH HELPERS
========================================================= */
const norm = (value) =>
 cleanKnownText(value).toLowerCase();
const searchText = (value) =>
 norm(value).replace(/[^a-z0-9]+/g, " ");
const sameSite = (a, b) => searchText(a) === searchText(b);
/* =========================================================
  APP
========================================================= */
export default function App() {
 /* =======================================================
    PAGE
 ======================================================= */
 const [page, setPage] = useState("dashboard");
 /* =======================================================
    APPLICATION DATA
 ======================================================= */
 const [data, setData] = useState(EMPTY);
 /* =======================================================
    AVAILABILITY SEARCH RESULTS
 ======================================================= */
 const [availability, setAvailability] = useState([]);
 /* =======================================================
    GLOBAL SEARCH
 ======================================================= */
 const [search, setSearch] = useState("");
 /* =======================================================
    LOADING
 ======================================================= */
 const [loading, setLoading] = useState(true);
 /* =======================================================
    ERROR
 ======================================================= */
 const [error, setError] = useState("");
 const [lastUpdated, setLastUpdated] = useState(null);
 const [refreshing, setRefreshing] = useState(false);
 const loadInFlight = useRef(false);
 /* =======================================================
    LOAD ALL DATA
 ======================================================= */
 const loadAll = useCallback(
   async (showLoader = false) => {
     if (loadInFlight.current) return;
     loadInFlight.current = true;
     try {
       if (showLoader) {
         setLoading(true);
       }
       setError("");
       const [
         dashboard,
         equipment,
         capacity,
         summary,
         mappings,
         maintenance,
         clientInformation,
         audit,
         mappingOptions,
       ] = await Promise.all([
         api.dashboard(),
         api.equipment(),
         api.capacity(),
         api.summary(),
         api.mappings(),
         api.maintenance(),
         api.clientInformation(),
         api.audit(),
         api.mappingOptions(),
       ]);
       setData(normalizeDashMarkers({
         dashboard: dashboard || {},
         equipment: Array.isArray(equipment) ? equipment : [],
         capacity: Array.isArray(capacity?.rows) ? capacity.rows : [],
         siteTotals: Array.isArray(capacity?.siteTotals)
           ? capacity.siteTotals
           : Array.isArray(dashboard?.siteTotals) ? dashboard.siteTotals : [],
         summary: summary || [],
         mappings: Array.isArray(mappings) ? mappings : [],
         maintenance: Array.isArray(maintenance) ? maintenance : [],
         clientInformation: Array.isArray(clientInformation) ? clientInformation : [],
         audit: Array.isArray(audit) ? audit : [],
         mappingOptions: mappingOptions || EMPTY.mappingOptions,
         capacityTotals: capacity?.totals || EMPTY.capacityTotals,
       }));
       setLastUpdated(new Date());
     } catch (e) {
       console.error(
         "Failed to load ReactorPlan data:",
         e
       );
       setError(
         e.message ||
           "Could not connect to the backend."
       );
     } finally {
       setLoading(false);
       loadInFlight.current = false;
     }
   },
   []
 );
 /* =======================================================
    INITIAL LOAD
 ======================================================= */
 useEffect(() => {
   loadAll(true);
 }, [loadAll]);
 /* =======================================================
    MANUAL REFRESH
    The workbook-backed database refreshes only on request or after imports.
 ======================================================= */
 const manualRefresh = useCallback(async () => {
   if (loadInFlight.current) return;
   setRefreshing(true);
   try { await loadAll(false); }
   finally { setRefreshing(false); }
 }, [loadAll]);
 /* =======================================================
    MUTATION HELPER
 ======================================================= */
 const mutate = useCallback(
   async (fn) => {
     // Return the API result so pages can immediately render the saved record.
     const result = await fn();
     await loadAll(false);
     return result;
   },
   [loadAll]
 );
 /* =======================================================
    AVAILABILITY SEARCH
 ======================================================= */
 const searchAvailability = useCallback((filters = {}) => {
   try {
     setError("");

     const min = filters.minCapacity === "" || filters.minCapacity == null
       ? null
       : Number(filters.minCapacity);
     const max = filters.maxCapacity === "" || filters.maxCapacity == null
       ? null
       : Number(filters.maxCapacity);
     const site = norm(filters.site || "All");
     const moc = norm(filters.moc || "All");
     const agitator = norm(filters.agitator || "All");

     const results = data.equipment.filter((reactor) => {
       const status = norm(reactor.status);
       if (status !== "available") return false;
       if (norm(reactor.projectMapped)) return false;

       const capacity = Number(reactor.capacity || 0);
       if (min !== null && Number.isFinite(min) && capacity < min) return false;
       if (max !== null && Number.isFinite(max) && capacity > max) return false;
       if (site !== "all" && !sameSite(reactor.site, filters.site)) return false;
       if (moc !== "all" && !norm(reactor.moc).includes(moc)) return false;
       if (agitator !== "all" && !norm(reactor.agitator).includes(agitator)) return false;
       return true;
     });

     setAvailability(results);
   } catch (e) {
     console.error("Availability search error:", e);
     setAvailability([]);
     setError(e.message || "Could not search available reactors.");
   }
 }, [data.equipment]);
 /* =======================================================
    GLOBAL SEARCH
    SUPPORTED OPERATIONS:
    available reactors
    all available reactors
    mapped reactors
    maintenance reactors
    available CTO-3
    mapped CTO-6
    CTO-5 reactors
    reactors above 5000 L
    reactors below 1000 L
    5000 L reactors
    Also searches:
    Reactors
    Mappings
    Capacity
    Maintenance
    Audit
    Sites
 ======================================================= */
 const searchResults = useMemo(() => {
   const raw = norm(search);
   if (!raw) {
     return [];
   }
   const q = searchText(raw);
   const results = [];
   const seen = new Set();
   const add = (result) => {
     if (!result || !result.key) {
       return;
     }
     if (seen.has(result.key)) {
       return;
     }
     seen.add(result.key);
     results.push(result);
   };
   /* =====================================================
      STATUS DETECTION
   ===================================================== */
   let status = null;
   if (
     raw.includes("available") ||
     raw.includes("free")
   ) {
     status = "Available";
   } else if (
     raw.includes("mapped") ||
     raw.includes("assigned")
   ) {
     status = "Mapped";
   } else if (
     raw.includes("maintenance") ||
     raw.includes("maint")
   ) {
     status = "Maintenance";
   }
   /* =====================================================
      SITE DETECTION
   ===================================================== */
   const sites = [
     "CTO-2",
     "CTO-3",
     "CTO-5",
     "CTO-6",
     "CTO-SEZ",
     "Mexico",
     "Mirfield",
   ];
   const matchedSite = sites.find(
     (site) => searchText(raw).includes(searchText(site))
   );
   const matchedReactors = data.equipment.filter((reactor) => {
     const id = searchText(reactor.id);
     return id && (id === q || id.includes(q) || q.includes(id));
   });
   /* =====================================================
      CAPACITY DETECTION
   ===================================================== */
   const aboveMatch = raw.match(
     /(?:above|over|greater than|more than)\s*(\d+(?:\.\d+)?)\s*(l|litres?|kl)?/
   );
   const belowMatch = raw.match(
     /(?:below|under|less than|smaller than)\s*(\d+(?:\.\d+)?)\s*(l|litres?|kl)?/
   );
   const exactCapacityMatch = raw.match(
     /(\d+(?:\.\d+)?)\s*(l|litres?|kl)\b/
   );
   const capacityValueInLitres = (match) => {
     if (!match) return null;
     const value = Number(match[1]);
     const unit = String(match[2] || "L").toLowerCase();
     return unit === "kl" ? value * 1000 : value;
   };
   const aboveCapacity = aboveMatch ? capacityValueInLitres(aboveMatch) : null;
   const belowCapacity = belowMatch ? capacityValueInLitres(belowMatch) : null;
   const exactCapacity = exactCapacityMatch ? capacityValueInLitres(exactCapacityMatch) : null;
   /* =====================================================
      DETERMINE IF THIS IS A REACTOR OPERATION
   ===================================================== */
   const reactorSearchRequested =
     raw.includes("reactor") ||
     raw.includes("reactors") ||
     matchedReactors.length > 0 ||
     status !== null ||
     matchedSite != null ||
     aboveCapacity !== null ||
     belowCapacity !== null ||
     exactCapacity !== null;
   /* =====================================================
      REACTOR OPERATION SEARCH
   ===================================================== */
   if (reactorSearchRequested) {
     let reactors = [
       ...data.equipment,
     ];
     /* STATUS */
     if (status) {
       reactors = reactors.filter((reactor) => {
         const currentStatus = norm(reactor.status);
         if (status === "Available") return ["available", "available now", "physically available", "ready to map"].includes(currentStatus);
         if (status === "Mapped") return ["mapped", "assigned", "reserved"].includes(currentStatus) || Boolean(norm(reactor.projectMapped));
         if (status === "Maintenance") return currentStatus.includes("maintenance");
         return currentStatus === norm(status);
       });
     }
     /* SITE */
     if (matchedSite) {
       reactors = reactors.filter(
         (reactor) =>
           norm(reactor.site) ===
           norm(matchedSite)
       );
     }
     /* ABOVE CAPACITY */
     if (aboveCapacity !== null) {
       reactors = reactors.filter(
         (reactor) =>
           Number(
             reactor.capacity || 0
           ) > aboveCapacity
       );
     }
     /* BELOW CAPACITY */
     if (belowCapacity !== null) {
       reactors = reactors.filter(
         (reactor) =>
           Number(
             reactor.capacity || 0
           ) < belowCapacity
       );
     }
     /* EXACT REACTOR ID */
     if (matchedReactors.length > 0) {
       const ids = new Set(matchedReactors.map((reactor) => reactor.uid));
       reactors = reactors.filter((reactor) => ids.has(reactor.uid));
     }
     /* EXACT CAPACITY */
     if (
       exactCapacity !== null &&
       aboveCapacity === null &&
       belowCapacity === null
     ) {
       reactors = reactors.filter(
         (reactor) =>
           Number(
             reactor.capacity || 0
           ) === exactCapacity
       );
     }
     /* ===================================================
        SHOW OPERATION RESULTS
     =================================================== */
     if (
       status ||
       matchedSite ||
       matchedReactors.length > 0 ||
       aboveCapacity !== null ||
       belowCapacity !== null ||
       exactCapacity !== null
     ) {
       const operationName = [
         status,
         matchedSite,
         aboveCapacity !== null
           ? `>${aboveCapacity / 1000} kL`
           : null,
         belowCapacity !== null
           ? `<${belowCapacity / 1000} kL`
           : null,
         exactCapacity !== null &&
         aboveCapacity === null &&
         belowCapacity === null
           ? `${exactCapacity / 1000} kL`
           : null,
       ]
         .filter(Boolean)
         .join(" · ");
       /* SUMMARY RESULT */
       add({
         key: `operation-${operationName}`,
         type: "Operation",
         title: `${reactors.length} Reactors Found`,
         subtitle:
           operationName ||
           "Matching reactor search",
         page: "reactors",
       });
       /* REACTOR RESULTS */
       reactors.forEach(
         (reactor) => {
           add({
             key:
               `reactor-operation-${reactor.uid}`,
             type: "Reactor",
             title:
reactor.id,
             subtitle:
               `${reactor.site || "No site"} · ` +
               `${reactor.capacity ? (Number(reactor.capacity) / 1000).toLocaleString(undefined,{maximumFractionDigits:3}) : "Unknown"} kL · ` +
               `${reactor.status || "Available"}`,
             page: "reactors",
           });
         }
       );
       return results.slice(
         0,
         200
       );
     }
   }
   /* =====================================================
      PAGE / OPERATION SEARCH
   ===================================================== */
   const pages = [
     [
       "dashboard",
       "Dashboard",
       "Operations dashboard",
     ],
     [
       "reactors",
       "Reactor Master",
       "Equipment and reactor inventory",
     ],
     [
       "availability",
       "Availability",
       "Available reactor search and equipment mapping",
     ],
     [
       "calendar",
       "Planning Calendar",
       "Project and reactor schedule",
     ],
     [
       "analytics",
       "Analytics",
       "Operational analytics",
     ],
     [
       "client-information",
       "Client Information",
       "Client, project and mapping tracker records",
     ],
     [
       "downloads",
       "Download Center",
       "Custom operational exports",
     ],
     [
       "capacity",
       "Capacity Summary",
       "Site and block capacity",
     ],
     [
       "admin",
       "Admin",
       "Maintenance and audit",
     ],
     [
       "site:CTO-2",
       "CTO-2",
       "Site dashboard",
     ],
     [
       "site:CTO-3",
       "CTO-3",
       "Site dashboard",
     ],
     [
       "site:CTO-5",
       "CTO-5",
       "Site dashboard",
     ],
     [
       "site:CTO-6",
       "CTO-6",
       "Site dashboard",
     ],
     [
       "site:CTO-SEZ",
       "CTO-SEZ",
       "Site dashboard",
     ],
     [
       "site:Mexico",
       "Mexico",
       "Site dashboard",
     ],
     [
       "site:Mirfield",
       "Mirfield",
       "Site dashboard",
     ],
   ];
   pages.forEach(
     ([id, title, subtitle]) => {
       const pageText =
         searchText(
           `${title} ${subtitle}`
         );
       if (
         matchesSearch(pageText, raw) ||
         matchesSearch(title, raw)
       ) {
         add({
           key: `page-${id}`,
           type: "Page",
           title,
           subtitle,
           page: id,
         });
       }
     }
   );
   /* =====================================================
      NORMAL REACTOR TEXT SEARCH
   ===================================================== */
   data.equipment.forEach(
     (reactor) => {
       const text =
         searchText(
           Object.entries(reactor)
             .map(([, value]) => String(value ?? ""))
             .join(" ")
         );
       if (!matchesSearch(text, raw)) {
         return;
       }
       add({
         key:
           `equipment-${reactor.uid}`,
         type: "Reactor",
         title:
reactor.id,
         subtitle:
           `${reactor.site || "No site"} · ` +
           `${reactor.capacity ? (Number(reactor.capacity) / 1000).toLocaleString(undefined,{maximumFractionDigits:3}) : "Unknown"} kL · ` +
           `${reactor.status || "Available"}`,
         page: "reactors",
       });
     }
   );
   /* =====================================================
      PROJECT MAPPINGS
   ===================================================== */
   data.mappings.forEach(
     (mapping, index) => {
       const text =
         searchText(
           Object.values(mapping)
             .map((value) =>
               String(value ?? "")
             )
             .join(" ")
         );
       if (!matchesSearch(text, raw)) {
         return;
       }
       add({
         key:
           `mapping-${index}-${mapping.id}`,
         type:
           "Equipment Mapping",
         title:
           mapping.product ||
mapping.id,
         subtitle:
           `${mapping.reactorId || "Unassigned"} · ` +
           `${mapping.category || "Mapping"}`,
         page: "availability",
       });
     }
   );
   /* =====================================================
      CAPACITY
   ===================================================== */
   data.capacity.forEach(
     (row, index) => {
       const text =
         searchText(
           Object.values(row)
             .map((value) =>
               String(value ?? "")
             )
             .join(" ")
         );
       if (!matchesSearch(text, raw)) {
         return;
       }
       add({
         key:
           `capacity-${index}`,
         type:
           "Capacity",
         title:
           `${row.site || "Unknown"} · ` +
           `${row.block || "Block"}`,
         subtitle:
           `${row.area || ""} · ` +
           `${row.totalCapacity ?? 0} KL total`,
         page: "capacity",
       });
     }
   );
   /* =====================================================
      MAINTENANCE
   ===================================================== */
   data.maintenance.forEach(
     (item, index) => {
       const text =
         searchText(
           Object.values(item)
             .map((value) =>
               String(value ?? "")
             )
             .join(" ")
         );
       if (!matchesSearch(text, raw)) {
         return;
       }
       add({
         key:
           `maintenance-${index}-${item.id}`,
         type:
           "Maintenance",
         title:
           item.reactorId ||
item.id,
         subtitle:
           `${item.action || "Maintenance"} · ` +
           `${item.status || ""}`,
         page: "admin",
       });
     }
   );
   /* =====================================================
      CLIENT / PROJECT SEARCH
   ===================================================== */
   data.clientInformation.forEach((client, index) => {
     const text = searchText(Object.values(client).map(value => String(value ?? "")).join(" "));
     if (!matchesSearch(text, raw)) return;
     add({ key:`client-${index}-${client.id || "row"}`, type:"Client / Project", title:client.clientName || client.product || client.projectCode || "Client record", subtitle:`${client.projectCode || client.product || ""} · ${client.reactorId || client.site || ""}`, page:"client-information" });
   });
   /* =====================================================
      AUDIT
   ===================================================== */
   data.audit.forEach(
     (item, index) => {
       const text =
         searchText(
           Object.values(item)
             .map((value) =>
               String(value ?? "")
             )
             .join(" ")
         );
       if (!matchesSearch(text, raw)) {
         return;
       }
       add({
         key:
           `audit-${index}-${item.id}`,
         type:
           "Audit",
         title:
           item.action ||
item.id,
         subtitle:
           item.user ||
           "System",
         page: "admin",
       });
     }
   );
   /* =====================================================
      FINAL RESULTS
   ===================================================== */
   return results.slice(
     0,
     200
   );
 }, [search, data]);
 /* =======================================================
    SITE PAGE
 ======================================================= */
 const siteName =
   page.startsWith("site:")
     ? page.slice(5)
     : "";
 /* =======================================================
    PAGE CONTENT
 ======================================================= */
 const content = useMemo(() => {
   if (
     loading &&
     !data.equipment.length
   ) {
     return null;
   }
   switch (page) {
     /* =================================================
        DASHBOARD
     ================================================= */
     case "dashboard":
       return (
<Dashboard
           data={data}
           mappings={
             data.mappings
           }
           audit={
             data.audit
           }
           onNavigate={
             (target) => setPage(target)
           }
         />
       );
     /* =================================================
        REACTORS
     ================================================= */
     case "reactors":
       return (
<Reactors
           equipment={
             data.equipment
           }
           mappings={data.mappings}
           clientInformation={data.clientInformation}
           globalSearch={
             search
           }
           onCreate={
             (newData) =>
               mutate(() =>
                 api.createEquipment(
                   newData
                 )
               )
           }
           onUpdate={
             (uid, updatedData) =>
               mutate(() =>
                 api.updateEquipment(
                   uid,
                   updatedData
                 )
               )
           }
           onDelete={
             async (uid) => {
               const reactor =
                 data.equipment.find(
                   (x) =>
                     x.uid === uid
                 );
               if (
                 confirm(
                   `Delete reactor ${
                     reactor?.id ||
                     uid
                   }?`
                 )
               ) {
                 await mutate(() =>
                   api.deleteEquipment(
                     uid
                   )
                 );
               }
             }
           }
         />
       );
     /* =================================================
        AVAILABILITY
     ================================================= */
     case "availability":
       return (
<Availability
           mappings={data.mappings}
           equipment={data.equipment}
           mappingOptions={data.mappingOptions}
           maintenance={data.maintenance}
           globalSearch={search}
           results={availability}
           onSearch={searchAvailability}
           onCreateMapping={(mappingData) => mutate(() => api.createMapping(mappingData))}
           onUpdateMapping={(mappingData) => mutate(() => api.updateMapping(mappingData.id, mappingData))}
           onDeleteMapping={async (mappingId) => {
             const mapping = data.mappings.find((m) => String(m.id) === String(mappingId));
             if (!mapping) return;
             if (!window.confirm(`Delete mapping ${mapping.id} for reactor ${mapping.reactorId || mapping.reactorUid || "selected reactor"}?`)) return;
             await mutate(() => api.deleteMapping(mappingId));
           }}
         />
       );
     /* =================================================
        MAPPING
     ================================================= */

     case "mapping":
     case "equipment-mapping":
       return (
<Availability
           mappings={data.mappings}
           equipment={data.equipment}
           mappingOptions={data.mappingOptions}
           maintenance={data.maintenance}
           globalSearch={search}
           results={availability}
           onSearch={searchAvailability}
           onCreateMapping={(mappingData) => mutate(() => api.createMapping(mappingData))}
           onUpdateMapping={(mappingData) => mutate(() => api.updateMapping(mappingData.id, mappingData))}
           onDeleteMapping={async (mappingId) => {
             const mapping = data.mappings.find((m) => String(m.id) === String(mappingId));
             if (!mapping) return;
             if (!window.confirm(`Delete mapping ${mapping.id} for reactor ${mapping.reactorId || mapping.reactorUid || "selected reactor"}?`)) return;
             await mutate(() => api.deleteMapping(mappingId));
           }}
         />
       );
     /* =================================================
        CALENDAR
     ================================================= */
     case "calendar":
       return (
<Calendar
           mappings={data.mappings}
           equipment={data.equipment}
           mappingOptions={data.mappingOptions}
           onCreateMapping={(mappingData) => mutate(() => api.createMapping(mappingData))}
         />
       );
     /* =================================================
        ANALYTICS
     ================================================= */
     case "analytics":
       return (
<Analytics
           equipment={
             data.equipment
           }
           mappings={
             data.mappings
           }
           capacity={
             data.capacity
           }
           summary={
             data.summary
           }
           maintenance={
             data.maintenance
           }
         />
       );
     /* =================================================
        DOWNLOAD CENTER
     ================================================= */
     case "downloads":
       return <DownloadCenter data={data} preset="reactors" />;
     case "downloads-capacity":
       return <DownloadCenter data={data} preset="capacity" />;
     case "downloads-ctos-all":
       return <DownloadCenter data={data} preset="ctos-all" />;
     case "downloads-cto-CTO-2":
     case "downloads-cto-CTO-3":
     case "downloads-cto-CTO-5":
     case "downloads-cto-CTO-6":
     case "downloads-cto-CTO-SEZ":
     case "downloads-cto-Mexico":
     case "downloads-cto-Mirfield":
       return <DownloadCenter data={data} preset={`cto-${page.replace("downloads-cto-", "")}`} />;
     case "downloads-availability":
       return <DownloadCenter data={data} preset="availability" />;
     case "downloads-mapping":
       return <DownloadCenter data={data} preset="mapping" />;
     case "downloads-report":
       return <DownloadCenter data={data} preset="report" />;
     case "downloads-calendar":
       return <DownloadCenter data={data} preset="calendar" />;
     case "downloads-analytics":
       return <DownloadCenter data={data} preset="analytics" />;
     case "downloads-reactors":
       return <DownloadCenter data={data} preset="reactors" />;
     case "downloads-dashboard":
       return <DownloadCenter data={data} preset="dashboard" />;
     case "downloads-clients":
       return <DownloadCenter data={data} preset="clients" />;
     case "downloads-all":
       return <DownloadCenter data={data} preset="all" />;
     /* =================================================
        CAPACITY
     ================================================= */
     case "capacity":
       return (
<Capacity
           rows={
             data.capacity
           }
           siteTotals={
             data.siteTotals
           }
           totals={data.capacityTotals}
           globalSearch={
             search
           }
           onNavigate={(target)=>setPage(target)}
         />
       );
     case "client-information":
       return <ClientInformation
         rows={data.clientInformation}
         mappings={data.mappings}
         equipment={data.equipment}
         mappingOptions={data.mappingOptions}
         onCreate={(clientData) => mutate(() => api.createClientInformation(clientData))}
         onImport={(rows) => mutate(() => api.importClientInformation(rows))}
         onCreateMapping={(mappingData) => mutate(() => api.createMapping(mappingData))}
       />;
     /* =================================================
        ADMIN
     ================================================= */
     case "admin":
       return (
<Admin
           equipment={data.equipment}
           maintenance={data.maintenance}
           mappings={data.mappings}
           clientInformation={data.clientInformation}
           audit={data.audit}
           onCreate={(maintenanceData) => mutate(() => api.createMaintenance(maintenanceData))}
           onUpdate={(id, maintenanceData) => mutate(() => api.updateMaintenance(id, maintenanceData))}
           onDelete={(id) => mutate(() => api.deleteMaintenance(id))}
         />
       );
     /* =================================================
        SITE
     ================================================= */
     default:
       if (siteName) {
         return (
<Site
             site={
               siteName
             }
             equipment={
               data.equipment
             }
             capacityRows={
               data.capacity
             }
             mappings={
               data.mappings
             }
             onCreateReactor={(reactorData) => mutate(() => api.createEquipment(reactorData))}
           />
         );
       }
       return (
<Dashboard
           data={
             data
           }
           mappings={
             data.mappings
           }
           audit={
             data.audit
           }
           onNavigate={
             setPage
           }
         />
       );
   }
 }, [
   page,
   data,
   availability,
   search,
   loading,
   siteName,
   mutate,
   searchAvailability,
 ]);
 /* =======================================================
    RENDER
 ======================================================= */
 return (
<Layout
 page={page}
 setPage={setPage}
 search={search}
 setSearch={setSearch}
 searchResults={searchResults}
 lastUpdated={lastUpdated}
 refreshing={refreshing}
 onRefresh={manualRefresh}
>
     {/* ===============================================
         ERROR
     =============================================== */}
     {error && (
<div className="error-banner">
<span>
           {error}
</span>
<button
           onClick={() =>
             loadAll(true)
           }
>
           Retry
</button>
</div>
     )}
     {/* ===============================================
         INITIAL LOADING
     =============================================== */}
     {loading &&
     !data.equipment.length ? (
<div className="loading-screen">
<div className="loader" />
<strong>
           Loading ReactorPlan...
</strong>
</div>
     ) : (
       content
     )}
</Layout>
 );
}