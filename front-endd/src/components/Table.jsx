const displayCell = value => {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "string" && /^\s*[-‐‑‒–—−]\s*$/u.test(value)) return "Unknown";
  return value;
};
const siteClass = value => `site-${String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export default function Table({ columns, rows, empty = "No records found." }) {
  return <div className="table-scroll"><table><thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>
    {rows.length === 0 ? <tr><td className="empty-cell" colSpan={columns.length}>{empty}</td></tr> : rows.map((row, index) => <tr key={row.uid ?? row.id ?? row.reactorId ?? row.reactor ?? index}>
      {columns.map(c => {
        const isSite = c.key === "site";
        return <td key={c.key} className={isSite && row[c.key] ? `site-cell ${siteClass(row[c.key])}` : ""}>{c.render ? c.render(row) : displayCell(row[c.key])}</td>;
      })}
    </tr>)}
  </tbody></table></div>;
}
