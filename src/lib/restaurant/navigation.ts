import type { Role } from "./shared";

export type Page =
  | "settings"
  | "floor"
  | "kitchen"
  | "cash"
  | "catalog"
  | "reports"
  | "team"
  | "account";
export type TableView = "menu" | "ready" | "order" | "pay";
export type Destination = {
  role: Role;
  page: Page;
  table?: string;
  view?: TableView;
  section?: string;
};
const roleSlugs: Record<Role, string> = {
  ADMIN: "administracion",
  WAITER: "salon",
  KITCHEN: "cocina",
  CASHIER: "caja",
};
const pageSlugs: Record<Page, string> = {
  settings: "configuracion",
  floor: "mesas",
  kitchen: "comandas",
  cash: "caja",
  catalog: "carta",
  reports: "resumen",
  team: "equipo",
  account: "mi-cuenta",
};
const viewSlugs: Record<TableView, string> = {
  menu: "carta",
  ready: "entregar",
  order: "pedido",
  pay: "pagar",
};
const sections: Record<string, string> = {
  sales: "ventas",
  activity: "actividad",
  accounts: "cuentas",
  sale: "venta",
  payments: "cobros",
  history: "cierres",
  categories: "categorias",
  products: "productos",
};
const allowed: Record<Role, Page[]> = {
  ADMIN: ["reports", "floor", "catalog", "team", "settings", "account"],
  WAITER: ["floor", "account"],
  KITCHEN: ["kitchen", "catalog", "account"],
  CASHIER: ["cash", "account"],
};
export const homeTab = (role: Role): Page => allowed[role][0];
function keyFor<T extends string>(
  values: Record<T, string>,
  value: string | null,
) {
  return (Object.keys(values) as T[]).find((key) => values[key] === value);
}
export function readDestination(
  params: URLSearchParams,
  fallback: Role,
  roles: Role[],
): Destination {
  const requested = keyFor(roleSlugs, params.get("rol"));
  const role = requested && roles.includes(requested) ? requested : fallback;
  const requestedPage = keyFor(pageSlugs, params.get("pagina"));
  const page =
    requestedPage && allowed[role].includes(requestedPage)
      ? requestedPage
      : homeTab(role);
  const result: Destination = { role, page };
  if (page === "floor" && params.get("mesa")) {
    result.table = params.get("mesa")!;
    result.view = keyFor(viewSlugs, params.get("vista")) ?? "menu";
  }
  if (page === "catalog" || page === "cash") {
    const section = keyFor(sections, params.get("seccion"));
    result.section =
      page === "catalog"
        ? role === "ADMIN" && section === "categories"
          ? "categories"
          : "products"
        : ["accounts", "sale", "payments", "history"].includes(section ?? "")
          ? section
          : "accounts";
  }
  if (page === "reports")
    result.section =
      params.get("seccion") === "actividad" ? "activity" : "sales";
  return result;
}
export function destinationUrl(destination: Destination) {
  const params = new URLSearchParams({
    rol: roleSlugs[destination.role],
    pagina: pageSlugs[destination.page],
  });
  if (destination.page === "floor" && destination.table) {
    params.set("mesa", destination.table);
    params.set("vista", viewSlugs[destination.view ?? "menu"]);
  }
  if (destination.page === "catalog" || destination.page === "cash")
    params.set(
      "seccion",
      sections[
        destination.section ??
          (destination.page === "cash" ? "accounts" : "products")
      ],
    );
  if (destination.page === "reports")
    params.set("seccion", sections[destination.section ?? "sales"]);
  return `/dashboard?${params}`;
}
