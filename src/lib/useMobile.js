import { useSyncExternalStore } from "react";

export const MOBILE_QUERY = "(max-width: 640px)";
const subscribe = (listener) => {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
export function useMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
