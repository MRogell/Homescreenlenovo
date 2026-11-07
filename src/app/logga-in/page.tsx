import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getSessionUser } from "@/server/authz";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Logga in" };

export default async function Page() {
  if (await getSessionUser()) redirect("/");
  const canRegister = (await db.user.count()) === 0;
  return <LoginForm canRegister={canRegister} />;
}
