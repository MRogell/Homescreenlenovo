import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Sessionen utan omdirigering. */
export const getSessionUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
});

/** Inloggad användare eller omdirigering till inloggning. Kontrolleras alltid på servern. */
export const requireUser = cache(async () => {
  const user = await getSessionUser();
  if (!user) redirect("/logga-in");
  return user;
});
