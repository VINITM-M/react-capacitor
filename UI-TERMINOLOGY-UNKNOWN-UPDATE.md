# Product Name / Stage Code and Unknown Placeholder Update

## UI terminology
- Standardized user-facing product fields to **Product Name**.
- Standardized user-facing stage-related fields to a single **Stage Code** field. Legacy internal `stage` / `stages` fields remain supported for data compatibility, but user-facing views and standard exports resolve them into one Stage Code value.
- Updated the Planning Calendar labels, tooltips, assignment details and forms to use Product Name and Stage Code consistently.
- Updated site-tab headers in the *exported updated master workbook* to Product Name and Stage Code. The bundled source workbook files are left untouched so the original workbook remains available as the source reference.

## Dash placeholder handling
- Standalone hyphen/dash placeholders (`-`, en/em dashes, and equivalent dash-only strings with surrounding spaces) are recognized as missing markers and presented/exported as **Unknown**.
- Import parsing ignores these markers for matching and calculations, while raw imported-sheet payloads, UI state, tables, ordinary CSV/JSON/XLSX exports, visual EDA exports and the updated-master-workbook export normalize them for display/output.
- Unknown sentinels are not treated as real Stage Code filter values or counted as distinct Stage Codes.

## Source-data scan
A direct scan found **zero dash-only values** in the current bundled `mock-db.json`, the three embedded workbook files under `backend/source-data`, and the supplied `reactorplan-eda-2026-10-22.xlsx`. No unrelated source values were rewritten. The normalization is in place for legacy records and future workbook imports that contain these markers.

## Validation performed
- Frontend UI contract validator passed.
- TypeScript parser syntax checks passed for 24 frontend JavaScript/JSX files.
- Node syntax checks passed for frontend `.js` utilities and `backend/server.js`.
- Targeted test passed for dash normalization, Date preservation, fallback to a valid legacy Stage Code, and excluding `Unknown` from real filter values.
- ZIP archive integrity will be checked after packaging.

## Validation limitation
A production Vite build could not be run because the project environment does not have the Vite executable installed (`vite: not found`). Browser interaction and rendered workbook-download testing therefore remain unverified.
