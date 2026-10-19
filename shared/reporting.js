export const periods = ["ytd", "month", "threeMonths", "year", "lifetime"];

export function periodStart(today, period) {
  if (period === "lifetime") return "1970-01-01";
  if (period === "ytd") return `${today.slice(0, 4)}-01-01`;
  if (period === "month") return `${today.slice(0, 7)}-01`;
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - (period === "threeMonths" ? 3 : 12));
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function inPeriod(transaction, today, period) {
  return (
    transaction.date >= periodStart(today, period) && transaction.date <= today
  );
}

export function financialTotals(transactions, budget = 0) {
  const total = { expense_cents: 0, income_cents: 0, refund_cents: 0 };
  for (const tx of transactions) {
    if (tx.status === "recorded") total[`${tx.type}_cents`] += tx.amount_cents;
  }
  total.net_cents =
    total.income_cents + total.refund_cents - total.expense_cents;
  total.available_cents = budget + total.net_cents;
  return total;
}
