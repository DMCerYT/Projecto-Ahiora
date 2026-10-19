// Use the current workspace so project access is inherited from the API's filtering.
export function unpaidBillChoices(data) {
  const bills = new Map(data.bills.map((bill) => [bill.id, bill]));
  const payments = new Map(
    data.payments.map((payment) => [payment.occurrence_id, payment]),
  );
  const choices = data.occurrences
    .flatMap((row) => {
      const bill = bills.get(row.bill_id),
        payment = payments.get(row.id);
      if (
        row.status !== "unpaid" ||
        !bill ||
        (payment && payment.status !== "failed")
      )
        return [];
      return [{ row, bill, payment }];
    })
    .sort(
      (a, b) =>
        a.row.due_date.localeCompare(b.row.due_date) ||
        a.bill.name.localeCompare(b.bill.name),
    );
  const upcomingBills = new Set();
  return choices.filter(({ row }) => {
    if (row.due_date < data.today) return true;
    if (upcomingBills.has(row.bill_id)) return false;
    upcomingBills.add(row.bill_id);
    return true;
  });
}
