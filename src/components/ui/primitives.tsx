"use client";
import {
  cloneElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      type="button"
      {...props}
      className={`button button--${variant} ${className}`}
    />
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const control = cloneElement(
    children as ReactElement<{ id?: string; "aria-describedby"?: string }>,
    { id, "aria-describedby": hint ? `${id}-hint` : undefined },
  );
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      )}
    </div>
  );
}
export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {action}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3 className="empty__title">{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <strong className="stat__value">{value}</strong>
    </div>
  );
}
export function ActionForm({
  children,
  submit,
  reset = false,
  className = "stack",
}: {
  children: ReactNode;
  submit: (data: FormData) => Promise<boolean>;
  reset?: boolean;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        setPending(true);
        try {
          if ((await submit(new FormData(form))) && reset) form.reset();
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset disabled={pending} className={className}>
        {children}
        {pending && (
          <span className="muted" role="status">
            Guardando…
          </span>
        )}
      </fieldset>
    </form>
  );
}
export const value = (form: FormData, name: string) =>
  String(form.get(name) ?? "");
export const checked = (form: FormData, name: string) =>
  form.get(name) === "on";
export const amount = (form: FormData, name: string) =>
  value(form, name).replace(",", ".");
export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const hex = [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
