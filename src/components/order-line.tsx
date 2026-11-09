"use client";
import { useState } from "react";
import { Dialog } from "./ui/dialog";
import { AnimatePresence } from "./ui/motion";
import type { ItemView } from "@/lib/restaurant/queries";
import {
  canManage,
  money,
  stations,
  statuses,
  type Role,
} from "@/lib/restaurant/shared";
import type { RunCommand } from "./dashboard";
import { ActionForm, Button, Field, value } from "./ui/primitives";
export function OrderLine({
  item,
  role,
  run,
  currency = "UYU",
  kitchen = false,
}: {
  item: ItemView;
  role: Role;
  run: RunCommand;
  currency?: string;
  kitchen?: boolean;
}) {
  const [cancelling, setCancelling] = useState(false);
  const next =
    item.status === "PENDING"
      ? "Empezar"
      : item.status === "PREPARING"
        ? "Marcar listo"
        : item.status === "READY"
          ? "Entregado"
          : null;
  const permitted =
    role === "ADMIN" ||
    (role === "KITCHEN" && item.status !== "READY") ||
    (role === "WAITER" && item.status === "READY");
  return (
    <div
      className={`order-line${item.status === "CANCELLED" ? " order-line--cancelled" : ""}`}
    >
      <div className="row row--between">
        <span className="order-line__name">
          {item.quantity} × {item.name}
        </span>
        <span className={`badge badge--${item.status.toLowerCase()}`}>
          {statuses[item.status]}
        </span>
      </div>
      <div className="row row--between">
        <span className="muted">
          {stations[item.station]}
          {item.varieties.map((v) => ` · ${v.name}: ${v.option}`).join("")}
          {item.extras.length ? ` · ${item.extras.join(", ")}` : ""}
        </span>
        {!kitchen && (
          <span className="muted">
            {money(Number(item.unitPrice) * item.quantity, currency)}
          </span>
        )}
      </div>
      {item.notes && <p className="order-line__notes">{item.notes}</p>}
      {item.cancellationReason && (
        <p className="muted">Motivo: {item.cancellationReason}</p>
      )}
      <div className="row row--between">
        {kitchen &&
          permitted &&
          ["PENDING", "PREPARING"].includes(item.status) && (
            <div className="order-line__kitchen-actions">
              <Button
                variant="secondary"
                className="order-line__start"
                disabled={item.status !== "PENDING"}
                onClick={() =>
                  run(
                    {
                      type: "item.advance",
                      id: item.id,
                      expectedStatus: "PENDING",
                    },
                    "Preparación iniciada.",
                  )
                }
              >
                {item.status === "PREPARING" ? "En preparación" : "Empezar"}
              </Button>
              <Button
                onClick={() =>
                  run(
                    {
                      type: "item.advance",
                      id: item.id,
                      expectedStatus: item.status as "PENDING" | "PREPARING",
                      targetStatus: "READY",
                    },
                    "Producto listo para entregar.",
                  )
                }
              >
                Marcar listo
              </Button>
            </div>
          )}
        {!kitchen && next && permitted && (
          <Button
            variant={kitchen ? "primary" : "secondary"}
            className="button--small"
            onClick={() =>
              run(
                {
                  type: "item.advance",
                  id: item.id,
                  expectedStatus: item.status as
                    | "PENDING"
                    | "PREPARING"
                    | "READY",
                },
                "Comanda actualizada.",
              )
            }
          >
            {next}
          </Button>
        )}
        {canManage(role) && item.status !== "CANCELLED" && (
          <>
            <Button variant="ghost" onClick={() => setCancelling(true)}>
              Anular ítem
            </Button>
            <AnimatePresence>
              {cancelling && (
                <Dialog
                  title={`Anular ${item.name}`}
                  close={() => setCancelling(false)}
                >
                  <ActionForm
                    submit={async (form) => {
                      const ok = await run(
                        {
                          type: "item.cancel",
                          id: item.id,
                          reason: value(form, "reason"),
                        },
                        "Ítem anulado. El motivo quedó en el historial.",
                      );
                      if (ok) setCancelling(false);
                      return ok;
                    }}
                  >
                    <Field label="Motivo de anulación">
                      <input
                        className="control"
                        name="reason"
                        required
                        minLength={3}
                        maxLength={300}
                      />
                    </Field>
                    <Button variant="danger" type="submit">
                      Confirmar anulación
                    </Button>
                  </ActionForm>
                </Dialog>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
