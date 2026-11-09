import { notFound } from "next/navigation";
import { getDb } from "@/lib/database/db";
import { type Addon } from "@/lib/restaurant/shared";
import { PublicMenuCatalog } from "@/components/public-menu-catalog";
import { ThemeToggle } from "@/components/theme-toggle";
export const dynamic = "force-dynamic";
export default async function PublicMenu({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const restaurant = await getDb().restaurant.findUnique({
    where: { slug },
    include: {
      categories: {
        orderBy: [{ position: "asc" }, { name: "asc" }],
        include: {
          products: { where: { active: true }, orderBy: { name: "asc" } },
        },
      },
    },
  });
  if (!restaurant) notFound();
  return (
    <main className="menu">
      <header className="menu__header">
        <div className="row row--between">
          <div className="brand">
            <span className="brand__mark">r.</span>resto
          </div>
          <ThemeToggle />
        </div>
        <p className="menu__label">Nuestra carta</p>
        <h1 className="menu__title">{restaurant.name}</h1>
        <p className="muted">Nuestro equipo toma tu pedido en la mesa.</p>
        <p className="muted">
          Precios en {restaurant.currency}. Si tenés alergias o restricciones
          alimentarias, consultá al equipo antes de pedir.
        </p>
      </header>
      <PublicMenuCatalog
        currency={restaurant.currency}
        categories={restaurant.categories.map((category) => ({
          id: category.id,
          name: category.name,
          products: category.products.map((product) => ({
            id: product.id,
            name: product.name,
            description: product.description,
            price: product.price.toString(),
            available: product.available,
            imageUrl: product.imageUrl,
            addons: product.addons as Addon[],
          })),
        }))}
      />
      <footer className="muted">Carta de consulta · {restaurant.name}</footer>
    </main>
  );
}
