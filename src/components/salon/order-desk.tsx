"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  Bell,
  Check,
  DollarSign,
  Minus,
  Pencil,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Utensils,
  X,
} from "lucide-react";
import type { RunCommand } from "../dashboard";
import type {
  ProductView,
  SessionView,
  Snapshot,
} from "@/lib/restaurant/queries";
import { type VarietySelection, methods, money } from "@/lib/restaurant/shared";
import {
  ActionForm,
  Field,
  value,
  Button,
  Empty,
  uuid,
} from "../ui/primitives";
import { SalonAccountLine } from "./account-line";
import {
  AnimatePresence,
  AnimatedList,
  FadeView,
  SlideView,
} from "../ui/motion";
import { Dialog } from "../ui/dialog";
import { ProductCustomizer } from "./product-customizer";
const desktopQuery = "(min-width: 1100px)";
const subscribeDesktop = (notify: () => void) => {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const readDesktop = () => window.matchMedia(desktopQuery).matches;
const serverDesktop = () => false;
const draftSchema = z.object({
  requestKey: z.string().uuid(),
  locked: z.boolean(),
  lines: z
    .array(
      z.object({
        id: z.string(),
        productId: z.string(),
        name: z.string(),
        quantity: z.number().int().min(1).max(50),
        notes: z.string(),
        addonIds: z.array(z.string()),
        extras: z.array(z.string()),
        varieties: z
          .array(
            z.object({
              varietyId: z.string(),
              optionId: z.string(),
              name: z.string(),
              option: z.string(),
            }),
          )
          .default([]),
        unitCents: z.number().int().nonnegative(),
      }),
    )
    .max(50),
});
export type Draft = z.infer<typeof draftSchema>;
const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;
export function SalonOrderDesk({
  session,
  data,
  run,
  directSale = false,
  onSaleComplete,
  view: controlledView,
  changeView,
}: {
  session: SessionView;
  data: Snapshot;
  run: RunCommand;
  checkout?: (id: string) => void;
  directSale?: boolean;
  onSaleComplete?: () => void;
  view?: "menu" | "ready" | "order" | "pay";
  changeView?: (view: "menu" | "ready" | "order" | "pay") => void;
}) {
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    readDesktop,
    serverDesktop,
  );
  const storageKey = `resto-draft:${data.user.id}:${session.id}`;
  const [draft, setDraft] = useState<Draft>(() => ({
    requestKey: uuid(),
    locked: false,
    lines: [],
  }));
  const [draftLoaded, setDraftLoaded] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientHydrated,
    serverHydrated,
  );
  if (hydrated && !draftLoaded) {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setDraft(draftSchema.parse(JSON.parse(saved)));
    } catch {}
    setDraftLoaded(true);
  }
  const [custom, setCustom] = useState<ProductView | null>(null);
  const [editLine, setEditLine] = useState<Draft["lines"][number] | null>(null);
  type View = "menu" | "ready" | "order" | "pay";
  const [localView, setLocalView] = useState<View>("menu");
  const view = controlledView ?? localView;
  const setView = changeView ?? setLocalView;
  const [direction, setDirection] = useState(1);
  const canPay =
    data.user.role === "ADMIN" ||
    data.user.role === "CASHIER" ||
    data.restaurant.waitersCanCharge;
  const unresolved =
    !directSale &&
    (draft.lines.length > 0 ||
      session.orders.some((order) =>
        order.items.some((item) =>
          ["PENDING", "PREPARING", "READY"].includes(item.status),
        ),
      ));
  const activeView = view === "pay" && (!canPay || unresolved) ? "menu" : view;
  const workspace =
    desktop && (activeView === "menu" || activeView === "order");
  const navigate = (next: View) => {
    const order: View[] = ["menu", "ready", "order", "pay"];
    setDirection(order.indexOf(next) > order.indexOf(activeView) ? 1 : -1);
    setView(next);
  };
  const [paymentDecision, setPaymentDecision] = useState<{
    requestKey: string;
    pendingIds: string[];
  } | null>(null);
  const [restoredPaymentView, setRestoredPaymentView] = useState(false);
  if (view !== "pay" && restoredPaymentView) setRestoredPaymentView(false);
  if (
    view === "pay" &&
    draftLoaded &&
    !restoredPaymentView &&
    !directSale &&
    canPay
  ) {
    setRestoredPaymentView(true);
    if (unresolved)
      setPaymentDecision({
        requestKey: uuid(),
        pendingIds: session.orders
          .flatMap((order) => order.items)
          .filter((item) =>
            ["PENDING", "PREPARING", "READY"].includes(item.status),
          )
          .map((item) => item.id),
      });
  }
  const cartTotal =
    draft.lines.reduce((n, l) => n + l.unitCents * l.quantity, 0) / 100;
  const chargeTotal = directSale ? cartTotal.toFixed(2) : session.total;
  const [service, setService] = useState<string | null>(null);
  const serviceValue =
    service ??
    (directSale
      ? "0"
      : (Math.round(Number(session.total) * 10) / 100).toFixed(2));
  const paymentTotal =
    (Math.round(Number(chargeTotal) * 100) +
      Math.round(Number(serviceValue || "0") * 100)) /
    100;
  function requestPayment() {
    if (directSale) {
      navigate("pay");
      return;
    }
    const pendingIds = session.orders
      .flatMap((o) => o.items)
      .filter((i) => ["PENDING", "PREPARING", "READY"].includes(i.status))
      .map((i) => i.id);
    setService(null);
    if (pendingIds.length || draft.lines.length)
      setPaymentDecision({ requestKey: uuid(), pendingIds });
    else navigate("pay");
  }
  async function resolvePending(decision: "DISCARD" | "CHARGE") {
    if (!paymentDecision) return;
    const ok = await run(
      {
        type: "payment.prepare",
        sessionId: session.id,
        ...paymentDecision,
        draftRequestKey: draft.requestKey,
        decision,
        items: draft.lines.map(
          ({ productId, quantity, notes, addonIds, varieties }) => ({
            productId,
            quantity,
            notes,
            addonIds,
            varieties: varieties.map(({ varietyId, optionId }) => ({
              varietyId,
              optionId,
            })),
          }),
        ),
      },
      decision === "CHARGE"
        ? "Pendientes incluidos en la cuenta."
        : "Pendientes descartados.",
    );
    if (ok) {
      setDraft({ requestKey: uuid(), locked: false, lines: [] });
      setPaymentDecision(null);
      navigate("pay");
    }
  }
  const scrollPositions = useRef(new Map<string, number>());
  const [categoryDirection, setCategoryDirection] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      if (draft.lines.length)
        sessionStorage.setItem(storageKey, JSON.stringify(draft));
      else sessionStorage.removeItem(storageKey);
    } catch {}
  }, [draft, storageKey, draftLoaded]);
  const items = session.orders.flatMap((o) => o.items);

  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .trim();
  const products = data.products.filter(
    (p) =>
      p.active &&
      (category === "all" || p.categoryId === category) &&
      normalize(`${p.name} ${p.description}`).includes(normalize(search)),
  );
  function add(
    p: ProductView,
    quantity = 1,
    notes = "",
    addonIds: string[] = [],
    selections: VarietySelection[] = [],
  ) {
    if (draft.locked) return;
    const addons = p.addons.filter((a) => addonIds.includes(a.id));
    const varieties = p.varieties.map((v) => {
      const option = v.options.find(
        (o) => o.id === selections.find((s) => s.varietyId === v.id)?.optionId,
      );
      return option
        ? {
            varietyId: v.id,
            optionId: option.id,
            name: v.name,
            option: option.name,
          }
        : null;
    });
    if (varieties.some((v) => !v)) return;
    const line = {
      id: editLine?.id ?? uuid(),
      productId: p.id,
      name: p.name,
      quantity,
      notes: notes.trim(),
      addonIds,
      extras: addons.map((a) => a.name),
      varieties: varieties.filter((v) => v !== null),
      unitCents:
        Math.round(Number(p.price) * 100) +
        addons.reduce((n, a) => n + Math.round(Number(a.price) * 100), 0),
    };
    setDraft((d) => {
      const split = Boolean(
        editLine && p.varieties.length && editLine.quantity > 1,
      );
      const others = d.lines.flatMap((l) =>
        l.id !== editLine?.id
          ? [l]
          : split
            ? [{ ...l, quantity: l.quantity - 1 }]
            : [],
      );
      if (split) line.id = uuid();
      const same = others.find(
        (l) =>
          l.productId === line.productId &&
          l.notes === line.notes &&
          l.unitCents === line.unitCents &&
          JSON.stringify([...l.addonIds].sort()) ===
            JSON.stringify([...addonIds].sort()) &&
          l.varieties.length === line.varieties.length &&
          l.varieties.every((v) =>
            line.varieties.some(
              (s) => s.varietyId === v.varietyId && s.optionId === v.optionId,
            ),
          ) &&
          l.quantity + quantity <= 50,
      );
      return {
        ...d,
        requestKey: uuid(),
        lines: same
          ? others.map((l) =>
              l.id === same.id ? { ...l, quantity: l.quantity + quantity } : l,
            )
          : editLine && !split
            ? d.lines.map((l) => (l.id === editLine.id ? line : l))
            : [...others, line],
      };
    });
  }
  const sending = useRef(false);
  async function sendOrder() {
    if (directSale) {
      requestPayment();
      return;
    }
    if (sending.current || !draft.lines.length) return;
    sending.current = true;
    try {
      setDraft((d) => ({ ...d, locked: true }));
      const ok = await run(
        {
          type: "order.create",
          sessionId: session.id,
          requestKey: draft.requestKey,
          items: draft.lines.map(
            ({ productId, quantity, notes, addonIds, varieties }) => ({
              productId,
              quantity,
              notes,
              addonIds,
              varieties: varieties.map(({ varietyId, optionId }) => ({
                varietyId,
                optionId,
              })),
            }),
          ),
        },
        "Pedido enviado a cocina y barra.",
      );
      if (ok) {
        setDraft({
          requestKey: uuid(),
          locked: false,
          lines: [],
        });
      }
    } finally {
      sending.current = false;
    }
  }
  const TableView = desktop ? FadeView : SlideView;
  const backToOrder = desktop ? (
    <Button variant="ghost" onClick={() => navigate("menu")}>
      <ArrowLeft aria-hidden="true" />
      Carta y pedido
    </Button>
  ) : null;
  return (
    <div className="order-desk">
      <TableView
        viewKey={workspace ? "workspace" : activeView}
        direction={direction}
        className={`table-views${workspace ? " table-views--workspace" : ""}`}
      >
        {(activeView === "menu" || workspace) && (
          <section className="order-desk__menu">
            <header className="order-desk__desktop-heading">
              <h2>Carta</h2>
              <span>{products.length} productos</span>
            </header>
            <div className="search-field">
              <Search aria-hidden="true" />
              <input
                aria-label="Buscar en la carta"
                className="control search-field__input"
                placeholder="Buscar un plato, una bebida…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <Button
                  variant="ghost"
                  className="button--icon search-field__clear"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setSearch("")}
                >
                  <X />
                </Button>
              )}
            </div>
            <div className="category-strip" aria-label="Categorías">
              <button
                className={`category-strip__item${category === "all" ? " category-strip__item--active" : ""}`}
                onClick={() => {
                  setCategoryDirection(-1);
                  setCategory("all");
                }}
                aria-pressed={category === "all"}
              >
                Toda la carta
              </button>
              {data.categories.map((c) => (
                <button
                  key={c.id}
                  className={`category-strip__item${category === c.id ? " category-strip__item--active" : ""}`}
                  onClick={() => {
                    const ids = ["all", ...data.categories.map((c) => c.id)];
                    setCategoryDirection(
                      ids.indexOf(c.id) > ids.indexOf(category) ? 1 : -1,
                    );
                    setCategory(c.id);
                  }}
                  aria-pressed={category === c.id}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <SlideView
              viewKey={category}
              direction={categoryDirection}
              className="category-views"
            >
              <div
                className="salon-products"
                aria-label="Productos de la carta"
                ref={(node) => {
                  if (node)
                    node.scrollTop = scrollPositions.current.get(category) ?? 0;
                }}
                onScroll={(e) =>
                  scrollPositions.current.set(
                    category,
                    e.currentTarget.scrollTop,
                  )
                }
              >
                {data.categories.map((c) => {
                  const categoryProducts = products.filter(
                    (p) => p.categoryId === c.id,
                  );
                  if (!categoryProducts.length) return null;
                  return (
                    <section className="salon-products__category" key={c.id}>
                      <h3 className="salon-products__heading">
                        {c.name}
                        <span>{categoryProducts.length}</span>
                      </h3>
                      <AnimatedList
                        className="product-grid"
                        animateSize={false}
                      >
                        {categoryProducts.map((p) => {
                          const quantity = draft.lines
                            .filter((l) => l.productId === p.id)
                            .reduce((n, l) => n + l.quantity, 0);
                          return (
                            <article
                              key={p.id}
                              className={`product-card${!p.available ? " product-card--unavailable" : ""}${quantity ? " product-card--added" : ""}`}
                            >
                              <div className="product-card__identity">
                                <h4 className="product-card__name">{p.name}</h4>
                                {!p.available && (
                                  <span className="product-card__availability">
                                    Agotado
                                  </span>
                                )}
                              </div>
                              <p className="product-card__description">
                                {p.description}
                              </p>
                              <div className="product-card__actions">
                                <strong>
                                  {money(p.price, data.restaurant.currency)}
                                </strong>
                                <div className="product-card__buttons">
                                  {quantity > 0 && (
                                    <span
                                      className="product-card__quantity"
                                      aria-label={`${quantity} en el pedido`}
                                    >
                                      {quantity}
                                    </span>
                                  )}
                                  <Button
                                    variant="secondary"
                                    className="button--icon product-card__add"
                                    disabled={
                                      !p.available ||
                                      draft.locked ||
                                      draft.lines.length >= 50
                                    }
                                    aria-label={`Agregar ${p.name}`}
                                    onClick={() => {
                                      setEditLine(null);
                                      setCustom(p);
                                    }}
                                  >
                                    <Plus aria-hidden="true" />
                                  </Button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </AnimatedList>
                    </section>
                  );
                })}
                {!products.length && (
                  <div className="salon-no-results">
                    <Search aria-hidden="true" />
                    <h3>No encontramos productos</h3>
                    <p>Probá con otro nombre o cambiá la categoría.</p>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearch("");
                        setCategory("all");
                      }}
                    >
                      Ver toda la carta
                    </Button>
                  </div>
                )}
              </div>
            </SlideView>
          </section>
        )}
        {(activeView === "order" || workspace) && (
          <aside className="receipt">
            <header className="receipt__header">
              <h2>Pedido</h2>
              <span>
                {draft.lines.reduce((n, l) => n + l.quantity, 0)}{" "}
                {draft.lines.reduce((n, l) => n + l.quantity, 0) === 1
                  ? "unidad"
                  : "unidades"}
              </span>
            </header>
            {desktop && !directSale && (
              <div className="receipt__service-actions">
                <Button
                  variant="secondary"
                  aria-label="Listos para entregar"
                  className={
                    items.some((i) => i.status === "READY")
                      ? "receipt__delivery--ready"
                      : ""
                  }
                  disabled={!items.some((i) => i.status === "READY")}
                  onClick={() => navigate("ready")}
                >
                  <Bell aria-hidden="true" />
                  Para entregar{" "}
                  <span>
                    {items
                      .filter((i) => i.status === "READY")
                      .reduce((n, i) => n + i.quantity, 0)}
                  </span>
                </Button>
                {canPay && (
                  <Button variant="secondary" onClick={requestPayment}>
                    <DollarSign aria-hidden="true" />
                    Pagar
                  </Button>
                )}
              </div>
            )}
            <AnimatedList className="receipt__body">
              {draft.lines.length ? (
                draft.lines.map((line) => (
                  <div className="cart__line" key={line.id}>
                    <div className="row row--between">
                      <strong>{line.name}</strong>
                      <div className="cart__actions">
                        <Button
                          variant="ghost"
                          className="button--icon"
                          aria-label={`Editar ${line.name}`}
                          disabled={draft.locked}
                          onClick={() => {
                            const product = data.products.find(
                              (p) => p.id === line.productId,
                            );
                            if (product) {
                              setEditLine(line);
                              setCustom(product);
                            }
                          }}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          className="button--icon"
                          aria-label={`Quitar ${line.name}`}
                          disabled={draft.locked}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              requestKey: uuid(),
                              lines: d.lines.filter((l) => l.id !== line.id),
                            }))
                          }
                        >
                          <X />
                        </Button>
                      </div>
                    </div>
                    {(line.varieties.length > 0 ||
                      line.extras.length > 0 ||
                      line.notes) && (
                      <p className="muted">
                        {[
                          ...line.varieties.map(
                            (v) => `${v.name}: ${v.option}`,
                          ),
                          ...line.extras,
                          line.notes,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                    <div className="row row--between">
                      <div className="quantity-stepper">
                        <Button
                          variant="ghost"
                          aria-label={`Restar ${line.name}`}
                          disabled={draft.locked}
                          onClick={() =>
                            setDraft((d) => ({
                              ...d,
                              requestKey: uuid(),
                              lines: d.lines
                                .map((l) =>
                                  l.id === line.id
                                    ? { ...l, quantity: l.quantity - 1 }
                                    : l,
                                )
                                .filter((l) => l.quantity > 0),
                            }))
                          }
                        >
                          <Minus />
                        </Button>
                        <span>{line.quantity}</span>
                        <Button
                          variant="ghost"
                          aria-label={`Sumar ${line.name}`}
                          disabled={draft.locked || line.quantity >= 50}
                          onClick={() => {
                            setDraft((d) => ({
                              ...d,
                              requestKey: uuid(),
                              lines: d.lines.map((l) =>
                                l.id === line.id
                                  ? { ...l, quantity: l.quantity + 1 }
                                  : l,
                              ),
                            }));
                          }}
                        >
                          <Plus />
                        </Button>
                      </div>
                      <strong>
                        {money(
                          (line.unitCents * line.quantity) / 100,
                          data.restaurant.currency,
                        )}
                      </strong>
                    </div>
                  </div>
                ))
              ) : (
                <div className="receipt__empty">
                  <ShoppingBag />
                  <h3>Empezá el pedido</h3>
                  <p>
                    Usá + para agregar productos.
                    <br />
                    Todavía no se envió nada a cocina.
                  </p>
                </div>
              )}
              {draft.locked && (
                <p className="notice notice--info">
                  Este envío quedó pendiente. Reintentá para comprobarlo sin
                  duplicar el pedido.
                </p>
              )}
            </AnimatedList>
            <footer className="receipt__footer">
              <div className="cart__total">
                <span>Total del pedido</span>
                <strong>{money(cartTotal, data.restaurant.currency)}</strong>
              </div>
              <Button
                className="button--wide"
                disabled={!draft.lines.length}
                onClick={sendOrder}
              >
                <Send />
                {directSale
                  ? "Continuar al cobro"
                  : draft.locked
                    ? "Reintentar envío"
                    : "Enviar a cocina / barra"}
              </Button>
              {draft.locked && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      requestKey: uuid(),
                      locked: false,
                      lines: [],
                    })
                  }
                >
                  Descartar borrador
                </Button>
              )}
            </footer>
          </aside>
        )}
        {activeView === "ready" && (
          <section className="table-section">
            <header className="receipt__header">
              <h2>Listos para entregar</h2>
              {backToOrder}
            </header>
            <AnimatedList className="table-section__body">
              {items
                .filter((i) => i.status === "READY")
                .map((item) => (
                  <article className="delivery-item" key={item.id}>
                    <div>
                      <h3>
                        {item.quantity} × {item.name}
                      </h3>
                      <p className="muted">
                        {[
                          ...item.varieties.map(
                            (v) => `${v.name}: ${v.option}`,
                          ),
                          ...item.extras,
                          item.notes,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Button
                      className="button--icon"
                      aria-label={`Marcar entregado: ${item.name}`}
                      title="Marcar entregado"
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
                    </Button>
                  </article>
                ))}
              {!items.some((i) => i.status === "READY") && (
                <Empty title="Todo entregado">
                  Los próximos productos listos aparecerán acá.
                </Empty>
              )}
            </AnimatedList>
          </section>
        )}
        {activeView === "pay" && canPay && (
          <section className="table-section table-section--payment">
            <header className="receipt__header">
              <h2>
                {directSale ? "Cobrar venta" : `Cuenta · ${session.tableName}`}
              </h2>
              {backToOrder}
              {directSale && !desktop && (
                <Button variant="ghost" onClick={() => navigate("order")}>
                  Volver al pedido
                </Button>
              )}
            </header>
            <div className="table-section__body payment-account">
              {directSale ? (
                draft.lines.map((line) => (
                  <div className="cart__line" key={line.id}>
                    <div className="row row--between">
                      <strong>
                        {line.quantity} × {line.name}
                      </strong>
                      <strong>
                        {money(
                          (line.quantity * line.unitCents) / 100,
                          data.restaurant.currency,
                        )}
                      </strong>
                    </div>
                    <p className="muted">
                      {[
                        ...line.varieties.map((v) => `${v.name}: ${v.option}`),
                        ...line.extras,
                        line.notes,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))
              ) : session.orders.length ? (
                session.orders.map((o, index) => (
                  <section key={o.id}>
                    <p className="receipt__order-label">
                      Pedido {index + 1}
                      <span>
                        {new Intl.DateTimeFormat("es-UY", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: data.restaurant.timezone,
                        }).format(new Date(o.createdAt))}
                      </span>
                    </p>
                    {o.items.map((i) => (
                      <SalonAccountLine
                        key={i.id}
                        item={i}
                        showDelivery={false}
                        role={data.user.role}
                        run={run}
                        currency={data.restaurant.currency}
                      />
                    ))}
                  </section>
                ))
              ) : (
                <Empty title="Todavía no hay consumos">
                  Agregá productos en Nuevo pedido.
                </Empty>
              )}
              <div className="cart__total">
                <span>Consumos</span>
                <strong>{money(chargeTotal, data.restaurant.currency)}</strong>
              </div>
            </div>
            <footer className="payment-controls">
              <ActionForm
                submit={async (form) => {
                  if (directSale) {
                    setDraft((d) => ({ ...d, locked: true }));
                    const ok = await run(
                      {
                        type: "sale.create",
                        requestKey: draft.requestKey,
                        items: draft.lines.map(
                          ({
                            productId,
                            quantity,
                            notes,
                            addonIds,
                            varieties,
                          }) => ({
                            productId,
                            quantity,
                            notes,
                            addonIds,
                            varieties: varieties.map(
                              ({ varietyId, optionId }) => ({
                                varietyId,
                                optionId,
                              }),
                            ),
                          }),
                        ),
                        method: value(form, "method") as keyof typeof methods,
                        expectedTotal: chargeTotal,
                        serviceAmount: serviceValue || "0",
                      },
                      "Venta cobrada.",
                    );
                    if (ok) {
                      sessionStorage.removeItem(storageKey);
                      setDraft({
                        requestKey: uuid(),
                        locked: false,
                        lines: [],
                      });
                      navigate("menu");
                      onSaleComplete?.();
                    }
                    return ok;
                  }
                  return run(
                    {
                      type: "payment.create",
                      sessionId: session.id,
                      method: value(form, "method") as keyof typeof methods,
                      expectedTotal: session.total,
                      serviceAmount: serviceValue || "0",
                    },
                    "Cobro registrado y mesa liberada.",
                  );
                }}
              >
                <div className="payment-controls__fields">
                  <Field
                    label={`Servicio (${data.restaurant.currency})`}
                    hint={
                      directSale
                        ? "Importe opcional."
                        : "Importe sugerido: 10% de los consumos."
                    }
                  >
                    <input
                      className="control"
                      name="service"
                      type="number"
                      min="0"
                      max="9999999"
                      step="0.01"
                      required
                      value={serviceValue}
                      onChange={(e) => setService(e.target.value)}
                    />
                  </Field>
                  <Field label="Medio de pago">
                    <select className="control" name="method">
                      {Object.entries(methods).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="cart__total">
                  <span>Total a pagar</span>
                  <strong>
                    {money(paymentTotal, data.restaurant.currency)}
                  </strong>
                </div>

                {!data.restaurant.cashOpen && (
                  <p className="notice notice--info">
                    Caja debe abrir un turno antes de cobrar.
                  </p>
                )}
                {items.some(
                  (i) =>
                    !["DELIVERED", "CANCELLED", "BILLABLE"].includes(i.status),
                ) && (
                  <p className="notice notice--info">
                    Hay nuevos pendientes. Volvé a pulsar Pagar para
                    resolverlos.
                  </p>
                )}
                {!directSale && draft.lines.length > 0 && (
                  <p className="notice notice--info">
                    Tenés un pedido sin enviar.
                  </p>
                )}
                {!directSale &&
                  Number(session.total) === 0 &&
                  !draft.lines.length &&
                  items.every((i) => i.status === "CANCELLED") && (
                    <Button
                      className="button--wide"
                      onClick={() =>
                        run(
                          { type: "table.closeEmpty", sessionId: session.id },
                          "Cuenta cerrada sin consumos.",
                        )
                      }
                    >
                      Cerrar mesa sin consumos
                    </Button>
                  )}
                <Button
                  type="submit"
                  disabled={
                    !data.restaurant.cashOpen ||
                    Number(chargeTotal) <= 0 ||
                    (!directSale && draft.lines.length > 0) ||
                    items.some(
                      (i) =>
                        !["DELIVERED", "CANCELLED", "BILLABLE"].includes(
                          i.status,
                        ),
                    )
                  }
                >
                  Confirmar cobro de{" "}
                  {money(paymentTotal, data.restaurant.currency)}
                </Button>
              </ActionForm>
            </footer>
          </section>
        )}
      </TableView>
      {!desktop && (
        <footer className="salon-view-toggle" aria-label="Vista de la mesa">
          <button
            className={`salon-view-toggle__button${activeView === "menu" ? " salon-view-toggle__button--active" : ""}`}
            aria-label="Carta"
            title="Carta"
            aria-pressed={activeView === "menu"}
            onClick={() => navigate("menu")}
          >
            <Utensils aria-hidden="true" />
          </button>
          {!directSale && (
            <button
              className={`salon-view-toggle__button salon-view-toggle__ready${activeView === "ready" ? " salon-view-toggle__button--active" : ""}`}
              aria-label="Listos para entregar"
              title="Listos para entregar"
              aria-pressed={activeView === "ready"}
              disabled={!items.some((i) => i.status === "READY")}
              onClick={() => navigate("ready")}
            >
              <Bell aria-hidden="true" />
              {items.some((i) => i.status === "READY") && (
                <span className="salon-view-toggle__ready-count">
                  {items
                    .filter((i) => i.status === "READY")
                    .reduce((n, i) => n + i.quantity, 0)}
                </span>
              )}
            </button>
          )}
          <button
            className={`salon-view-toggle__button salon-view-toggle__button--order${activeView === "order" ? " salon-view-toggle__button--active" : ""}`}
            aria-label={`Pedido ${money(cartTotal, data.restaurant.currency)}`}
            title="Pedido"
            aria-pressed={activeView === "order"}
            onClick={() => navigate("order")}
          >
            <ShoppingBag aria-hidden="true" />
            <strong>{money(cartTotal, data.restaurant.currency)}</strong>
          </button>
          <Button
            className="button--icon salon-view-toggle__send"
            aria-label={
              directSale
                ? "Continuar al cobro"
                : draft.locked
                  ? "Reintentar envío del pedido"
                  : "Enviar pedido"
            }
            title="Enviar pedido"
            disabled={!draft.lines.length}
            onClick={sendOrder}
          >
            <Send aria-hidden="true" />
          </Button>
          {canPay && (
            <button
              className={`salon-view-toggle__button${activeView === "pay" ? " salon-view-toggle__button--active" : ""}`}
              aria-label="Pagar"
              title="Pagar"
              aria-pressed={activeView === "pay"}
              onClick={requestPayment}
            >
              <DollarSign aria-hidden="true" />
            </button>
          )}
        </footer>
      )}
      <AnimatePresence>
        {paymentDecision && (
          <Dialog
            title="Resolver pendientes"
            close={() => {
              setPaymentDecision(null);
              if (view === "pay") navigate("menu");
            }}
          >
            <p>
              Antes de mostrar la cuenta, elegí qué hacer con el pedido sin
              enviar y los productos aún no entregados.
            </p>
            <ul className="stack stack--compact">
              {draft.lines.map((l) => (
                <li key={l.id}>
                  {l.quantity} × {l.name} · Sin enviar
                </li>
              ))}
              {items
                .filter((i) => paymentDecision.pendingIds.includes(i.id))
                .map((i) => (
                  <li key={i.id}>
                    {i.quantity} × {i.name} · Sin entregar
                  </li>
                ))}
            </ul>
            <p className="muted">
              Descartar los excluye del cobro. Cobrarlos los incluye y los marca
              como entregados automáticamente.
            </p>
            <div className="salon-dialog-actions">
              <Button
                variant="danger"
                onClick={() => resolvePending("DISCARD")}
              >
                Descartar
              </Button>
              <Button onClick={() => resolvePending("CHARGE")}>
                Cobrarlos
              </Button>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {custom && (
          <ProductCustomizer
            key={editLine?.id ?? custom.id}
            product={custom}
            line={editLine}
            currency={data.restaurant.currency}
            close={() => {
              setCustom(null);
              setEditLine(null);
            }}
            save={(quantity, notes, addonIds, varieties) => {
              add(custom, quantity, notes, addonIds, varieties);
              setCustom(null);
              setEditLine(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
