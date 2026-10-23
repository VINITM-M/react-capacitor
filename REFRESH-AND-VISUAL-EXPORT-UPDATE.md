# Refresh control and visual Excel export update

## UI changes
- Replaced the ambiguous circular refresh glyph with a labeled `Refresh data` action and a standard refresh icon.
- Added a clear busy state (`Refreshing…`) with an animated icon and disabled action while a refresh is in flight.
- Changed the adjacent status pill to distinguish workbook-data readiness, last successful update time, and an active refresh.
- Kept the manual-refresh behavior; this update does not add polling or auto-refresh loops.

## Excel export changes
- The visual EDA workbook continues to provide native Excel pie/bar charts and now uses a multi-colour chart palette with color-coded analysis rows.
- Generic XLSX dataset exports retain the raw exported data and existing color legend, and now add `Visual Analysis` and `Category Mix` worksheets when a useful low-cardinality source category is available.
- The multi-sheet `Everything` export adds `Export Overview` and `Category Mix` charts showing the record volume per exported worksheet.
- Workbook chart summaries are derived from the exported rows. They do not alter the source data. Blank category values are shown as `Blank / missing`; when there are many categories, the smaller categories are grouped as `Other categories` in the visual summary while the raw data tab remains intact.

## Validation notes
- Frontend UI contract checks passed.
- Excel chart XML generation was tested for bar and pie charts, with multi-colour point formatting and well-formed XML.
- A full Vite production build and browser-driven export test could not be completed in this environment because the npm dependency installation did not finish. Run the included project locally to confirm chart rendering in the Excel version used by your team.
