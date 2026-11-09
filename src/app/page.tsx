import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
export default async function Home() {
  redirect((await currentUser()) ? "/dashboard" : "/login");
}
