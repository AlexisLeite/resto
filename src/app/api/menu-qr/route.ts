import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/database/db";
import { failure } from "@/lib/http";
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const restaurant = await getDb().restaurant.findUniqueOrThrow({
      where: { id: user.restaurantId },
    });
    const origin = process.env.APP_URL ?? req.nextUrl.origin;
    const svg = await QRCode.toString(
      new URL(`/menu/${restaurant.slug}`, origin).href,
      { type: "svg", errorCorrectionLevel: "M", margin: 4 },
    );
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store",
        "Content-Disposition": 'inline; filename="resto-carta.svg"',
      },
    });
  } catch (error) {
    return failure(error);
  }
}
