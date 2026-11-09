"use client";
import { useState } from "react";
import { Check, Ban } from "lucide-react";
import type { ItemView } from "@/lib/restaurant/queries";
import {
  canManage,
  money,
  stations,
  statuses,
  type Role,
} from "@/lib/restaurant/shared";
import type { RunCommand } from "../dashboard";
import { ActionForm, Button, Field, value } from "../ui/primitives";
import { AnimatePresence } from "../ui/motion";
import { Dialog } from "../ui/dialog";
export function SalonAccountLine({
  item,
  role,
  run,
  currency,
  showDelivery = true,
}: {
  item: ItemView;
  role: Role;
  run: RunCommand;
  currency: string;
  showDelivery?: boolean;
}) {
  const [cancel, setCancel] = useState(false);
  const cancelled = item.status === "CANCELLED";
  return (
    <article
      className={`salon-account-line${cancelled ? " salon-account-line--cancelled" : ""}`}
    >
      <div className="salon-account-line__identity">
        <span className="salon-account-line__quantity">{item.quantity}</span>
        <div>
          <h3>{item.name}</h3>
          <p>
            {stations[item.station]}
            {item.varieties.map((v) => ` · ${v.name}: ${v.option}`).join("")}
            {item.extras.length ? ` · ${item.extras.join(", ")}` : ""}
          </p>
        </div>
        <strong>
          {money(Number(item.unitPrice) * item.quantity, currency)}
        </strong>
      </div>
      {item.notes && <p className="salon-account-line__note">{item.notes}</p>}
      {cancelled && (
        <p className="salon-account-line__reason">{item.cancellationReason}</p>
      )}
      <div className="salon-account-line__footer">
        <span className={`badge badge--${item.status.toLowerCase()}`}>
          {statuses[item.status]}
        </span>
        <div className="salon-account-line__actions">
          {canManage(role) && !cancelled && (
            <Button
              variant="ghost"
              className="button--icon"
              title="Anular consumo"
              aria-label={`Anular ${item.name}`}
              onClick={() => setCancel(true)}
            >
              <Ban aria-hidden="true" />
            </Button>
          )}
          {showDelivery &&
            item.status === "READY" &&
            (role === "ADMIN" || role === "WAITER") && (
              <Button
                variant="secondary"
                onClick={() =>
                  run(
                    {
                      type: "item.advance",
                      id: item.id,
                      expectedStatus: "READY",
                    },
                    "Entrega registrada.",
                  )
                }
              >
                <Check aria-hidden="true" />
                Entregado
              </Button>
            )}
        </div>
      </div>
      <AnimatePresence>
        {cancel && (
          <Dialog title="Anular consumo" close={() => setCancel(false)}>
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
                if (ok) setCancel(false);
                return ok;
              }}
            >
              <div className="salon-cancellation">
                <strong>
                  {item.quantity} × {item.name}
                </strong>
                <span>
                  {money(Number(item.unitPrice) * item.quantity, currency)}
                </span>
              </div>
              <p className="muted">
                Se descontará de la cuenta y quedará registrado en el historial.
              </p>
              <Field label="Motivo de anulación">
                <textarea
                  className="control control--area"
                  name="reason"
                  required
                  minLength={3}
                  maxLength={300}
                  placeholder="Explicá por qué se anula este consumo"
                />
              </Field>
              <div className="salon-dialog-actions">
                <Button variant="secondary" onClick={() => setCancel(false)}>
                  Volver
                </Button>
                <Button variant="danger" type="submit">
                  Confirmar anulación
                </Button>
              </div>
            </ActionForm>
          </Dialog>
        )}
      </AnimatePresence>
    </article>
  );
}
