# ReactorPlan — End-to-End Project Package

## Quick start (Windows)

1. Extract the entire ZIP to a writable folder.
2. Install Node.js LTS (Node 22.12+ is suitable for the included Vite version).
3. Double-click `SETUP-AND-RUN-WINDOWS.bat`, or run `npm run install:all`, `npm run verify`, then `npm run dev` from this directory.
4. Open `http://127.0.0.1:5173`. The backend health endpoint is `http://127.0.0.1:4000/api/health`.

`npm run verify` validates workbook data, frontend/backend contracts, and UI checks. `npm run build` creates the production frontend bundle after dependency installation. Full browser interaction testing must still be run in the target environment. See `START-HERE.txt` and `DELIVERY-VERIFICATION-2026-10-23.md`.

---

# ReactorPlan — End-to-End Optimized

## Run locally

From the project root, run these commands in order:

```bash
npm run install:all
npm run verify
npm run dev
```

Keep the development terminal open. Open `http://127.0.0.1:5173` in a browser. In a **second terminal**, from the same project root, run `npm run smoke` to exercise the API while the backend is running.

To run the services separately, start `npm --prefix backend run dev` first, then `npm --prefix frontend run dev` in another terminal. The Vite server proxies `/api` calls to `http://127.0.0.1:4000`.

## Latest workflow

- Dashboard KPI cards are clickable and open the corresponding operational data.
- Availability and Equipment Mapping are one workflow: check availability, select a reactor, then map it.
- Mapping uses the user-facing terms **Product Name** and **Stage Code**, plus planning category and dates. Legacy product/stage properties remain internal for compatibility.
- Product Name and Stage Code options are loaded through `/api/mapping-options` from the source-backed database.
- Maintenance is administered by site with create, edit, complete, cancel and delete actions.
- Capacity Summary uses the parsed Capacity Summary source rows as the authoritative KL source.
- Generated Excel exports exclude SAP Code and use styled headers/status cells.
- Downloads include individual CTOs, all CTOs, availability, mapping, planning calendar, analytics, reactor master, dashboard, report and everything.
- Analytics contains exploratory analysis and time-series views.

## Source reconciliation

The current bundled source workbooks are stored under `backend/source-data/`. The Capacity Summary remains authoritative for capacity KPIs; individual reactor capacity values remain unchanged in inventory records.

Verified platform data:
- Capacity Summary: 34 rows; **955.418 kL** total capacity; **385.005 kL** utilization; **730.725 kL** mapped capacity; **224.693 kL** available capacity.
- Equipment inventory: **272 physical reactor records**.
- Mapping Tracker: **326 planning intervals** (these are not reactor counts).
- Inventory assignment status: **203 mapped + 69 available + 0 maintenance = 272 total reactors**.
- Equipment by site: CTO-2 12, CTO-3 52, CTO-5 17, CTO-6 136, CTO-SEZ 26, Mexico 22, Mirfield 7.
- Mapping Tracker intervals by site: CTO-2 9, CTO-3 71, CTO-5 26, CTO-6 160, CTO-SEZ 35, Mexico 18, Mirfield 7.
- Product Information: **113 distinct Product Names** in the source Mapping Tracker register.
- Site volume totals: 599.441 kL total, 484.560 kL mapped, 328.650 kL utilized, 114.881 kL available.

**Unresolved source discrepancy:** the sum of individual inventory capacities is **955.504 kL**, which is **0.086 kL higher** than the Capacity Summary total. The source values are preserved and the variance is documented in `DATA-RECONCILIATION-2026-10-23.md`.

The backend validation script checks these figures against the bundled data and source validation record.

## Client Master Excel workflow
- The bundled client master is `backend/source-data/master-workbook.xlsx`.
- Download Center accepts `.xlsx` uploads and parses the operational sheets into the mock database.
- The original uploaded bytes are stored after a successful parse/import at the same master path.
- `Master Excel — Exact Uploaded File` downloads that stored workbook unchanged, preserving every sheet, formula, format, hidden sheet/property and source value.
- `Current Platform Excel` / `Everything` are generated operational exports and include current platform changes.
- Uploading a new workbook replaces the prior master baseline after successful import; the previous workbook is not mixed with the new workbook.

## v3.1 startup fix
The package includes a root `npm run dev` launcher that starts both the backend and frontend. The backend also has a friendly `/` status page, so visiting port 4000 no longer displays `Cannot GET /`.

## v29 Data Sync Refresh

- Reconciled the bundled source workbook against the uploaded master workbook.
- Preserved the master workbook unchanged because its SHA-256 matches the uploaded file exactly.
- Retained the complete equipment, mapping, capacity, volume, client, and raw-sheet datasets already derived from that master workbook.
- Updated release metadata to v29 / platform version 2.6.0.

## v37 updates

The v37 package replaces the capacity waterfall with a single segmented total-capacity bar, expands the Material of Construction panel to full width with all categories, shows product and product code together in planning probability, and adds clickable calendar assignment details with the mapped timeline and next estimated availability. Text and chart panels have been enlarged for readability. The Mapping Tracker smart suggestion is now an Open-Source AI Planning Assistant endpoint that uses a local Ollama model when configured and a clearly labelled deterministic fallback otherwise. See `START-OPEN-SOURCE-LLM-WINDOWS.md`.


## v40 — Source Data Consistency

The current package imports the latest 14-Oct-2026 master workbook consistently across equipment, capacity, planning intervals, client/project rows, monthly summary, and volume summary. See `DATA-CONSISTENCY-REPORT-v40.md` for source counts and the 0.086 kL discrepancy already present between individual inventory capacity sum and the Excel Capacity Summary.

## Backend startup reliability fix

The delivered backend restores the required `stageFromProductCode`, `buildMappingOptions`, and `recalculateDerivedCapacity` helpers that had been referenced but omitted from `server.js`. Startup now validates the database before announcing readiness, and the launcher reports an early backend exit instead of waiting for the full health-check timeout. See `BACKEND-STARTUP-FIX-2026-10-23.md`.
