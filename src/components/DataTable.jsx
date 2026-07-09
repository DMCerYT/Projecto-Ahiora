import { formatCurrency, formatDate } from '../utils/formatters.js';
import { useLanguage } from '../i18n/LanguageContext.jsx';

function DataTable({
  columns,
  rows,
  loading,
  emptyMessage,
  attachmentsByRecord = {},
  onPreviewAttachment,
  onDeleteAttachment,
  renderRowActions,
  onEdit,
  onDelete
}) {
  const { t } = useLanguage();

  if (loading) {
    return <div className="stateBox">{t('loadingRecords')}</div>;
  }

  if (!rows.length) {
    return <div className="stateBox">{emptyMessage}</div>;
  }

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{t(column.labelKey)}</th>
            ))}
            <th>{t('attachments')}</th>
            <th>{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>{formatCell(row[column.key], column.type, t)}</td>
              ))}
              <td>
                <AttachmentCell
                  attachments={attachmentsByRecord[row.id] || []}
                  onPreviewAttachment={onPreviewAttachment}
                  onDeleteAttachment={onDeleteAttachment}
                />
              </td>
              <td className="actionCell">
                <button type="button" className="smallButton" onClick={() => onEdit(row)}>
                  {t('edit')}
                </button>
                <button type="button" className="smallButton danger" onClick={() => onDelete(row.id)}>
                  {t('delete')}
                </button>
                {renderRowActions?.(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttachmentCell({ attachments, onPreviewAttachment, onDeleteAttachment }) {
  const { t } = useLanguage();

  if (!attachments.length) {
    return <span className="mutedText">{t('noFiles')}</span>;
  }

  return (
    <div className="tableAttachmentList">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="tableAttachmentItem">
          <button type="button" className="fileChip" onClick={() => onPreviewAttachment(attachment)}>
            {attachment.name}
          </button>
          <button
            type="button"
            className="iconTextButton danger"
            onClick={() => onDeleteAttachment(attachment.id)}
            aria-label={`${t('delete')} ${attachment.name}`}
          >
            {t('delete')}
          </button>
        </div>
      ))}
    </div>
  );
}

function formatCell(value, type, t) {
  if (type === 'currency') return formatCurrency(value);
  if (type === 'date') return formatDate(value);
  if (type === 'status') return t(`status_${value}`);
  if (type === 'recurrence') return t(`recurrence_${value || 'once'}`);
  return value || '-';
}

export default DataTable;
