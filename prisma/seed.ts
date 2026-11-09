import "dotenv/config";
import { demoImages } from "../src/lib/restaurant/demo-images";
import { randomBytes } from "node:crypto";
import { mkdir, appendFile, chmod } from "node:fs/promises";
import { createDatabaseClient } from "../src/lib/database/client";
import { hashPassword } from "../src/lib/auth/password";
const sampleVarieties: Record<string, Record<string, string[]>> = {
  "Bastones de muzzarella": { Salsa: ["Tomate", "Alioli", "Sin salsa"] },
  "Papas rústicas": {
    Condimento: ["Hierbas", "Pimentón", "Solo sal", "Sin sal"],
  },
  "Hamburguesa de la casa": {
    "Punto de cocción": ["A punto", "Bien cocida"],
    Pan: ["Clásico", "Con sésamo"],
  },
  "Milanesa napolitana": {
    Línea: ["Carne", "Pollo"],
    Guarnición: ["Papas fritas", "Ensalada"],
  },
  "Ensalada de estación": {
    Aderezo: ["Aceite y limón", "Vinagreta", "Sin aderezo"],
  },
  "Flan casero": {
    Presentación: ["Con dulce de leche", "Con crema", "Mixto", "Solo"],
  },
  Brownie: {
    Presentación: ["Tibio", "A temperatura ambiente"],
    Helado: ["Vainilla", "Chocolate"],
  },
  Limonada: {
    Línea: ["Clásica", "Menta y jengibre"],
    Endulzado: ["Azúcar", "Edulcorante", "Sin endulzar"],
  },
  "Agua mineral": { Línea: ["Sin gas", "Con gas"] },
  Café: { Presentación: ["Espresso", "Americano"], Tamaño: ["Corto", "Largo"] },
};
const db = createDatabaseClient();
async function main() {
  const restaurant = await db.restaurant.upsert({
    where: { slug: "resto-demo" },
    update: {},
    create: { slug: "resto-demo", name: "Resto · Cocina de barrio" },
  });
  await mkdir(".local", { recursive: true, mode: 0o700 });
  for (const [username, name, role] of [
    ["admin", "Administración", "ADMIN"],
    ["mozo", "Equipo de salón", "WAITER"],
    ["cocina", "Equipo de cocina", "KITCHEN"],
    ["caja", "Equipo de caja", "CASHIER"],
  ] as const) {
    if (await db.user.findUnique({ where: { username } })) continue;
    const password = randomBytes(12).toString("base64url");
    await db.user.create({
      data: {
        restaurantId: restaurant.id,
        username,
        name,
        role,
        roles:
          role === "ADMIN" ? ["ADMIN", "WAITER", "KITCHEN", "CASHIER"] : [role],
        passwordHash: await hashPassword(password),
      },
    });
    await appendFile(".local/access.txt", `${username}: ${password}\n`, {
      mode: 0o600,
    });
    await chmod(".local/access.txt", 0o600);
  }
  for (let n = 1; n <= 8; n++) {
    const name = `Mesa ${String(n).padStart(2, "0")}`;
    const existing = await db.diningTable.findFirst({
      where: { restaurantId: restaurant.id, name },
    });
    if (!existing)
      await db.diningTable.create({
        data: { restaurantId: restaurant.id, name, seats: n <= 4 ? 4 : 2 },
      });
  }
  for (const name of ["Entradas", "Principales", "Postres", "Bebidas"]) {
    const category = await db.category.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name } },
      update: {},
      create: { restaurantId: restaurant.id, name },
    });
    const menu = {
      Entradas: [
        ["Bastones de muzzarella", "Con salsa de tomate casera", "290"],
        ["Papas rústicas", "Papas al horno con hierbas", "220"],
      ],
      Principales: [
        [
          "Hamburguesa de la casa",
          "Carne, cheddar, lechuga y tomate. Con papas",
          "480",
        ],
        ["Milanesa napolitana", "Con papas fritas y ensalada", "550"],
        ["Ensalada de estación", "Hojas verdes, vegetales y semillas", "360"],
      ],
      Postres: [
        ["Flan casero", "Con dulce de leche", "190"],
        ["Brownie", "Chocolate y helado de vainilla", "250"],
      ],
      Bebidas: [
        ["Limonada", "Limón, menta y jengibre", "160"],
        ["Agua mineral", "Botella de 500 ml", "110"],
        ["Café", "Espresso o americano", "130"],
      ],
    }[name]!;
    for (const [productName, description, price] of menu) {
      const varieties = Object.entries(sampleVarieties[productName]).map(
        ([name, options], i) => ({
          id: `variety-${i + 1}`,
          name,
          options: options.map((name, j) => ({ id: `option-${j + 1}`, name })),
        }),
      );
      const existing = await db.product.findFirst({
        where: { restaurantId: restaurant.id, name: productName },
      });
      if (existing) {
        if (!existing.imageUrl) await db.product.update({ where: { id: existing.id }, data: { imageUrl: demoImages[productName] ?? "" } });
        if (Array.isArray(existing.varieties) && !existing.varieties.length)
          await db.product.update({
            where: { id: existing.id },
            data: { varieties },
          });
        continue;
      }
      await db.product.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: category.id,
          name: productName,
          imageUrl: demoImages[productName] ?? "",
          description,
          price,
          varieties,
          station: name === "Bebidas" ? "BAR" : "KITCHEN",
          addons:
            name === "Principales"
              ? [
                  {
                    id: "extra-cheddar",
                    name: "Extra cheddar",
                    price: "50.00",
                  },
                  { id: "extra-huevo", name: "Huevo", price: "40.00" },
                ]
              : [],
        },
      });
    }
  }
  console.log(
    "Ejemplo listo: 8 mesas, carta y 4 roles. Credenciales nuevas en .local/access.txt (fuera de Git).",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
