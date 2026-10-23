# ReactorPlan v40 — source-data consistency report

**Source workbook:** `Equipment List & Live Tracker_M-Sheet file_14Oct26(2).xlsx`

## Imported source counts

- Equipment inventory: **272 records**
- Capacity Summary: **34 rows**
- Mapping Tracker: **326 planning intervals/records**
- Unique reactor IDs in the Mapping Tracker (punctuation-normalized): **193**
- Unique product/product codes: **112**
- Client/project register: **133 rows**
- Volume Summary: **10 rows** (7 site totals plus 3 block-level rows)

## Authoritative capacity totals (Capacity Summary sheet)

| Metric | Excel value |
|---|---:|
| Total capacity | 955.418 kL |
| Utilized capacity | 385.005 kL |
| Mapped capacity | 730.725 kL |
| Available capacity | 224.693 kL |

Utilized capacity is a subset of mapped capacity. The total breakdown is therefore **utilized + (mapped − utilized) + available**, not utilized + mapped + available.

## Source workbook discrepancy retained transparently

The individual reactor capacity fields sum to **955.504 kL**, while the Capacity Summary sheet totals **955.418 kL**. The difference is **0.086 kL**; site differences are `{'CTO-6': 0.08, 'Mexico': 0.006}`. This discrepancy exists in the uploaded workbook itself. ReactorPlan preserves individual reactor capacities exactly as entered and uses Capacity Summary as the authoritative source for aggregate capacity cards/graphs; it does not silently change source values to force the totals to match.

## Fixes in this package

1. The workbook parser now reads the physical equipment inventory from `Mapping Tracker` when the site-named tabs are client/project registers.
2. Site-named tabs are parsed as client/project records, retaining client, product, stage, reactor IDs, timeline, area and block.
3. Mapping Tracker rows are split into continuous weekly intervals by schedule value and Excel cell-fill category. Green = Confirmed, yellow = High Probable, amber/gold = Visible.
4. The per-interval probability category is no longer overwritten by the first category seen for that reactor.
5. Duplicate reactor IDs are preserved when their block/area differs; import identity and mapping links use site + reactor ID + block + area.
6. The import payload now marks Capacity Summary totals as authoritative, preventing backend recalculation from replacing 955.418 kL with the 955.504 kL inventory sum.
7. Monthly Summary parsing keeps Mapped, Occupied and Ideal values in separate month groups.
8. Volume Summary parsing uses the source sheet's values in kL and correctly resolves labels when the sheet's used range starts in column D.
9. Capacity cards display three decimal places and recalculate from filtered rows when a search is active.
10. Analytics status counts normalize case/aliases; Reactor Master inventory status labels are distinguished from unique planned reactor counts.
