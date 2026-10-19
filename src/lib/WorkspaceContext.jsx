import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { financialTotals, inPeriod } from "../../shared/reporting.js";
import { apiRequest } from "./apiClient.js";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const WorkspaceContext = createContext(null);
export function WorkspaceProvider({ user, setUser, children }) {
  const { language } = useLanguage();
  const [data, setData] = useState(null),
    [error, setError] = useState(null),
    [month, setMonth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState("ytd");
  const load = useCallback(async () => {
    try {
      const { data: next } = await apiRequest(
        `/api/workspace${month ? `?month=${month}` : ""}`,
      );
      setData(next);
      setError(null);
      return next;
    } catch (next) {
      if (next.status === 401) setUser(null);
      setError(next);
      throw next;
    }
  }, [month]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest(`/api/workspace${month ? `?month=${month}` : ""}`)
      .then(({ data: next }) => {
        if (active) {
          setData(next);
          setError(null);
        }
      })
      .catch((next) => {
        if (active) {
          setError(next);
          if (next.status === 401) setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month]);
  async function mutate(path, body = {}, method = "POST") {
    try {
      const result = await apiRequest(`/api/${path}`, {
        method,
        body: JSON.stringify(body),
      });
      // A failed refresh must not invite a second submission of an already committed write.
      try {
        await load();
      } catch {
        /* load reports the refresh error in the workspace */
      }
      return result;
    } catch (next) {
      if (next.status === 401) setUser(null);
      throw next;
    }
  }
  const locale = language === "es" ? "es-PR" : "en-US";
  const money = (value) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: data?.business.currency || "USD",
    }).format((value || 0) / 100);
  const date = (value) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          ...(value.includes("T")
            ? {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: data?.business.time_zone || "America/New_York",
              }
            : { timeZone: "UTC" }),
        }).format(new Date(value.includes("T") ? value : `${value}T00:00:00Z`))
      : "—";
  return (
    <WorkspaceContext.Provider
      value={{
        data,
        user,
        setUser,
        editor: user.role !== "employee",
        owner: user.role === "owner",
        error,
        loading,
        load,
        mutate,
        month: month || data?.month,
        setMonth,
        money,
        date,
        locale,
        period,
        setPeriod,
        inPeriod: (tx) => inPeriod(tx, data.today, period),
        totals: (target, id, budget = 0, lifetime = false) =>
          financialTotals(
            data.transactions.filter(
              (tx) =>
                tx[target] === id &&
                inPeriod(tx, data.today, lifetime ? "lifetime" : period),
            ),
            budget,
          ),
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
export const useWorkspace = () => useContext(WorkspaceContext);
