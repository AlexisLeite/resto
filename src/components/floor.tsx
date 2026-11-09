"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { destinationUrl } from "@/lib/restaurant/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Users,
  Utensils,
} from "lucide-react";
import type { ModuleProps } from "./dashboard";
import type { TableView } from "@/lib/restaurant/navigation";
import type { Snapshot } from "@/lib/restaurant/queries";
import { money } from "@/lib/restaurant/shared";
import {
  ActionForm,
  Button,
  Empty,
  Field,
  value,
  checked,
} from "./ui/primitives";
import { Dialog } from "./ui/dialog";
import { AnimatePresence, FadeView, useListMotion } from "./ui/motion";
import { HeaderContext } from "./ui/header-context";
import { SalonOrderDesk } from "./salon/order-desk";

type Table = Snapshot["tables"][number];
export function elapsed(date: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 60000),
  );
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
export function Floor({
  data,
  run,
  checkout,
  active = true,
  selectedId,
  selectTable: setSelectedId,
  view,
  changeView,
}: ModuleProps & {
  checkout: (id: string) => void;
  active?: boolean;
  selectedId: string | null;
  selectTable: (id: string | null, view?: "menu" | "ready") => void;
  view: TableView;
  changeView: (view: TableView) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [opening, setOpening] = useState<Table | null>(null);
  const [guests, setGuests] = useState(2);
  const [manage, setManage] = useState(false);
  const [deleting, setDeleting] = useState<Table | null>(null);
  const [editor, setEditor] = useState<Table | "new" | null>(null);
  const tableMotion = useListMotion<HTMLDivElement>();
  const tables = data.tables.filter(
    (t) => t.active || data.sessions.some((s) => s.tableId === t.id),
  );
  const session = data.sessions.find((s) => s.tableId === selectedId);
  const ready = data.sessions.filter((s) =>
    s.orders.some((o) => o.items.some((i) => i.status === "READY")),
  );
  const free = tables.filter(
    (t) => !data.sessions.some((s) => s.tableId === t.id),
  ).length;
  const filtered = tables.filter(
    (t) =>
      filter === "all" ||
      (filter === "free" && !data.sessions.some((s) => s.tableId === t.id)) ||
      (filter === "busy" && data.sessions.some((s) => s.tableId === t.id)) ||
      (filter === "ready" && ready.some((s) => s.tableId === t.id)),
  );
  function choose(table: Table) {
    if (data.user.role === "ADMIN") {
      setEditor(table);
      return;
    }
    if (data.sessions.some((s) => s.tableId === table.id))
      setSelectedId(table.id);
    else {
      setGuests(Math.min(2, table.seats));
      setOpening(table);
    }
  }
  return (
    <div className="floor-navigation">
      {session && (
        <HeaderContext active={active}>
          <Link
            className="button button--ghost button--icon"
            aria-label="Todas las mesas"
            href={destinationUrl({ role: data.user.role, page: "floor" })}
            scroll={false}
          >
            <ArrowLeft aria-hidden="true" />
          </Link>
          <select
            className="control app-header__table"
            aria-label="Cambiar mesa"
            value={session.tableId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {[...data.sessions]
              .sort((a, b) => a.tableName.localeCompare(b.tableName))
              .map((s) => (
                <option key={s.id} value={s.tableId ?? ""}>
                  {s.tableName}
                </option>
              ))}
          </select>
        </HeaderContext>
      )}
      <FadeView
        viewKey={session?.id ?? "floor"}
        className="floor-navigation__views"
      >
        <div className={`salon-page${session ? " salon-page--ordering" : ""}`}>
          {session ? (
            <>
              <SalonOrderDesk
                key={session.id}
                session={session}
                data={data}
                run={run}
                checkout={checkout}
                view={view}
                changeView={changeView}
              />
            </>
          ) : (
            <>
              <header className="salon-heading">
                <div>
                  <h1 className="salon-heading__title">
                    {data.user.role === "ADMIN" ? "Mesas" : "El salón"}
                  </h1>
                </div>
                <div className="salon-heading__actions">
                  {data.user.role === "ADMIN" && (
                    <Button variant="secondary" onClick={() => setManage(true)}>
                      <Settings2 aria-hidden="true" />
                      Organizar mesas
                    </Button>
                  )}
                  <a
                    className="button button--ghost"
                    href={`/menu/${data.restaurant.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver carta
                    <ArrowUpRight aria-hidden="true" />
                  </a>
                </div>
              </header>
              <div className="salon-layout">
                {ready.length > 0 && (
                  <aside
                    className="salon-service"
                    aria-label="Pendientes del salón"
                  >
                    <header className="salon-service__header">
                      <Bell aria-hidden="true" />
                      <h2>Para entregar</h2>
                      <span className="salon-service__count">
                        {ready.length}
                      </span>
                    </header>
                    <div className="salon-service__tasks">
                      {ready.map((s) => (
                        <Link
                          href={destinationUrl({
                            role: data.user.role,
                            page: "floor",
                            table: s.tableId!,
                            view: "ready",
                          })}
                          scroll={false}
                          key={s.id}
                          className="salon-service__task"
                        >
                          <span className="salon-service__task-heading">
                            <strong>{s.tableName}</strong>
                            <ArrowUpRight aria-hidden="true" />
                          </span>
                        </Link>
                      ))}
                    </div>
                  </aside>
                )}
                <section className="salon" aria-label="Mesas del salón">
                  <div className="salon__toolbar">
                    <div
                      className="salon-filters"
                      role="group"
                      aria-label="Filtrar mesas"
                    >
                      {[
                        ["all", "Todas", tables.length],
                        ["free", "Libres", free],
                        ["busy", "En servicio", data.sessions.length],
                        ["ready", "Para entregar", ready.length],
                      ].map(([id, name, count]) => (
                        <button
                          key={id}
                          className={`salon-filters__item${filter === id ? " salon-filters__item--active" : ""}`}
                          aria-pressed={filter === id}
                          onClick={() => setFilter(String(id))}
                        >
                          {name}
                          <span className="salon-filters__count">{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="salon-tables" ref={tableMotion}>
                    {filtered.map((t) => {
                      const s = data.sessions.find((s) => s.tableId === t.id);
                      const isReady = ready.some((r) => r.tableId === t.id);
                      const number = t.name.match(/^mesa\s*(\d+)$/i)?.[1];
                      const destination =
                        s && data.user.role !== "ADMIN"
                          ? destinationUrl({
                              role: data.user.role,
                              page: "floor",
                              table: t.id,
                            })
                          : undefined;
                      return (
                        <TableControl
                          href={destination}
                          key={t.id}
                          className={`salon-table salon-table--${isReady ? "ready" : s ? "busy" : "free"}`}
                          aria-label={`${t.name}, ${s ? "en servicio" : "libre"}`}
                          onClick={destination ? undefined : () => choose(t)}
                        >
                          <span className="salon-table__top">
                            <span className="salon-table__status">
                              <span className="salon-table__dot" />
                              {isReady
                                ? "Para entregar"
                                : s
                                  ? "En servicio"
                                  : "Libre"}
                            </span>
                            {s && (
                              <span className="salon-table__time">
                                {elapsed(s.openedAt)}
                              </span>
                            )}
                          </span>
                          <span
                            className={`salon-table__diagram${t.seats <= 2 ? " salon-table__diagram--round" : ""}`}
                            aria-hidden="true"
                          >
                            <i className="salon-table__chair salon-table__chair--top" />
                            <i className="salon-table__chair salon-table__chair--bottom" />
                            {t.seats > 2 && (
                              <>
                                <i className="salon-table__chair salon-table__chair--left" />
                                <i className="salon-table__chair salon-table__chair--right" />
                              </>
                            )}
                            <span className="salon-table__surface">
                              <span className="salon-table__number">
                                {number ?? <Utensils />}
                              </span>
                              <span className="salon-table__seats">
                                <Users />
                                {s?.guests ?? t.seats}
                              </span>
                            </span>
                          </span>
                          <span className="salon-table__bottom">
                            <strong>{t.name}</strong>
                            <span>
                              {s
                                ? money(s.total, data.restaurant.currency)
                                : `${t.seats} lugares`}
                            </span>
                          </span>
                        </TableControl>
                      );
                    })}
                  </div>
                  {!filtered.length && (
                    <Empty
                      title={
                        tables.length
                          ? "No hay mesas en este estado"
                          : "Creá las mesas del salón"
                      }
                    >
                      {tables.length ? (
                        <Button
                          variant="secondary"
                          onClick={() => setFilter("all")}
                        >
                          Mostrar todas
                        </Button>
                      ) : (
                        "Usá Organizar mesas para empezar."
                      )}
                    </Empty>
                  )}
                  <p className="salon__hint">
                    {data.user.role === "ADMIN"
                      ? "Seleccioná una mesa para editar su nombre y capacidad."
                      : "Seleccioná una mesa para abrir o continuar su cuenta."}
                  </p>
                </section>
              </div>
            </>
          )}
        </div>
      </FadeView>
      <AnimatePresence>
        {opening && (
          <Dialog
            title={`Abrir ${opening.name}`}
            className="salon-customizer"
            close={() => setOpening(null)}
          >
            <ActionForm
              className="salon-customizer__form"
              submit={async () => {
                const ok = await run(
                  { type: "table.open", tableId: opening.id, guests },
                  "Mesa abierta. Ya podés tomar el pedido.",
                );
                if (ok) {
                  setSelectedId(opening.id);
                  setOpening(null);
                }
                return ok;
              }}
            >
              <div className="salon-customizer__scroll">
                <fieldset className="variety-switch">
                  <legend className="variety-switch__legend">Comensales</legend>
                  <div className="variety-switch__options variety-switch__options--guests">
                    {Array.from({ length: opening.seats }, (_, i) => i + 1).map(
                      (n) => (
                        <label className="variety-switch__option" key={n}>
                          <input
                            className="variety-switch__input"
                            type="radio"
                            name="guests"
                            value={n}
                            required
                            checked={guests === n}
                            onChange={() => setGuests(n)}
                          />
                          <span className="variety-switch__label">{n}</span>
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>
              </div>
              <footer className="salon-customizer__footer">
                <div className="salon-dialog-actions">
                  <Button variant="secondary" onClick={() => setOpening(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Abrir cuenta</Button>
                </div>
              </footer>
            </ActionForm>
          </Dialog>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {manage && (
          <Dialog title="Organizar mesas" close={() => setManage(false)}>
            <div className="salon-management">
              <div className="salon-management__intro">
                <p className="muted">
                  Nombre, capacidad y disponibilidad de cada mesa.
                </p>
                <Button onClick={() => setEditor("new")}>
                  <Plus />
                  Nueva mesa
                </Button>
              </div>
              <div className="salon-management__list">
                {data.tables.map((t) => (
                  <div key={t.id} className="salon-management__row">
                    <span className="salon-management__icon">
                      <Utensils aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{t.name}</strong>
                      <p>
                        {t.seats} lugares{!t.active ? " · Inactiva" : ""}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      aria-label={`Editar ${t.name}`}
                      onClick={() => setEditor(t)}
                    >
                      <Pencil />
                      Editar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editor && (
          <Dialog
            title={editor === "new" ? "Nueva mesa" : "Editar mesa"}
            close={() => setEditor(null)}
          >
            <ActionForm
              submit={async (form) => {
                const ok = await run({
                  type: "table.save",
                  ...(editor === "new" ? {} : { id: editor.id }),
                  name: value(form, "name"),
                  seats: Number(value(form, "seats")),
                  active: checked(form, "active"),
                });
                if (ok) setEditor(null);
                return ok;
              }}
            >
              <div className="form-grid">
                <Field label="Nombre">
                  <input
                    className="control"
                    name="name"
                    required
                    maxLength={100}
                    placeholder="Ej. Mesa 09"
                    defaultValue={editor === "new" ? "" : editor.name}
                  />
                </Field>
                <Field label="Lugares">
                  <input
                    className="control"
                    type="number"
                    name="seats"
                    required
                    min={1}
                    max={30}
                    defaultValue={editor === "new" ? 4 : editor.seats}
                  />
                </Field>
              </div>
              <label className="salon-check">
                <input
                  className="check__input"
                  type="checkbox"
                  name="active"
                  defaultChecked={editor === "new" || editor.active}
                />
                <span>
                  Mesa activa
                  <small>Disponible para abrir cuentas en el salón.</small>
                </span>
              </label>
              {editor !== "new" && (
                <div className="salon-table-delete">
                  <Button
                    variant="danger"
                    disabled={data.sessions.some(
                      (s) => s.tableId === editor.id,
                    )}
                    onClick={() => setDeleting(editor)}
                  >
                    <Trash2 aria-hidden="true" /> Eliminar mesa
                  </Button>
                  {data.sessions.some((s) => s.tableId === editor.id) && (
                    <p className="muted">
                      Cerrá la cuenta para poder eliminar esta mesa.
                    </p>
                  )}
                </div>
              )}
              <div className="salon-dialog-actions">
                <Button variant="secondary" onClick={() => setEditor(null)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar mesa</Button>
              </div>
            </ActionForm>
          </Dialog>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {deleting && (
          <Dialog
            title={`Eliminar ${deleting.name}`}
            close={() => setDeleting(null)}
          >
            <p>
              La mesa dejará de aparecer en el salón y en la administración. Sus
              cuentas y cobros anteriores se conservarán.
            </p>
            <div className="salon-dialog-actions">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Conservar mesa
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (
                    await run(
                      { type: "table.delete", id: deleting.id },
                      "Mesa eliminada.",
                    )
                  ) {
                    setDeleting(null);
                    setEditor(null);
                  }
                }}
              >
                Confirmar eliminación
              </Button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}

function TableControl({
  href,
  ...props
}: {
  href?: string;
  className: string;
  "aria-label": string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return href ? (
    <Link {...props} href={href} scroll={false} />
  ) : (
    <button {...props} />
  );
}
