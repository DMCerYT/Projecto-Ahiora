export const financeEntities = {
  incomes: {
    table: 'incomes',
    fields: ['description', 'reference_number', 'amount', 'collected_date', 'status']
  },
  expenses: {
    table: 'expenses',
    fields: ['description', 'category', 'reference_number', 'amount', 'paid_date', 'status']
  },
  providers: {
    table: 'providers',
    fields: ['name', 'service', 'reference_number', 'amount_due', 'payment_date', 'status']
  },
  employees: {
    table: 'employees',
    fields: ['name', 'role', 'reference_number', 'salary', 'payment_date', 'status']
  },
  'client-charges': {
    table: 'client_charges',
    fields: ['client_name', 'description', 'reference_number', 'amount', 'collection_date', 'status']
  },
  debts: {
    table: 'debts',
    fields: ['creditor', 'description', 'reference_number', 'amount', 'due_date', 'status']
  },
  bills: {
    table: 'bills',
    fields: [
      'payee',
      'bill_type',
      'reference_number',
      'amount',
      'due_date',
      'recurrence_type',
      'recurrence_day',
      'interval_days',
      'payment_method',
      'payment_link',
      'phone_number',
      'notes',
      'status'
    ]
  },
  'bill-payments': {
    table: 'bill_payments',
    fields: ['bill_id', 'amount', 'payment_date', 'confirmation_number']
  }
};
