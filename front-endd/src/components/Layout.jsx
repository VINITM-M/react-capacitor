import React, { useMemo, useState } from "react";

/* =========================================================
   ICONS (SVG)
   ========================================================= */
function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconReactor() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 2v7.31L4.12 18.27A2 2 0 0 0 5.8 21h12.4a2 2 0 0 0 1.68-2.73L14 9.31V2" />
      <line x1="8.5" y1="2" x2="15.5" y2="2" />
      <line x1="7" y1="14" x2="17" y2="14" />
    </svg>
  );
}

function IconAvailability() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function IconClient() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconCapacity() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconSite() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <line x1="9" y1="9" x2="9" y2="9.01" />
      <line x1="9" y1="13" x2="9" y2="13.01" />
      <line x1="9" y1="17" x2="9" y2="17.01" />
    </svg>
  );
}

function IconDownloads() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconChevron({ open }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`chevron-icon ${open ? "is-open" : ""}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/* =========================================================
   NAVIGATION SECTIONS (ORGANIZED)
   ========================================================= */
const OPERATIONS_NAV = [
  ["dashboard", "Dashboard", IconDashboard],
  ["calendar", "Planning Calendar", IconCalendar],
  ["analytics", "Analytics", IconAnalytics],
];

const ASSETS_NAV = [
  ["reactors", "Reactor Master", IconReactor],
  ["availability", "Availability & Equipment Mapping", IconAvailability],
  ["client-information", "Client Information", IconClient],
];

const DATA_SITES = [
  ["site:CTO-2", "CTO-2"],
  ["site:CTO-3", "CTO-3"],
  ["site:CTO-5", "CTO-5"],
  ["site:CTO-6", "CTO-6"],
  ["site:CTO-SEZ", "CTO-SEZ"],
  ["site:Mexico", "Mexico"],
  ["site:Mirfield", "Mirfield"],
];

/* =========================================================
   LAYOUT COMPONENT
   ========================================================= */
export default function Layout({
  page,
  setPage,
  children,
  search = "",
  setSearch = () => {},
  searchResults = [],
  lastUpdated = null,
  refreshing = false,
  onRefresh = null,
}) {
  const [dataOpen, setDataOpen] = useState(true);

  const activeSite = useMemo(
    () => (page.startsWith("site:") ? page.slice(5) : ""),
    [page]
  );

  return (
    <div className="app-shell">
      {/* ===================================================
          SIDEBAR (ORGANIZED HIERARCHY)
          =================================================== */}
      <aside className="sidebar">
        {/* BRAND HEADER */}
        <div className="brand">
          <div className="brand-header">
            <div className="brand-logo" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2v7.31L4.12 18.27A2 2 0 0 0 5.8 21h12.4a2 2 0 0 0 1.68-2.73L14 9.31V2" />
                <line x1="8.5" y1="2" x2="15.5" y2="2" />
                <line x1="7" y1="14" x2="17" y2="14" />
              </svg>
            </div>
            <div className="brand-text">
              <div className="brand-title">Reactor Plan</div>
              <div className="brand-subtitle">Operations Platform</div>
            </div>
          </div>
        </div>

        {/* ORGANIZED SIDEBAR NAVIGATION */}
        <nav className="sidebar-nav" aria-label="Main navigation">
          {/* GROUP 1: OPERATIONS */}
          <div className="nav-group">
            <div className="nav-group-title">Operations</div>
            {OPERATIONS_NAV.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                className={`nav-item ${page === id ? "active" : ""}`}
                onClick={() => setPage(id)}
              >
                <span className="nav-item-icon"><Icon /></span>
                <span className="nav-item-label">{label}</span>
              </button>
            ))}
          </div>

          {/* GROUP 2: ASSETS & MAPPING */}
          <div className="nav-group">
            <div className="nav-group-title">Assets & Allocation</div>
            {ASSETS_NAV.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                className={`nav-item ${page === id ? "active" : ""}`}
                onClick={() => setPage(id)}
              >
                <span className="nav-item-icon"><Icon /></span>
                <span className="nav-item-label">{label}</span>
              </button>
            ))}
          </div>

          {/* GROUP 3: SITES & CAPACITY */}
          <div className="nav-group">
            <div className="nav-group-title">Sites & Capacity</div>
            <button
              type="button"
              className={`nav-item ${page === "capacity" ? "active" : ""}`}
              onClick={() => setPage("capacity")}
            >
              <span className="nav-item-icon"><IconCapacity /></span>
              <span className="nav-item-label">Capacity Summary</span>
            </button>

            <button
              type="button"
              className={`nav-section ${page === "capacity" || activeSite ? "open" : ""}`}
              onClick={() => setDataOpen((value) => !value)}
              aria-expanded={dataOpen}
            >
              <span className="nav-section-label">
                <span className="nav-item-icon"><IconSite /></span>
                <span>Manufacturing Sites</span>
                <span className="nav-count-badge">7</span>
              </span>
              <span className="nav-section-arrow">
                <IconChevron open={dataOpen} />
              </span>
            </button>

            {dataOpen && (
              <div className="nested-nav">
                {DATA_SITES.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`nav-item nested ${page === id ? "active" : ""}`}
                    onClick={() => setPage(id)}
                  >
                    <span className="nested-site-dot" />
                    <span className="nav-item-label">{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* GROUP 4: SYSTEM */}
          <div className="nav-group">
            <div className="nav-group-title">System</div>
            <button
              type="button"
              className={`nav-item ${page.startsWith("downloads") ? "active" : ""}`}
              onClick={() => setPage("downloads")}
            >
              <span className="nav-item-icon"><IconDownloads /></span>
              <span className="nav-item-label">Downloads</span>
            </button>
            <button
              type="button"
              className={`nav-item ${page === "admin" ? "active" : ""}`}
              onClick={() => setPage("admin")}
            >
              <span className="nav-item-icon"><IconAdmin /></span>
              <span className="nav-item-label">Admin</span>
            </button>
          </div>
        </nav>

        {/* PROFILE FOOTER */}
        <div className="profile">
          <div className="profile-avatar" aria-hidden="true">
            VP
          </div>
          <div className="profile-info">
            <strong className="profile-name">Vikas S Pawar</strong>
            <span className="profile-role">Lead Program Manager</span>
          </div>
          <div className="profile-status" title="Active">
            <span className="profile-status-dot" />
          </div>
        </div>
      </aside>

      {/* ===================================================
          MAIN CONTENT AREA
          =================================================== */}
      <main className="main-content">
        {/* =================================================
            TOP BAR / NAVBAR (ONLY REFRESH DATA FEATURE)
            ================================================= */}
        <header className="topbar topbar-refresh-only">
          <div className="topbar-right" style={{ marginLeft: "auto" }}>
            {/* LIVE UPDATED STATUS & REFRESH */}
            <div
              className="live-indicator"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                flexShrink: 0,
                whiteSpace: "nowrap",
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
          </div>
        </header>

        {/* PAGE CONTENT */}
        <div className="page-content">
          {children}
        </div>
      </main>
    </div>
  );
}