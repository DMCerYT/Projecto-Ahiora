import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { useWorkspace } from "../lib/WorkspaceContext.jsx";

export default function CalendarPayments({ items }) {
  const { t } = useLanguage(),
    { month, setMonth, loading, locale, money } = useWorkspace();
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1)),
    offset = first.getUTCDay(),
    count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days = Array.from(
    { length: Math.ceil((offset + count) / 7) * 7 },
    (_, index) => {
      const day = index - offset + 1;
      return day > 0 && day <= count ? day : null;
    },
  );
  const visible = items.filter((item) => item.date.startsWith(month));
  function move(delta) {
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
      .toISOString()
      .slice(0, 7);
    if (next >= "1970-01" && next <= "2100-12") setMonth(next);
  }
  return (
    <section className="monthCalendar" aria-busy={loading}>
      <div className="calendarToolbar">
        <button
          className="smallButton"
          disabled={loading || month === "1970-01"}
          onClick={() => move(-1)}
        >
          {t("previous")}
        </button>
        <strong aria-live="polite">
          {new Intl.DateTimeFormat(locale, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(first)}
        </strong>
        <button
          className="smallButton"
          disabled={loading || month === "2100-12"}
          onClick={() => move(1)}
        >
          {t("next")}
        </button>
      </div>
      {loading ? (
        <p className="stateBox">{t("loading")}</p>
      ) : (
        <>
          <div className="weekdayRow">
            {["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => (
              <span key={day}>{t(day)}</span>
            ))}
          </div>
          <div className="calendarGrid">
            {days.map((day, index) => (
              <article
                key={index}
                className={`calendarDay ${day ? "" : "empty"}`}
              >
                {day && (
                  <>
                    <h3>{day}</h3>
                    <ul>
                      {visible
                        .filter(
                          (item) =>
                            item.date ===
                            `${month}-${String(day).padStart(2, "0")}`,
                        )
                        .map((item) => (
                          <li
                            key={item.id}
                            className={
                              ["paid", "processed"].includes(item.status)
                                ? "paidItem"
                                : "pendingItem"
                            }
                          >
                            <div>
                              <Link to={item.to}>
                                <strong>{item.title}</strong>
                              </Link>
                              <span>
                                {t(`statuses.${item.kind}`)} ·{" "}
                                {money(item.amount_cents)}
                              </span>
                              {item.kind !== "expense" &&
                                item.kind !== "income" &&
                                item.kind !== "refund" && (
                                  <span>{t(`statuses.${item.status}`)}</span>
                                )}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </>
                )}
              </article>
            ))}
          </div>
          {!visible.length && <p className="stateBox">{t("emptyCalendar")}</p>}
        </>
      )}
    </section>
  );
}
