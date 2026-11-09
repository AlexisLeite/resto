import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createDatabaseClient } from "../src/lib/database/client";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const phase = "category-motion";
  const dir = `.local/management-review/${phase}`;
  const baseURL = process.env.APP_URL || "http://100.111.171.20:3000";
  const db = createDatabaseClient();
  const browser = await chromium.launch();
  const restaurant = await db.restaurant.create({
    data: { name: "Restaurante de ejemplo", slug: `review-${randomUUID()}` },
  });
  const restaurantId = restaurant.id;
  const password = randomUUID();
  try {
    await mkdir(dir, { recursive: true });
    const user = await db.user.create({
      data: {
        restaurantId,
        username: `review-${randomUUID().slice(0, 8)}`,
        name: "Lucía",
        role: "ADMIN",
        roles: ["ADMIN", "WAITER", "KITCHEN", "CASHIER"],
        passwordHash: await hashPassword(password),
      },
    });
    const categories = await Promise.all(
      ["Entradas", "Principales", "Bebidas", "Postres"].map((name) =>
        db.category.create({ data: { restaurantId, name } }),
      ),
    );
    const products: Awaited<ReturnType<typeof db.product.create>>[] = [];
    for (const [name, description, price, cat] of [
      ["Bastones de muzzarella", "Con salsa de tomate casera", 290, 0],
      ["Papas rústicas", "Al horno, con romero y sal marina", 220, 0],
      [
        "Hamburguesa de la casa",
        "Carne, cheddar, lechuga y tomate. Con papas",
        480,
        1,
      ],
      ["Milanesa napolitana", "Con papas fritas y ensalada fresca", 550, 1],
      ["Ensalada de estación", "Hojas verdes, vegetales y semillas", 360, 1],
      ["Agua mineral", "Botella de 500 ml", 110, 2],
      ["Limonada", "Limón, menta y jengibre", 160, 2],
      ["Café", "Espresso o americano", 130, 2],
      ["Brownie", "Chocolate y helado de vainilla", 250, 3],
      ["Flan casero", "Con dulce de leche", 190, 3],
    ] as const)
      products.push(
        await db.product.create({
          data: {
            restaurantId,
            categoryId: categories[cat].id,
            name,
            description,
            price,
            station: cat === 2 ? "BAR" : "KITCHEN",
            available: name !== "Flan casero",
            addons:
              name === "Hamburguesa de la casa"
                ? [
                    { id: "cheddar", name: "Extra cheddar", price: "50.00" },
                    { id: "bacon", name: "Panceta", price: "70.00" },
                  ]
                : [],
          },
        }),
      );
    const tables = [];
    for (let i = 1; i <= 8; i++)
      tables.push(
        await db.diningTable.create({
          data: {
            restaurantId,
            name: `Mesa 0${i}`,
            seats: i === 3 || i > 5 ? 2 : 4,
          },
        }),
      );
    for (let n = 0; n < 3; n++) {
      const session = await db.tableSession.create({
        data: {
          restaurantId,
          tableId: tables[n].id,
          guests: n === 2 ? 2 : 4,
          openedBy: user.name,
          openedAt: new Date(Date.now() - (n + 1) * 12 * 60000),
        },
      });
      if (n < 2)
        await db.order.create({
          data: {
            sessionId: session.id,
            requestKey: randomUUID(),
            createdById: user.id,
            items: {
              create: (n === 0 ? [0, 2, 3, 6, 8] : [2, 6]).map((p, i) => ({
                productId: products[p].id,
                name: products[p].name,
                unitPrice: products[p].price,
                quantity: p === 6 ? 2 : 1,
                extras: [],
                notes: p === 2 ? "Sin cebolla" : "",
                station: products[p].station,
                status:
                  n === 1
                    ? "PREPARING"
                    : (
                        [
                          "READY",
                          "PENDING",
                          "PREPARING",
                          "DELIVERED",
                          "CANCELLED",
                        ] as const
                      )[i],
                cancellationReason: p === 8 ? "Cambio de pedido" : null,
              })),
            },
          },
        });
    }
    const closedShift = await db.cashShift.create({
      data: {
        restaurantId,
        openedBy: user.name,
        closedBy: user.name,
        openingCash: 500,
        closingCash: 1000,
        expectedCash: 1000,
        closedAt: new Date(),
        notes: "Arqueo completo",
      },
    });
    const closedSession = await db.tableSession.create({
      data: {
        restaurantId,
        tableId: tables[6].id,
        guests: 2,
        openedBy: user.name,
        closedAt: new Date(),
      },
    });
    await db.order.create({
      data: {
        sessionId: closedSession.id,
        requestKey: randomUUID(),
        createdById: user.id,
        items: {
          create: {
            productId: products[8].id,
            name: products[8].name,
            unitPrice: 250,
            quantity: 2,
            extras: [],
            station: "KITCHEN",
            status: "DELIVERED",
          },
        },
      },
    });
    await db.payment.create({
      data: {
        sessionId: closedSession.id,
        shiftId: closedShift.id,
        amount: 500,
        method: "CASH",
        receivedBy: user.name,
      },
    });
    await db.auditEvent.create({
      data: {
        restaurantId,
        actorId: user.id,
        actorName: user.name,
        action: "payment.create",
        detail: "Cobro registrado: Mesa 07 · Efectivo $ 500",
      },
    });
    await db.product.update({
      where: { id: products[5].id },
      data: {
        varieties: [
          {
            id: "line",
            name: "Línea",
            options: [
              { id: "still", name: "Sin gas" },
              { id: "sparkling", name: "Con gas" },
            ],
          },
        ],
      },
    });
    const page = await browser.newPage({
      baseURL,
      viewport: { width: 390, height: 844 },
      reducedMotion: "no-preference",
    });
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (/Blocked aria-hidden|retained focus/i.test(message.text()))
        warnings.push(message.text());
    });
    page.on("pageerror", (error) => warnings.push(error.message));
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill(user.username);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.getByRole("button", { name: "Menú de funcionalidades" }).click();
    await page
      .getByRole("navigation", {name:"Navegación principal"})
      .getByRole("button", { name: "Carta", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Categorías", exact: true })
      .click();
    const tracks: unknown[] = [];
    const sample = () =>
      page.evaluate(`new Promise(resolve=>{
      const samples=[];const until=performance.now()+700;
      const capture=()=>{
        const viewport=document.querySelector('.category-manager .fade-view');
        const incoming=viewport?.querySelector('.fade-view__page:not([data-exiting])');
        const outgoing=viewport?.querySelector('.fade-view__page[data-exiting]');
        if(viewport&&incoming&&outgoing) samples.push({scroll:viewport.scrollLeft,width:incoming.getBoundingClientRect().width,incoming:Number(getComputedStyle(incoming).opacity),outgoing:Number(getComputedStyle(outgoing).opacity),x:new DOMMatrixReadOnly(getComputedStyle(incoming).transform).m41});
      };
      const observer=new MutationObserver(capture);
      observer.observe(document.querySelector('.category-manager .fade-view'),{childList:true,subtree:true});
      const frame=()=>{capture();if(performance.now()<until) requestAnimationFrame(frame);else {observer.disconnect();resolve(samples);}};
      requestAnimationFrame(frame);
    })`) as Promise<
        { scroll: number; width: number; incoming: number; outgoing: number; x: number }[]
      >;
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ["new", "edit"]) {
        const trigger = page.getByRole("button", {
          name: mode === "new" ? "Nueva categoría" : "Editar categoría Bebidas",
          exact: true,
        });
        await trigger.focus();
        const entering = sample();
        await page.keyboard.press("Enter");
        const frames = await entering;
        expect(frames.length).toBeGreaterThan(2);
        expect(frames.every((f) => f.scroll === 0)).toBe(true);
        expect(frames.some(f => f.incoming > 0 && f.incoming < 1)).toBe(true);
        expect(frames.some(f => f.outgoing > 0 && f.outgoing < 1)).toBe(true);
        expect(frames.every(f => f.x === 0)).toBe(true);
        await expect(
          page.getByLabel("Nombre de la categoría", { exact: true }),
        ).toBeFocused();
        await page.screenshot({ path: `${dir}/${width}-${mode}.png` });
        const leaving = sample();
        await page
          .getByRole("button", { name: "Cancelar", exact: true })
          .click();
        const back = await leaving;
        expect(back.every((f) => f.scroll === 0)).toBe(true);
        expect(back.some(f => f.incoming > 0 && f.incoming < 1)).toBe(true);
        expect(back.some(f => f.outgoing > 0 && f.outgoing < 1)).toBe(true);
        expect(back.every(f => f.x === 0)).toBe(true);
        await expect(trigger).toBeFocused();
        tracks.push({ width, mode, frames, back });
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page
      .getByRole("button", { name: "Nueva categoría", exact: true })
      .click();
    await expect(
      page.getByLabel("Nombre de la categoría", { exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Nueva categoría", exact: true }),
    ).toBeFocused();
    expect(warnings).toEqual([]);
    await writeFile(`${dir}/frames.json`, JSON.stringify({ tracks, warnings }));
    console.log(
      "Categorías: desvanecimiento de entrada y salida sin desplazamiento lateral, foco de entrada y retorno, teclado, movimiento reducido y consola limpia.",
    );
  } finally {
    await browser.close();
    await db.payment.deleteMany({ where: { session: { restaurantId } } });
    await db.cashShift.deleteMany({ where: { restaurantId } });
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
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
