import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, ensure } from "./restaurant/errors";
import { Prisma } from "@/generated/prisma/client";
export function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : req.nextUrl.origin;
  ensure(origin === expected, "Origen no permitido.", 403);
  ensure(
    req.headers.get("content-type")?.includes("application/json"),
    "Se requiere JSON.",
    415,
  );
}
export async function readBody(req: NextRequest) {
  // Limita el cuerpo real, incluso cuando no hay Content-Length.
  const reader = req.body?.getReader();
  ensure(reader, "Falta el cuerpo de la solicitud.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) {
      await reader.cancel();
      throw new AppError("La solicitud es demasiado grande.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("JSON inválido.");
  }
}
export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function failure(error: unknown) {
  if (error instanceof AppError)
    return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json(
      {
        error: `Revisá los datos: ${error.issues[0]?.message ?? "formato inválido"}`,
      },
      400,
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return json(
      {
        error:
          "Ya existe un registro con esos datos. Actualizá e intentá nuevamente.",
      },
      409,
    );
  console.error(
    "Error de operación",
    error instanceof Error ? error.name : "unknown",
  );
  return json(
    { error: "No pudimos completar la operación. Intentá nuevamente." },
    500,
  );
}
