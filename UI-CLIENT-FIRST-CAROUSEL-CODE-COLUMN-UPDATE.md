# ReactorPlan UI update — navigation and single code column

## Changes
- Added accessible left/right paging controls to **Map Equipment** and **Product Information**, including item counts, disabled boundary controls, and keyboard-focus styling.
- The Client Information register leads with **Client Name**, then Product Name, Stage Code, reactor/site details, status, and timeline. Product Information drill-downs also put Client Name first in related-client tables.
- Removed duplicate Project Code/Product Code display columns from dashboard, mapping, client/product detail tables, and normalized CSV/Excel/PDF exports. User-facing data downloads present one canonical **Stage Code** field; the underlying legacy source fields remain intact in the app's data model for mapping compatibility.
- The generated **Client Information** sheet in the updated master workbook begins with **Client Name** and includes one **Stage Code** column.
- The maintenance search now has one Stage Code filter that searches the available stage/product/project code fields, instead of duplicate Project Code options.
- Updated table-search guidance to refer to Product Name and Stage Code without mentioning a second code column.

## Validation
- `frontend/validate-ui.mjs`: passed, including navigation and single-code-column contract checks.
- JSX parser: passed for all 19 frontend JSX files.
- `backend/validate-data.mjs`: passed source capacity, inventory, schedule interval, and per-site reconciliation checks.
- ZIP archive integrity verified after packaging.
- Production build and browser interaction tests were not run because the frontend dependencies are not installed in this environment.

## Data integrity note
The visible export/UI schema is consolidated to one Stage Code column. Legacy Product/Project Code fields remain in the source data model where necessary for existing mapping behaviour. Where the source represents these values differently, the app keeps the source values internally rather than rewriting the workbook in place.
