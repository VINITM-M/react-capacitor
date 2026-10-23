# ReactorPlan Data Reconciliation and UI Polish — 23 October 2026

## Shared physical-inventory definitions

- Total Reactors: 272 physical equipment records, keyed by stable equipment UID.
- Mapped Reactors: 203 physical records with at least one planning assignment.
- Available Reactors: 69 physical records without a planning assignment.
- Maintenance Reactors: 0 in the current database.
- Reconciliation: 203 + 69 + 0 = 272.
- Site counts also reconcile to 272: CTO-2 12 (9 mapped, 3 available); CTO-3 52 (41 mapped, 11 available); CTO-5 17 (17 mapped, 0 available); CTO-6 136 (88 mapped, 48 available); CTO-SEZ 26 (23 mapped, 3 available); Mexico 22 (18 mapped, 4 available); Mirfield 7 (7 mapped, 0 available).
- Planning Intervals: 326 schedule assignments. This is not a reactor count.
- Equipment Map shows the available subset separately from full inventory: 69 available for mapping and 272 Total Reactors.
- Mapping Tracker visible reactor IDs are not unique across site/block/area and must not be used as physical inventory IDs.

## Planning confidence

- Confirmed: 138 physical reactors have at least one Confirmed schedule period.
- High Probable: 47 physical reactors have at least one High Probable schedule period.
- Visible: 66 physical reactors have at least one Visible schedule period.
- These categories can overlap across periods; they are not additive and do not sum to Total Reactors. The same explanation is visible beside the Planning Calendar confidence legend.
- Current schedule cells: Confirmed 4,093; High Probable 1,136; Visible 763; total 5,992.

- Product Information is grouped by 113 distinct Product Names; the product with multiple Stage Codes displays those codes together in one card.

## Capacity reconciliation

- Capacity summary: Total 955.418 kL; Mapped 730.725 kL; Utilized 385.005 kL; Available 224.693 kL.
- Mapped + Available = Total. Utilized capacity is a subset of mapped capacity and must not be added to mapped capacity.
- Sum of individual reactor capacities is 955.504 kL, exceeding the capacity summary by 0.086 kL: CTO-6 +0.080 kL and Mexico +0.006 kL. The two supplied values are preserved; no silent balancing adjustment was made.

## Presentation and consistency updates

- Inventory status cards in Dashboard, Reactor Inventory, Availability, Client Information, and CTO site views use one shared physical-inventory status helper.
- Dashboard detail status displays use the same derived status as the KPI counts, avoiding stale `status` values from imported records.
- Display names are standardized on Product Name and Stage Code. Product Code and legacy Stage fields remain only as internal compatibility properties.
- Client Information starts with Client Name; Product Information uses concise cards and consistent labels.
- CTO planning view selectors and tabs use high-contrast text and focus states.
- No source capacity values were changed to force an apparent reconciliation.

## Verification performed

- `node backend/validate-data.mjs` checks source capacity values, site capacity totals, inventory identity uniqueness, mapped/available reconciliation by site, unique Product Name count, schedule interval counts, and the documented capacity discrepancy.
- `cd frontend && node validate-ui.mjs` checks frontend UI contracts.
- `node --check backend/server.js`, JS/JSX syntax transpilation, and CSS parsing pass.
- A production bundle could not be generated because `npm ci` timed out and left Vite unavailable in this environment. Browser-based end-to-end interaction testing was therefore not completed.
