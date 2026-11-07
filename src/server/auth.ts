import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { getEnv } from "@/lib/env";

const env = getEnv();

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: (env.AUTH_TRUSTED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128, autoSignIn: true },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 120 * env.AUTH_RATE_LIMIT_SCALE,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 * env.AUTH_RATE_LIMIT_SCALE },
      "/sign-up/email": { window: 60, max: 10 * env.AUTH_RATE_LIMIT_SCALE },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Vänligt felmeddelande. Själva garantin är det unika indexet "user_single_account" i databasen.
        before: async (user) => {
          if ((await db.user.count()) > 0) throw new APIError("FORBIDDEN", { message: "Registreringen är stängd: ett konto finns redan." });
          return { data: { ...user, emailVerified: true } };
        },
      },
    },
  },
  advanced: { useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://") },
  plugins: [nextCookies()],
});
