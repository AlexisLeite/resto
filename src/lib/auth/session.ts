import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/lib/database/db";
import { assignedRoles, type Role } from "@/lib/restaurant/shared";
import { AppError } from "@/lib/restaurant/errors";
const cookieName = "resto_session";
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export type Actor = {
  id: string;
  name: string;
  role: Role;
  roles: Role[];
  restaurantId: string;
  username: string;
  sessionHash?: string;
};
export async function currentUser(): Promise<Actor | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const session = await getDb().authSession.findUnique({
    where: { tokenHash: digest(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active)
    return null;
  const { id, name, restaurantId, username } = session.user;
  const roles = assignedRoles(session.user);
  if (!roles.includes(session.activeRole)) return null;
  return {
    id,
    name,
    role: session.activeRole,
    roles,
    restaurantId,
    username,
    sessionHash: session.tokenHash,
  };
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AppError("Tu sesión venció. Volvé a ingresar.", 401);
  return user;
}
export async function startSession(userId: string) {
  await endSession();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const user = await getDb().user.findUniqueOrThrow({ where: { id: userId } });
  await getDb().authSession.create({
    data: {
      tokenHash: digest(token),
      userId,
      expiresAt,
      activeRole: user.role,
    },
  });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    // La instalación actual funciona por HTTP sobre Tailscale. HTTPS activa Secure.
    secure: process.env.APP_URL?.startsWith("https://") ?? false,
  });
}
export async function endSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token)
    await getDb().authSession.deleteMany({
      where: { tokenHash: digest(token) },
    });
  jar.delete(cookieName);
}
