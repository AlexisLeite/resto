"use client";
import { useState } from "react";
import Image from "next/image";
import imageCredits from "@/lib/restaurant/demo-image-credits.json";
import { Search, UtensilsCrossed, X } from "lucide-react";
import { money, type Addon } from "@/lib/restaurant/shared";
import { WorkspaceTabs } from "./ui/workspace-tabs";
import { SlideView } from "./ui/motion";
import { Button, Empty } from "./ui/primitives";

type MenuProduct = {
  id: string;
  name: string;
  description: string;
  price: string;
  available: boolean;
  imageUrl: string;
  addons: Addon[];
};
type MenuCategory = { id: string; name: string; products: MenuProduct[] };
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
function ProductImage({ product }: { product: MenuProduct }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="public-menu__photo">
      {product.imageUrl && !failed ? (
        <Image
          unoptimized={!product.imageUrl.startsWith("/")}
          sizes="7rem"
          src={product.imageUrl}
          alt={product.name}
          width={320}
          height={320}
          onError={() => setFailed(true)}
        />
      ) : (
        <UtensilsCrossed aria-hidden="true" />
      )}
    </div>
  );
}
export function PublicMenuCatalog({
  categories,
  currency,
}: {
  categories: MenuCategory[];
  currency: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [direction, setDirection] = useState(1);
  const options = [
    { id: "all", label: "Toda la carta" },
    ...categories
      .filter((c) => c.products.length)
      .map((c) => ({ id: c.id, label: c.name })),
  ];
  const visible = categories
    .filter((c) => category === "all" || c.id === category)
    .map((c) => ({
      ...c,
      products: c.products.filter((p) =>
        normalize(`${p.name} ${p.description}`).includes(
          normalize(search.trim()),
        ),
      ),
    }))
    .filter((c) => c.products.length);
  return (
    <div className="public-menu">
      <div className="public-menu__controls">
        <div className="public-menu__search">
          <Search aria-hidden="true" />
          <input
            className="control"
            type="search"
            aria-label="Buscar en la carta"
            placeholder="Buscá un plato, una bebida…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <Button
              variant="ghost"
              className="button--icon"
              aria-label="Limpiar búsqueda"
              onClick={() => setSearch("")}
            >
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
        <WorkspaceTabs
          label="Categorías de la carta"
          value={category}
          options={options}
          change={(next) => {
            setDirection(
              options.findIndex((o) => o.id === next) >
                options.findIndex((o) => o.id === category)
                ? 1
                : -1,
            );
            setCategory(next);
          }}
        />
      </div>
      <SlideView viewKey={category} direction={direction}>
        <div className="public-menu__sections">
          {visible.map((c) => (
            <section className="public-menu__category" key={c.id}>
              <h2 className="public-menu__heading">
                {c.name}
                <span>{c.products.length}</span>
              </h2>
              <div className="public-menu__products">
                {c.products.map((p) => (
                  <article className="public-menu__product" key={p.id}>
                    <ProductImage key={p.imageUrl} product={p} />
                    <div className="public-menu__identity">
                      <h3>{p.name}</h3>
                      <p>{p.description}</p>
                      {!p.available && (
                        <span className="badge badge--error">
                          Agotado por el momento
                        </span>
                      )}
                      <strong className="public-menu__price">
                        {money(p.price, currency)}
                      </strong>
                      {p.addons.length > 0 && (
                        <p className="public-menu__addons">
                          Adicionales:{" "}
                          {p.addons
                            .map(
                              (a) => `${a.name} (+${money(a.price, currency)})`,
                            )
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {!visible.length && (
            <Empty title={search ? "Sin coincidencias" : "Sin productos"}>
              {search
                ? "Probá otra búsqueda o categoría."
                : "Consultá al equipo por nuestra carta."}
            </Empty>
          )}
        </div>
      </SlideView>
      <details className="public-menu__credits">
        <summary>Créditos de las fotografías</summary>
        <ul>
          {imageCredits
            .filter((credit) =>
              categories.some((category) =>
                category.products.some(
                  (product) => product.imageUrl === credit.image,
                ),
              ),
            )
            .map((credit) => (
              <li key={credit.image}>
                <a href={credit.source} target="_blank" rel="noreferrer">
                  {credit.title}
                </a>{" "}
                — {credit.author}.{" "}
                <a href={credit.licenseUrl} target="_blank" rel="noreferrer">
                  {credit.license}
                </a>
                . Presentación recortada al encuadre.
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}
