import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createDatabaseClient } from "../src/lib/database/client";
import { hashPassword } from "../src/lib/auth/password";
async function main() {
  const db = createDatabaseClient();
  const browser = await chromium.launch();
  const baseURL = "http://100.111.171.20:3000";
  const r = await db.restaurant.create({
    data: {
      name: "Prueba de pago",
      slug: `pay-ui-${randomUUID()}`,
      waitersCanCharge: true,
    },
  });
  const restaurantId = r.id;
  try {
    const password = randomUUID();
    const u = await db.user.create({
      data: {
        restaurantId,
        username: `pay-${randomUUID().slice(0, 8)}`,
        name: "Mozo",
        role: "WAITER",
        passwordHash: await hashPassword(password),
      },
    });
    const cat = await db.category.create({
      data: { restaurantId, name: "Carta" },
    });
    const product = await db.product.create({
      data: {
        restaurantId,
        categoryId: cat.id,
        name: "Plato de prueba",
        price: "100",
      },
    });
    const table = await db.diningTable.create({
      data: { restaurantId, name: "Mesa prueba", seats: 4 },
    });
    const session = await db.tableSession.create({
      data: { restaurantId, tableId: table.id, guests: 2, openedBy: u.name },
    });
    await db.cashShift.create({
      data: { restaurantId, openedBy: "Caja", openingCash: "0" },
    });
    await db.order.create({
      data: {
        sessionId: session.id,
        createdById: u.id,
        requestKey: randomUUID(),
        items: {
          create: ["PENDING", "READY", "DELIVERED"].map((status) => ({
            productId: product.id,
            name: product.name,
            unitPrice: "100",
            quantity: 1,
            station: "KITCHEN",
            status: status as "PENDING" | "READY" | "DELIVERED",
          })),
        },
      },
    });
    const page = await browser.newPage({
      baseURL,
      viewport: { width: 390, height: 844 },
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const settle = () =>
      page.evaluate(() =>
        Promise.all(
          document.getAnimations().map((a) => a.finished.catch(() => {})),
        ),
      );
    await mkdir(".local/payments", { recursive: true });
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill(u.username);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page
      .getByRole("link", { name: "Mesa prueba, en servicio", exact: true })
      .click();
    const footer = page.locator(".salon-view-toggle");
    await expect(footer.getByRole("button")).toHaveCount(5);
    await footer
      .getByRole("button", { name: "Listos para entregar", exact: true })
      .click();
    await settle();
    await page.screenshot({ path: ".local/payments/ready.png" });
    await page
      .getByRole("button", {
        name: "Marcar entregado: Plato de prueba",
        exact: true,
      })
      .click();
    await expect(
      footer.getByRole("button", { name: "Listos para entregar", exact: true }),
    ).toBeDisabled();
    await footer.getByRole("button", { name: "Carta", exact: true }).click();
    await page
      .getByRole("button", { name: "Agregar Plato de prueba", exact: true })
      .click();
    await page.getByRole("button", { name: "Sumar al pedido", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Agregar Plato de prueba", exact: true })
      .click();
    await page.getByRole("button", { name: "Sumar al pedido", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Pagar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Cuenta · Mesa prueba", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog")).toContainText("Sin enviar");
    await expect(page.getByRole("dialog")).toContainText("Sin entregar");
    await settle();
    await page.screenshot({ path: ".local/payments/pending.png" });
    await page.getByRole("button", { name: "Cobrarlos", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Cuenta · Mesa prueba", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await settle();
    await expect(
      page.getByLabel("Servicio (UYU)", { exact: true }),
    ).toHaveValue("50.00");
    await page.getByLabel("Servicio (UYU)", { exact: true }).fill("37.50");
    await expect(
      page.getByRole("button", { name: /^Confirmar cobro/ }),
    ).toContainText("537,50");
    await expect(page.locator(".table-section")).toContainText(
      "Entregado",
    );
    await settle();
    await page.screenshot({ path: ".local/payments/account-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await settle();
    await page.screenshot({ path: ".local/payments/account-desktop.png" });
    await page.getByRole("button", { name: /^Confirmar cobro/ }).click();
    await expect(
      page.getByRole("button", { name: "Mesa prueba, libre", exact: true }),
    ).toBeVisible();
    const payment = await db.payment.findUniqueOrThrow({
      where: { sessionId: session.id },
    });
    expect(payment.amount.toFixed(2)).toBe("537.50");
    expect(payment.serviceAmount.toFixed(2)).toBe("37.50");
    await page
      .getByRole("button", { name: "Mesa prueba, libre", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Abrir cuenta", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar Plato de prueba", exact: true })
      .click();
    await page.getByRole("button", { name: "Sumar al pedido", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Pagar", exact: true }).click();
    await page.getByRole("button", { name: "Descartar", exact: true }).click();
    await expect(
      page.getByLabel("Servicio (UYU)", { exact: true }),
    ).toHaveValue("0.00");
    await expect(
      page.getByRole("button", { name: /^Confirmar cobro/ }),
    ).toBeDisabled();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
    await page.screenshot({path:".local/payments/close-empty-light.png"});
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
    await page.screenshot({path:".local/payments/close-empty-dark.png"});
    await page.evaluate(() => document.documentElement.dataset.theme = "light");
    await page
      .getByRole("button", { name: "Cerrar mesa sin consumos", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Mesa prueba, libre", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    console.log(
      "Pago UI OK: cinco iconos, entrega, resolución previa, descartar/cobrar, cuenta, servicio 10% editable y pago persistente.",
    );
  } finally {
    await browser.close();
    await db.payment.deleteMany({ where: { session: { restaurantId } } });
    await db.orderItem.deleteMany({
      where: { order: { session: { restaurantId } } },
    });
    await db.order.deleteMany({ where: { session: { restaurantId } } });
    await db.tableSession.deleteMany({ where: { restaurantId } });
    await db.cashShift.deleteMany({ where: { restaurantId } });
    await db.product.deleteMany({ where: { restaurantId } });
    await db.category.deleteMany({ where: { restaurantId } });
    await db.diningTable.deleteMany({ where: { restaurantId } });
    await db.auditEvent.deleteMany({ where: { restaurantId } });
    await db.user.deleteMany({ where: { restaurantId } });
    await db.restaurant.delete({ where: { id: restaurantId } });
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
