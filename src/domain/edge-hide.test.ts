import { describe, expect, it } from "vitest";
import { isPointerNearEdge, resolveEdgeHidePlacement } from "./edge-hide";
import { clampWindowPosition, fitWindowSize } from "./window-geometry";

const workArea = {
  position: { x: 0, y: 0 },
  size: { width: 1920, height: 1040 }
};

const windowSize = { width: 256, height: 122 };

describe("Edge Hide placement", () => {
  it("leaves a visible left edge tab and restores under the triggering pointer", () => {
    const placement = resolveEdgeHidePlacement({ x: 10, y: 400 }, windowSize, workArea);
    expect(placement).toEqual({
      edge: "left",
      hiddenPosition: { x: -242, y: 400 },
      restoredPosition: { x: 0, y: 400 }
    });
    expect(resolveEdgeHidePlacement(placement!.restoredPosition, windowSize, workArea)?.edge).toBe("left");
  });

  it("leaves a visible right edge tab and restores under the triggering pointer", () => {
    const placement = resolveEdgeHidePlacement({ x: 1655, y: 1000 }, windowSize, workArea);
    expect(placement).toEqual({
      edge: "right",
      hiddenPosition: { x: 1906, y: 918 },
      restoredPosition: { x: 1664, y: 918 }
    });
    expect(resolveEdgeHidePlacement(placement!.restoredPosition, windowSize, workArea)?.edge).toBe("right");
  });

  it("supports top and bottom edge tabs with clamped horizontal positions", () => {
    const top = resolveEdgeHidePlacement({ x: 900, y: 4 }, windowSize, workArea);
    expect(top).toEqual({
      edge: "top",
      hiddenPosition: { x: 900, y: -108 },
      restoredPosition: { x: 900, y: 0 }
    });
    expect(resolveEdgeHidePlacement(top!.restoredPosition, windowSize, workArea)?.edge).toBe("top");
    const bottom = resolveEdgeHidePlacement({ x: 900, y: 1000 }, windowSize, workArea);
    expect(bottom).toEqual({
      edge: "bottom",
      hiddenPosition: { x: 900, y: 1026 },
      restoredPosition: { x: 900, y: 918 }
    });
    expect(resolveEdgeHidePlacement(bottom!.restoredPosition, windowSize, workArea)?.edge).toBe("bottom");
  });

  it("clamps an expanded settings window fully inside the display work area", () => {
    expect(clampWindowPosition({ x: 1906, y: 918 }, { width: 400, height: 460 }, workArea)).toEqual({
      x: 1520,
      y: 580
    });
  });

  it("shrinks an expanded window before clamping when the work area is smaller", () => {
    const smallWorkArea = {
      position: { x: 0, y: 0 },
      size: { width: 360, height: 300 }
    };
    const fitted = fitWindowSize({ width: 400, height: 460 }, smallWorkArea);
    expect(fitted).toEqual({ width: 360, height: 300 });
    expect(clampWindowPosition({ x: 120, y: 80 }, fitted, smallWorkArea)).toEqual({ x: 0, y: 0 });
  });

  it("does not hide a window that is merely moved within the work area", () => {
    expect(resolveEdgeHidePlacement({ x: 300, y: 300 }, windowSize, workArea)).toBeUndefined();
  });

  it("keeps the restored window visible while the pointer is in the edge corridor", () => {
    expect(isPointerNearEdge({ x: 20, y: 500 }, workArea, "left")).toBe(true);
    expect(isPointerNearEdge({ x: 25, y: 500 }, workArea, "left")).toBe(false);
    expect(isPointerNearEdge({ x: 1905, y: 500 }, workArea, "right")).toBe(true);
    expect(isPointerNearEdge({ x: 1890, y: 500 }, workArea, "right")).toBe(false);
    expect(isPointerNearEdge({ x: 500, y: 10 }, workArea, "top")).toBe(true);
    expect(isPointerNearEdge({ x: 500, y: 1030 }, workArea, "bottom")).toBe(true);
    expect(
      isPointerNearEdge(
        { x: 10, y: 10 },
        workArea,
        "left",
        undefined,
        { position: { x: 0, y: 400 }, size: windowSize }
      )
    ).toBe(false);
  });
});
