import { readFileSync, existsSync } from "fs";
const files = ["src/App.jsx","src/components/Layout.jsx","src/components/MapEquipment.jsx","src/components/ProductPlayCard.jsx","src/pages/Availability.jsx","src/pages/Admin.jsx","src/pages/Analytics.jsx","src/pages/Calendar.jsx","src/pages/ClientInformation.jsx","src/pages/Dashboard.jsx","src/pages/DownloadCenter.jsx","src/pages/Site.jsx","src/api.js"];
for (const file of files) {
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
  const text = readFileSync(file,"utf8");
  for (const [open, close] of [["{","}"],["(",")"],["[","]"]]) {
    const a=[...text].filter(c=>c===open).length, b=[...text].filter(c=>c===close).length;
    if(a!==b) throw new Error(`${file}: unbalanced ${open}${close}`);
  }
}
const app=readFileSync("src/App.jsx","utf8");
const api=readFileSync("src/api.js","utf8");
const checks=[
  [app.includes('Availability') && app.includes('onCreateMapping'), 'availability/equipment mapping integration'],
  [app.includes('updateMaintenance'), 'maintenance update wiring'],
  [api.includes('updateMaintenance'), 'maintenance update API'],
  [readFileSync("src/pages/Analytics.jsx","utf8").includes("Long-Range Planning Trends") && readFileSync("src/pages/Analytics.jsx","utf8").includes("exportEdaVisualWorkbook"), 'analytics time-series and visual workbook'],
  [readFileSync("src/pages/DownloadCenter.jsx","utf8").includes("Operational Report"), 'operational report export'],
  [readFileSync("src/pages/Availability.jsx","utf8").includes("stageOptions") && !readFileSync("src/pages/Availability.jsx","utf8").includes("Custom stage"), 'controlled stage dropdown'],
  [readFileSync("src/pages/Availability.jsx","utf8").includes("MAPPING_CATEGORIES") && readFileSync("src/pages/Availability.jsx","utf8").includes("High Probable") && readFileSync("src/pages/Availability.jsx","utf8").includes("Visible"), 'mapping probability dropdown'],
];
checks.push([!readFileSync("src/pages/DownloadCenter.jsx","utf8").includes("Export Preview"), "download center has no export preview table"]);
checks.push([readFileSync("src/components/ProductPlayCard.jsx","utf8").includes("Product Information") && readFileSync("src/components/ProductPlayCard.jsx","utf8").includes("Previous Product Information page") && readFileSync("src/components/ProductPlayCard.jsx","utf8").includes("Next Product Information page"), "Product Information arrow navigation"]);
checks.push([readFileSync("src/components/MapEquipment.jsx","utf8").includes("Previous equipment") && readFileSync("src/components/MapEquipment.jsx","utf8").includes("Next equipment"), "Map Equipment arrow navigation"]);
checks.push([readFileSync("src/pages/ClientInformation.jsx","utf8").includes('<th>Client Name</th><th>Product Name</th><th>Stage Code</th>') && readFileSync("src/pages/ClientInformation.jsx","utf8").includes("MapEquipment"), "client-first information table and Map Equipment carousel"]);
checks.push([!readFileSync("src/components/ProductPlayCard.jsx","utf8").includes('<th>Project Code</th>') && !readFileSync("src/pages/Dashboard.jsx","utf8").includes('<th>Project Code(s)</th>') && !readFileSync("src/pages/Site.jsx","utf8").includes('label:"Project Code"'), "duplicate code columns removed from mapping details"]);
checks.push([readFileSync("src/utils/exportUtils.js","utf8").includes('const legacyCodeFields = new Set(["stage", "stages", "productCode", "projectCode", "productCodes", "projectCodes"])') && !readFileSync("src/utils/exportUtils.js","utf8").includes('"Project Code": row.projectCode || ""'), "single Stage Code field in normalized downloads and client register"]);
checks.push([!readFileSync("src/pages/Admin.jsx","utf8").includes('<option>Project Code</option>') && readFileSync("src/pages/Admin.jsx","utf8").includes('maintenanceSearchBy === "Stage Code"'), "single Stage Code filter replaces duplicate project-code filters"]);
checks.push([readFileSync("src/App.jsx","utf8").includes("manualRefresh") && !readFileSync("src/App.jsx","utf8").includes("setInterval(refresh"), "manual refresh without constant polling"]);
checks.push([readFileSync("src/utils/exportUtils.js","utf8").includes('"Planning Trends"') && readFileSync("src/utils/exportUtils.js","utf8").includes('doc.addPage()'), "five-part visual EDA exports"]);
const layout=readFileSync("src/components/Layout.jsx","utf8");
checks.push([layout.includes('refresh-button-label') && layout.includes('Updating data…') && layout.includes('<svg viewBox="0 0 24 24"'), "explicit refresh action with visible busy state"]);
const exports=readFileSync("src/utils/exportUtils.js","utf8");
checks.push([exports.includes('<c:dPt>') && exports.includes('2563EB') && exports.includes('appendVisualAnalysisSheets') && exports.includes('Category Mix'), "colourful Excel bar/pie charts and source-derived visual summaries"]);
const mapEquipment=readFileSync("src/components/MapEquipment.jsx","utf8");
checks.push([mapEquipment.includes("totalEquipment") && mapEquipment.includes("Total Reactors") && mapEquipment.includes("Available"), "Map Equipment clearly separates available subset from total inventory"]);
const calendar=readFileSync("src/pages/Calendar.jsx","utf8");
checks.push([calendar.includes("distinct reactors with at least one matching planning period") && calendar.includes("exclusive highest-confidence counts"), "planning confidence counts explain overlap"]);
const dashboard=readFileSync("src/pages/Dashboard.jsx","utf8");
checks.push([dashboard.includes('const groupKey = name.toLowerCase();') && dashboard.includes('const mappedProductCount = productInformation.length;'), "Product Information counts unique Product Names"]);
const productCard=readFileSync("src/components/ProductPlayCard.jsx","utf8");
checks.push([productCard.includes("inventoryMetrics.statusFor(row)") && productCard.includes("_inventoryStatus || \"Unknown\""), "Product Information uses derived inventory status"]);
const downloads=readFileSync("src/pages/DownloadCenter.jsx","utf8");
checks.push([layout.includes('onClick={() => setPage("downloads")}') && !layout.includes("download-cto-nav"), "Downloads opens the full export center without nested dropdowns"]);
checks.push([downloads.includes("INTERNAL_SOURCE_FIELDS") && !downloads.includes("sourceSheet: \"Source Sheet\""), "raw source metadata is excluded from user-facing download fields"]);
checks.push([!readFileSync("src/pages/Analytics.jsx","utf8").includes("workbook schedule coverage") && !readFileSync("src/pages/Analytics.jsx","utf8").includes("source time series available"), "EDA uses plain-language planning coverage labels"]);
for(const [ok,label] of checks) if(!ok) throw new Error(`Missing ${label}`);
console.log(`PASS frontend UI contract checks (${files.length} files; ${checks.length} contracts)`);
