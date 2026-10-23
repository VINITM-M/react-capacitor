import React, { useEffect, useMemo, useRef, useState } from "react";
/* =========================================================
  PRIMARY NAVIGATION
  ========================================================= */
const PRIMARY = [
 ["dashboard", "Dashboard"],
 ["reactors", "Reactor Master"],
 ["availability", "Availability & Equipment Mapping"],
 
 ["calendar", "Planning Calendar"],
 ["analytics", "Analytics"],
 ["client-information", "Client Information"],
];
/* =========================================================
  CAPACITY & DATA NAVIGATION
  ========================================================= */
const DATA = [
 ["capacity", "Capacity Summary"],
 ["site:CTO-2", "CTO-2"],
 ["site:CTO-3", "CTO-3"],
 ["site:CTO-5", "CTO-5"],
 ["site:CTO-6", "CTO-6"],
 ["site:CTO-SEZ", "CTO-SEZ"],
 ["site:Mexico", "Mexico"],
 ["site:Mirfield", "Mirfield"],
];
/* =========================================================
  SEARCH RESULT ICONS
  ========================================================= */
const TYPE_ICONS = {
 Reactor: "⚗",
 "Project Mapping": "🔗",
 Capacity: "📊",
 Maintenance: "🔧",
 Audit: "📝",
 Site: "🏭",
 Operation: "⚙",
 Page: "↗",
};
/* =========================================================
  LAYOUT
  ========================================================= */
export default function Layout({
 page,
 setPage,
 children,
 search,
 setSearch,
 searchResults = [],
 lastUpdated = null,
 refreshing = false,
 onRefresh = null,
}) {
 const [dataOpen, setDataOpen] = useState(true);
 const [searchOpen, setSearchOpen] = useState(false);
 const searchRef = useRef(null);
 const skipSearchAutoOpen = useRef(false);
 /* =======================================================
    ACTIVE SITE
    ======================================================= */
 const activeSite = useMemo(
   () =>
     page.startsWith("site:")
       ? page.slice(5)
       : "",
   [page]
 );
 /* =======================================================
    SHOW SEARCH RESULTS
    ======================================================= */
 useEffect(() => {
   if (skipSearchAutoOpen.current) {
     skipSearchAutoOpen.current = false;
     return;
   }
   if (search.trim()) {
     setSearchOpen(true);
   } else {
     setSearchOpen(false);
   }
 }, [search, searchResults]);
 /* =======================================================
    CLOSE SEARCH WHEN CLICKING OUTSIDE
    ======================================================= */
 useEffect(() => {
   const handleClickOutside = (event) => {
     if (
       searchRef.current &&
       !searchRef.current.contains(event.target)
     ) {
       setSearchOpen(false);
     }
   };
   document.addEventListener(
     "mousedown",
     handleClickOutside
   );
   return () => {
     document.removeEventListener(
       "mousedown",
       handleClickOutside
     );
   };
 }, []);
 /* =======================================================
    NAVIGATE FROM SEARCH
    ======================================================= */
 const handleSearchResult = (result) => {
   if (!result?.page) {
     return;
   }
   setPage(result.page);

   // Keep a record-specific query when opening searchable records so pages
   // that support globalSearch can immediately narrow to the selected item.
   // Navigation-only results clear the query to avoid stale filtering.
   const searchableRecordTypes = new Set([
     "Reactor",
     "Equipment Mapping",
     "Project Mapping",
     "Capacity",
     "Maintenance",
     "Audit",
     "Client / Project",
   ]);

   skipSearchAutoOpen.current = true;
   setSearch(
     searchableRecordTypes.has(result.type)
       ? String(result.title || "")
       : ""
   );
   setSearchOpen(false);
 };
 /* =======================================================
    KEYBOARD NAVIGATION
    ======================================================= */
 const handleSearchKeyDown = (event) => {
   if (event.key === "Escape") {
     setSearch("");
     setSearchOpen(false);
     return;
   }
   if (
     event.key === "Enter" &&
     searchResults.length === 1
   ) {
     handleSearchResult(searchResults[0]);
   }
 };
 /* =======================================================
    CLEAR SEARCH
    ======================================================= */
 const clearSearch = () => {
   setSearch("");
   setSearchOpen(false);
 };
 return (


  
<div className="app-shell">
     {/* ===================================================
         SIDEBAR
         =================================================== */}
<aside className="sidebar">
<div className="brand">
<div className="brand-title">
           Reactor Plan
</div>
<div className="brand-subtitle">
           Operations Platform
</div>
</div>
       {/* =================================================
           MAIN NAVIGATION
           ================================================= */}
<nav
         className="sidebar-nav"
         aria-label="Main navigation"
>
         {PRIMARY.map(([id, label]) => (
<button
             key={id}
             className={`nav-item ${
               page === id ? "active" : ""
             }`}
             onClick={() => setPage(id)}
>
             {label}
</button>
         ))}
         {/* ===============================================
             CAPACITY & DATA
             =============================================== */}
<button
           className={`nav-section ${
             page === "capacity" ||
             activeSite
               ? "open"
               : ""
           }`}
           onClick={() =>
             setDataOpen((value) => !value)
           }
           aria-expanded={dataOpen}
>
<span>
             Capacity & Data
</span>
<span>
             {dataOpen ? "−" : "+"}
</span>
</button>
         {dataOpen && (
<div className="nested-nav">
             {DATA.map(([id, label]) => (
<button
                 key={id}
                 className={`nav-item nested ${
                   page === id ? "active" : ""
                 }`}
                 onClick={() => setPage(id)}
>
                 {label}
</button>
             ))}
</div>
         )}
         {/* Downloads opens the complete Download Center directly. The
             available exports are listed on the page, so a nested sidebar
             accordion is unnecessary and avoids crowding the navigation. */}
         <div className="nav-divider" aria-hidden="true" />
         <button
           type="button"
           className={`nav-item ${page.startsWith("downloads") ? "active" : ""}`}
           onClick={() => setPage("downloads")}
         >Downloads</button>
         {/* ===============================================
             ADMIN
             =============================================== */}
<button
           className={`nav-item ${
             page === "admin" ? "active" : ""
           }`}
           onClick={() => setPage("admin")}
>
           Admin
</button>
</nav>
       {/* =================================================
           PROFILE
           ================================================= */}
<div className="profile">
<strong>
           Vikas S Pawar
</strong>
<span>
           Lead Program Manager
</span>
</div>
</aside>
     {/* ===================================================
         MAIN CONTENT
         =================================================== */}
<main className="main-content">
       {/* =================================================
           TOP BAR
           ================================================= */}
<header className="topbar">
<div className="topbar-title">
           ReactorPlan POC
</div>
         {/* =================================================
             TOP RIGHT CONTROLS
             Live Updated
             Search Operations
             ================================================= */}
<div
           className="topbar-right"
           style={{
             display: "flex",
             alignItems: "center",
             justifyContent: "flex-end",
             gap: "24px",
             flexWrap: "nowrap",
             minWidth: 0,
             position: "relative",
             overflow: "visible",
           }}
>
           {/* =============================================
               LIVE UPDATED
               ============================================= */}
<div
             className="live-indicator"
             style={{
               display: "flex",
               alignItems: "center",
               justifyContent: "center",
               gap: "7px",
               flexShrink: 0,
               whiteSpace: "nowrap",
               minWidth: "105px",
             }}
>
<i className={refreshing ? "live-dot is-refreshing" : "live-dot"} />
<span className="live-indicator-text" aria-live="polite">
  {refreshing ? "Updating data…" : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Data ready"}
</span>
{onRefresh && (
  <button
    type="button"
    className={`refresh-button${refreshing ? " is-refreshing" : ""}`}
    onClick={onRefresh}
    disabled={refreshing}
    aria-label={refreshing ? "Refreshing data" : "Refresh data"}
    title="Refresh application data"
  >
    <span className="refresh-button-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M20 7v5h-5" />
        <path d="M20 12a8 8 0 1 1-2.34-5.66L20 9" />
      </svg>
    </span>
    <span className="refresh-button-label">{refreshing ? "Refreshing…" : "Refresh data"}</span>
  </button>
)}
</div>
           {/* =============================================
               SEARCH OPERATIONS
               ============================================= */}
<div
             ref={searchRef}
             className="global-search-wrapper"
             style={{
               position: "relative",
               display: "flex",
               alignItems: "center",
               flexShrink: 0,
               width: "250px",
               maxWidth: "250px",
             }}
>
<input
               className="global-search"
               value={search}
               onChange={(e) =>
                 setSearch(e.target.value)
               }
               onKeyDown={handleSearchKeyDown}
               placeholder="Search reactors, Product Names, Stage Codes, clients and sites..."
               aria-label="Search operations"
               style={{
                 width: "100%",
                 boxSizing: "border-box",
               }}
             />
             {/* =========================================
                 CLEAR SEARCH
                 ========================================= */}
             {search && (
<button
                 type="button"
                 className="global-search-clear"
                 onClick={clearSearch}
                 aria-label="Clear search"
>
                 ×
</button>
             )}
             {/* =========================================
                 SEARCH RESULTS
                 ========================================= */}
             {searchOpen && (
<div
                 className="search-results-dropdown"
                 style={{
                   position: "absolute",
                   top: "calc(100% + 8px)",
                   right: 0,
                   width: "250px",
                   maxWidth: "250px",
                   maxHeight: "420px",
                   overflowY: "auto",
                   zIndex: 1000,
                   boxSizing: "border-box",
                 }}
>
                 {searchResults.length > 0 ? (
<>
<div className="search-results-header">
<span>
                         Search Results
</span>
<span>
                         {searchResults.length}
</span>
</div>
<div className="search-results-list">
                       {searchResults
                         .slice(0, 20)
                         .map((result) => (
<button
                             key={result.key}
                             type="button"
                             className="search-result-item"
                             onClick={() =>
                               handleSearchResult(
                                 result
                               )
                             }
>
<span className="search-result-icon">
                               {
                                 TYPE_ICONS[
                                   result.type
                                 ] || "•"
                               }
</span>
<span className="search-result-content">
<strong>
                                 {result.title}
</strong>
<small>
                                 {result.subtitle}
</small>
<em>
                                 {result.type}
</em>
</span>
</button>
                         ))}
</div>
                     {searchResults.length > 20 && (
<div className="search-results-footer">
                         Showing first 20 results
</div>
                     )}
</>
                 ) : (
<div className="search-no-results">
<strong>
                       No results found
</strong>
<span>
                       Try a reactor ID, site,
                       project, capacity,
                       status or block.
</span>
</div>
                 )}
</div>
             )}
</div>
</div>
</header>
       {/* =================================================
           PAGE CONTENT
           ================================================= */}
<div className="page-content">
         {children}
</div>
</main>
</div>
 );
}