import { describe, expect, it } from "vitest";
import { viewport } from "./layout";

describe("viewport", () => {
  it("does not allow zoom and covers the Dynamic Island area", () => {
    expect(viewport).toMatchObject({ width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover" });
  });
});
