"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { useIsPresent } from "motion/react";
import { createPortal } from "react-dom";
const subscribe = (notify: () => void) => {
  queueMicrotask(notify);
  const query = matchMedia("(min-width: 1100px)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const snapshot = () =>
  matchMedia("(min-width: 1100px)").matches
    ? null
    : document.getElementById("salon-header-context");
export function HeaderContext({
  children,
  active,
}: {
  children: ReactNode;
  active: boolean;
}) {
  const present = useIsPresent();
  const target = useSyncExternalStore(subscribe, snapshot, () => null);
  return active && present && target ? createPortal(children, target) : null;
}
