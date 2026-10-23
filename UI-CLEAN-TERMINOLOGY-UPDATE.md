# UI Clean-up and Terminology Update

- Reduced visual weight in product cards and drill-down modals: calmer borders, subtler shadows, more consistent spacing, and less aggressive table headers.
- Standardized user-facing terminology to **Product Name** and **Stage Code** in the updated tables, search controls, and product detail views.
- Removed the duplicate Stage/Stage Code column from the Planning Calendar details table; the display now uses a single Stage Code column.
- Product detail views display Stage Code values instead of combining separate Stage and Stage Code values in the same cell.
- Internal workbook/data fields and mapping logic are retained to avoid changing the source data model.

Validation note: JSX parser/build verification could not be completed because the local dependency tree in this environment is incomplete (`vite` is unavailable). Please run `npm install` and `npm run build` in `frontend` and verify the affected screens in a browser.
