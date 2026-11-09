import { defineConfig } from "vitest/config";
import path from "node:path";
import { TEST_DATABASE_URL } from "./test/test-env";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-123456",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
      SONOS_CLIENT_ID: "sonos-id",
      SONOS_CLIENT_SECRET: "sonos-secret",
      SPOTIFY_CLIENT_ID: "spotify-id",
      SPOTIFY_CLIENT_SECRET: "spotify-secret",
    },
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
