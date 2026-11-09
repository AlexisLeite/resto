"use client";
import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "./ui/primitives";
function getTheme() {
  try {
    return localStorage.getItem("resto-theme") === "dark";
  } catch {
    return false;
  }
}
function subscribe(callback: () => void) {
  const sync = () => {
    document.documentElement.dataset.theme = getTheme() ? "dark" : "light";
    callback();
  };
  sync();
  window.addEventListener("storage", sync);
  window.addEventListener("resto-theme", sync);
  return () => {
    window.removeEventListener("storage", sync);
    window.removeEventListener("resto-theme", sync);
  };
}
export function ThemeToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const dark = useSyncExternalStore(subscribe, getTheme, () => false);
  return (
    <Button
      variant="ghost"
      className={iconOnly ? "button--icon" : undefined}
      title={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      aria-label="Cambiar tema"
      aria-pressed={dark}
      onClick={() => {
        const theme = dark ? "light" : "dark";
        try {
          localStorage.setItem("resto-theme", theme);
        } catch {}
        document.documentElement.dataset.theme = theme;
        window.dispatchEvent(new Event("resto-theme"));
      }}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      {!iconOnly && (dark ? "Tema claro" : "Tema oscuro")}
    </Button>
  );
}
