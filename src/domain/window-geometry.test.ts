import { describe, expect, it } from "vitest";
import { resolveTrafficOverlayHeight } from "./window-geometry";

describe("resolveTrafficOverlayHeight", () => {
  it("keeps an empty traffic overlay tall enough for the login action", () => {
    expect(resolveTrafficOverlayHeight(29, 116)).toBe(116);
  });

  it("preserves measured height when content is taller than the minimum", () => {
    expect(resolveTrafficOverlayHeight(132, 116)).toBe(132);
  });

  it("falls back to a positive minimum for invalid measurements", () => {
    expect(resolveTrafficOverlayHeight(Number.NaN, 84)).toBe(84);
  });
});
