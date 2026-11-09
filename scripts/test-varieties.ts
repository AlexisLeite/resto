import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createDatabaseClient } from "../src/lib/database/client";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const db = createDatabaseClient();
  const baseURL = process.env.APP_URL ?? "http://100.111.171.20:3000";
  const restaurant = await db.restaurant.create({
    data: { slug: `varieties-${randomUUID()}`, name: "Prueba variedades" },
  });
  const restaurantId = restaurant.id;
  const browser = await chromium.launch();
  try {
    const password = randomUUID();
    const user = await db.user.create({
      data: {
        restaurantId,
        username: `v-${randomUUID().slice(0, 8)}`,
        name: "Prueba",
        role: "ADMIN",
        roles: ["ADMIN", "WAITER", "KITCHEN"],
        passwordHash: await hashPassword(password),
      },
    });
    const category = await db.category.create({
      data: { restaurantId, name: "Carta" },
    });
    const table = await db.diningTable.create({
      data: { restaurantId, name: "Mesa test", seats: 4 },
    });
    const page = await browser.newPage({
      baseURL,
      viewport: { width: 390, height: 844 },
    });
    const settle = () =>
      page.evaluate(() =>
        Promise.all(
          document.getAnimations().map((a) => a.finished.catch(() => {})),
        ),
      );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill(user.username);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL("**/dashboard");
    const navigate = async () => {
      if (!(await page.locator(".desktop-navigation").isVisible())) await page
        .getByRole("button", { name: "Menú de funcionalidades" })
        .click();
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "Carta", exact: true })
        .click();
    };
    await navigate();
    await page
      .getByRole("button", { name: "Nuevo producto", exact: true })
      .click();
    await page.getByLabel("Nombre", { exact: true }).fill("Hamburguesa test");
    await page.getByLabel("Precio (UYU)").fill("480");
    await page.getByRole("button",{name:/^Variedades /}).click();
    for (const [index, name, options] of [
      [1, "Punto de cocción", ["A punto", "Bien cocida"]],
      [2, "Pan", ["Clásico", "Con sésamo"]],
    ] as const) {
      await page
        .getByRole("button", { name: "Variedad", exact: true })
        .click();
      await page
        .getByLabel(`Nombre de variedad ${index}`, { exact: true })
        .fill(name);
      for (let j = 0; j < options.length; j++)
        await page
          .getByLabel(`Opción ${j + 1} de variedad ${index}`, { exact: true })
          .fill(options[j]);
    }
    await page
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Editar Hamburguesa test",
        exact: true,
      }),
    ).toBeVisible();
    const product = await db.product.findFirstOrThrow({
      where: { restaurantId },
    });
    const definitions = product.varieties as {
      id: string;
      name: string;
      options: { id: string; name: string }[];
    }[];
    expect(definitions).toHaveLength(2);
    await page
      .getByRole("combobox", { name: "Rol activo" })
      .selectOption("WAITER");
    await page
      .getByRole("button", { name: "Mesa test, libre", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Abrir cuenta", exact: true })
      .click();
    const menu = async () => {
      if((page.viewportSize()?.width || 0)>=1100)return;
      await page
        .locator(".salon-view-toggle")
        .getByRole("button", { name: "Carta", exact: true })
        .click();
    };
    const order = async () => {
      if((page.viewportSize()?.width || 0)>=1100)return;
      await page
        .locator(".salon-view-toggle")
        .getByRole("button", { name: /^Pedido / })
        .click();
    };
    const choose = async (point: string, bread: string) => {
      await expect(
        page.getByRole("combobox", { name: "Punto de cocción" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("spinbutton", { name: "Cantidad", exact: true }),
      ).toHaveValue("1");
      await page
        .getByRole("group", { name: "Punto de cocción", exact: true })
        .getByRole("radio", { name: point, exact: true })
        .check();
      await page
        .getByRole("group", { name: "Pan", exact: true })
        .getByRole("radio", { name: bread, exact: true })
        .check();
    };
    await page
      .getByRole("button", { name: "Agregar Hamburguesa test", exact: true })
      .click();
    await expect(
      page
        .getByRole("group", { name: "Punto de cocción", exact: true })
        .getByRole("radio")
        .first(),
    ).toBeChecked();
    await expect(
      page
        .getByRole("group", { name: "Pan", exact: true })
        .getByRole("radio")
        .first(),
    ).toBeChecked();
    await choose("A punto", "Clásico");
    await mkdir(".local/varieties", { recursive: true });
    await settle();
    await page.screenshot({ path: ".local/varieties/selector-mobile.png" });
    await page
      .getByRole("button", { name: "Sumar al pedido", exact: true })
      .click();
    await order();
    await expect(page.locator(".cart__line")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Sumar Hamburguesa test", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".cart__line")).toHaveCount(1);
    await expect(page.locator(".quantity-stepper")).toContainText("2");
    await menu();
    await page
      .getByRole("button", { name: "Agregar Hamburguesa test", exact: true })
      .click();
    await choose("Bien cocida", "Con sésamo");
    await page
      .getByRole("button", { name: "Sumar al pedido", exact: true })
      .click();
    await order();
    await expect(page.locator(".cart__line")).toHaveCount(2);
    // Editar una unidad de un grupo la mueve a su nueva combinación.
    await page
      .getByRole("button", { name: "Editar Hamburguesa test", exact: true })
      .first()
      .click();
    await choose("Bien cocida", "Con sésamo");
    await page
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await expect(
      page.locator(".cart__line").first().locator(".quantity-stepper"),
    ).toContainText("1");
    await expect(
      page.locator(".cart__line").last().locator(".quantity-stepper"),
    ).toContainText("2");
    await page.reload();
    await order();
    await expect(page.locator(".cart__line")).toHaveCount(2);
    await settle();
    expect((await page.locator(".app-header").boundingBox())!.y).toBe(0);
    await page.screenshot({ path: ".local/varieties/grouped-mobile.png" });
    const session = await db.tableSession.findFirstOrThrow({
      where: { restaurantId, tableId: table.id },
    });
    const post = (items: unknown[]) =>
      page.request.post("/api/commands", {
        headers: { Origin: baseURL },
        data: {
          type: "order.create",
          sessionId: session.id,
          requestKey: randomUUID(),
          items,
        },
      });
    const line = {
      productId: product.id,
      quantity: 1,
      notes: "",
      addonIds: [],
    };
    expect((await post([line])).status()).toBe(409);
    expect(
      (
        await post([
          {
            ...line,
            varieties: definitions.map((v) => ({
              varietyId: v.id,
              optionId: "inventada",
            })),
          },
        ])
      ).status(),
    ).toBe(409);
    const selection = definitions.map((v) => ({
      varietyId: v.id,
      optionId: v.options[0].id,
    }));
    expect(
      (await post([{ ...line, varieties: [...selection, selection[0]] }])).ok(),
    ).toBe(false);
    expect(await db.order.count({ where: { sessionId: session.id } })).toBe(0);
    await menu();
    await page.setViewportSize({width: 360, height: 740});
    const quickSend = page.getByRole("button", {name: "Enviar pedido", exact: true});
    await expect(quickSend).toBeEnabled();
    await settle();
    expect(await page.locator(".salon-view-toggle").evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    await page.screenshot({path: ".local/varieties/quick-send-mobile.png"});
    await quickSend.click();
    await expect(quickSend).toBeDisabled();
    await expect(
      page.getByText("Pedido enviado a cocina y barra.", { exact: true }),
    ).toBeVisible();
    const saved = await db.orderItem.findMany({
      where: { order: { sessionId: session.id } },
      orderBy: { quantity: "asc" },
    });
    expect(saved.map((i) => i.quantity)).toEqual([1, 2]);
    expect(saved[0].varieties).toEqual(
      definitions.map((v) => ({
        varietyId: v.id,
        optionId: v.options[0].id,
        name: v.name,
        option: v.options[0].name,
      })),
    );
    await page
      .getByRole("combobox", { name: "Rol activo" })
      .selectOption("ADMIN");
    await navigate();
    await page
      .getByRole("button", { name: "Editar Hamburguesa test", exact: true })
      .click();
    await page.getByRole("button",{name:/^Variedades /}).click();
    await expect(
      page.getByLabel("Nombre de variedad 1", { exact: true }),
    ).toHaveValue("Punto de cocción");
    await page
      .getByLabel("Opción 1 de variedad 1", { exact: true })
      .fill("Nuevo punto");
    await page
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Editar Hamburguesa test",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await db.orderItem.findUniqueOrThrow({ where: { id: saved[0].id } }))
        .varieties,
    ).toEqual(saved[0].varieties);
    await page
      .getByRole("combobox", { name: "Rol activo" })
      .selectOption("KITCHEN");
    await expect(
      page
        .locator(".order-line")
        .filter({ hasText: "Punto de cocción: A punto" }),
    ).toHaveCount(1);
    if (!(await page.locator(".desktop-navigation").isVisible())) await page.getByRole("button", { name: "Menú de funcionalidades" }).click();
    await page.getByRole("button", { name: "Cambiar tema" }).click();
    await page.keyboard.press("Escape");
    await page
      .getByRole("combobox", { name: "Rol activo" })
      .selectOption("WAITER");
    await page
      .getByRole("link", { name: "Mesa test, en servicio", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agregar Hamburguesa test", exact: true })
      .click();
    await settle();
    await page.screenshot({ path: ".local/varieties/selector-dark.png" });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", { name: "Agregar Hamburguesa test", exact: true })
      .click();
    await settle();
    await page.screenshot({ path: ".local/varieties/selector-desktop.png" });
    await page.keyboard.press("Escape");
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `v${i}`,
      name: `Variedad ${i + 1}`,
      options: Array.from({ length: i === 7 ? 7 : 6 }, (_, j) => ({
        id: `o${j}`,
        name: `Opción ${j + 1}`,
      })),
    }));
    await db.product.update({
      where: { id: product.id },
      data: { varieties: many },
    });
    await page.reload();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 650 : 900 });
      await page
        .getByRole("button", { name: "Agregar Hamburguesa test", exact: true })
        .click();
      await settle();
      const confirm = page.getByRole("button", {
        name: "Sumar al pedido",
        exact: true,
      });
      const bounds = await confirm.boundingBox();
      expect(bounds!.y).toBeGreaterThan(0);
      expect(bounds!.y + bounds!.height).toBeLessThan(
        width === 390 ? 650 : 900,
      );
      const radios = page
        .getByRole("group", { name: "Variedad 1", exact: true })
        .locator(".variety-switch__option");
      const first = await radios.nth(0).boundingBox();
      const second = await radios.nth(1).boundingBox();
      if (width === 390) {
        expect(second!.y).toBeGreaterThan(first!.y);
        expect(second!.x).toBe(first!.x);
      } else {
        expect(second!.x).toBeGreaterThan(first!.x);
        expect(second!.y).toBe(first!.y);
      }
      await expect(
        page.getByRole("combobox", { name: "Variedad 8", exact: true }),
      ).toHaveJSProperty("tagName", "SELECT");
      await page.locator(".salon-customizer__scroll").evaluate((e) => {
        e.scrollTop = e.scrollHeight;
      });
      expect((await confirm.boundingBox())!.y).toBe(bounds!.y);
      await expect(
        page.getByRole("combobox", { name: "Variedad 8", exact: true }),
      ).toHaveValue("o0");
      for (let i = 1; i <= 7; i++)
        await expect(
          page
            .getByRole("group", { name: `Variedad ${i}`, exact: true })
            .getByRole("radio")
            .first(),
        ).toBeChecked();
      expect((await confirm.boundingBox())!.y).toBe(bounds!.y);
      await page
        .getByRole("group", { name: "Variedad 1", exact: true })
        .getByRole("radio")
        .first()
        .focus();
      await page.keyboard.press("ArrowDown");
      await expect(
        page
          .getByRole("group", { name: "Variedad 1", exact: true })
          .getByRole("radio")
          .nth(1),
      ).toBeChecked();
      await settle();
      await page.screenshot({
        path: `.local/varieties/many-options-${width}.png`,
      });
      if (width === 1440) {
        for (let i = 1; i <= 7; i++)
          await page
            .getByRole("group", { name: `Variedad ${i}`, exact: true })
            .getByRole("radio")
            .first()
            .check();
        await page
          .getByRole("combobox", { name: "Variedad 8", exact: true })
          .selectOption("o0");
        await page
          .getByRole("spinbutton", { name: "Cantidad", exact: true })
          .fill("3");
        await expect(page.locator(".salon-customizer__total")).toContainText(
          "1.440",
        );
        await confirm.click();
        await order();
        await expect(page.locator(".cart__line")).toHaveCount(1);
        await expect(page.locator(".quantity-stepper")).toContainText("3");
        await expect(page.locator(".cart__line")).toContainText(
          "Variedad 8: Opción 1",
        );
      } else await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    console.log(
      "Variedades OK: alta y edición, selectores responsive, más de seis opciones, pie fijo, teclado, selección por unidad, agrupación, edición parcial, persistencia, validación en servidor e historial.",
    );
    void category;
  } finally {
    await browser.close();
    await db.orderItem.deleteMany({
      where: { order: { session: { restaurantId } } },
    });
    await db.order.deleteMany({ where: { session: { restaurantId } } });
    await db.tableSession.deleteMany({ where: { restaurantId } });
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
