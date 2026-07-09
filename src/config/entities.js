export const entityConfigs = {
  incomes: {
    path: '/incomes',
    titleKey: 'entities.incomes',
    table: 'incomes',
    amountField: 'amount',
    dateField: 'collected_date',
    statusField: 'status',
    statusPaidValue: 'collected',
    columns: [
      { key: 'description', labelKey: 'description' },
      { key: 'reference_number', labelKey: 'referenceNumber' },
      { key: 'amount', labelKey: 'amount', type: 'currency' },
      { key: 'collected_date', labelKey: 'collectedDate', type: 'date' },
      { key: 'status', labelKey: 'status', type: 'status' }
    ],
    fields: [
      { name: 'description', labelKey: 'description', type: 'text', required: true },
      { name: 'reference_number', labelKey: 'referenceNumber', type: 'text' },
      { name: 'amount', labelKey: 'amount', type: 'number', required: true },
      { name: 'collected_date', labelKey: 'collectedDate', type: 'date', required: true },
      {
        name: 'status',
        labelKey: 'status',
        type: 'select',
        options: ['collected', 'pending'],
        required: true
      }
    ]
  },
  expenses: {
    path: '/expenses',
    titleKey: 'entities.expenses',
    table: 'expenses',
    amountField: 'amount',
    dateField: 'paid_date',
    statusField: 'status',
    statusPaidValue: 'paid',
    columns: [
      { key: 'description', labelKey: 'description' },
      { key: 'category', labelKey: 'category' },
      { key: 'reference_number', labelKey: 'referenceNumber' },
      { key: 'amount', labelKey: 'amount', type: 'currency' },
      { key: 'paid_date', labelKey: 'paidDate', type: 'date' },
      { key: 'status', labelKey: 'status', type: 'status' }
    ],
    fields: [
      { name: 'description', labelKey: 'description', type: 'text', required: true },
      { name: 'category', labelKey: 'category', type: 'text' },
      { name: 'reference_number', labelKey: 'referenceNumber', type: 'text' },
      { name: 'amount', labelKey: 'amount', type: 'number', required: true },
      { name: 'paid_date', labelKey: 'paidDate', type: 'date', required: true },
      { name: 'status', labelKey: 'status', type: 'select', options: ['paid', 'pending'], required: true }
    ]
  },
  providers: {
    path: '/providers',
    titleKey: 'entities.providers',
    table: 'providers',
    calendarDateField: 'payment_date',
    calendarAmountField: 'amount_due',
    calendarLabelField: 'name',
    columns: [
      { key: 'name', labelKey: 'provider' },
      { key: 'service', labelKey: 'service' },
      { key: 'reference_number', labelKey: 'referenceNumber' },
      { key: 'amount_due', labelKey: 'amountDue', type: 'currency' },
      { key: 'payment_date', labelKey: 'paymentDate', type: 'date' },
      { key: 'status', labelKey: 'status', type: 'status' }
    ],
    fields: [
      { name: 'name', labelKey: 'providerName', type: 'text', required: true },
      { name: 'service', labelKey: 'service', type: 'text' },
      { name: 'reference_number', labelKey: 'referenceNumber', type: 'text' },
      { name: 'amount_due', labelKey: 'amountDue', type: 'number' },
      { name: 'payment_date', labelKey: 'paymentDate', type: 'date' },
      { name: 'status', labelKey: 'status', type: 'select', options: ['pending', 'paid'] }
    ]
  },
  employees: {
    path: '/employees',
    titleKey: 'entities.employees',
    table: 'employees',
    calendarDateField: 'payment_date',
    calendarAmountField: 'salary',
    calendarLabelField: 'name',
    columns: [
      { key: 'name', labelKey: 'employee' },
      { key: 'role', labelKey: 'role' },
      { key: 'reference_number', labelKey: 'referenceNumber' },
      { key: 'salary', labelKey: 'salary', type: 'currency' },
      { key: 'payment_date', labelKey: 'paymentDate', type: 'date' },
      { key: 'status', labelKey: 'status', type: 'status' }
    ],
    fields: [
      { name: 'name', labelKey: 'employeeName', type: 'text', required: true },
      { name: 'role', labelKey: 'role', type: 'text' },
      { name: 'reference_number', labelKey: 'referenceNumber', type: 'text' },
      { name: 'salary', labelKey: 'salary', type: 'number' },
      { name: 'payment_date', labelKey: 'paymentDate', type: 'date' },
      { name: 'status', labelKey: 'status', type: 'select', options: ['pending', 'paid'] }
    ]
  },
  'client-charges': {
    path: '/client-charges',
    titleKey: 'entities.clientCharges',
    table: 'client_charges',
    amountField: 'amount',
    dateField: 'collection_date',
    statusField: 'status',
    statusPaidValue: 'collected',
    calendarDateField: 'collection_date',
    calendarAmountField: 'amount',
    calendarLabelField: 'client_name',
    columns: [
      { key: 'client_name', labelKey: 'client' },
      { key: 'description', labelKey: 'description' },
      { key: 'reference_number', labelKey: 'referenceNumber' },
      { key: 'amount', labelKey: 'amount', type: 'currency' },
      { key: 'collection_date', labelKey: 'collectionDate', type: 'date' },
      { key: 'status', labelKey: 'status', type: 'status' }
    ],
    fields: [
      { name: 'client_name', labelKey: 'clientName', type: 'text', required: true },
      { name: 'description', labelKey: 'description', type: 'text' },
      { name: 'reference_number', labelKey: 'referenceNumber', type: 'text' },
      { name: 'amount', labelKey: 'amount', type: 'number', required: true },
      { name: 'collection_date', labelKey: 'collectionDate', type: 'date', required: true },
      {
        name: 'status',
        labelKey: 'status',
        type: 'select',
        options: ['pending', 'collected'],
        required: true
      }
    ]
  },
  debts: {
    path: '/debts',
    titleKey: 'entities.debts',
    table: 'debts',
    amountField: 'amount',
    dateField: 'due_date',
    statusField: 'status',
    statusPaidValue: 'paid',
    calendarDateField: 'due_date',
    calendarAmountField: 'amount',
    calendarLabelField: 'creditor',
    columns: [
      { key: 'creditor', labelKey: 'creditor' },
      { key: 'description', labelKey: 'description' },
      { key: 'reference_number', labelKey: 'referenceNumber' },
      { key: 'amount', labelKey: 'amount', type: 'currency' },
      { key: 'due_date', labelKey: 'dueDate', type: 'date' },
      { key: 'status', labelKey: 'status', type: 'status' }
    ],
    fields: [
      { name: 'creditor', labelKey: 'creditor', type: 'text', required: true },
      { name: 'description', labelKey: 'description', type: 'text' },
      { name: 'reference_number', labelKey: 'referenceNumber', type: 'text' },
      { name: 'amount', labelKey: 'amount', type: 'number', required: true },
      { name: 'due_date', labelKey: 'dueDate', type: 'date', required: true },
      { name: 'status', labelKey: 'status', type: 'select', options: ['pending', 'paid'], required: true }
    ]
  },
  bills: {
    path: '/bills',
    titleKey: 'entities.bills',
    table: 'bills',
    amountField: 'amount',
    dateField: 'due_date',
    statusField: 'status',
    statusPaidValue: 'paid',
    calendarDateField: 'due_date',
    calendarAmountField: 'amount',
    calendarLabelField: 'payee',
    columns: [
      { key: 'payee', labelKey: 'payee' },
      { key: 'bill_type', labelKey: 'billType' },
      { key: 'reference_number', labelKey: 'referenceNumber' },
      { key: 'amount', labelKey: 'amount', type: 'currency' },
      { key: 'due_date', labelKey: 'dueDate', type: 'date' },
      { key: 'recurrence_type', labelKey: 'recurrence', type: 'recurrence' },
      { key: 'payment_method', labelKey: 'paymentMethod' },
      { key: 'status', labelKey: 'status', type: 'status' }
    ],
    fields: [
      { name: 'payee', labelKey: 'payee', type: 'text', required: true },
      { name: 'bill_type', labelKey: 'billType', type: 'text' },
      { name: 'reference_number', labelKey: 'referenceNumber', type: 'text' },
      { name: 'amount', labelKey: 'amount', type: 'number', required: true },
      { name: 'due_date', labelKey: 'dueDate', type: 'date', required: true },
      {
        name: 'recurrence_type',
        labelKey: 'recurrence',
        type: 'select',
        options: ['once', 'monthly', 'interval_days'],
        required: true
      },
      { name: 'recurrence_day', labelKey: 'dayOfMonth', type: 'number' },
      { name: 'interval_days', labelKey: 'intervalDays', type: 'number' },
      { name: 'payment_method', labelKey: 'paymentMethod', type: 'text' },
      { name: 'payment_link', labelKey: 'paymentLink', type: 'url' },
      { name: 'phone_number', labelKey: 'phoneNumber', type: 'tel' },
      { name: 'notes', labelKey: 'notes', type: 'text' },
      { name: 'status', labelKey: 'status', type: 'select', options: ['pending', 'paid'], required: true }
    ]
  }
};

export const navItems = [
  { to: '/', labelKey: 'dashboard' },
  ...Object.values(entityConfigs).map((config) => ({
    to: config.path,
    labelKey: config.titleKey
  }))
];
