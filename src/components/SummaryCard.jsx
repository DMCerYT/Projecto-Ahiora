import { formatCurrency } from '../utils/formatters.js';

function SummaryCard({ label, value, tone = 'neutral' }) {
  return (
    <section className={`summaryCard ${tone}`}>
      <span>{label}</span>
      <strong>{typeof value === 'number' ? formatCurrency(value) : value}</strong>
    </section>
  );
}

export default SummaryCard;
