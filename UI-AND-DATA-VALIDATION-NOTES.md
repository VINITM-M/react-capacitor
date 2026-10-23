# ReactorPlan UI and Availability Validation Notes

## Changes in this update
- Download Center preset actions now use high-contrast white cards with readable labels and descriptions.
- Download Center export forms, column selection, quick downloads, and preview tables have consistent spacing and responsive sizing.
- Planning Calendar wide timelines are constrained to the calendar's own horizontal scroll area so they do not widen the whole app or overlap the sidebar.
- Planning Calendar controls, week columns, and reactor/project labels have larger readable text and wrapping.
- Availability KPI labels now make clear that the values count unique reactors.
- Added an on-screen note distinguishing source inventory rows from distinct reactor IDs.

## Current source-derived availability counts
Based on the project's currently loaded source-derived database:
- Inventory rows: 272
- Distinct normalized reactor IDs: 261
- Mapped distinct reactor IDs: 193
- Available distinct reactor IDs: 68
- Maintenance reactors: 0
- 11 extra inventory rows are duplicate normalized IDs (272 rows minus 261 distinct IDs).

The distinct-ID counts reconcile: 193 mapped + 68 available = 261 distinct IDs. Duplicate rows are not silently added to unique-reactor KPI counts.

## Validation actually performed
- Frontend UI contract validator: PASS (8 files).
- Backend source-data validator: PASS (source capacity rows/totals, inventory row count, schedule intervals, equipment by site, mapping intervals, locked capacity source and bundled workbook checks).
- ZIP integrity: to be checked after packaging.
- Production build: NOT VERIFIED. The available frontend dependency tree does not contain a runnable Vite installation (`vite: Permission denied`, then `vite/bin/vite.js` missing).
- Browser visual/interactions regression testing: NOT PERFORMED.


## Professional UI pass — 23 October 2026
- Product Information now repeats the Dashboard's four Planning Confidence KPI cards and values.
- Site labels are plain text instead of colored/outlined chips.
- Reactor Master deletion is represented by a neutral trash icon rather than a solid red block.
- Availability filters and the “reactors found” count have improved spacing, typography, and responsive behavior.
- Calendar reactor IDs and Product Names are both clickable to open assignment details; the Product Name no longer uses a filled blue pill.
- Frontend UI contract checks (25 contracts), backend data validation, and backend preflight passed. A production Vite build and browser visual testing could not be completed in this environment because Vite dependencies were unavailable.
