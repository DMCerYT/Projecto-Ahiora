// Rent income is the only transaction that can be recorded without a receipt ID.
export function isPropertyIncome(transaction) {
  return Boolean(transaction?.property_id) && transaction.type === "income";
}
