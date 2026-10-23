# Interactive Dashboard and Planning Status Update

## Changes

- Planning Probability summaries now count distinct reactor/site combinations by schedule category instead of counting mapping rows. The dashboard and Planning Calendar legend use the same distinct-reactor definition and exclude empty reactor IDs.
- Confirmed, High Probable and Visible counts reconcile to the source workbook metadata: 138, 47 and 65 respectively. A reactor may appear under more than one category if its schedule has different confidence levels at different periods.
- Dashboard KPI cards now open searchable detail modals. Total reactors and maintenance show inventory-level records; mapped reactors show deduplicated mapping detail; capacity cards show the workbook's site-summary values and a separate searchable inventory-level reactor list. Individual equipment capacities remain separate from Capacity Summary totals to avoid implying a false reconciliation.
- Product Information tiles are clickable and open a detail view with related client/project information, mapping/planning records and reactor inventory. Product-to-reactor joining is site-aware where site data is available.
- Product Information now displays all available product/code cards rather than truncating the list to twelve.
- Planning Calendar confidence-filter legend counts show distinct reactors and remain stable while one category is selected; the selected category still filters the rows/calendar itself.

## Validation performed

- `frontend/validate-ui.mjs`: passed.
- JSX syntax transpilation with the installed TypeScript compiler: passed for Dashboard.jsx, Calendar.jsx and ProductPlayCard.jsx.
- `backend/validate-data.mjs`: passed all source capacity, inventory count, schedule interval, equipment-by-site, mapping interval and bundled workbook-source checks.
- Planning-category distinct reactor/site counts were independently compared with `backend/database/mock-db.json` metadata and matched (138 Confirmed; 47 High Probable; 65 Visible).
- ZIP archive integrity verified after packaging.

## Validation limitation

A production Vite build and browser interaction test were not completed. `npm ci` could not fetch packages from the npm registry because the environment could not resolve `registry.npmjs.org` (EAI_AGAIN). The partial `node_modules` directory was removed before packaging; package files and lockfiles remain in the archive.
