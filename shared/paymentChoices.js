// Use the current workspace so project access is inherited from the API's filtering.
export function unpaidBillChoices(data) {
  const projects = new Map(
    data.projects.map((project) => [project.id, project]),
  );
  const bills = new Map(data.bills.map((bill) => [bill.id, bill]));
  const payments = new Map(
    data.payments.map((payment) => [payment.occurrence_id, payment]),
  );
  return data.occurrences
    .flatMap((row) => {
      const bill = bills.get(row.bill_id),
        project = projects.get(bill?.project_id),
        payment = payments.get(row.id);
      if (
        row.status !== "unpaid" ||
        !project ||
        project.status === "archived" ||
        (payment && payment.status !== "failed")
      )
        return [];
      return [{ row, bill, project, payment }];
    })
    .sort(
      (a, b) =>
        a.row.due_date.localeCompare(b.row.due_date) ||
        a.bill.name.localeCompare(b.bill.name),
    );
}
