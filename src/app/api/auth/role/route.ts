import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/database/db";
import { assignedRoles } from "@/lib/restaurant/shared";
import { getSnapshot } from "@/lib/restaurant/queries";
import { ensure } from "@/lib/restaurant/errors";
import { checkOrigin, failure, json, readBody } from "@/lib/http";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const { role } = z
      .object({ role: z.enum(["ADMIN", "WAITER", "KITCHEN", "CASHIER"]) })
      .parse(await readBody(req));
    const actor = await requireUser();
    await getDb().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
      const session = await tx.authSession.findUnique({
        where: { tokenHash: actor.sessionHash! },
        include: { user: true },
      });
      ensure(
        session && session.expiresAt > new Date() && session.user.active,
        "Tu sesión venció. Volvé a ingresar.",
        401,
      );
      ensure(
        assignedRoles(session.user).includes(role),
        "No tenés asignado ese rol.",
        403,
      );
      if (session.activeRole === role) return;
      await tx.authSession.update({
        where: { tokenHash: session.tokenHash },
        data: { activeRole: role },
      });
      await tx.auditEvent.create({
        data: {
          restaurantId: actor.restaurantId,
          actorId: actor.id,
          actorName: actor.name,
          action: "role.switch",
          detail: `${session.activeRole} → ${role}`,
        },
      });
    });
    return json(await getSnapshot(await requireUser()));
  } catch (error) {
    return failure(error);
  }
}
