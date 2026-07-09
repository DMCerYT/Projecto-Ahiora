import { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { getTodayDateInputValue } from '../utils/formatters.js';

function TransactionForm({ title, fields, editingRecord, loading, onSubmit, onCancel }) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({});
  const [files, setFiles] = useState([]);

  useEffect(() => {
    if (editingRecord) {
      setFormData(editingRecord);
      return;
    }

    const initialValues = {};
    fields.forEach((field) => {
      if (field.type === 'select') initialValues[field.name] = field.options?.[0] || '';
      else if (field.type === 'date') initialValues[field.name] = getTodayDateInputValue();
      else initialValues[field.name] = '';
    });
    setFormData(initialValues);
    setFiles([]);
  }, [editingRecord, fields]);

  function handleChange(event) {
    const { name, value, type } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: type === 'number' ? Number(value) : value
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(formData, files);
  }

  return (
    <form className="formPanel" onSubmit={handleSubmit}>
      <div className="sectionHeader">
        <h2>{editingRecord ? `${t('edit')} ${title}` : `${t('add')} ${title}`}</h2>
        {editingRecord && (
          <button type="button" className="secondaryButton" onClick={onCancel}>
            {t('cancel')}
          </button>
        )}
      </div>

      <div className="formGrid">
        {fields.map((field) => (
          <label key={field.name}>
            {t(field.labelKey)}
            {field.type === 'select' ? (
              <select
                name={field.name}
                value={formData[field.name] || ''}
                onChange={handleChange}
                required={field.required}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {t(getOptionLabelKey(field, option))}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={field.name}
                type={field.type}
                value={formData[field.name] ?? ''}
                onChange={handleChange}
                required={field.required}
                step={field.type === 'number' ? '0.01' : undefined}
              />
            )}
          </label>
        ))}
      </div>

      <label className="fileInput">
        {t('attachments')}
        <input
          type="file"
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files || []))}
        />
        <span className="fieldHint">{t('attachmentsHint')}</span>
      </label>

      {!!files.length && (
        <ul className="selectedFiles">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`}>
              {file.name} · {Math.round(file.size / 1024)} KB
            </li>
          ))}
        </ul>
      )}

      <button type="submit" className="primaryButton" disabled={loading}>
        {loading ? t('saving') : editingRecord ? t('saveChanges') : t('createRecord')}
      </button>
    </form>
  );
}

function getOptionLabelKey(field, option) {
  if (field.name === 'recurrence_type') return `recurrence_${option}`;
  return `status_${option}`;
}

export default TransactionForm;
