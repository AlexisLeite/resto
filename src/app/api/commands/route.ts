import { ensure } from "@/lib/restaurant/errors";
import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/database/db";
import { executeCommand } from "@/lib/restaurant/commands";
import { checkOrigin, failure, json, readBody } from "@/lib/http";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const actor = await requireUser();
    const expectedRole = req.headers.get("x-resto-role");
    ensure(
      !expectedRole || expectedRole === actor.role,
      "El rol activo cambió. Revisá la pantalla antes de continuar.",
      409,
    );
    return json(await executeCommand(getDb(), actor, await readBody(req)));
  } catch (error) {
    return failure(error);
  }
}
