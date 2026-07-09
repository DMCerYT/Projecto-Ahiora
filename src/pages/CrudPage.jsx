import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import TransactionForm from '../components/TransactionForm.jsx';
import { entityConfigs } from '../config/entities.js';
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

function CrudPage({ entityKey, user }) {
  const { t } = useLanguage();
  const config = entityConfigs[entityKey];
  const title = config ? t(config.titleKey) : '';
  const [rows, setRows] = useState([]);
  const [editingRecord, setEditingRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [billPayments, setBillPayments] = useState([]);
  const [paymentAttachments, setPaymentAttachments] = useState([]);
  const [paymentBill, setPaymentBill] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  useEffect(() => {
    if (!config) return;
    loadRows();
  }, [entityKey]);

  async function loadRows() {
    setLoading(true);
    setError('');

    try {
      const requests = [
        listRecords(entityKey),
        listAttachments(entityKey)
      ];

      if (entityKey === 'bills') {
        requests.push(listBillPayments(), listAttachments('bill-payments'));
      }

      const results = await Promise.all(requests);
      const [{ data }, { data: attachmentData }] = results;
      setRows(data || []);
      setAttachments(attachmentData || []);
      setBillPayments(results[2]?.data || []);
      setPaymentAttachments(results[3]?.data || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecordPayment(payment, files = []) {
    if (!paymentBill) return;

    setSaving(true);
    setError('');

    try {
      await recordBillPayment(paymentBill.id, payment, files);
      setPaymentBill(null);
      loadRows();
    } catch (paymentError) {
      setError(paymentError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(formData, files = []) {
    setSaving(true);
    setError('');

    const cleanData = config.fields.reduce(
      (payload, field) => ({
        ...payload,
        [field.name]: formData[field.name] === '' ? null : formData[field.name]
      }),
      { user_id: user.id }
    );

    try {
      const response = await saveRecord(entityKey, cleanData, editingRecord?.id);
      const recordId = editingRecord?.id || response.id;

      if (files.length && recordId) {
        await uploadAttachments(entityKey, recordId, files);
      }

      setEditingRecord(null);
      loadRows();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm(t('deleteConfirm'));
    if (!confirmed) return;

    setError('');
    try {
      await deleteRecord(entityKey, id);
      setRows((currentRows) => currentRows.filter((row) => row.id !== id));
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function handleDeleteAttachment(id) {
    const confirmed = window.confirm(t('deleteAttachmentConfirm'));
    if (!confirmed) return;

    setError('');
    try {
      await deleteAttachment(id);
      setAttachments((currentAttachments) => currentAttachments.filter((attachment) => attachment.id !== id));
      setPaymentAttachments((currentAttachments) => currentAttachments.filter((attachment) => attachment.id !== id));
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  const attachmentsByRecord = useMemo(() => {
    return attachments.reduce((groupedAttachments, attachment) => {
      return {
        ...groupedAttachments,
        [attachment.recordId]: [...(groupedAttachments[attachment.recordId] || []), attachment]
      };
    }, {});
  }, [attachments]);

  if (!config) {
    return <div className="stateBox">{t('pageNotFound')}</div>;
  }

  return (
    <div className="pageStack">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">{t('manage')}</p>
          <h1>{title}</h1>
        </div>
      </header>

      {error && <div className="errorBox">{error}</div>}

      <TransactionForm
        title={title}
        fields={config.fields}
        editingRecord={editingRecord}
        loading={saving}
        onSubmit={handleSubmit}
        onCancel={() => setEditingRecord(null)}
      />

      <section className="contentSection">
        <div className="sectionHeader">
          <h2>{t('records')}</h2>
        </div>
        <DataTable
          columns={config.columns}
          rows={rows}
          loading={loading}
          emptyMessage={t('noRecords', { title: title.toLowerCase() })}
          attachmentsByRecord={attachmentsByRecord}
          onPreviewAttachment={setPreviewAttachment}
          onDeleteAttachment={handleDeleteAttachment}
          renderRowActions={
            entityKey === 'bills'
              ? (row) => (
                  <button type="button" className="smallButton" onClick={() => setPaymentBill(row)}>
                    {t('recordPayment')}
                  </button>
                )
              : undefined
          }
          onEdit={setEditingRecord}
          onDelete={handleDelete}
        />
      </section>

      {entityKey === 'bills' && (
        <BillPaymentHistory
          payments={billPayments}
          attachments={paymentAttachments}
          onPreviewAttachment={setPreviewAttachment}
          onDeleteAttachment={handleDeleteAttachment}
        />
      )}

      {paymentBill && (
        <BillPaymentModal
          bill={paymentBill}
          loading={saving}
          onSubmit={handleRecordPayment}
          onClose={() => setPaymentBill(null)}
        />
      )}

      {previewAttachment && (
        <FilePreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      )}
    </div>
  );
}

function BillPaymentHistory({ payments, attachments, onPreviewAttachment, onDeleteAttachment }) {
  const { t } = useLanguage();
  const attachmentsByPayment = attachments.reduce((groups, attachment) => {
    return {
      ...groups,
      [attachment.recordId]: [...(groups[attachment.recordId] || []), attachment]
    };
  }, {});

  return (
    <section className="contentSection">
      <div className="sectionHeader">
        <h2>{t('paymentHistory')}</h2>
      </div>

      {!payments.length ? (
        <div className="stateBox">{t('noPaymentsRecorded')}</div>
      ) : (
        <div className="paymentHistoryList">
          {payments.map((payment) => (
            <article key={payment.id} className="paymentHistoryItem">
              <div>
                <strong>{payment.payee}</strong>
                <span>
                  {formatPaymentSummary(payment, t)}
                </span>
              </div>
              <div className="tableAttachmentList">
                {(attachmentsByPayment[payment.id] || []).map((attachment) => (
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
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatPaymentSummary(payment, t) {
  const parts = [`${t('amount')}: ${Number(payment.amount || 0).toLocaleString()}`, `${t('paymentDate')}: ${payment.payment_date}`];
  if (payment.confirmation_number) {
    parts.push(`${t('confirmationNumber')}: ${payment.confirmation_number}`);
  }
  return parts.join(' · ');
}

function BillPaymentModal({ bill, loading, onSubmit, onClose }) {
  const { t } = useLanguage();
  const [payment, setPayment] = useState({
    amount: bill.amount || '',
    payment_date: new Date().toISOString().slice(0, 10),
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
            <p className="eyebrow">{t('recordPayment')}</p>
            <h2>{bill.payee}</h2>
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
            <span>
              {attachment.type || t('unknownFileType')} · {Math.round(attachment.size / 1024)} KB
            </span>
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

export default CrudPage;
