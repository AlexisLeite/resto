"use client";
import { motion } from "motion/react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { Button } from "./primitives";
import { useMotionTokens } from "./motion";

export function Feedback({
  message,
  error,
  close,
  action,
}: {
  message: string;
  error?: boolean;
  close?: () => void;
  action?: { label: string; onClick: () => void };
}) {
  const { dialog, ease } = useMotionTokens();
  const Icon = error ? CircleAlert : CheckCircle2;
  return (
    <motion.div
      className={`app-feedback${error ? " app-feedback--error" : ""}`}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: dialog / 1000, ease }}
    >
      <div className="app-feedback__content" role={error ? "alert" : "status"}>
        <Icon className="app-feedback__icon" aria-hidden="true" />
        <span>{message}</span>
        {action && (
          <Button variant="ghost" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {close && (
          <Button
            variant="ghost"
            className="button--icon"
            aria-label="Cerrar aviso"
            onClick={close}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
