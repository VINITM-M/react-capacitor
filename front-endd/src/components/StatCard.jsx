export default function StatCard({ label, value, hint, onClick }) {
  const content = <>
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
    {hint && <div className="stat-hint">{hint}</div>}
  </>;
  if (onClick) return <button type="button" className="stat-card stat-card-clickable" onClick={onClick} aria-label={`${label}: ${value}. Open details`}>{content}<span className="stat-card-link">View details →</span></button>;
  return <div className="stat-card">{content}</div>;
}
