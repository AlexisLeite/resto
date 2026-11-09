export const roles = {
  ADMIN: "Administrador",
  WAITER: "Mozo",
  KITCHEN: "Cocina",
  CASHIER: "Caja",
} as const;
export type Role = keyof typeof roles;
export const stations = { KITCHEN: "Cocina", BAR: "Barra" } as const;
export const statuses = {
  PENDING: "Pendiente",
  PREPARING: "Preparando",
  READY: "Listo",
  DELIVERED: "Entregado",
  BILLABLE: "Cobrar sin entrega",
  CANCELLED: "Anulado",
} as const;
export const methods = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
} as const;
export type Addon = { id: string; name: string; price: string };
export function money(value: string | number, currency = "UYU") {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
export function dateTime(value: string, timezone = "America/Montevideo") {
  return new Intl.DateTimeFormat("es-UY", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
export function canManage(role: Role) {
  return role === "ADMIN" || role === "CASHIER";
}

export function assignedRoles(user: { role: Role; roles: Role[] }) {
  return [...new Set([user.role, ...user.roles])];
}
export const roleWorkspaces = {
  ADMIN: "Administración",
  WAITER: "Salón",
  KITCHEN: "Cocina y barra",
  CASHIER: "Caja",
} as const;

export type Variety = {
  id: string;
  name: string;
  options: { id: string; name: string }[];
};
export type VarietySelection = { varietyId: string; optionId: string };
export type SelectedVariety = VarietySelection & {
  name: string;
  option: string;
};
