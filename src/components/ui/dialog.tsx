"use client";
import { useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { motion, useIsPresent } from "motion/react";
import { useMotionTokens } from "./motion";
import { X } from "lucide-react";
import { OperationFeedback } from "./operation-feedback";
import { Button } from "./primitives";
export function Dialog({
  title,
  close,
  children,
  className = "",
  initialFocus,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  className?: string;
  initialFocus?: string;
}) {
  const feedback = useContext(OperationFeedback);
  const error = feedback.error;
  const resetFeedback = useRef(feedback.reset);
  const present = useIsPresent();
  const { dialog, reduced, ease } = useMotionTokens();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    resetFeedback.current();
    const element = ref.current;
    const trigger = document.activeElement;
    element?.showModal();
    if (initialFocus) element?.querySelector<HTMLElement>(initialFocus)?.focus({ preventScroll: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previous;
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [initialFocus]);
  return (
    <motion.dialog
      initial={{ y: reduced ? 0 : "var(--motion-popup-offset)" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : "var(--motion-popup-offset)" }}
      transition={{ duration: dialog / 1000, ease }}
      data-closing={!present || undefined}
      inert={!present}
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog__surface">
        <header className="dialog__header">
          <h2 id={id} className="panel__title">
            {title}
          </h2>
          <Button variant="ghost" aria-label="Cerrar diálogo" onClick={close}>
            <X aria-hidden="true" />
          </Button>
        </header>
        <div className="dialog__body">
          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}
          {children}
        </div>
      </div>
    </motion.dialog>
  );
}
