import { useEffect, useMemo, useState } from 'react';
import CalendarPayments from '../components/CalendarPayments.jsx';
import SummaryCard from '../components/SummaryCard.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { getDashboardRecords } from '../lib/financeService.js';
import { isDateInCurrentMonth } from '../utils/formatters.js';

function Dashboard({ user }) {
  const { t } = useLanguage();
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const { data } = await getDashboardRecords(user.id);
        setRecords(data);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [user.id]);

  const summary = useMemo(() => {
    const incomes = records.incomes || [];
    const expenses = records.expenses || [];
    const debts = records.debts || [];
    const clientCharges = records.client_charges || [];
    const bills = records.bills || [];

    const monthlyIncome = sumByStatusAndMonth(incomes, 'amount', 'collected_date', 'status', 'collected');
    const monthlyExpenses = sumByStatusAndMonth(expenses, 'amount', 'paid_date', 'status', 'paid');
    const pendingDebts = sumByStatus(debts, 'amount', 'status', 'pending');
    const pendingClientCharges = sumByStatus(clientCharges, 'amount', 'status', 'pending');

    return {
      monthlyIncome,
      monthlyExpenses,
      profit: monthlyIncome - monthlyExpenses,
      pendingDebts,
      pendingClientCharges,
      upcomingBills: sumByStatus(bills, 'amount', 'status', 'pending'),
      upcomingPayments: buildCalendarItems(records).length
    };
  }, [records]);

  const calendarItems = useMemo(() => buildCalendarItems(records), [records]);

  return (
    <div className="pageStack">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">{t('currentMonth')}</p>
          <h1>{t('dashboard')}</h1>
        </div>
      </header>

      {error && <div className="errorBox">{error}</div>}

      <div className="summaryGrid">
        <SummaryCard label={t('collectedIncome')} value={summary.monthlyIncome} tone="positive" />
        <SummaryCard label={t('paidExpenses')} value={summary.monthlyExpenses} tone="warning" />
        <SummaryCard label={t('profit')} value={summary.profit} tone={summary.profit >= 0 ? 'positive' : 'danger'} />
        <SummaryCard label={t('pendingDebts')} value={summary.pendingDebts} tone="danger" />
        <SummaryCard label={t('pendingClientCharges')} value={summary.pendingClientCharges} tone="neutral" />
        <SummaryCard label={t('upcomingBills')} value={summary.upcomingBills} tone="warning" />
        <SummaryCard label={t('upcomingPayments')} value={String(summary.upcomingPayments)} tone="neutral" />
      </div>

      <section className="contentSection">
        <div className="sectionHeader">
          <div>
            <p className="eyebrow">{t('calendar')}</p>
            <h2>{t('paymentsAndCollections')}</h2>
          </div>
        </div>
        <CalendarPayments items={calendarItems} loading={loading} />
      </section>
    </div>
  );
}

function sumByStatusAndMonth(items, amountField, dateField, statusField, paidValue) {
  return items
    .filter((item) => item[statusField] === paidValue && isDateInCurrentMonth(item[dateField]))
    .reduce((total, item) => total + Number(item[amountField] || 0), 0);
}

function sumByStatus(items, amountField, statusField, pendingValue) {
  return items
    .filter((item) => item[statusField] === pendingValue)
    .reduce((total, item) => total + Number(item[amountField] || 0), 0);
}

function buildCalendarItems(records) {
  const providers = records.providers || [];
  const employees = records.employees || [];
  const clientCharges = records.client_charges || [];
  const debts = records.debts || [];
  const bills = records.bills || [];
  const billPayments = records.bill_payments || [];

  return [
    ...providers.map((item) => ({
      id: item.id,
      typeKey: 'providerPayment',
      kind: 'provider',
      title: item.name,
      amount: item.amount_due,
      date: item.payment_date
    })),
    ...employees.map((item) => ({
      id: item.id,
      typeKey: 'employeePayment',
      kind: 'employee',
      title: item.name,
      amount: item.salary,
      date: item.payment_date
    })),
    ...clientCharges.map((item) => ({
      id: item.id,
      typeKey: 'clientCollection',
      kind: 'client',
      title: item.client_name,
      amount: item.amount,
      date: item.collection_date
    })),
    ...debts.map((item) => ({
      id: item.id,
      typeKey: 'debtDue',
      kind: 'debt',
      title: item.creditor,
      amount: item.amount,
      date: item.due_date
    })),
    ...bills.map((item) => ({
      id: item.id,
      typeKey: 'billDue',
      kind: 'bill',
      status: item.status,
      title: item.payee,
      amount: item.amount,
      date: item.due_date,
      paymentMethod: item.payment_method,
      paymentLink: item.payment_link,
      phoneNumber: item.phone_number,
      notes: item.notes,
      recurrenceType: item.recurrence_type,
      recurrenceDay: item.recurrence_day,
      intervalDays: item.interval_days
    })),
    ...billPayments.map((item) => ({
      id: item.id,
      typeKey: 'billPaid',
      kind: 'paid',
      status: 'paid',
      title: item.payee,
      amount: item.amount,
      date: item.payment_date,
      confirmationNumber: item.confirmation_number
    }))
  ]
    .filter((item) => item.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

export default Dashboard;
