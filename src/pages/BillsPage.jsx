import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import {
  deleteAttachment,
  deleteRecord,
  listAttachments,
  listBillPayments,
  listRecords,
  recordBillPayment,
  saveRecord,
  uploadAttachments
} from '../lib/financeService.js';
import { formatCurrency, formatDate, getTodayDateInputValue } from '../utils/formatters.js';

const emptyReminder = {
  payee: '',
  bill_type: 'Credit card',
  reference_number: '',
  amount: '',
  due_date: getNextMonthlyDueDate(15),
  recurrence_type: 'monthly',
  recurrence_day: 15,
  interval_days: '',
  payment_method: '',
  payment_link: '',
  phone_number: '',
  notes: '',
  status: 'pending'
};

function BillsPage() {
  const { t } = useLanguage();
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [billAttachments, setBillAttachments] = useState([]);
  const [paymentAttachments, setPaymentAttachments] = useState([]);
  const [formData, setFormData] = useState(emptyReminder);
  const [editingBill, setEditingBill] = useState(null);
  const [paymentBill, setPaymentBill] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [setupFiles, setSetupFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadBills();
  }, []);

  async function loadBills() {
    setLoading(true);
    setError('');

    try {
      const [billRows, billFiles, paymentRows, paymentFiles] = await Promise.all([
        listRecords('bills'),
        listAttachments('bills'),
        listBillPayments(),
        listAttachments('bill-payments')
      ]);

      setBills(billRows.data || []);
      setBillAttachments(billFiles.data || []);
      setPayments(paymentRows.data || []);
      setPaymentAttachments(paymentFiles.data || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(event) {
    const { name, value, type } = event.target;
    setFormData((current) => ({
      ...current,
      ...getReminderUpdates(current, name, type === 'number' ? Number(value) : value)
    }));
  }

  function startEdit(bill) {
    setEditingBill(bill);
    setFormData({
      ...emptyReminder,
      ...bill,
      recurrence_type: bill.recurrence_type || 'monthly',
      recurrence_day: bill.recurrence_day || 15
    });
    setSetupFiles([]);
  }

  function resetForm() {
    setEditingBill(null);
    setFormData(emptyReminder);
    setSetupFiles([]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const response = await saveRecord('bills', formData, editingBill?.id);
      const recordId = editingBill?.id || response.id;

      if (setupFiles.length && recordId) {
        await uploadAttachments('bills', recordId, setupFiles);
      }

      resetForm();
      loadBills();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBill(id) {
    if (!window.confirm(t('deleteConfirm'))) return;

    setError('');
    try {
      await deleteRecord('bills', id);
      loadBills();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function handleDeleteAttachment(id) {
    if (!window.confirm(t('deleteAttachmentConfirm'))) return;

    setError('');
    try {
      await deleteAttachment(id);
      setBillAttachments((current) => current.filter((attachment) => attachment.id !== id));
      setPaymentAttachments((current) => current.filter((attachment) => attachment.id !== id));
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  const billAttachmentsByRecord = useMemo(() => groupAttachments(billAttachments), [billAttachments]);
  const paymentAttachmentsByRecord = useMemo(() => groupAttachments(paymentAttachments), [paymentAttachments]);

  return (
    <div className="pageStack">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">{t('reminderSetup')}</p>
          <h1>{t('entities.bills')}</h1>
        </div>
      </header>

      {error && <div className="errorBox">{error}</div>}

      <section className="billWorkspace">
        <form className="formPanel reminderForm" onSubmit={handleSubmit}>
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">{t('setReminder')}</p>
              <h2>{editingBill ? t('editReminder') : t('newReminder')}</h2>
            </div>
            {editingBill && (
              <button type="button" className="secondaryActionButton" onClick={resetForm}>
                {t('cancel')}
              </button>
            )}
          </div>

          <div className="quickReminder">
            <button type="button" className="smallButton" onClick={() => setFormData((current) => applyMonthlyPreset(current, 'Credit card', 15))}>
              {t('creditCard15th')}
            </button>
            <button type="button" className="smallButton" onClick={() => setFormData((current) => applyMonthlyPreset(current, 'Mortgage', 1))}>
              {t('mortgageMonthly')}
            </button>
            <button type="button" className="smallButton" onClick={() => setFormData((current) => applyIntervalPreset(current, 30))}>
              {t('every30Days')}
            </button>
          </div>

          <div className="formGrid">
            <label>
              {t('payee')}
              <input name="payee" value={formData.payee} onChange={handleChange} required />
            </label>
            <label>
              {t('billType')}
              <input name="bill_type" value={formData.bill_type || ''} onChange={handleChange} />
            </label>
            <label>
              {t('amount')}
              <input name="amount" type="number" step="0.01" value={formData.amount} onChange={handleChange} required />
            </label>
            <label>
              {t('nextDueDate')}
              <input name="due_date" type="date" value={formData.due_date || ''} onChange={handleChange} required />
            </label>
            <label>
              {t('recurrence')}
              <select name="recurrence_type" value={formData.recurrence_type} onChange={handleChange}>
                <option value="monthly">{t('recurrence_monthly')}</option>
                <option value="interval_days">{t('recurrence_interval_days')}</option>
                <option value="once">{t('recurrence_once')}</option>
              </select>
            </label>
            {formData.recurrence_type === 'monthly' && (
              <label>
                {t('dayOfMonth')}
                <input name="recurrence_day" type="number" min="1" max="31" value={formData.recurrence_day || ''} onChange={handleChange} />
              </label>
            )}
            {formData.recurrence_type === 'interval_days' && (
              <label>
                {t('intervalDays')}
                <input name="interval_days" type="number" min="1" value={formData.interval_days || ''} onChange={handleChange} />
              </label>
            )}
            <label>
              {t('referenceNumber')}
              <input name="reference_number" value={formData.reference_number || ''} onChange={handleChange} />
            </label>
            <label>
              {t('paymentMethod')}
              <input name="payment_method" value={formData.payment_method || ''} onChange={handleChange} placeholder={t('paymentMethodPlaceholder')} />
            </label>
            <label>
              {t('paymentLink')}
              <input name="payment_link" type="url" value={formData.payment_link || ''} onChange={handleChange} />
            </label>
            <label>
              {t('phoneNumber')}
              <input name="phone_number" type="tel" value={formData.phone_number || ''} onChange={handleChange} />
            </label>
            <label className="fullSpan">
              {t('notes')}
              <input name="notes" value={formData.notes || ''} onChange={handleChange} />
            </label>
          </div>

          <label className="fileInput">
            {t('setupFiles')}
            <input type="file" multiple onChange={(event) => setSetupFiles(Array.from(event.target.files || []))} />
            <span className="fieldHint">{t('setupFilesHint')}</span>
          </label>

          <button className="primaryButton" type="submit" disabled={saving}>
            {saving ? t('saving') : editingBill ? t('saveReminder') : t('createReminder')}
          </button>
        </form>

        <section className="contentSection">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">{t('dueSchedule')}</p>
              <h2>{t('activeReminders')}</h2>
            </div>
          </div>

          {loading ? (
            <div className="stateBox">{t('loadingRecords')}</div>
          ) : !bills.length ? (
            <div className="stateBox">{t('noBillReminders')}</div>
          ) : (
            <div className="reminderList">
              {bills.map((bill) => (
                <article key={bill.id} className="reminderCard">
                  <div className="reminderMain">
                    <div>
                      <strong>{bill.payee}</strong>
                      <span>{bill.bill_type || t('billDue')}</span>
                    </div>
                    <div>
                      <strong>{formatCurrency(bill.amount)}</strong>
                      <span>{t('nextDueDate')}: {formatDate(bill.due_date)}</span>
                    </div>
                    <span className={`statusPill ${bill.status === 'paid' ? 'paid' : 'pending'}`}>
                      {t(`status_${bill.status || 'pending'}`)}
                    </span>
                  </div>

                  <div className="reminderDetails">
                    <span>{formatRecurrence(bill, t)}</span>
                    {bill.payment_method && <span>{t('paymentMethod')}: {bill.payment_method}</span>}
                    {bill.payment_link && <a href={bill.payment_link} target="_blank" rel="noreferrer">{t('paymentLink')}</a>}
                    {bill.phone_number && <span>{t('phoneNumber')}: {bill.phone_number}</span>}
                  </div>

                  <AttachmentRow
                    attachments={billAttachmentsByRecord[bill.id] || []}
                    onPreviewAttachment={setPreviewAttachment}
                    onDeleteAttachment={handleDeleteAttachment}
                  />

                  <div className="reminderActions">
                    <button type="button" className="primaryButton" onClick={() => setPaymentBill(bill)}>
                      {t('recordPayment')}
                    </button>
                    <button type="button" className="smallButton" onClick={() => startEdit(bill)}>
                      {t('editReminder')}
                    </button>
                    <button type="button" className="smallButton danger" onClick={() => handleDeleteBill(bill.id)}>
                      {t('delete')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <BillPaymentHistory
        payments={payments}
        attachmentsByPayment={paymentAttachmentsByRecord}
        onPreviewAttachment={setPreviewAttachment}
        onDeleteAttachment={handleDeleteAttachment}
      />

      {paymentBill && (
        <BillPaymentModal
          bill={paymentBill}
          loading={saving}
          onSubmit={async (payment, files) => {
            setSaving(true);
            setError('');
            try {
              await recordBillPayment(paymentBill.id, payment, files);
              setPaymentBill(null);
              loadBills();
            } catch (paymentError) {
              setError(paymentError.message);
            } finally {
              setSaving(false);
            }
          }}
          onClose={() => setPaymentBill(null)}
        />
      )}

      {previewAttachment && <FilePreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />}
    </div>
  );
}

function AttachmentRow({ attachments, onPreviewAttachment, onDeleteAttachment }) {
  const { t } = useLanguage();

  if (!attachments.length) return null;

  return (
    <div className="tableAttachmentList">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="tableAttachmentItem">
          <button type="button" className="fileChip" onClick={() => onPreviewAttachment(attachment)}>
            {attachment.name}
          </button>
          <button type="button" className="iconTextButton danger" onClick={() => onDeleteAttachment(attachment.id)}>
            {t('delete')}
          </button>
        </div>
      ))}
    </div>
  );
}

function BillPaymentHistory({ payments, attachmentsByPayment, onPreviewAttachment, onDeleteAttachment }) {
  const { t } = useLanguage();

  return (
    <section className="contentSection">
      <div className="sectionHeader">
        <div>
          <p className="eyebrow">{t('paymentRecords')}</p>
          <h2>{t('paymentHistory')}</h2>
        </div>
      </div>

      {!payments.length ? (
        <div className="stateBox">{t('noPaymentsRecorded')}</div>
      ) : (
        <div className="paymentHistoryList">
          {payments.map((payment) => (
            <article key={payment.id} className="paymentHistoryItem">
              <div>
                <strong>{payment.payee}</strong>
                <span>{formatPaymentSummary(payment, t)}</span>
              </div>
              <AttachmentRow
                attachments={attachmentsByPayment[payment.id] || []}
                onPreviewAttachment={onPreviewAttachment}
                onDeleteAttachment={onDeleteAttachment}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function BillPaymentModal({ bill, loading, onSubmit, onClose }) {
  const { t } = useLanguage();
  const [payment, setPayment] = useState({
    amount: bill.amount || '',
    payment_date: getTodayDateInputValue(),
    confirmation_number: ''
  });
  const [files, setFiles] = useState([]);

  function handleChange(event) {
    const { name, value, type } = event.target;
    setPayment((current) => ({ ...current, [name]: type === 'number' ? Number(value) : value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(payment, files);
  }

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label={t('recordPayment')}>
      <form className="paymentModal" onSubmit={handleSubmit}>
        <div className="previewHeader">
          <div>
            <p className="eyebrow">{t('paymentRecords')}</p>
            <h2>{t('recordPayment')}: {bill.payee}</h2>
          </div>
          <button type="button" className="smallButton" onClick={onClose}>
            {t('close')}
          </button>
        </div>

        <div className="formGrid">
          <label>
            {t('paymentAmount')}
            <input name="amount" type="number" step="0.01" value={payment.amount} onChange={handleChange} required />
          </label>
          <label>
            {t('paymentDate')}
            <input name="payment_date" type="date" value={payment.payment_date} onChange={handleChange} required />
          </label>
          <label>
            {t('confirmationNumber')}
            <input name="confirmation_number" value={payment.confirmation_number} onChange={handleChange} />
          </label>
        </div>

        <label className="fileInput">
          {t('attachments')}
          <input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} />
          <span className="fieldHint">{t('paymentReceiptHint')}</span>
        </label>

        <button type="submit" className="primaryButton" disabled={loading}>
          {loading ? t('saving') : t('savePayment')}
        </button>
      </form>
    </div>
  );
}

function FilePreviewModal({ attachment, onClose }) {
  const { t } = useLanguage();
  const isImage = attachment.type?.startsWith('image/');
  const isPdf = attachment.type === 'application/pdf';
  const isText = attachment.type?.startsWith('text/');

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label={attachment.name}>
      <section className="previewModal">
        <div className="previewHeader">
          <div>
            <h2>{attachment.name}</h2>
            <span>{attachment.type || t('unknownFileType')} · {Math.round(attachment.size / 1024)} KB</span>
          </div>
          <button type="button" className="smallButton" onClick={onClose}>
            {t('close')}
          </button>
        </div>

        <div className="previewBody">
          {isImage && <img src={attachment.downloadUrl} alt={attachment.name} />}
          {(isPdf || isText) && <iframe title={attachment.name} src={attachment.downloadUrl} />}
          {!isImage && !isPdf && !isText && (
            <div className="stateBox">
              {t('previewUnavailable')}
              <a className="smallButton" href={attachment.downloadUrl} download>
                {t('downloadFile')}
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function groupAttachments(attachments) {
  return attachments.reduce((groups, attachment) => {
    return {
      ...groups,
      [attachment.recordId]: [...(groups[attachment.recordId] || []), attachment]
    };
  }, {});
}

function getReminderUpdates(current, name, value) {
  if (name === 'recurrence_day') {
    return {
      recurrence_day: value,
      due_date: getNextMonthlyDueDate(value || 1)
    };
  }

  if (name === 'recurrence_type' && value === 'monthly') {
    const day = current.recurrence_day || getDateDay(current.due_date) || 15;
    return {
      recurrence_type: value,
      recurrence_day: day,
      due_date: getNextMonthlyDueDate(day)
    };
  }

  if (name === 'recurrence_type' && value === 'interval_days') {
    return {
      recurrence_type: value,
      interval_days: current.interval_days || 30,
      due_date: getTodayDateInputValue()
    };
  }

  if (name === 'due_date' && current.recurrence_type === 'monthly') {
    return {
      due_date: value,
      recurrence_day: getDateDay(value)
    };
  }

  return { [name]: value };
}

function applyMonthlyPreset(current, billType, day) {
  return {
    ...current,
    bill_type: billType,
    recurrence_type: 'monthly',
    recurrence_day: day,
    interval_days: '',
    due_date: getNextMonthlyDueDate(day)
  };
}

function applyIntervalPreset(current, intervalDays) {
  return {
    ...current,
    recurrence_type: 'interval_days',
    interval_days: intervalDays,
    due_date: getTodayDateInputValue()
  };
}

function getNextMonthlyDueDate(dayOfMonth) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const thisMonthDate = toDateKey(year, month, clampDay(year, month, Number(dayOfMonth || 1)));
  const todayKey = getTodayDateInputValue();

  if (thisMonthDate >= todayKey) {
    return thisMonthDate;
  }

  const nextMonthDate = new Date(year, month + 1, 1);
  return toDateKey(
    nextMonthDate.getFullYear(),
    nextMonthDate.getMonth(),
    clampDay(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), Number(dayOfMonth || 1))
  );
}

function clampDay(year, month, preferredDay) {
  return Math.min(Math.max(preferredDay, 1), new Date(year, month + 1, 0).getDate());
}

function toDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDateDay(value) {
  if (!value) return 15;
  return Number(value.split('-')[2]);
}

function formatRecurrence(bill, t) {
  if (bill.recurrence_type === 'monthly') return `${t('recurrence_monthly')} · ${t('dayOfMonth')} ${bill.recurrence_day}`;
  if (bill.recurrence_type === 'interval_days') return `${t('recurrence_interval_days')} · ${bill.interval_days || 30}`;
  return t('recurrence_once');
}

function formatPaymentSummary(payment, t) {
  const amount = formatCurrency(payment.amount);
  const parts = [`${t('amount')}: ${amount}`, `${t('paymentDate')}: ${formatDate(payment.payment_date)}`];
  if (payment.confirmation_number) parts.push(`${t('confirmationNumber')}: ${payment.confirmation_number}`);
  return parts.join(' · ');
}

export default BillsPage;
