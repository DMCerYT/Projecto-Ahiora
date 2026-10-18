export default function SummaryCard({ label, value, tone = "neutral" }) {
  return (
    <article className={`summaryCard ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
