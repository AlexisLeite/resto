"use client";
import { Pencil, Plus, QrCode, ExternalLink, Trash2 } from "lucide-react";
import { Dialog } from "./ui/dialog";
import { AnimatePresence, AnimatedList, SlideView } from "./ui/motion";
import { commandSchema } from "@/lib/restaurant/validation";
import { WorkspaceTabs } from "./ui/workspace-tabs";
import { CategoryManager } from "./category-manager";
import { VarietiesEditor } from "./varieties-editor";
import Image from "next/image";
import { destinationUrl } from "@/lib/restaurant/navigation";
import { useState } from "react";
import type { ModuleProps } from "./dashboard";
import type { ProductView } from "@/lib/restaurant/queries";
import {
  money,
  stations,
  type Addon,
  type Variety,
} from "@/lib/restaurant/shared";
import { ActionForm, Button, Empty, Field, uuid } from "./ui/primitives";

export function Catalog({
  data,
  run,
  section = "products",
  changeSection,
}: ModuleProps & {
  section?: string;
  changeSection?: (section: string) => void;
}) {
  const [localTab, setLocalTab] = useState("products");
  const tab = changeSection ? section : localTab;
  const setTab = changeSection ?? setLocalTab;
  const [tabDirection, setTabDirection] = useState(1);
  const [editor, setEditor] = useState<ProductView | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [utility, setUtility] = useState<"qr" | null>(null);
  const filtered = data.products.filter(
    (p) =>
      (category === "all" || p.categoryId === category) &&
      `${p.name} ${p.description}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const admin = data.user.role === "ADMIN";
  const available = admin || data.user.role === "KITCHEN";
  return (
    <>
      {admin && (
        <WorkspaceTabs
          label="Administrar carta"
          href={(section) =>
            destinationUrl({ role: data.user.role, page: "catalog", section })
          }
          beforeNavigate={(next) =>
            setTabDirection(next === "products" ? 1 : -1)
          }
          value={tab}
          options={[
            { id: "categories", label: "Categorías" },
            { id: "products", label: "Productos" },
          ]}
          change={(next) => {
            setTabDirection(next === "products" ? 1 : -1);
            setTab(next);
          }}
        />
      )}
      <SlideView
        viewKey={admin ? tab : "products"}
        direction={tabDirection}
        className="catalog-sections"
      >
        {admin && tab === "categories" ? (
          <CategoryManager data={data} run={run} inline />
        ) : (
          <div className="catalog-products">
            <div className="catalog-toolbar">
              {admin ? (
                <Button
                  onClick={() => setEditor("new")}
                  disabled={!data.categories.length}
                >
                  <Plus aria-hidden="true" /> Nuevo producto
                </Button>
              ) : (
                <p className="management-count">
                  Actualizá lo que se puede pedir.
                </p>
              )}
              <div className="catalog-toolbar__tools">
                <Button
                  variant="secondary"
                  className="button--icon"
                  aria-label="Código QR"
                  title="Carta pública y código QR"
                  onClick={() => setUtility("qr")}
                >
                  <QrCode aria-hidden="true" />
                </Button>
              </div>
            </div>
            <AnimatePresence>
              {utility === "qr" && (
                <Dialog
                  title="Código QR de la carta"
                  close={() => setUtility(null)}
                >
                  <div className="qr-preview">
                    {/* El QR es un documento legible por cámara, con contraste propio. */}
                    <Image
                      unoptimized
                      width={192}
                      height={192}
                      className="qr"
                      src="/api/menu-qr"
                      alt="Código QR de la carta pública"
                    />
                    <div className="row">
                      <a
                        href={`/menu/${data.restaurant.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="button button--secondary"
                      >
                        <ExternalLink aria-hidden="true" /> Carta pública
                      </a>
                      <a
                        href="/api/menu-qr"
                        download="resto-carta.svg"
                        className="button button--primary"
                      >
                        Descargar QR
                      </a>
                    </div>
                    <p className="muted">
                      Descargalo para imprimir. La carta es de consulta; los
                      pedidos los toma el equipo de salón.
                    </p>
                  </div>
                </Dialog>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {editor && (
                <ProductEditor
                  key={editor === "new" ? "new" : editor.id}
                  product={editor === "new" ? null : editor}
                  data={data}
                  run={run}
                  close={() => setEditor(null)}
                />
              )}
            </AnimatePresence>
            <div className="management-filters">
              <Field label="Buscar producto">
                <input
                  className="control"
                  placeholder="Nombre o descripción"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Field>
              <Field label="Filtrar categoría">
                <select
                  className="control"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="all">Todas</option>
                  {data.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="management-count">
              {filtered.length}{" "}
              {filtered.length === 1 ? "producto" : "productos"}
            </p>
            <AnimatedList className="management-list" animateSize={false}>
              {filtered.map((p) => (
                <article className="catalog-row" key={p.id}>
                  <div className="catalog-row__identity">
                    <strong>{p.name}</strong>
                    <span>
                      {data.categories.find((c) => c.id === p.categoryId)?.name}{" "}
                      · {stations[p.station]}
                    </span>
                    {p.description && <p>{p.description}</p>}
                  </div>
                  <strong className="catalog-row__price">
                    {money(p.price, data.restaurant.currency)}
                  </strong>
                  <div className="catalog-row__actions">
                    {!p.active ? (
                      <span className="badge">Archivado</span>
                    ) : available ? (
                      <Button
                        variant={p.available ? "secondary" : "danger"}
                        aria-label={`${p.available ? "Marcar agotado" : "Marcar disponible"}: ${p.name}`}
                        aria-pressed={p.available}
                        onClick={() =>
                          run(
                            {
                              type: "product.availability",
                              id: p.id,
                              available: !p.available,
                            },
                            "",
                          )
                        }
                      >
                        <span
                          className={`availability-dot${p.available ? " availability-dot--on" : ""}`}
                        />
                        {p.available ? "Disponible" : "Agotado"}
                      </Button>
                    ) : (
                      <span className="badge">
                        {p.available ? "Disponible" : "Agotado"}
                      </span>
                    )}
                    {admin && (
                      <Button
                        variant="secondary"
                        className="button--icon"
                        aria-label={`Editar ${p.name}`}
                        title={`Editar ${p.name}`}
                        onClick={() => setEditor(p)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </AnimatedList>
            {!filtered.length && (
              <Empty
                title={
                  data.products.length
                    ? "Sin coincidencias"
                    : "La carta está vacía"
                }
              >
                {data.products.length
                  ? "Probá otro nombre o categoría."
                  : "Creá una categoría y tu primer producto."}
              </Empty>
            )}
          </div>
        )}
      </SlideView>
    </>
  );
}
function ProductEditor({
  product,
  data,
  run,
  close,
}: ModuleProps & { product: ProductView | null; close: () => void }) {
  const [varieties, setVarieties] = useState<Variety[]>(
    product?.varieties ?? [],
  );
  const [addons, setAddons] = useState<Addon[]>(product?.addons ?? []);
  const [section, setSection] = useState("data");
  const [direction, setDirection] = useState(1);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    imageUrl: product?.imageUrl ?? "",
    categoryId: product?.categoryId ?? data.categories[0]?.id ?? "",
    price: product?.price ?? "",
    station: product?.station ?? "KITCHEN",
    available: product?.available ?? true,
    active: product?.active ?? true,
  });
  const navigate = (next: string) => {
    setDirection(
      ["data", "varieties", "addons"].indexOf(next) >
        ["data", "varieties", "addons"].indexOf(section)
        ? 1
        : -1,
    );
    setSection(next);
  };

  return (
    <Dialog
      title={product ? `Editar ${product.name}` : "Nuevo producto"}
      close={close}
      className="management-editor product-editor"
    >
      <ActionForm
        submit={async () => {
          const input = {
            type: "product.save" as const,
            ...(product ? { id: product.id } : {}),
            ...draft,
            varieties,
            addons: addons.map((a) => ({
              ...a,
              price: a.price.replace(",", "."),
            })),
          };
          const parsed = commandSchema.safeParse(input);
          if (!parsed.success) {
            const field = parsed.error.issues[0].path[0];
            const next =
              field === "varieties"
                ? "varieties"
                : field === "addons"
                  ? "addons"
                  : "data";
            setError(
              next === "data"
                ? "Completá los datos del producto y un precio mayor a cero."
                : next === "varieties"
                  ? "Completá el nombre de cada variedad y sus opciones."
                  : "Completá el nombre y el precio de cada adicional.",
            );
            navigate(next);
            return false;
          }
          setError("");
          const ok = await run(parsed.data);
          if (ok) close();
          return ok;
        }}
      >
        <WorkspaceTabs
          label="Edición de producto"
          value={section}
          options={[
            { id: "data", label: "Datos" },
            { id: "varieties", label: "Variedades", count: varieties.length },
            { id: "addons", label: "Adicionales", count: addons.length },
          ]}
          change={navigate}
        />
        {error && (
          <p
            className="notice notice--error product-editor__error"
            role="alert"
          >
            {error}
          </p>
        )}
        <SlideView
          viewKey={section}
          direction={direction}
          className="product-editor__views"
        >
          <div className="management-editor__scroll">
            {section === "data" && (
              <>
                <div className="form-grid">
                  <Field label="Nombre">
                    <input
                      className="control"
                      name="name"
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                      required
                      maxLength={100}
                    />
                  </Field>
                  <Field label="Categoría">
                    <select
                      className="control"
                      name="categoryId"
                      value={draft.categoryId}
                      onChange={(e) =>
                        setDraft({ ...draft, categoryId: e.target.value })
                      }
                      required
                    >
                      {data.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Precio (${data.restaurant.currency})`}>
                    <input
                      className="control"
                      type="number"
                      name="price"
                      min="0.01"
                      max="9999999"
                      step="0.01"
                      value={draft.price}
                      onChange={(e) =>
                        setDraft({ ...draft, price: e.target.value })
                      }
                      required
                    />
                  </Field>
                  <Field label="Preparación">
                    <select
                      className="control"
                      name="station"
                      value={draft.station}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          station: e.target.value as "KITCHEN" | "BAR",
                        })
                      }
                    >
                      <option value="KITCHEN">Cocina</option>
                      <option value="BAR">Barra</option>
                    </select>
                  </Field>
                  <div className="form-grid__full">
                    <Field label="Descripción">
                      <textarea
                        className="control control--area"
                        name="description"
                        value={draft.description}
                        onChange={(e) =>
                          setDraft({ ...draft, description: e.target.value })
                        }
                        maxLength={500}
                      />
                    </Field>
                    <Field
                      label="Imagen de la carta pública"
                      hint="Se muestra únicamente en la carta que consultan los clientes."
                    >
                      <input
                        className="control"
                        name="imageUrl"
                        value={draft.imageUrl}
                        placeholder="https://…"
                        maxLength={2000}
                        onChange={(event) =>
                          setDraft({ ...draft, imageUrl: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                </div>
                <div className="row">
                  <label className="check">
                    <input
                      className="check__input"
                      name="available"
                      type="checkbox"
                      checked={draft.available}
                      onChange={(e) =>
                        setDraft({ ...draft, available: e.target.checked })
                      }
                    />
                    Disponible para pedir
                  </label>
                  <label className="check">
                    <input
                      className="check__input"
                      name="active"
                      type="checkbox"
                      checked={draft.active}
                      onChange={(e) =>
                        setDraft({ ...draft, active: e.target.checked })
                      }
                    />
                    Producto activo
                  </label>
                </div>
              </>
            )}
            {section === "varieties" && (
              <VarietiesEditor value={varieties} change={setVarieties} />
            )}
            {section === "addons" && (
              <>
                <div className="stack stack--compact">
                  <div className="row row--between">
                    <h3 className="panel__title">Adicionales</h3>
                    <Button
                      variant="secondary"
                      disabled={addons.length >= 10}
                      onClick={() =>
                        setAddons([
                          ...addons,
                          { id: uuid(), name: "", price: "0" },
                        ])
                      }
                    >
                      <Plus aria-hidden="true" /> Adicional
                    </Button>
                  </div>
                  {addons.map((a, index) => (
                    <div key={a.id} className="addon-editor__row">
                      <Field label={`Adicional ${index + 1}`}>
                        <input
                          className="control"
                          value={a.name}
                          required
                          maxLength={100}
                          onChange={(e) =>
                            setAddons(
                              addons.map((v) =>
                                v.id === a.id
                                  ? { ...v, name: e.target.value }
                                  : v,
                              ),
                            )
                          }
                        />
                      </Field>
                      <div className="row">
                        <Field label="Precio">
                          <input
                            aria-label={`Precio adicional ${index + 1}`}
                            type="number"
                            className="control"
                            value={a.price}
                            min="0"
                            max="9999999"
                            step="0.01"
                            required
                            onChange={(e) =>
                              setAddons(
                                addons.map((v) =>
                                  v.id === a.id
                                    ? { ...v, price: e.target.value }
                                    : v,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Button
                          variant="danger"
                          className="button--icon"
                          aria-label={`Quitar adicional ${index + 1}`}
                          title="Quitar adicional"
                          onClick={() =>
                            setAddons(addons.filter((v) => v.id !== a.id))
                          }
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {!addons.length && (
                  <Empty title="Sin adicionales">
                    Agregá extras opcionales con su precio.
                  </Empty>
                )}
              </>
            )}
          </div>
        </SlideView>
        <footer className="management-editor__footer">
          <Button type="submit">Guardar producto</Button>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
        </footer>
      </ActionForm>
    </Dialog>
  );
}
