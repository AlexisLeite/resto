import { requireUser } from "@/lib/auth/session";
import { getSnapshot } from "@/lib/restaurant/queries";
import { failure, json } from "@/lib/http";
export async function GET() {
  try {
    return json(await getSnapshot(await requireUser()));
  } catch (error) {
    return failure(error);
  }
}
