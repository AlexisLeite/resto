import { NextRequest } from "next/server";
import { endSession } from "@/lib/auth/session";
import { checkOrigin, failure, json } from "@/lib/http";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    await endSession();
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
