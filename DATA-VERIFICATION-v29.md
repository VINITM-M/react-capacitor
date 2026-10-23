# ReactorPlan v29 — Master Data Verification

Verification date: 2026-09-22 12:06 IST

## Source file
- Uploaded: `Equipment List & Live Tracker_M-Sheet file.xlsx`
- Bundled: `backend/source-data/master-workbook.xlsx`
- SHA-256: `199aeef414b07e220324afd73c6ea311f3fdf08932a769d9fe9349537c82f9c2`
- Size: 183,554 bytes
- Result: EXACT BYTE-FOR-BYTE MATCH

## Platform dataset
- Equipment: 293
- Mapping Tracker: 203
- Capacity Summary: 34
- Sites: CTO-2, CTO-3, CTO-5, CTO-6, CTO-SEZ, Mexico, Mirfield
- Capacity total: 955.418 KL
- Capacity utilization: 385.005 KL
- Capacity mapped: 730.725 KL
- Capacity available: 224.693 KL
- Volume total: 599.441 KL
- Volume mapped: 484.560 KL
- Volume utilized: 328.650 KL
- Volume available: 114.881 KL

## Validation
`node backend/validate-data.mjs` — PASS (all checks)

`node backend/preflight.mjs` — PASS (all checks)

## Result
The supplied platform already contained the exact uploaded master workbook and reconciled data. v29 is the refreshed, packaged release with corrected release documentation and verification metadata; no source values were changed because doing so would make the platform diverge from the master workbook.


## Executive presentation changes (2026-10-23)
- Added the Product Play card directly below Planning Probability, using live mapping-derived counts and the latest available mapping date.
- Added explicit Currently Mapped and Date fields to the Planning Probability panel.
- Tightened workbook numeric parsing to reject malformed numeric tokens rather than extracting misleading partial numbers; supports commas, currency symbols, percentages, and parenthetical negatives.
- Important audit note: workbook values are preserved at source precision; no claim of zero defects is made until the workbook-specific reconciliation checks and stakeholder acceptance are run in the target environment.
