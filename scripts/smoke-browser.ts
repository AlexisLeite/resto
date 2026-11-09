import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createDatabaseClient } from "../src/lib/database/client";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const db = createDatabaseClient();
  const suffix = randomUUID().slice(0, 8);
  const baseURL = process.env.APP_URL ?? "http://100.111.171.20:3000";
  const password = randomUUID();
  const restaurant = await db.restaurant.create({
    data: { slug: `qa-${suffix}`, name: "Resto · Prueba de servicio" },
  });
  const restaurantId = restaurant.id;
  const browser = await chromium.launch({ headless: true });
  try {
    const passwordHash = await hashPassword(password);
    for (const role of ["ADMIN", "WAITER", "KITCHEN", "CASHIER"] as const)
      await db.user.create({
        data: {
          restaurantId,
          username: `${role.toLowerCase()}-${suffix}`,
          name: role,
          role,
          roles:
            role === "ADMIN"
              ? ["ADMIN", "WAITER", "KITCHEN", "CASHIER"]
              : [role],
          passwordHash,
        },
      });
    const category = await db.category.create({
      data: { restaurantId, name: "Principales" },
    });
    await db.product.create({
      data: {
        restaurantId,
        categoryId: category.id,
        name: "Hamburguesa de prueba",
        description: "Carne, cheddar y papas",
        price: "480",
        addons: [{ id: "extra", name: "Extra cheddar", price: "50" }],
      },
    });
    await db.diningTable.createMany({
      data: [1, 2, 3, 4].map((n) => ({
        restaurantId,
        name: `Mesa ${n}`,
        seats: 4,
      })),
    });
    const context = await browser.newContext({
      baseURL,
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const chooseRole = async (role: string) => {
      if((page.viewportSize()?.width || 0)>=1100){
        const names:Record<string,string>={ADMIN:"Administración",WAITER:"Salón",KITCHEN:"Cocina y barra",CASHIER:"Caja"};
        await page.getByRole("link",{name:`Rol ${names[role]}`,exact:true}).click();
        await expect.poll(async()=> (await (await page.request.get("/api/state")).json()).user.role).toBe(role);
      } else {await page.getByRole("combobox",{name:"Rol activo"}).selectOption(role);await expect(page.getByRole("combobox",{name:"Rol activo"})).toHaveValue(role);}
    };
    const openMenu = async () => {
      if (await page.locator(".desktop-navigation").isVisible()) return;
      await page
        .getByRole("button", { name: "Menú de funcionalidades" })
        .click();
    };
    const navigate = async (name: string) => {
      await openMenu();
      const button=page.getByRole("link",{name,exact:true});
      if(await button.count()) await button.click();
      else await page.getByRole("link",{name:`Rol ${name}`,exact:true}).click();
    };
    const showOrder = async () => {
      if((page.viewportSize()?.width || 0)>=1100)return;
      await page
        .locator(".salon-view-toggle")
        .getByRole("button", { name: /^Pedido / })
        .click();
    };
    const showMenu = async () => {
      if((page.viewportSize()?.width || 0)>=1100){const back=page.getByRole("button",{name:"Carta y pedido",exact:true});if(await back.isVisible())await back.click();return;}
      await page
        .locator(".salon-view-toggle")
        .getByRole("button", { name: "Carta", exact: true })
        .click();
    };
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill(`admin-${suffix}`);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await navigate("Configuración");
    await page.getByLabel("Los mozos pueden cobrar", { exact: true }).check();
    await page
      .getByRole("button", { name: "Guardar configuración", exact: true })
      .click();
    await expect(
      page.getByText("Configuración guardada.", { exact: true }),
    ).toBeVisible();
    await chooseRole("WAITER");
    await expect(
      page.getByRole("heading", { name: "El salón", exact: true }),
    ).toBeVisible();
    await mkdir(".local/screenshots", { recursive: true });
    await page.screenshot({
      path: ".local/screenshots/salon-light.png",
      fullPage: true,
      animations: "disabled",
    });
    const light = await page
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    await openMenu();
    await page.getByRole("button", { name: "Cambiar tema" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const dark = await page
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor);
    assert.notEqual(light, dark);
    const themeContrast = await page
      .getByRole("button", { name: "Cambiar tema" })
      .evaluate((button) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        const style = getComputedStyle(button);
        const [fg, bg] = [style.color, style.backgroundColor].map((color) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const values = [...ctx.getImageData(0, 0, 1, 1).data]
            .slice(0, 3)
            .map((v) => {
              const s = v / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
          return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
        });
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      });
    assert.ok(
      themeContrast >= 4.5,
      "El botón de tema seleccionado conserva contraste legible",
    );
    await page.screenshot({
      path: ".local/screenshots/salon-dark.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Cambiar tema" }).click();
    assert.equal(
      await page
        .locator("body")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      light,
    );
    await page.keyboard.press("Escape");
    await chooseRole("CASHIER");
    await page.getByLabel("Fondo inicial en efectivo").fill("500");
    await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
    await expect(
      page.getByText("Turno de caja abierto.", { exact: true }),
    ).toBeVisible();
    await chooseRole("WAITER");
    await page
      .getByRole("button", { name: "Mesa 1, libre", exact: true })
      .click();
    const guests = page
      .getByRole("group", { name: "Comensales", exact: true })
      .getByRole("radio", { name: "2", exact: true });
    await page.keyboard.press("Tab");
    await guests.focus();
    assert.equal(
      await guests.evaluate(
        (e) => getComputedStyle(e.closest("label")!).outlineStyle,
      ),
      "solid",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Mesa 1, libre", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Mesa 1, libre", exact: true })
      .click();
    await guests.check();
    await page
      .getByRole("button", { name: "Abrir cuenta", exact: true })
      .click();
    await showOrder();
    await expect(
      page.getByRole("button", {
        name: "Enviar a cocina / barra",
        exact: true,
      }),
    ).toBeDisabled();
    await showMenu();
    await page
      .getByRole("button", {
        name: "Agregar Hamburguesa de prueba",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Sumar al pedido", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await showOrder();
    await expect(page.locator(".cart__line")).toContainText(
      "Hamburguesa de prueba",
    );
    await page
      .getByRole("button", { name: "Sumar Hamburguesa de prueba", exact: true })
      .click();
    await expect(page.locator(".quantity-stepper")).toContainText("2");
    await page
      .getByRole("button", {
        name: "Quitar Hamburguesa de prueba",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Enviar a cocina / barra",
        exact: true,
      }),
    ).toBeDisabled();
    await showMenu();
    await page
      .getByRole("button", {
        name: "Agregar Hamburguesa de prueba",
        exact: true,
      })
      .click();
    await page.getByLabel("Cantidad", { exact: true }).fill("2");
    await page.getByLabel(/Extra cheddar/).check();
    await page
      .getByLabel("Notas para cocina", { exact: true })
      .fill("Sin cebolla");
    await page
      .getByRole("button", { name: "Sumar al pedido", exact: true })
      .click();
    // El borrador persiste al navegar y al recargar antes de enviarse.
    await showOrder();
    await showMenu();
    await showOrder();
    await expect(page.locator(".cart__line")).toContainText("Sin cebolla");
    await page.reload();
    await showOrder();
    await expect(page.locator(".cart__line")).toContainText("Sin cebolla");
    await page
      .getByRole("button", { name: "Enviar a cocina / barra", exact: true })
      .click();
    await expect(
      page.getByText("Pedido enviado a cocina y barra.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/screenshots/pedido.png",
      fullPage: true,
      animations: "disabled",
    });
    await chooseRole("KITCHEN");
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    await page
      .getByRole("button", { name: "Marcar listo", exact: true })
      .click();
    await page.screenshot({
      path: ".local/screenshots/cocina.png",
      fullPage: true,
      animations: "disabled",
    });
    await chooseRole("WAITER");
    await page
      .getByRole("link", { name: "Mesa 1, en servicio", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Listos para entregar", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Marcar entregado: Hamburguesa de prueba",
        exact: true,
      })
      .click();
    await showMenu();
    await expect(
      page.getByRole("button", { name: "Listos para entregar", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Pagar", exact: true }).click();
    await page
      .getByLabel("Medio de pago", { exact: true })
      .selectOption("CASH");
    await expect(
      page.getByLabel("Servicio (UYU)", { exact: true }),
    ).toHaveValue("106.00");
    await page.getByLabel("Servicio (UYU)", { exact: true }).fill("60");
    await expect(
      page.getByRole("button", { name: /^Confirmar cobro de/ }),
    ).toContainText("1.120");
    await page.getByRole("button", { name: /^Confirmar cobro de/ }).click();
    await expect(
      page.getByText("Cobro registrado y mesa liberada.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/screenshots/caja.png",
      fullPage: true,
      animations: "disabled",
    });
    await chooseRole("CASHIER");
    await page
      .getByRole("button", { name: "Cerrar turno", exact: true })
      .click();
    await page.getByLabel("Efectivo contado", { exact: true }).fill("1620");
    await page
      .getByLabel("Observaciones del cierre", { exact: true })
      .fill("Arqueo de prueba");
    await page
      .getByRole("button", { name: "Confirmar cierre de turno", exact: true })
      .click();
    await expect(
      page.getByText("Caja cerrada. El arqueo quedó guardado.", {
        exact: true,
      }),
    ).toBeVisible();
    const shift = await db.cashShift.findFirstOrThrow({
      where: { restaurantId },
    });
    assert.equal(shift.expectedCash?.toFixed(2), "1620.00");
    await chooseRole("ADMIN");
    await expect(
      page
        .getByText("Hamburguesa de prueba", { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    const csrf = await context.request.post("/api/commands", {
      headers: { Origin: "https://untrusted.example" },
      data: { type: "shift.open", openingCash: "0" },
    });
    assert.equal(csrf.status(), 403);
    const anonymous = await browser.newContext({ baseURL });
    assert.equal((await anonymous.request.get("/api/state")).status(), 401);
    assert.equal(
      (await anonymous.request.get(`/menu/${restaurant.slug}`)).status(),
      200,
    );
    const kitchen = await browser.newContext({ baseURL });
    assert.equal(
      (
        await kitchen.request.post("/api/auth/login", {
          headers: { Origin: baseURL },
          data: { username: `kitchen-${suffix}`, password },
        })
      ).status(),
      200,
    );
    const state = await (await kitchen.request.get("/api/state")).json();
    assert.deepEqual(state.users, []);
    assert.deepEqual(state.shifts, []);
    assert.equal(state.report, null);
    assert.ok(!JSON.stringify(state).includes("passwordHash"));
    assert.equal(
      (
        await kitchen.request.post("/api/commands", {
          headers: { Origin: baseURL },
          data: { type: "shift.open", openingCash: "0" },
        })
      ).status(),
      403,
    );
    await navigate("Carta");
    await page.getByRole("button", { name:"Código QR", exact:true }).click();
    await expect(
      page.getByRole("img", { name: "Código QR de la carta pública" }),
    ).toBeVisible();
    assert.equal(
      (await context.request.get("/api/menu-qr")).headers()["content-type"],
      "image/svg+xml",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("link", { name:"Categorías", exact:true }).click();
    await page.getByRole("button", {name:"Nueva categoría",exact:true}).click();
    await page
      .getByLabel("Nombre de la categoría", { exact: true })
      .fill("Postres QA");
    await page
      .getByRole("button", { name: "Crear categoría", exact: true })
      .click();
    await expect(
      page.getByRole("button", {name:"Editar categoría Postres QA",exact:true}),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("link",{name:"Productos",exact:true}).click();
    await page
      .getByRole("button", { name: "Nuevo producto", exact: true })
      .click();
    await page.getByLabel("Nombre", { exact: true }).fill("Postre QA");
    await page
      .getByLabel("Categoría", { exact: true })
      .selectOption({ label: "Postres QA" });
    await page.getByLabel("Precio (UYU)", { exact: true }).fill("150.25");
    await page.getByRole("button",{name:/^Adicionales /}).click();
    await page
      .getByRole("button", { name: "Adicional", exact: true })
      .click();
    await page.getByLabel("Adicional 1", { exact: true }).fill("Crema");
    await page.getByLabel("Precio adicional 1", { exact: true }).fill("20");
    await page
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Editar Postre QA", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Marcar agotado: Postre QA", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Marcar disponible: Postre QA",
        exact: true,
      }),
    ).toBeVisible();
    await navigate("Equipo");
    await page
      .getByRole("button", { name: "Nueva persona", exact: true })
      .click();
    await page.getByLabel("Nombre", { exact: true }).fill("Mozo QA");
    await page.getByLabel("Usuario", { exact: true }).fill(`nuevo-${suffix}`);
    await page.getByLabel("Contraseña inicial", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Guardar persona", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Editar Mozo QA", exact: true }),
    ).toBeVisible();
    assert.equal(
      (
        await anonymous.request.post("/api/auth/login", {
          headers: { Origin: baseURL },
          data: { username: `nuevo-${suffix}`, password },
        })
      ).status(),
      200,
    );
    const waiterState = await (
      await anonymous.request.get("/api/state")
    ).json();
    assert.equal(waiterState.user.role, "WAITER");
    assert.equal(
      (
        await anonymous.request.post("/api/commands", {
          headers: { Origin: baseURL },
          data: { type: "category.save", name: "No permitido" },
        })
      ).status(),
      403,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await chooseRole("WAITER");
    await page.screenshot({
      path: ".local/screenshots/mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "Sin scroll horizontal en móvil",
    );
    await page.goto(`/menu/${restaurant.slug}`);
    await expect(
      page.getByRole("heading", { name: restaurant.name }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/screenshots/carta-publica.png",
      fullPage: true,
      animations: "disabled",
    });
    assert.deepEqual(errors, [], "Sin errores de JavaScript en navegador");
    console.log(
      "E2E OK: login, mesa, adicionales, cocina, cobro, cierre, ABM de carta/equipo, roles, CSRF, QR, temas y móvil.",
    );
  } catch(error) {
    for (const context of browser.contexts()) for (const page of context.pages()) { console.log("Failed URL",page.url(),await page.locator("body").innerText()); await page.screenshot({path:".local/screenshots/failure.png"}); }
    throw error;
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
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
