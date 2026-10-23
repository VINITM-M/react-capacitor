import { readFileSync } from "fs";

const root = new URL("../", import.meta.url).pathname;
const read = relative => readFileSync(new URL(relative, import.meta.url), "utf8");
const server = read("server.js");
const app = read("../frontend/src/App.jsx");
const analytics = read("../frontend/src/pages/Analytics.jsx");
const availability = read("../frontend/src/pages/Availability.jsx");
const reactors = read("../frontend/src/pages/Reactors.jsx");
const downloads = read("../frontend/src/pages/DownloadCenter.jsx");
const parser = read("../frontend/src/utils/workbookParser.js");
const exports = read("../frontend/src/utils/exportUtils.js");

const checks = [
  ["server syntax contract", !server.includes('app.post("/api/equipment/:uid/reserve"') && !server.includes('app.post("/api/equipment/:uid/release-reserve"')],
  ["required runtime helpers are implemented", ["function stageFromProductCode(code)", "function buildMappingOptions(db)", "function recalculateDerivedCapacity(db)", "function buildSiteTotals(rows = [])", "function syncHistoricalStatuses(db)"].every(helper => server.includes(helper))],
  ["backend performs a database startup check", server.includes("async function startBackend()") && server.includes("await readDB()") && server.includes("Startup check failed")],
  ["frontend reserve UI removed", !app.includes("reserveEquipment") && !app.includes('onReserve={reserve}')],
  ["reactor reserve status removed", !reactors.includes("<option>Reserved</option>")],
  ["availability maps directly", availability.includes("Map equipment") && availability.includes("onCreateMapping")],
  ["time-series analytics present", analytics.includes("Long-Range Planning Trends") && analytics.includes("activeMappings") && analytics.includes("timeSeriesHorizon")],
  ["analytics export includes time series", analytics.includes("timeSeries: analytics.timeSeries") && exports.includes('"Planning Trends"')],
  ["download center includes all operational datasets", ["Capacity Summary", "Availability", "Mapping", "Planning Calendar", "Analytics", "Reactor Master Data", "Dashboard", "Everything"].every(x => downloads.includes(`>${x}<`))],
  ["SAP Code retained in generated exports", downloads.includes("sapCode") && !downloads.includes("isHiddenExportColumn = key => /^sap")],
  ["Excel parsing and import enabled", downloads.includes("Excel Parsing and Data Sync") && downloads.includes("parseWorkbook") && parser.includes("export async function parseWorkbook") && server.includes("/api/import/workbook")],
  ["master workbook colours preserved", exports.includes('7030A0') && exports.includes('92D050') && exports.includes('FFFF00') && exports.includes('0070C0') && exports.includes('FF0000')],
  ["current platform Excel export enabled", downloads.includes("Current Platform Excel") && downloads.includes("downloadAll")],
];
for (const [name, ok] of checks) {
  if (!ok) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
}
console.log("PASS ReactorPlan frontend/backend preflight");
