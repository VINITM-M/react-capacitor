ReactorPlan v32.6 — Source workbook reconciliation

Source workbook: finaldata(3).xlsx
Sheet: data for the platform (275 rows x 77 columns)
Inventory records: 272 (Excel rows 3–274; row 275 is a continuation of weekly schedule cells)
Site capacity values are sourced from rows 2–5 of the workbook. Workbook totals are not recomputed from reactor statuses.

Site source capacity (kL):
- CTO-2: total=44.0, mapped=35.5, utilized=35.5, available=8.5
- CTO-3: total=60.0, mapped=50.0, utilized=33.0, available=10.0
- CTO-5: total=187.8, mapped=161.8, utilized=101.8, available=26.0
- CTO-6: total=455.9, mapped=323.9, utilized=98.4, available=132.0
- CTO-SEZ: total=131.8, mapped=86.2, utilized=43.2, available=45.6
- Mexico: total=53.8, mapped=51.0, utilized=51.0, available=2.74
- Mirfield: total=22.0, mapped=22.0, utilized=22.0, available=0.0

Probability definitions shown in the dashboard are operational descriptions. The uploaded workbook has no Confirmed / High Probable / Visible field, so only manually categorized mappings are counted in those cards; workbook schedule rows remain category Workbook.

Capacity bar categories partition the source total: utilized, mapped-but-not-utilized, available (net of any maintenance capacity), maintenance, and residual/unallocated difference. This avoids double-counting utilization as separate from mapped capacity.
