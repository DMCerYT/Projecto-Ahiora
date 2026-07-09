import { useMemo, useState } from 'react';
import { formatCurrency } from '../utils/formatters.js';
import { useLanguage } from '../i18n/LanguageContext.jsx';

function CalendarPayments({ items, loading }) {
  const { t } = useLanguage();
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const days = Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - startOffset + 1;
    return dayNumber >= 1 && dayNumber <= daysInMonth ? dayNumber : null;
  });

  const visibleItems = useMemo(() => expandItemsForMonth(items, year, month), [items, year, month]);

  const itemsByDate = visibleItems.reduce((groups, item) => {
    return {
      ...groups,
      [item.date]: [...(groups[item.date] || []), item]
    };
  }, {});

  if (loading) {
    return <div className="stateBox">{t('loadingCalendar')}</div>;
  }

  return (
    <section className="monthCalendar">
      <div className="calendarToolbar">
        <button type="button" className="smallButton" onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}>
          {t('previousMonth')}
        </button>
        <strong>{visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" className="smallButton" onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}>
          {t('nextMonth')}
        </button>
      </div>

      <div className="weekdayRow">
        {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => (
          <span key={day}>{t(day)}</span>
        ))}
      </div>

      <div className="calendarGrid">
        {days.map((day, index) => (
          <article key={`${day || 'blank'}-${index}`} className={`calendarDay ${day ? '' : 'empty'}`}>
            {day && <h3>{day}</h3>}
            {day && (
              <ul>
                {(itemsByDate[toDateKey(year, month, day)] || []).map((item) => (
                  <li key={`${item.typeKey}-${item.id}`} className={item.status === 'paid' ? 'paidItem' : 'pendingItem'}>
                    <span className={`dot ${item.kind}`} aria-hidden="true" />
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {t(item.typeKey)} · {formatCurrency(item.amount)}
                      </span>
                      <PaymentDetails item={item} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>

      {!visibleItems.length && <div className="stateBox">{t('noItemsThisMonth')}</div>}
    </section>
  );
}

function expandItemsForMonth(items, year, month) {
  return items.flatMap((item) => {
    if (item.typeKey !== 'billDue') {
      return isDateInMonth(item.date, year, month) ? [item] : [];
    }

    if (item.status === 'paid') {
      return [];
    }

    if (item.recurrenceType === 'monthly') {
      const day = clampDay(year, month, Number(item.recurrenceDay || getDatePart(item.date, 'day') || 1));
      const date = toDateKey(year, month, day);
      return date >= item.date ? [{ ...item, date, id: `${item.id}-${date}` }] : [];
    }

    if (item.recurrenceType === 'interval_days') {
      return expandIntervalItem(item, year, month);
    }

    return isDateInMonth(item.date, year, month) ? [item] : [];
  });
}

function expandIntervalItem(item, year, month) {
  const interval = Number(item.intervalDays || 30);
  const monthStart = toDateKey(year, month, 1);
  const monthEnd = toDateKey(year, month, new Date(year, month + 1, 0).getDate());
  const occurrences = [];
  let date = new Date(`${item.date}T00:00:00`);

  while (date.toISOString().slice(0, 10) < monthStart) {
    date.setDate(date.getDate() + interval);
  }

  while (date.toISOString().slice(0, 10) <= monthEnd) {
    const dateKey = date.toISOString().slice(0, 10);
    occurrences.push({ ...item, date: dateKey, id: `${item.id}-${dateKey}` });
    date.setDate(date.getDate() + interval);
  }

  return occurrences;
}

function isDateInMonth(value, year, month) {
  if (!value) return false;
  const [itemYear, itemMonth] = value.split('-').map(Number);
  return itemYear === year && itemMonth === month + 1;
}

function getDatePart(value, part) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day }[part];
}

function clampDay(year, month, preferredDay) {
  return Math.min(preferredDay, new Date(year, month + 1, 0).getDate());
}

function toDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function PaymentDetails({ item }) {
  const { t } = useLanguage();
  const details = [
    item.paymentMethod && `${t('paymentMethod')}: ${item.paymentMethod}`,
    item.phoneNumber && `${t('phoneNumber')}: ${item.phoneNumber}`,
    item.confirmationNumber && `${t('confirmationNumber')}: ${item.confirmationNumber}`,
    item.notes && `${t('notes')}: ${item.notes}`
  ].filter(Boolean);

  if (!details.length && !item.paymentLink) {
    return null;
  }

  return (
    <div className="paymentDetails">
      {details.map((detail) => (
        <span key={detail}>{detail}</span>
      ))}
      {item.paymentLink && (
        <a href={item.paymentLink} target="_blank" rel="noreferrer">
          {t('paymentLink')}
        </a>
      )}
    </div>
  );
}

export default CalendarPayments;
