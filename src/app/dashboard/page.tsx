import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { getSnapshot } from "@/lib/restaurant/queries";
import { Dashboard } from "@/components/dashboard";
export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <Dashboard initial={await getSnapshot(user)} />;
}
