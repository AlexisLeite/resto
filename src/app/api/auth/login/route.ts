import { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/database/db";
import { verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { checkOrigin, failure, json, readBody } from "@/lib/http";
import { ensure } from "@/lib/restaurant/errors";

export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const data = z
      .object({
        username: z.string().trim().toLowerCase().min(1).max(40),
        password: z.string().min(1).max(128),
      })
      .parse(await readBody(req));
    const db = getDb();
    const user = await db.user.findUnique({
      where: { username: data.username },
    });
    ensure(
      !user?.lockedUntil || user.lockedUntil < new Date(),
      "Demasiados intentos. Esperá 15 minutos.",
      429,
    );
    const valid = await verifyPassword(
      data.password,
      user?.passwordHash ?? `${"0".repeat(32)}:${"0".repeat(128)}`,
    );
    if (!user?.active || !valid) {
      if (user) {
        const updated = await db.user.update({
          where: { id: user.id },
          data: { failedAttempts: { increment: 1 } },
        });
        if (updated.failedAttempts >= 5)
          await db.user.update({
            where: { id: user.id },
            data: {
              lockedUntil: new Date(Date.now() + 900000),
              failedAttempts: 0,
            },
          });
      }
      ensure(false, "Usuario o contraseña incorrectos.", 401);
    }
    await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
    await startSession(user.id);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
