import { getDb } from "@/lib/database/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Comprueba conexión y migración sin exponer datos del restaurante.
    await getDb().restaurant.findFirst({ select: { id: true } });
    return Response.json(
      { status: "ok" },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
