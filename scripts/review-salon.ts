import "dotenv/config";
import { chromium, expect, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createDatabaseClient } from "../src/lib/database/client";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const phase = process.env.REVIEW_PHASE || "pass-2";
  const dir = `.local/salon-review/${phase}`;
  const baseURL = process.env.APP_URL || "http://100.111.171.20:3000";
  const db = createDatabaseClient();
  const browser = await chromium.launch();
  const restaurant = await db.restaurant.create({
    data: { name: "Restaurante de ejemplo", slug: `review-${randomUUID()}` },
  });
  const restaurantId = restaurant.id;
  const password = randomUUID();
  const inventory: string[] = [];
  try {
    await mkdir(dir, { recursive: true });
    const user = await db.user.create({
      data: {
        restaurantId,
        username: `review-${randomUUID().slice(0, 8)}`,
        name: "Lucía",
        role: "ADMIN",
        roles: ["ADMIN","WAITER","KITCHEN","CASHIER"],
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
    const page = await browser.newPage({baseURL,viewport:{width:390,height:844},reducedMotion:"no-preference",recordVideo:{dir:`${dir}/video`,size:{width:390,height:844}}});
    const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    const settle = async()=> {await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));};
    const shot = async(name:string,locator?:Locator)=>{await settle();await page.mouse.move(0,0);await page.screenshot({path:`${dir}/${name}.png`});if(locator)await locator.screenshot({path:`${dir}/${name}-component.png`});inventory.push(name);};
    const footer = page.locator(".salon-view-toggle");
    const showOrder = async()=>{if ((page.viewportSize()?.width || 0) < 1100) await footer.getByRole("button",{name:/^Pedido /}).click();await settle();};
    const showMenu = async()=>{if ((page.viewportSize()?.width || 0) < 1100) await footer.getByRole("button",{name:"Carta",exact:true}).click();await settle();};
    const menu = async()=>{if(await page.locator(".desktop-navigation").isVisible()) return; await page.getByRole("button",{name:"Menú de funcionalidades"}).click();await settle();};
    const role = page.getByRole("combobox",{name:"Rol activo"});
    await page.goto("/login");await page.getByLabel("Usuario",{exact:true}).fill(user.username);await page.getByLabel("Contraseña",{exact:true}).fill(password);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await page.waitForURL("**/dashboard");
    await menu();await shot("01-navigation",page.getByRole("dialog"));await page.getByRole("navigation").getByRole("button",{name:"Mesas",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button",{name:"Organizar mesas",exact:true}).click();await shot("02-table-management",page.getByRole("dialog"));
    await page.getByRole("button",{name:"Nueva mesa",exact:true}).click();await shot("03-new-table",page.getByRole("dialog").last());await page.getByLabel("Nombre",{exact:true}).fill("Mesa 01");await page.getByRole("button",{name:"Guardar mesa",exact:true}).click();await expect(page.getByRole("dialog").last().getByRole("alert")).toBeVisible();await shot("04-validation-error",page.getByRole("dialog").last());await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(1);await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button",{name:"Mesa 04, libre",exact:true}).click();await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);await shot("05-edit-table",page.getByRole("dialog"));await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
    const settingsResponse = await page.request.post("/api/commands", {headers:{Origin:baseURL},data:{type:"restaurant.settings",waitersCanCharge:true}});expect(settingsResponse.ok()).toBe(true);
    const fadeObserved = page.evaluate(`new Promise(resolve => {
      let seen = false; const until = performance.now() + 1500;
      const sample = () => {const panels = [...document.querySelectorAll(".app-shell__content > .fade-view > .fade-view__page")]; seen ||= panels.length === 2 && panels.some(e => {const opacity = Number(getComputedStyle(e).opacity); return opacity > 0 && opacity < 1;}); if (performance.now() > until) resolve(seen); else requestAnimationFrame(sample);}; sample();
    })`);
    await role.selectOption("WAITER"); expect(await fadeObserved).toBe(true);await expect(page.getByRole("heading",{name:"El salón",exact:true})).toBeVisible();await shot("06-salon-mobile");
    const readyPanel = page.getByRole("complementary", {name: "Pendientes del salón"});
    await expect(readyPanel).toBeVisible();
    expect((await readyPanel.boundingBox())!.y).toBeLessThan((await page.getByRole("region", {name: "Mesas del salón"}).boundingBox())!.y);
    await page.setViewportSize({width:1440,height:1000});await shot("07-salon-desktop");
    // Filtering from multiple rows to one must never scale a remaining table.
    for (const width of [390,1440,1920]) {
      await page.setViewportSize({width,height:1000});
      await settle();
      await page.evaluate(`(() => {
        const frames = []; window.tableFrames = frames;
        const until = performance.now() + 800;
        const sample = () => {
          const card = document.querySelector('[aria-label="Mesa 01, en servicio"]');
          if (card) { const box = card.getBoundingClientRect(); frames.push([box.width, box.height]); }
          if (performance.now() < until) requestAnimationFrame(sample);
        }; sample();
      })()`);
      await page.getByRole("button",{name:/^Para entregar\s*1$/}).click();
      await page.waitForTimeout(900);
      const frames = await page.evaluate(() => (window as unknown as {tableFrames:number[][]}).tableFrames);
      expect(frames.length).toBeGreaterThan(5);
      for (const dimension of [0,1]) expect(Math.max(...frames.map(f=>f[dimension])) - Math.min(...frames.map(f=>f[dimension]))).toBeLessThan(2);
      if (width >= 1100) {
        const content = await page.locator(".app-shell__content").boundingBox();
        const floor = await page.locator(".salon-page:not(.salon-page--ordering)").boundingBox();
        expect(Math.abs((floor!.x - content!.x) - ((content!.x + content!.width) - (floor!.x + floor!.width)))).toBeLessThan(2);
        const tableBox = await page.getByRole("button",{name:"Mesa 01, en servicio",exact:true}).boundingBox();
        expect(Math.abs(tableBox!.x + tableBox!.width/2 - content!.x - content!.width/2)).toBeLessThan(2);
      }
      await shot(`07-filter-stable-${width}`);
      await page.getByRole("button",{name:/^Todas\s*8$/}).click();
      await settle();
    }
    await page.setViewportSize({width:1440,height:1000});
    const free = page.getByRole("button",{name:"Mesa 04, libre",exact:true});await free.hover();await shot("08-free-hover",free);await page.keyboard.press("Tab");await free.focus();await shot("09-free-focus",free);
    await shot("10-ready-table",page.getByRole("button",{name:"Mesa 01, en servicio",exact:true}));await shot("11-busy-table",page.getByRole("button",{name:"Mesa 02, en servicio",exact:true}));
    await page.getByRole("button",{name:/^Para entregar\s*1$/}).click();await shot("12-filter-ready");await page.getByRole("button",{name:/^Todas\s*8$/}).click();
    await page.evaluate(`(() => {
      window.__dialogFrames = [];
      const start = performance.now();
      const sample = () => {
        const dialog = document.querySelector("dialog[open]");
        if (dialog) window.__dialogFrames.push({height: dialog.getBoundingClientRect().height, opacity: getComputedStyle(dialog).opacity});
        if (performance.now() - start < 1000) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    })()`);
    await free.click();await shot("13-open-table",page.getByRole("dialog"));
    const modalFrames = await page.evaluate("window.__dialogFrames") as {height:number;opacity:string}[];
    expect(modalFrames.length).toBeGreaterThan(1);
    expect(modalFrames.every(frame => frame.opacity === "1")).toBe(true);
    expect(Math.max(...modalFrames.map(frame => frame.height)) - Math.min(...modalFrames.map(frame => frame.height))).toBeLessThan(1);
const guestOptions = page.getByRole("group",{name:"Comensales",exact:true}).getByRole("radio"); await expect(guestOptions).toHaveCount(4); await guestOptions.first().check(); await guestOptions.first().focus(); await expect(guestOptions.first()).toBeChecked(); await shot("14-open-focus-disabled",page.getByRole("dialog"));await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);await expect(free).toBeFocused();
    await free.click();await page.getByRole("button",{name:"Abrir cuenta",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.getByRole("combobox",{name:"Cambiar mesa"})).toHaveValue(tables[3].id);
    await page.getByRole("combobox",{name:"Cambiar mesa"}).selectOption(tables[0].id);await showOrder();await expect(page.getByRole("button",{name:"Enviar a cocina / barra",exact:true})).toBeDisabled();await shot("15-empty-receipt");await showMenu();
    await page.setViewportSize({width:390,height:844});await shot("16-catalog-mobile");
    // La tarjeta que permanece al filtrar no debe estirarse mientras AutoAnimate reduce la grilla.
    const searchHeights: Record<string, number[]> = {};
    for (const width of [390, 1440]) {
      await page.setViewportSize({width, height: 1000});
      await expect(page.locator(".table-views--workspace")).toHaveCount(width >= 1100 ? 1 : 0);
      await expect(page.locator(".table-views > :is(.slide-view__page, .fade-view__page)")).toHaveCount(1);
      await settle();
      for (const query of ["Agua", ""]) {
        const frames = page.evaluate(`new Promise(resolve => {
          const heights = []; const until = performance.now() + 1000;
          const sample = () => {
            const card = [...document.querySelectorAll(".product-card")].find(e => e.querySelector("h3, h4")?.textContent === "Agua mineral" || e.querySelector(".product-card__name")?.textContent === "Agua mineral");
            if (card) heights.push(card.getBoundingClientRect().height);
            if (performance.now() > until) resolve(heights); else requestAnimationFrame(sample);
          }; sample();
        })`);
        await page.getByLabel("Buscar en la carta", {exact:true}).fill(query);
        const heights = await frames as number[];
        expect(heights.length).toBeGreaterThan(5);
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);
        searchHeights[`${width}-${query || "clear"}`] = heights;
      }
    }
    await writeFile(`${dir}/search-heights.json`, JSON.stringify(searchHeights));
    await page.setViewportSize({width:390,height:844});await settle();
    // Verificar desplazamiento real, no solo un cambio de color en la pestaña.
    await page.getByRole("button",{name:"Entradas",exact:true}).click();await expect(page.locator(".category-views .slide-view__page")).toHaveCount(2);await page.screenshot({path:`${dir}/17-category-in-motion.png`});await expect(page.locator(".category-views .slide-view__page")).toHaveCount(1);await shot("18-category-settled");
    await page.getByRole("button",{name:"Bebidas",exact:true}).click();await expect(page.locator(".category-views .slide-view__page")).toHaveCount(2);await expect(page.locator(".category-views .slide-view__page")).toHaveCount(1);
    await page.getByRole("button",{name:"Postres",exact:true}).click();await page.getByRole("button",{name:"Entradas",exact:true}).click();await page.getByRole("button",{name:"Principales",exact:true}).click();await expect(page.locator(".category-views .slide-view__page")).toHaveCount(1);await expect(page.getByRole("heading",{name:"Hamburguesa de la casa",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Agregar Hamburguesa de la casa",exact:true}).click();await page.getByLabel(/Extra cheddar/).check();await page.getByRole("spinbutton",{name:"Cantidad",exact:true}).fill("2");await page.getByLabel("Notas para cocina",{exact:true}).fill("Sin cebolla");await shot("19-customizer-mobile",page.getByRole("dialog"));await page.getByRole("button",{name:"Sumar al pedido",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button",{name:"Bebidas",exact:true}).click();await page.getByRole("button",{name:"Agregar Limonada",exact:true}).click();await page.getByRole("button",{name:"Sumar al pedido",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await showOrder();await expect(page.locator(".cart__line")).toHaveCount(2);await expect(page.locator(".receipt__footer .cart__total")).toContainText("1.220");await shot("20-draft-mobile");
    await page.getByRole("button",{name:"Editar Hamburguesa de la casa",exact:true}).click();await expect(page.getByRole("spinbutton",{name:"Cantidad",exact:true})).toHaveValue("2");await expect(page.getByLabel(/Extra cheddar/)).toBeChecked();await page.getByLabel("Notas para cocina",{exact:true}).fill("Sin cebolla, bien cocida");await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.locator(".cart__line").first()).toContainText("bien cocida");
    await page.getByRole("button",{name:"Sumar Limonada",exact:true}).click();await expect(page.locator(".receipt__footer .cart__total")).toContainText("1.380");await page.getByRole("button",{name:"Restar Limonada",exact:true}).click();await expect(page.locator(".receipt__footer .cart__total")).toContainText("1.220");
    await shot("21-draft-states");
    await page.getByRole("button",{name:"Listos para entregar",exact:true}).click();
    await expect(page.locator(".table-views > :is(.slide-view__page, .fade-view__page)")).toHaveCount(2);
    await shot("21-ready-section");
    await page.getByRole("button",{name:"Marcar entregado: Bastones de muzzarella",exact:true}).click();
    await expect(page.getByRole("button",{name:"Listos para entregar",exact:true})).toBeDisabled();
    await page.getByRole("button",{name:"Pagar",exact:true}).click(); await shot("21-pending-decision"); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", {name: "Todas las mesas", exact: true}).click();
    await expect(page.locator(".floor-navigation__views > .fade-view__page")).toHaveCount(2);
    await expect(page.getByRole("heading", {name:"El salón",exact:true})).toBeVisible();
    await expect(readyPanel).toHaveCount(0);
    await page.getByRole("button",{name:"Mesa 01, en servicio",exact:true}).click();
    await expect(page.locator(".floor-navigation__views > .fade-view__page")).toHaveCount(2);
    await showOrder();

    await showOrder();await showMenu();await page.getByRole("button",{name:"Toda la carta",exact:true}).click();await page.getByLabel("Buscar en la carta",{exact:true}).fill("cafe");await expect(page.getByRole("heading",{name:"Café",exact:true})).toBeVisible();await shot("22-search");await page.getByLabel("Buscar en la carta",{exact:true}).fill("zzzz");await shot("23-empty-search");await page.getByRole("button",{name:"Ver toda la carta",exact:true}).click();
    await page.getByRole("combobox",{name:"Cambiar mesa"}).selectOption(tables[1].id);await page.getByRole("combobox",{name:"Cambiar mesa"}).selectOption(tables[0].id);await showOrder();await expect(page.locator(".cart__line")).toHaveCount(2);await expect(page.locator(".cart__line").first()).toContainText("bien cocida");
    await page.getByRole("button",{name:"Enviar a cocina / barra",exact:true}).click();await expect(page.getByText("Pedido enviado a cocina y barra.",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Enviar pedido",exact:true})).toBeDisabled();await shot("24-sent-order");
    await showMenu();await page.getByRole("button",{name:"Postres",exact:true}).click();await shot("25-unavailable",page.locator(".product-card").filter({has:page.getByRole("heading",{name:"Flan casero",exact:true})}));await expect(page.getByRole("button",{name:"Agregar Flan casero",exact:true})).toBeDisabled();
    await menu();await page.getByRole("button",{name:"Cambiar tema"}).click();await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);await shot("26-dark-catalog");await page.getByRole("button",{name:"Agregar Brownie",exact:true}).click();await shot("27-dark-dialog",page.getByRole("dialog"));await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);await showOrder();await shot("28-dark-account");
    for(const width of [360,768,1024,1280,1440,1920]) {await page.setViewportSize({width,height:width===1440?1000:844});await showMenu();await shot(`29-catalog-${width}`);await showOrder();await shot(`30-receipt-${width}`);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width<1100){const footerBox=await footer.boundingBox();expect(footerBox!.y+footerBox!.height).toBeLessThanOrEqual(width===1440?1000:844);}else await expect(footer).toHaveCount(0);}
    await menu();await page.getByRole("button",{name:"Cambiar tema"}).click();await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);await showMenu();await page.getByRole("button",{name:"Toda la carta",exact:true}).click();await shot("31-final-desktop");
    // Desktop keeps menu and editable draft visible together; resizing preserves the draft.
    await page.getByRole("button", {name:"Agregar Agua mineral",exact:true}).click();
    await page.getByRole("dialog").getByRole("button", {name:"Sumar al pedido",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({width,height:1000});
      await expect(page.getByLabel("Buscar en la carta",{exact:true})).toBeVisible();
      await expect(page.locator(".cart__line")).toHaveCount(1);
      const menuBox = await page.locator(".order-desk__menu").boundingBox();
      const orderBox = await page.locator(".receipt").boundingBox();
      expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(orderBox!.x + 1);
      const sendBox = await page.getByRole("button",{name:"Enviar a cocina / barra",exact:true}).boundingBox();
      expect(sendBox!.height).toBeLessThan(70);
      expect(sendBox!.y + sendBox!.height).toBeLessThan(1000);
      await shot(`32-workspace-${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    await showOrder();
    await expect(page.locator(".cart__line")).toHaveCount(1);
    await expect(page.getByLabel("Buscar en la carta",{exact:true})).toHaveCount(0);
    await shot("33-mobile-preserved");
    await writeFile(`${dir}/inventory.json`,JSON.stringify({phase,components:inventory,errors},null,2));expect(errors).toEqual([]);
    console.log(`${phase}: ${inventory.length} capturas; roles, mesa, búsqueda, categorías animadas, borrador editable, envío, entrega, modales, temas y cuatro tamaños verificados.`);
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
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
