const BASE = process.env.API_BASE || "http://127.0.0.1:4000";

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);
  const body = await response.arrayBuffer();
  return { status: response.status, type: response.headers.get("content-type") || "", body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const getEndpoints = [
  "/api/health",
  "/api/dashboard",
  "/api/equipment",
  "/api/reactors",
  "/api/availability",
  "/api/summary",
  "/api/capacity",
  "/api/mappings",
  "/api/mapping-options",
  "/api/volume",
  "/api/maintenance",
  "/api/audit",
  "/api/audit-logs",
  "/api/source-info",
];

for (const path of getEndpoints) {
  const result = await request(path);
  assert(result.status === 200, `${path}: expected 200, received ${result.status}`);
}

const source = await request("/api/download/source-workbook");
assert(source.status === 200, `/api/download/source-workbook: expected 200, received ${source.status}`);
assert(
  source.type.includes("spreadsheetml"),
  `/api/download/source-workbook: unexpected content type ${source.type}`
);

const invalidEquipment = await request("/api/equipment", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({})
});
assert(invalidEquipment.status === 400, "POST /api/equipment validation failed");

const invalidMapping = await request("/api/mappings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({})
});
assert(invalidMapping.status === 400, "POST /api/mappings validation failed");

const invalidMaintenance = await request("/api/maintenance", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({})
});
assert(invalidMaintenance.status === 400, "POST /api/maintenance validation failed");

const missingUid = "smoke-test-missing-uid";
for (const [method, path] of [
  ["PUT", `/api/equipment/${missingUid}`],
  ["DELETE", `/api/equipment/${missingUid}`],
  ["POST", `/api/equipment/${missingUid}/reserve`],
  ["POST", `/api/equipment/${missingUid}/release-reserve`],
  ["DELETE", `/api/mappings/${missingUid}`],
  ["DELETE", `/api/maintenance/${missingUid}`],
]) {
  const result = await request(path, { method, headers: { "Content-Type": "application/json" }, body: "{}" });
  assert(result.status === 404, `${method} ${path}: expected 404, received ${result.status}`);
}

const undo = await request("/api/equipment/undo-delete", { method: "POST" });
assert([200, 404].includes(undo.status), `POST /api/equipment/undo-delete: unexpected ${undo.status}`);

console.log(`PASS ${getEndpoints.length + 1} GET/download endpoints and mutation validation routes`);
