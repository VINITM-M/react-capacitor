# ReactorPlan Delivery Verification — 23 October 2026

## Inventory count reconciliation

| Metric | Verified value | Definition |
|---|---:|---|
| Total Reactors | 272 | Physical equipment records in inventory |
| Mapped Reactors | 203 | Physical inventory records with at least one planning assignment |
| Available Reactors | 69 | Physical inventory records without a planning assignment |
| Maintenance Reactors | 0 | Current inventory records marked under maintenance |
| Planning Intervals | 326 | Mapping Tracker assignment records, not physical reactors |
| Product Names | 113 | Distinct normalized Product Name values across mapping records |

**Check:** 203 + 69 + 0 = 272. The count is also reconciled by site:

| Site | Total Reactors | Mapped | Available | Maintenance |
|---|---:|---:|---:|---:|
| CTO-2 | 12 | 9 | 3 | 0 |
| CTO-3 | 52 | 41 | 11 | 0 |
| CTO-5 | 17 | 17 | 0 | 0 |
| CTO-6 | 136 | 88 | 48 | 0 |
| CTO-SEZ | 26 | 23 | 3 | 0 |
| Mexico | 22 | 18 | 4 | 0 |
| Mirfield | 7 | 7 | 0 | 0 |
| **Total** | **272** | **203** | **69** | **0** |

## Capacity reconciliation

The capacity summary values reconcile internally:

| Metric | Value |
|---|---:|
| Total Capacity | 955.418 kL |
| Mapped Capacity | 730.725 kL |
| Utilized Capacity | 385.005 kL |
| Available Capacity | 224.693 kL |

Mapped Capacity + Available Capacity = Total Capacity. Utilized Capacity is a subset of Mapped Capacity and is not added a second time.

**Unresolved source discrepancy:** adding individual equipment capacities gives **955.504 kL**, which is **0.086 kL higher** than the site capacity summary at 955.418 kL. The variance is CTO-6 **+0.080 kL** and Mexico **+0.006 kL**. These source values are intentionally preserved rather than silently adjusted. Dashboard capacity KPIs use the site capacity summary consistently, while reactor details retain individual capacities.

## Planning confidence counts

| Confidence | Distinct Reactors | Scheduled Cells |
|---|---:|---:|
| Confirmed | 138 | 4,093 |
| High Probable | 47 | 1,136 |
| Visible | 66 | 763 |

These categories may overlap because one reactor can have different confidence levels in different periods. Their counts must **not** be added to obtain Total Reactors. The Planning Calendar now says this beside its clickable legend.

## Interface consistency updates

- Inventory cards, dashboard and site pages use shared status logic: Total Reactors 272 = Mapped Reactors 203 + Available Reactors 69 + Maintenance Reactors 0.
- Map Equipment distinguishes the **69 available** reactors from the **272 total** reactors.
- Product Information is grouped by Product Name (113 distinct names); related Stage Codes are shown together on the same product card.
- Product-detail inventory statuses use the same derived status logic as dashboard and inventory pages.
- Client Information begins with Client Name and then Product Name and Stage Code.
- Only one user-facing Stage Code field is presented; legacy Product Code/project/stage properties remain internal compatibility data.
- Download field selection excludes raw source-sheet/source-column payload metadata.
- CTO calendar tabs have high-contrast selected/inactive states, and confidence-count overlap is explained in the UI.

## Checks performed for the end-to-end package

- PASS — `npm run verify` completed successfully. This runs backend workbook/data validation, the backend/frontend preflight contracts, and the frontend UI contract checks.
- PASS — `node --check` on the backend server, backend preflight, backend data validator, and root launcher.
- PASS — TypeScript transpile syntax check on all 25 frontend JS/JSX source files; no syntax diagnostics were emitted.
- PASS — CSS syntax parse.
- PASS — ZIP integrity test on the delivered archive.
- NOT VERIFIED — Production build. A clean install did not complete in this environment; the frontend dependency cache is missing the required Vite dependency. An offline install reports that the `yallist@3.1.1` package is not cached. Run `npm run install:all` on the target machine before building.
- NOT COMPLETED — Browser-driven end-to-end interaction tests. The API smoke test requires the backend server to be running and was not counted as passed during packaging.

## End-to-end package contents

The package includes the complete React/Vite frontend, Express backend, preloaded database snapshot, operational source workbooks, package lock files, data validation scripts, UI contract tests, setup guide, and Windows setup/run and verification launchers. Dependencies are not embedded in the ZIP; install them via the lock files using `SETUP-AND-RUN-WINDOWS.bat` or `npm run install:all`.

This delivery is source- and data-validated, but it is not claimed to be a production-built or browser-regression-tested release. The 0.086 kL capacity source discrepancy remains documented and unchanged.


## Backend startup fix — end-to-end package revision

A review of the packaged `backend/server.js` found that three referenced runtime helpers were missing: `stageFromProductCode`, `buildMappingOptions`, and `recalculateDerivedCapacity`. The first database read therefore threw a `ReferenceError`; health checks and most API endpoints could not load successfully. These helper implementations have now been restored from the last complete project version.

Additional fixes in this revision:
- `server.js` validates the database before announcing that the backend is ready and gives a direct startup error if validation fails.
- The root launcher detects an early backend process exit and stops rather than waiting through the full health-check timeout.
- The API smoke-test default uses `127.0.0.1`, consistent with the actual backend bind address.
- Backend preflight now explicitly checks that the runtime helpers exist.
- README instructions no longer ask users to run the API smoke test before starting the backend; source count documentation is reconciled to the current 272-reactor workbook-backed data.

### Regression checks for this revision
- PASS — `npm run verify` (data validation, backend preflight and frontend UI contract checks).
- PASS — `node --check` for backend server, backend smoke test and root launcher.
- PASS — isolated runtime exercise of the actual database read/normalization helper path: 272 equipment records, 326 planning intervals, mapping-options catalogue populated, and locked Capacity Summary retained at 955.418 kL. The isolated test used a copy of the database so the bundled production snapshot was not modified.
- PASS — source-data validation against a copied database after the runtime normalization exercise.
- NOT RUN — live HTTP endpoint smoke test and Vite production build. The dependencies were not installable in this environment because DNS resolution for `registry.npmjs.org` failed; therefore Express/CORS were unavailable to start the real server. Run `npm run install:all`, `npm run verify`, `npm run build`, and then `npm run smoke` in the target environment (with `npm run dev` already running) for the complete end-to-end verification.
