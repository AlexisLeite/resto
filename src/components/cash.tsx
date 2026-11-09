"use client";
import { SalonOrderDesk } from "./salon/order-desk";
import { Dialog } from "./ui/dialog";
import { useDesktop } from "./ui/use-desktop";
import { AnimatePresence, FadeView, SlideView } from "./ui/motion";
import { WorkspaceTabs } from "./ui/workspace-tabs";
import { useState } from "react";
import { destinationUrl } from "@/lib/restaurant/navigation";
import type { ModuleProps } from "./dashboard";
import { money, dateTime, methods } from "@/lib/restaurant/shared";
import {
  ActionForm,
  Button,
  Empty,
  Field,
  Panel,
  Stat,
  amount,
  value,
  uuid,
} from "./ui/primitives";
import { OrderLine } from "./order-line";
export function Cash({
  data,
  run,
  initialSessionId = "",
  section,
  onSectionChange,
}: ModuleProps & {
  initialSessionId?: string;
  section?: string;
  onSectionChange?: (section: string) => void;
}) {
  const [selected, setSelected] = useState(initialSessionId);
  const [closing, setClosing] = useState(false);
  const [direction, setDirection] = useState(1);
  const [localTab, setLocalTab] = useState("accounts");
  const tab = section ?? localTab;
  const setTab = onSectionChange ?? setLocalTab;
  const desktop = useDesktop();
  const SectionView = desktop ? FadeView : SlideView;
  const shift = data.shifts.find((s) => !s.closedAt);
  const session = data.sessions.find((s) => s.id === selected);
  const currency = data.restaurant.currency;
  const pendingItems =
    session?.orders
      .flatMap((o) => o.items)
      .filter((i) => ["PENDING", "PREPARING", "READY"].includes(i.status)) ??
    [];
  return (
    <div className="cash-workspace">
      <WorkspaceTabs
        label="Caja"
        href={(section) =>
          destinationUrl({ role: data.user.role, page: "cash", section })
        }
        beforeNavigate={(next) => {
          const tabs = ["accounts", "sale", "payments", "history"];
          setDirection(tabs.indexOf(next) > tabs.indexOf(tab) ? 1 : -1);
        }}
        value={tab}
        options={[
          { id: "accounts", label: "Cuentas", count: data.sessions.length },
          { id: "sale", label: "Venta" },
          { id: "payments", label: "Cobros" },
          { id: "history", label: "Cierres" },
        ]}
        change={(next) => {
          const tabs = ["accounts", "sale", "payments", "history"];
          setDirection(tabs.indexOf(next) > tabs.indexOf(tab) ? 1 : -1);
          setTab(next);
        }}
      />
      <SectionView
        viewKey={tab}
        direction={direction}
        className={`module-section-views${tab === "sale" ? " module-section-views--sale" : ""}`}
      >
        <div
          className={
            tab === "accounts" ? "stack cash-workspace__overview" : "stack"
          }
        >
          {tab === "sale" && (
            <div className="salon-page salon-page--ordering cash-sale">
              <SalonOrderDesk
                session={{
                  id: `sale-${data.user.id}`,
                  tableId: null,
                  tableName: "Venta directa",
                  guests: 0,
                  openedBy: data.user.name,
                  openedAt: "",
                  total: "0.00",
                  orders: [],
                }}
                data={data}
                run={run}
                directSale
                onSaleComplete={() => setTab("payments")}
              />
            </div>
          )}
          {tab === "accounts" && (
            <>
              <div className="stack cash-workspace__shift">
                {!shift ? (
                  <Panel title="Abrir turno de caja">
                    <ActionForm
                      submit={(form) =>
                        run(
                          {
                            type: "shift.open",
                            openingCash: amount(form, "openingCash"),
                          },
                          "Turno de caja abierto.",
                        )
                      }
                    >
                      <p className="muted">
                        Registrá el efectivo inicial para poder cobrar las
                        cuentas.
                      </p>
                      <Field label="Fondo inicial en efectivo">
                        <input
                          className="control"
                          name="openingCash"
                          type="number"
                          min="0"
                          max="9999999"
                          step="0.01"
                          defaultValue="0"
                          required
                        />
                      </Field>
                      <Button type="submit">Abrir caja</Button>
                    </ActionForm>
                  </Panel>
                ) : (
                  <>
                    <div className="stat-grid">
                      <Stat
                        label="Fondo inicial"
                        value={money(shift.openingCash, currency)}
                      />
                      <Stat
                        label="Cobrado en el turno"
                        value={money(
                          shift.payments.reduce(
                            (n, p) => n + Number(p.amount),
                            0,
                          ),
                          currency,
                        )}
                      />
                      <Stat
                        label="Efectivo esperado"
                        value={money(shift.expectedCash, currency)}
                      />
                    </div>
                    <div className="toolbar">
                      <p className="muted">
                        Turno abierto por {shift.openedBy} ·{" "}
                        {dateTime(shift.openedAt, data.restaurant.timezone)}
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => setClosing(!closing)}
                      >
                        {closing ? "Volver al turno" : "Cerrar turno"}
                      </Button>
                    </div>
                    <AnimatePresence>
                      {closing && (
                        <Dialog
                          title="Cierre de caja"
                          close={() => setClosing(false)}
                          className="management-editor"
                        >
                          <ActionForm
                            submit={async (form) => {
                              const ok = await run(
                                {
                                  type: "shift.close",
                                  id: shift.id,
                                  closingCash: amount(form, "closingCash"),
                                  notes: value(form, "notes"),
                                },
                                "Caja cerrada. El arqueo quedó guardado.",
                              );
                              if (ok) setClosing(false);
                              return ok;
                            }}
                          >
                            <div className="management-editor__scroll">
                              <p className="muted">
                                Efectivo esperado:{" "}
                                {money(shift.expectedCash, currency)}. Tarjetas
                                y transferencias no forman parte del efectivo.
                              </p>
                              {data.sessions.length > 0 && (
                                <p className="notice notice--info">
                                  Quedan {data.sessions.length} mesas abiertas.
                                  Pueden seguir en servicio. Sus cobros se
                                  registrarán en el turno abierto al momento de
                                  cobrar.
                                </p>
                              )}
                              <Field label="Efectivo contado">
                                <input
                                  className="control"
                                  name="closingCash"
                                  type="number"
                                  min="0"
                                  max="9999999"
                                  step="0.01"
                                  required
                                />
                              </Field>
                              <Field label="Observaciones del cierre">
                                <textarea
                                  className="control control--area"
                                  name="notes"
                                  maxLength={500}
                                />
                              </Field>
                            </div>
                            <footer className="management-editor__footer">
                              <Button type="submit">
                                Confirmar cierre de turno
                              </Button>
                            </footer>
                          </ActionForm>
                        </Dialog>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>
              <div className="cash-accounts">
                <Panel title="Cuentas abiertas">
                  <div className="stack stack--compact">
                    {data.sessions.map((s) => (
                      <button
                        className={`table-card${selected === s.id ? " table-card--selected" : ""}`}
                        key={s.id}
                        onClick={() => setSelected(s.id)}
                      >
                        <div className="row row--between">
                          <strong>{s.tableName}</strong>
                          <strong>{money(s.total, currency)}</strong>
                        </div>
                        <span className="muted">
                          {s.guests} comensales ·{" "}
                          {s.orders
                            .flatMap((o) => o.items)
                            .some(
                              (i) =>
                                ![
                                  "DELIVERED",
                                  "CANCELLED",
                                  "BILLABLE",
                                ].includes(i.status),
                            )
                            ? "Pendiente de entrega"
                            : "Lista para cerrar"}
                        </span>
                      </button>
                    ))}
                    {!data.sessions.length && (
                      <Empty title="Todas las mesas al día">
                        Las cuentas abiertas aparecerán acá.
                      </Empty>
                    )}
                  </div>
                </Panel>
                <AnimatePresence>
                  {session && pendingItems.length > 0 && (
                    <CashPending
                      key={`${session.id}:${pendingItems.map((i) => i.id).join(",")}`}
                      session={session}
                      run={run}
                      close={() => setSelected("")}
                    />
                  )}
                  {session && pendingItems.length === 0 && (
                    <Dialog
                      title={`Cuenta · ${session.tableName}`}
                      close={() => setSelected("")}
                      className="management-editor cash-account"
                    >
                      <div className="cash-account__items">
                        {session.orders
                          .flatMap((o) => o.items)
                          .map((i) => (
                            <OrderLine
                              key={i.id}
                              item={i}
                              role={data.user.role}
                              run={run}
                              currency={currency}
                            />
                          ))}
                      </div>
                      <div className="cash-account__controls">
                        <div className="cart__total">
                          <span>Total</span>
                          <span>{money(session.total, currency)}</span>
                        </div>
                        {session.orders
                          .flatMap((o) => o.items)
                          .every((i) => i.status === "CANCELLED") ? (
                          <Button
                            className="button--wide"
                            onClick={async () => {
                              if (
                                await run({
                                  type: "table.closeEmpty",
                                  sessionId: session.id,
                                })
                              )
                                setSelected("");
                            }}
                          >
                            Cerrar cuenta sin consumos
                          </Button>
                        ) : (
                          <ActionForm
                            key={session.id}
                            submit={async (form) => {
                              const ok = await run(
                                {
                                  type: "payment.create",
                                  sessionId: session.id,
                                  method: value(
                                    form,
                                    "method",
                                  ) as keyof typeof methods,
                                  expectedTotal: session.total,
                                },
                                "Cobro registrado y mesa liberada.",
                              );
                              if (ok) setSelected("");
                              return ok;
                            }}
                          >
                            <Field label="Medio de pago">
                              <select className="control" name="method">
                                {Object.entries(methods).map(([id, name]) => (
                                  <option key={id} value={id}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <p className="muted">
                              Confirmá después de recibir el pago. Se registra
                              el total y se libera la mesa.
                            </p>
                            {!shift && (
                              <p className="notice notice--info">
                                Abrí la caja para registrar el cobro.
                              </p>
                            )}
                            <Button
                              type="submit"
                              disabled={
                                !shift ||
                                session.orders
                                  .flatMap((o) => o.items)
                                  .some(
                                    (i) =>
                                      ![
                                        "DELIVERED",
                                        "CANCELLED",
                                        "BILLABLE",
                                      ].includes(i.status),
                                  )
                              }
                            >
                              Confirmar cobro de{" "}
                              {money(session.total, currency)}
                            </Button>
                          </ActionForm>
                        )}
                      </div>
                    </Dialog>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
          {tab === "payments" && (
            <Panel title="Cobros del turno">
              {shift?.payments.length ? (
                <div className="ledger-list">
                  {shift.payments.map((p) => (
                    <article className="ledger-row" key={p.id}>
                      <div className="ledger-row__identity">
                        <strong>{p.tableName}</strong>
                        <span>
                          {methods[p.method]} · {p.receivedBy}
                        </span>
                        <time>
                          {dateTime(p.createdAt, data.restaurant.timezone)}
                        </time>
                      </div>
                      <strong className="ledger-row__amount">
                        {money(p.amount, currency)}
                      </strong>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty title="Sin cobros todavía" />
              )}
            </Panel>
          )}
          {tab === "history" && (
            <Panel title="Últimos cierres">
              <div className="ledger-list">
                {data.shifts
                  .filter((s) => s.closedAt)
                  .map((s) => (
                    <article className="shift-record" key={s.id}>
                      <div className="row row--between">
                        <strong>
                          {dateTime(s.closedAt!, data.restaurant.timezone)}
                        </strong>
                        <span className="muted">{s.closedBy}</span>
                      </div>
                      <dl className="shift-record__amounts">
                        <div>
                          <dt>Esperado</dt>
                          <dd>{money(s.expectedCash, currency)}</dd>
                        </div>
                        <div>
                          <dt>Contado</dt>
                          <dd>{money(s.closingCash!, currency)}</dd>
                        </div>
                        <div>
                          <dt>Diferencia</dt>
                          <dd>
                            {money(
                              Number(s.closingCash) - Number(s.expectedCash),
                              currency,
                            )}
                          </dd>
                        </div>
                      </dl>
                      {s.notes && <p className="muted">{s.notes}</p>}
                    </article>
                  ))}
              </div>
              {!data.shifts.some((s) => s.closedAt) && (
                <Empty title="Todavía no hay cierres" />
              )}
            </Panel>
          )}
        </div>
      </SectionView>
    </div>
  );
}

function CashPending({
  session,
  run,
  close,
}: {
  session: ModuleProps["data"]["sessions"][number];
  run: ModuleProps["run"];
  close: () => void;
}) {
  const [keys] = useState(() => ({
    CHARGE: uuid(),
    DISCARD: uuid(),
    draft: uuid(),
  }));
  const pending = session.orders
    .flatMap((o) => o.items)
    .filter((i) => ["PENDING", "PREPARING", "READY"].includes(i.status));
  const resolve = (decision: "CHARGE" | "DISCARD") =>
    run(
      {
        type: "payment.prepare",
        sessionId: session.id,
        requestKey: keys[decision],
        draftRequestKey: keys.draft,
        decision,
        pendingIds: pending.map((i) => i.id),
        items: [],
      },
      decision === "CHARGE"
        ? "Consumos incluidos y marcados entregados."
        : "Consumos pendientes descartados.",
    );
  return (
    <Dialog title={`Resolver pendientes · ${session.tableName}`} close={close}>
      <p>
        Estos consumos todavía no se entregaron. Elegí qué hacer antes de
        cobrar.
      </p>
      <ul className="stack stack--compact">
        {pending.map((i) => (
          <li key={i.id}>
            {i.quantity} × {i.name}
            {i.varieties.length > 0 && (
              <span className="muted">
                {" "}
                · {i.varieties.map((v) => `${v.name}: ${v.option}`).join(", ")}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="muted">
        Cobrarlos los incluye en la cuenta y los marca como entregados.
        Descartar los anula y conserva el motivo en el historial.
      </p>
      <div className="salon-dialog-actions">
        <Button variant="danger" onClick={() => resolve("DISCARD")}>
          Descartar
        </Button>
        <Button onClick={() => resolve("CHARGE")}>Cobrarlos</Button>
      </div>
    </Dialog>
  );
}
