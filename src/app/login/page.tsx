import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
export default async function Login() {
  if (await currentUser()) redirect("/dashboard");
  return <LoginForm />;
}
