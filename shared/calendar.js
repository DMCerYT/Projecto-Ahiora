// Build calendar entries from persisted occurrences, never from a moving next-due date.
export function buildCalendarEvents(data) {
  const bills = new Map(data.bills.map((bill) => [bill.id, bill]));
  const occurrences = new Map(
    data.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  );
  const paidTransactions = new Set(
    data.payments.map((payment) => payment.transaction_id).filter(Boolean),
  );
  return [
    ...data.occurrences
      .filter((occurrence) => occurrence.status !== "canceled")
      .map((occurrence) => {
        const bill = bills.get(occurrence.bill_id);
        return {
          id: `due-${occurrence.id}`,
          title: bill.name,
          project_id: bill.project_id,
          amount_cents: occurrence.amount_cents,
          date: occurrence.due_date,
          kind: "billDue",
          status: occurrence.display_status,
          to: `/transactions?tab=bills#${occurrence.id}`,
        };
      }),
    ...data.payments.map((payment) => {
      const occurrence = occurrences.get(payment.occurrence_id),
        bill = bills.get(occurrence.bill_id);
      return {
        id: `payment-${payment.id}`,
        title: bill.name,
        project_id: bill.project_id,
        amount_cents: payment.amount_cents,
        date: payment.payment_date,
        kind: "payment",
        status: payment.status,
        to: `/transactions?tab=bills#${occurrence.id}`,
      };
    }),
    ...data.transactions
      .filter((tx) => tx.status === "recorded" && !paidTransactions.has(tx.id))
      .map((tx) => ({
        id: `transaction-${tx.id}`,
        title: tx.name,
        project_id: tx.project_id,
        property_id: tx.property_id,
        amount_cents: tx.amount_cents,
        date: tx.date,
        kind: tx.type,
        status: "recorded",
        to: `/transactions#${tx.id}`,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
