import "dotenv/config";
import { createDatabaseClient } from "../src/lib/database/client";
import { demoImages } from "../src/lib/restaurant/demo-images";
const db = createDatabaseClient();
async function main() {
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { slug: "resto-demo" },
  });
  for (const [name, imageUrl] of Object.entries(demoImages))
    await db.product.updateMany({
      where: { restaurantId: restaurant.id, name, imageUrl: "" },
      data: { imageUrl },
    });
  console.log("Imágenes del demo asignadas.");
}
main().finally(() => db.$disconnect());
