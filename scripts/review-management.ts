import "dotenv/config";
import { demoImages } from "../src/lib/restaurant/demo-images";
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createDatabaseClient } from "../src/lib/database/client";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const phase = process.env.REVIEW_PHASE || "before";
  const dir = `.local/management-review/${phase}`;
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
            imageUrl: demoImages[name] ?? "",
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
      viewport: { width: 1440, height: 1000 },
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => {if (message.type() === "error" || /Blocked aria-hidden|retained focus/.test(message.text())) errors.push(message.text());});
    const settle = async () => {
      await page.evaluate(() =>
        Promise.all(
          document.getAnimations().map((a) => a.finished.catch(() => {})),
        ),
      );
    };
    const shot = async (name: string) => {
      await settle();
      await page.screenshot({ path: `${dir}/${name}.png` });
      inventory.push(name);
    };
    const menu = async () => {
      if (await page.locator(".desktop-navigation").isVisible()) return;
      await page
        .getByRole("button", { name: "Menú de funcionalidades" })
        .click();
    };
    const selectRole = async (role:string)=>{
      if((page.viewportSize()?.width || 0)>=1100){const labels:Record<string,string>={ADMIN:"Administración",WAITER:"Salón",KITCHEN:"Cocina y barra",CASHIER:"Caja"};await page.getByRole("link",{name:`Rol ${labels[role]}`,exact:true}).click();await expect.poll(async()=> (await (await page.request.get("/api/state")).json()).user.role).toBe(role);}else await page.getByRole("combobox",{name:"Rol activo"}).selectOption(role);
      await settle();
    };
    const nav = async (name: string) => {
      const rail = page.getByRole("navigation", {name:"Navegación de escritorio"});
      if (!(await rail.isVisible())) await menu();
      const button = (await rail.isVisible() ? page.locator(".desktop-navigation") : page.getByRole("dialog")).getByRole("button",{name,exact:true});
      const changing = await button.getAttribute("aria-current") !== "page";
      const reduced = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
      if (changing && !reduced) await page.evaluate(`(() => {
        window.navMotion = []; const until=performance.now()+600;
        const sample=()=>{
          const pages=[...document.querySelectorAll('.app-shell__content > .fade-view > .fade-view__page')];
          if(pages.length===2) for(const p of pages) window.navMotion.push({opacity:Number(getComputedStyle(p).opacity),x:new DOMMatrixReadOnly(getComputedStyle(p).transform).m41});
          if(performance.now()<until) requestAnimationFrame(sample);
        };sample();
      })()`);
      await button.click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await settle();
      if (changing && !reduced) {
        const frames = await page.evaluate(() => (window as unknown as {navMotion:{opacity:number;x:number}[]}).navMotion);
        expect(frames.some(f=>f.opacity>0 && f.opacity<1)).toBe(true);
        expect(frames.every(f=>f.x===0)).toBe(true);
      }
    };
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill(user.username);
    await page.getByLabel("Contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await page.waitForURL("**/dashboard");
    if (process.env.CHECK_PUBLIC_ONLY) {
      for (const width of [1440,390]) {
        await page.setViewportSize({width,height:900});
        await page.goto("/dashboard?rol=administracion&pagina=carta&seccion=categorias");
        await page.getByRole("button",{name:"Editar categoría Bebidas",exact:true}).click();
        const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel("Nombre de la categoría")).toBeFocused();
        await expect(page.locator(".category-manager--inline .category-manager__list")).toBeVisible();
        await shot(`category-modal-${width}`);
        await dialog.getByLabel("Nombre de la categoría").fill("Bebidas frescas");
        await dialog.getByRole("button",{name:"Guardar categoría",exact:true}).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByRole("button",{name:"Editar categoría Bebidas frescas",exact:true})).toBeFocused();
        await page.getByRole("button",{name:"Editar categoría Bebidas frescas",exact:true}).click();
        await dialog.getByLabel("Nombre de la categoría").fill("Bebidas");
        await dialog.getByRole("button",{name:"Guardar categoría",exact:true}).click();
        await expect(dialog).toHaveCount(0);
        const pub=await browser.newPage({baseURL,viewport:{width,height:900}});
        await pub.goto(`/menu/${restaurant.slug}`);
        await expect(pub.locator(".public-menu__product")).toHaveCount(10);
        for(const image of await pub.locator(".public-menu__photo img").all()) {await image.scrollIntoViewIfNeeded(); await expect.poll(()=>image.evaluate((el)=> (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);}
        await pub.evaluate(()=>window.scrollTo(0,0));await pub.screenshot({path:`${dir}/public-${width}.png`,fullPage:true});
        await pub.getByLabel("Buscar en la carta",{exact:true}).fill("cafe");await expect(pub.locator(".public-menu__product")).toHaveCount(1);await expect(pub.locator(".public-menu__product")).toContainText("Café");
        await pub.getByRole("button",{name:"Limpiar búsqueda"}).click();
        await pub.getByRole("button",{name:"Postres",exact:true}).click();await expect(pub.locator(".public-menu__product")).toHaveCount(2);
        await pub.getByRole("button",{name:"Cambiar tema",exact:true}).click();await pub.screenshot({path:`${dir}/public-dark-${width}.png`,fullPage:true});
        expect(await pub.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await pub.close();
      }
      await page.goto("/dashboard?rol=salon&pagina=mesas");await expect(page.getByRole("link",{name:/^Mesa 03,/})).toBeVisible();await page.getByRole("link",{name:/^Mesa 03,/}).click();
      for(const theme of ["light","dark"]) {
        if(theme==="dark") { await menu();await page.getByRole("button",{name:"Cambiar tema",exact:true}).click();await page.getByRole("button",{name:"Cerrar diálogo"}).click(); }
        const footer=page.locator(".salon-view-toggle");
        await expect(footer.getByRole("button",{name:"Carta",exact:true})).toHaveAttribute("aria-pressed","true");
        await expect(footer.getByRole("button",{name:"Listos para entregar",exact:true})).toBeDisabled();
        const backgrounds=await footer.evaluate(el=>[getComputedStyle(el.querySelector('[aria-pressed="true"]')!).backgroundColor,getComputedStyle(el.querySelector(':disabled')!).backgroundColor]);expect(backgrounds[0]).not.toBe(backgrounds[1]);await shot(`footer-${theme}`);
      }
      expect(errors).toEqual([]);console.log("Public menu, category modal and footer states passed");return;
    }
    if (process.env.CHECK_DELIVERY_LINK_ONLY) {
      let roleRequests = 0;
      page.on("request", request => { if (request.url().endsWith("/api/auth/role")) roleRequests++; });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await selectRole("WAITER");
        await expect.poll(async () => (await (await page.request.get("/api/state")).json()).user.role).toBe("WAITER");
        console.log("delivery start", width, page.url());
        await page.locator(".salon-service__task").filter({ hasText: "Mesa 01" }).click();
        await expect(page.getByRole("heading", { name: "Listos para entregar", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Marcar entregado: Bastones de muzzarella", exact: true })).toBeVisible();
        await expect(page.getByLabel("Buscar en la carta", { exact: true })).toBeHidden();
        await shot(`delivery-link-${width}`);
        const deliveryUrl = page.url();
        expect(deliveryUrl).toContain("vista=entregar");
        await page.reload();
        await expect(page.getByRole("heading", { name: "Listos para entregar", exact: true })).toBeVisible();
        if (width >= 1100) await page.getByRole("link", { name: "Rol Salón", exact: true }).click();
        else await page.getByRole("link", { name: "Todas las mesas", exact: true }).click();
        await expect(page.getByRole("heading", { name: "El salón", exact: true })).toBeVisible();
        await page.getByRole("link", { name: /^Mesa 01,/ }).click();
        await expect(page.getByLabel("Buscar en la carta", { exact: true })).toBeVisible();
        const tableUrl = page.url();
        await page.goBack();
        await expect(page.getByRole("heading", { name: "El salón", exact: true })).toBeVisible();
        await page.goForward();
        await expect(page).toHaveURL(tableUrl);
        await expect(page.getByLabel("Buscar en la carta", { exact: true })).toBeVisible();
        await selectRole("ADMIN");
        if (width >= 1100) {
          const rail = page.locator(".desktop-navigation");
          for (const name of ["Carta", "Equipo", "Configuración", "Resumen"]) {
            await rail.getByRole("link", { name, exact: true }).click();
            await expect(page.getByRole("main", { name, exact: true })).toBeVisible();
          }
          const url = page.url(); await page.reload(); await expect(page).toHaveURL(url); await page.waitForFunction(() => { const element = document.querySelector(".app-header__role"); return element && Object.keys(element).some(key => key.startsWith("__reactProps$")); });
        }
      }
      await db.restaurant.update({where:{id:restaurantId},data:{waitersCanCharge:true}});
      await page.goto(`/dashboard?rol=salon&pagina=mesas&mesa=${tables[0].id}&vista=pagar`);
      await expect(page.getByRole("dialog",{name:"Resolver pendientes",exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:/^Confirmar cobro/})).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByLabel("Buscar en la carta",{exact:true})).toBeVisible();
      expect(roleRequests).toBeLessThan(8);
      expect(errors).toEqual([]);
      console.log("Delivery links: desktop and mobile passed");
      return;
    }
    if (process.env.CHECK_NEW_ONLY) {
      const roleNames = {ADMIN:"Administración",WAITER:"Salón",KITCHEN:"Cocina y barra",CASHIER:"Caja"};
      const role = async (value: keyof typeof roleNames) => {
        if ((page.viewportSize()?.width || 0)>=1100) await page.getByRole("link",{name:`Rol ${roleNames[value]}`,exact:true}).click();
        else await page.getByRole("combobox",{name:"Rol activo"}).selectOption(value);
        await expect.poll(async()=> (await (await page.request.get("/api/state")).json()).user.role).toBe(value); await settle();
      };
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:900}); await role("ADMIN"); await nav("Carta");
        await page.getByRole("button",{name:"Categorías",exact:true}).click();
        await expect(page.locator(".category-manager__row")).toHaveCount(4);await settle();
        const handle=page.getByRole("button",{name:"Reordenar Bebidas",exact:true});
        const start=await handle.boundingBox(),target=await page.locator(".category-manager__row").nth(1).boundingBox();
        const x=start!.x+start!.width/2,y=start!.y+start!.height/2,endY=target!.y+target!.height/2;
        if(width>=1100){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+8,y);await expect(page.locator(".category-manager__row--dragging")).toHaveCount(1);await page.mouse.move(x,endY,{steps:15});await page.mouse.up();}
        else {const cdp=await page.context().newCDPSession(page);await cdp.send("Emulation.setTouchEmulationEnabled",{enabled:true});await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y+10}]});for(let step=1;step<=10;step++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:y+(endY-y)*step/10}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();}
        await expect(page.locator(".category-manager__row").nth(1)).toContainText("Bebidas");
        await shot(`categories-${width}`);
        const pub=await browser.newPage({baseURL,viewport:{width,height:900}});await pub.goto(`/menu/${restaurant.slug}`);await expect(pub.getByRole("heading",{level:2}).first()).toContainText("Entradas");await pub.close();
        await expect(handle).toBeEnabled();await handle.focus();await page.keyboard.press("Space");await expect(page.locator(".category-manager__row--dragging")).toHaveCount(1);await page.keyboard.press("ArrowUp");await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.keyboard.press("Space");await expect(page.locator(".category-manager__row").first()).toContainText("Bebidas");
        await role("WAITER");await page.getByRole("button",{name:/^Mesa 01,/}).click();
        await expect(page.getByLabel("Buscar en la carta",{exact:true})).toBeVisible();
        if(width>=1100){await expect(page.locator(".salon-view-toggle")).toHaveCount(0);await expect(page.locator('.desktop-navigation select[aria-label="Rol activo"]')).toHaveCount(0);const person=await page.locator(".desktop-navigation__person").boundingBox();expect(person!.y).toBeGreaterThan(650);await page.getByRole("button",{name:"Listos para entregar",exact:true}).click();await expect(page.getByRole("heading",{name:"Listos para entregar",exact:true})).toBeVisible();await page.getByRole("button",{name:"Carta y pedido",exact:true}).click();}
        if(width>=1100){await page.getByRole("button",{name:"Rol Salón",exact:true}).click();await expect(page.getByRole("heading",{name:"El salón",exact:true})).toBeVisible();await page.locator(".desktop-navigation").getByRole("button",{name:"Mesa 02",exact:true}).click();await expect(page.locator(".desktop-navigation").getByRole("button",{name:"Mesa 02",exact:true})).toHaveAttribute("aria-current","page");const beforeIndicator=await page.locator(".desktop-navigation__indicator").boundingBox();
          const motionFrames=page.evaluate(`new Promise(resolve=>{const positions=[];const end=performance.now()+600;const sample=()=>{const el=document.querySelector('.desktop-navigation__indicator');if(el)positions.push(el.getBoundingClientRect().y);if(performance.now()<end)requestAnimationFrame(sample);else resolve(positions);};sample();})`) as Promise<number[]>;
          await page.locator(".desktop-navigation").getByRole("button",{name:"Mesa 01",exact:true}).click();const frames=await motionFrames;const afterIndicator=await page.locator(".desktop-navigation__indicator").boundingBox();expect(frames.some(y=>y>Math.min(beforeIndicator!.y,afterIndicator!.y)+1 && y<Math.max(beforeIndicator!.y,afterIndicator!.y)-1)).toBe(true);await expect(page.locator(".desktop-navigation__indicator")).toHaveCount(1);await expect(page.getByRole("combobox",{name:"Cambiar mesa"})).toHaveCount(0);}
        await shot(`table-${width}`);
        if(width===1440){for(const desktopWidth of [1280,1920]){await page.setViewportSize({width:desktopWidth,height:900});await shot(`table-${desktopWidth}`);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const send=await page.getByRole("button",{name:"Enviar a cocina / barra",exact:true}).boundingBox();expect(send!.y+send!.height).toBeLessThanOrEqual(900);}await page.setViewportSize({width,height:900});}
        await role("KITCHEN");const pending=page.locator(".order-line").filter({has:page.getByRole("button",{name:"Empezar",exact:true})}).first();
        if(await pending.count()){await expect(pending.getByRole("button",{name:"Marcar listo",exact:true})).toBeVisible();await shot(`kitchen-${width}`);await pending.getByRole("button",{name:"Marcar listo",exact:true}).click();}
        await role("CASHIER");
        const open=page.getByRole("button",{name:"Abrir caja",exact:true});if(await open.isVisible())await open.click();
        if(width>=1100)await page.getByRole("button",{name:"Cuentas",exact:true}).click();
        await page.locator(".cash-accounts").getByRole("button",{name:width===1440?/Mesa 02/:/Mesa 01/}).click();
        await expect(page.getByRole("dialog",{name:/Resolver pendientes/})).toBeVisible();
        await shot(`cash-pending-${width}`);await page.getByRole("button",{name:width===1440?"Cobrarlos":"Descartar",exact:true}).click();
        await expect(page.getByRole("dialog",{name:/Cuenta/})).toBeVisible();await expect(page.getByRole("button",{name:/Confirmar cobro/})).toBeEnabled();await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
        await page.getByRole("button",{name:"Venta",exact:true}).click();
        await page.getByRole("button",{name:"Agregar Agua mineral",exact:true}).click();
        await expect(page.getByRole("radio",{name:"Sin gas",exact:true})).toBeChecked();await page.getByRole("button",{name:"Sumar al pedido",exact:true}).click();
        if(width<1100) await page.locator(".salon-view-toggle").getByRole("button",{name:/^Pedido /}).click();
        await page.getByRole("button",{name:"Sumar Agua mineral",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.locator(".quantity-stepper")).toContainText("2");await page.getByRole("button",{name:"Restar Agua mineral",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.locator(".quantity-stepper")).toContainText("1");
        await shot(`sale-${width}`);
        await menu();await page.getByRole("button",{name:"Cambiar tema",exact:true}).click();if(width<1100){await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);}await shot(`sale-dark-${width}`);await menu();await page.getByRole("button",{name:"Cambiar tema",exact:true}).click();if(width<1100){await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);}
        await page.locator(".receipt__footer").getByRole("button",{name:"Continuar al cobro",exact:true}).click();await expect(page.getByRole("heading",{name:"Cobrar venta",exact:true})).toBeVisible();
        await expect(page.locator('input[name="service"]')).toHaveValue("0");await shot(`checkout-${width}`);
        const request=page.waitForRequest(r=>r.url().endsWith("/api/commands") && r.postDataJSON()?.type==="sale.create");
        await page.getByRole("button",{name:/Confirmar cobro de/}).click();const command=(await request).postDataJSON();
        await expect(page.getByText("Venta cobrada.",{exact:true})).toBeVisible();
        const sales=await db.tableSession.findMany({where:{restaurantId,tableId:null},include:{payment:true}});expect(sales).toHaveLength(width===1440?1:2);expect(sales.every(s=>!!s.payment && !!s.closedAt)).toBe(true);
        const retry=await page.request.post("/api/commands",{headers:{Origin:baseURL},data:command});expect(retry.ok()).toBe(true);expect(await db.tableSession.count({where:{restaurantId,tableId:null}})).toBe(sales.length);
        await shot(`paid-${width}`);
      }
      expect(errors).toEqual([]);console.log("Cambios verificados: roles laterales, categorías ordenadas, mesa sin footer desktop, cocina directa, cantidades sin modal, venta y cobro sin mesa e idempotencia en 1440 y 390.");return;
    }
    if (process.env.CHECK_STATES_ONLY) {
      for (const width of [390,1440]) {
        await page.setViewportSize({width,height:700}); await nav("Carta");
        await page.getByLabel("Buscar producto",{exact:true}).fill("sin coincidencias xyz");
        await expect(page.getByText("Sin coincidencias",{exact:true})).toBeVisible();
        await shot(`empty-${width}`);
        await page.getByLabel("Buscar producto",{exact:true}).fill("");
        await page.getByLabel("Buscar producto",{exact:true}).focus();
        await shot(`focus-${width}`);
        let release: (()=>void) | undefined;
        const pendingResponse = new Promise<void>(resolve=>{release=resolve;});
        await page.route("**/api/commands", async route => {await pendingResponse; await route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({error:"El producto cambió. Revisá el estado e intentá nuevamente."})});});
        const toggle=page.locator(".catalog-row").first().getByRole("button",{name:/Marcar (agotado|disponible)/});
        await toggle.click();
        await expect(toggle).toBeDisabled();
        await shot(`loading-${width}`);
        release!();
        await expect(page.locator(".app-shell__content").getByRole("alert")).toContainText("El producto cambió");
        await expect(toggle).toBeEnabled();
        await shot(`error-${width}`);
        await page.getByRole("button",{name:"Cerrar aviso",exact:true}).click();
        await expect(page.locator(".app-shell__content").getByRole("alert")).toHaveCount(0);
        await page.unroute("**/api/commands");
        await page.route("**/api/state",route=>route.fulfill({status:503,body:"Temporalmente no disponible"}));
        await expect(page.locator(".app-shell__content").getByRole("alert")).toContainText("No se pudo actualizar",{timeout:10000});
        await expect(page.locator(".catalog-row")).toHaveCount(10);
        await shot(`offline-${width}`);
        await page.unroute("**/api/state");
        await page.getByRole("button",{name:"Reintentar",exact:true}).click();
        await expect(page.locator(".app-shell__content").getByRole("alert")).toHaveCount(0);
      }
      expect(errors).toEqual([]);
      console.log("Estados: vacío, foco, carga, error recuperable y pérdida/recuperación de conexión verificados en móvil y escritorio.");
      return;
    }
    if (process.env.CHECK_SCROLL_ONLY) {
      for (const width of [390,1440]) {
        await page.setViewportSize({width,height:600});
        await nav("Carta");
        const row=page.locator(".catalog-row").last();
        const toggle=row.getByRole("button",{name:/Marcar (agotado|disponible)/});
        await toggle.scrollIntoViewIfNeeded(); await settle();
        const before=await page.locator(".module-content").evaluate(e=>({scroll:e.scrollTop,y:e.getBoundingClientRect().y}));
        const rowBefore=await row.boundingBox();
        await toggle.click();
        await expect(toggle).toBeEnabled();
        await page.waitForTimeout(600);
        const after=await page.locator(".module-content").evaluate(e=>({scroll:e.scrollTop,y:e.getBoundingClientRect().y}));
        const rowAfter=await row.boundingBox();
        console.log(JSON.stringify({width,before,after,rowBefore:rowBefore!.y,rowAfter:rowAfter!.y}));
        await shot(`availability-scroll-${width}`);
        expect(Math.abs(after.scroll-before.scroll)).toBeLessThan(2);
        expect(Math.abs(rowAfter!.y-rowBefore!.y)).toBeLessThan(2);
      }
      return;
    }
    for (const width of [1280, 1440, 1920, 360, 390]) {
      await page.setViewportSize({ width, height: Number(process.env.REVIEW_HEIGHT || 900) });
      for (const name of [
        "Resumen",
        "Carta",
        "Equipo",
        "Configuración",
        "Mi cuenta",
      ]) {
        await nav(name);
        await shot(`${width}-${name}`);
        if (width >= 1100) {
          await expect(page.getByRole("button",{name:"Menú de funcionalidades"})).toBeHidden();
          await expect(page.getByRole("navigation",{name:"Navegación de escritorio"}).getByRole("button",{name:"Mi cuenta",exact:true})).toHaveCount(0);
          const themeButton = page.locator(".desktop-navigation__actions").getByRole("button",{name:"Cambiar tema",exact:true});
          expect(await themeButton.innerText()).toBe("");
          const themeBox = await themeButton.boundingBox();
          const logoutBox = await page.locator(".desktop-navigation__actions").getByRole("button",{name:"Salir",exact:true}).boundingBox();
          expect(Math.abs(themeBox!.y - logoutBox!.y)).toBeLessThan(2);
          const shell = await page.locator(".app-shell__content").boundingBox();
          const main = await page.locator("main.page").boundingBox();
          expect(main!.width).toBeLessThanOrEqual(1280);
          await expect.poll(()=>page.locator(".desktop-navigation").evaluate(e=>e.scrollHeight <= e.clientHeight + 1)).toBe(true);
          expect(Math.abs(main!.x - shell!.x - (shell!.width - main!.width)/2)).toBeLessThan(2);
        }
      }
      await selectRole("KITCHEN");
      await settle();
      await shot(`${width}-Cocina`);
      await selectRole("CASHIER");
      await settle();
      await shot(`${width}-Caja`);
      await selectRole("ADMIN");
      await settle();
    }
    await page.setViewportSize({width:1920,height:1000});
    await page.getByRole("button",{name:"Cambiar tema",exact:true}).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
    for (const name of ["Resumen","Mesas","Carta","Equipo","Configuración","Mi cuenta"]) {
      await nav(name); await shot(`1920-dark-${name}`);
    }
    await selectRole("KITCHEN");
    await shot("1920-dark-Cocina");
    await selectRole("CASHIER");
    await shot("1920-dark-Caja");
    await page.getByRole("button",{name:"Cambiar tema",exact:true}).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme","light");
    await selectRole("ADMIN");
    await page.setViewportSize({ width: 390, height: 844 });
    await nav("Carta");
    await page.getByLabel("Buscar producto", { exact: true }).fill("Agua");
    await expect(page.locator(".catalog-row")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Editar Agua mineral", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await shot("product-editor-mobile");
    await page
      .getByLabel("Nombre", { exact: true })
      .fill("Agua mineral revisada");
    await page.getByRole("button", { name: /^Variedades / }).click();
    await shot("product-varieties-mobile");
    await page.setViewportSize({width:1440,height:1000});
    await shot("product-varieties-desktop");
    await page.setViewportSize({width:390,height:844});
    await expect(
      page.getByLabel("Opción 1 de variedad 1", { exact: true }),
    ).toHaveValue("Sin gas");
    await page.getByRole("button", { name: /^Adicionales / }).click();
    await shot("product-addons-mobile");
    await page.getByRole("button", { name: "Datos", exact: true }).click();
    await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(
      "Agua mineral revisada",
    );

    const save = page.getByRole("button", {
      name: "Guardar producto",
      exact: true,
    });
    const box = await save.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    await page
      .getByLabel("Nombre", { exact: true })
      .fill("Agua mineral revisada");
    await save.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("Agua mineral revisada", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Marcar agotado: Agua mineral revisada",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Marcar disponible: Agua mineral revisada",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Categorías", exact: true })
      .click();
    await shot("categories-mobile");
    await page
      .getByRole("button", { name: "Editar categoría Bebidas", exact: true })
      .click();
    await shot("category-editor-mobile");
    await expect(page.locator(".category-manager input")).toHaveCount(1);
    await page
      .getByRole("textbox", { name: "Nombre de la categoría", exact: true })
      .fill("Bebidas frías");
    await page
      .getByRole("button", { name: "Guardar categoría", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Editar categoría Bebidas frías",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Nueva categoría", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Nombre de la categoría", exact: true })
      .fill("Especiales");
    await page
      .getByRole("button", { name: "Crear categoría", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Editar categoría Especiales",
        exact: true,
      }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", {name:"Productos",exact:true}).click();
    await page.getByRole("button", { name: "Código QR", exact: true }).click();
    await shot("qr-mobile");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await nav("Equipo");
    await page
      .getByRole("button", { name: "Editar Lucía", exact: true })
      .click();
    await shot("team-editor-mobile");
    await page
      .getByRole("button", { name: "Guardar persona", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await nav("Configuración");
    await page.getByLabel("Los mozos pueden cobrar", { exact: true }).check();
    await page
      .getByRole("button", { name: "Guardar configuración", exact: true })
      .click();
    await selectRole("KITCHEN");
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Empezar", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Marcar listo", exact: true })
      .first()
      .click();
    await shot("kitchen-updated");
    await selectRole("CASHIER");
    await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Cerrar turno", exact: true }),
    ).toBeVisible();
    await shot("cash-open");
    await page.getByRole("button", { name: /Mesa 01/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button",{name:"Cobrarlos",exact:true}).click();
    await expect(page.getByRole("dialog",{name:/Cuenta/})).toBeVisible();
    await shot("cash-account-mobile");
    await page
      .getByRole("button", { name: "Anular ítem", exact: true })
      .first()
      .click();
    const cancellation = page.getByRole("dialog").last();
    await cancellation
      .getByLabel("Motivo de anulación", { exact: true })
      .fill("Cambio solicitado por el cliente");
    await shot("cash-cancel-item");
    await cancellation
      .getByRole("button", { name: "Confirmar anulación", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByRole("dialog")).toContainText(
      "Cambio solicitado por el cliente",
    );

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Cobros", exact: true }).click();
    await shot("cash-payments");
    await page.getByRole("button", { name: "Cierres", exact: true }).click();
    await shot("cash-history");
    await page.getByRole("button", { name: /^Cuentas/ }).click();
    await page
      .getByRole("button", { name: "Cerrar turno", exact: true })
      .click();
    await shot("cash-close-with-open-tables");
    await expect(
      page.getByRole("button", {
        name: "Confirmar cierre de turno",
        exact: true,
      }),
    ).toBeEnabled();
    const openBefore = await db.tableSession.count({where:{restaurantId,closedAt:null}});
    await page.getByLabel("Efectivo contado",{exact:true}).fill("0");
    await page.getByRole("button",{name:"Confirmar cierre de turno",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Abrir caja",exact:true})).toBeVisible();
    expect(await db.tableSession.count({where:{restaurantId,closedAt:null}})).toBe(openBefore);
    await shot("cash-closed-tables-preserved");
    await page.getByRole("button",{name:"Abrir caja",exact:true}).click();
    await expect(page.getByRole("button",{name:"Cerrar turno",exact:true})).toBeVisible();
    await selectRole("ADMIN");
    await menu();
    await page
      .getByRole("button", { name: "Cambiar tema", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    for (const name of [
      "Resumen",
      "Carta",
      "Equipo",
      "Configuración",
      "Mi cuenta",
    ]) {
      await nav(name);
      await shot(`dark-${name}`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await nav("Carta");
    await page
      .getByRole("button", {
        name: "Editar Agua mineral revisada",
        exact: true,
      })
      .click();
    await shot("dark-product-editor");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await selectRole("KITCHEN");
    await shot("dark-kitchen");
    await selectRole("CASHIER");
    await shot("dark-cash");
    await menu();
    await page
      .getByRole("button", { name: "Cambiar tema", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await shot("light-restored");
    await selectRole("ADMIN");
    await nav("Resumen");
    await page.getByRole("button", { name: "Actividad", exact: true }).click();
    await shot("activity-mobile");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await nav("Carta");
    await page
      .getByRole("button", {
        name: "Editar Agua mineral revisada",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await nav("Mesas");
    await page
      .getByRole("button", { name: "Organizar mesas", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Editar Mesa 01", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Eliminar mesa", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Editar Mesa 04", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Eliminar mesa", exact: true })
      .click();
    await shot("delete-table-confirmation");
    await page
      .getByRole("button", { name: "Conservar mesa", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Eliminar mesa", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar eliminación", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Editar Mesa 04", exact: true }),
    ).toHaveCount(0);
    expect(
      (await db.diningTable.findUniqueOrThrow({ where: { id: tables[3].id } }))
        .deletedAt,
    ).not.toBeNull();
    await page.keyboard.press("Escape");
    await page.goto(`/menu/${restaurant.slug}`);
    await shot("public-menu-mobile");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/login");
    await shot("login-mobile");
    await writeFile(
      `${dir}/inventory.json`,
      JSON.stringify({ screens: inventory, errors }, null, 2),
    );
    expect(errors).toEqual([]);
    console.log(`${phase}: ${inventory.length} capturas de administración`);
  } catch(error) {
    for (const context of browser.contexts()) for (const page of context.pages()) { console.log("Failed URL", page.url()); console.log((await page.locator("body").innerText()).slice(0,1800)); await page.screenshot({path:`${dir}/failure.png`}); }
    throw error;
  } finally {
    await browser.close();
    await db.payment.deleteMany({ where: { session: { restaurantId } } });
    await db.cashShift.deleteMany({ where: { restaurantId } });
    await db.orderItem.deleteMany({
      where: { order: { session: { restaurantId } } },
    });
    await db.order.deleteMany({ where: { session: { restaurantId } } });
    await db.paymentPreparation.deleteMany({where:{session:{restaurantId}}});
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
