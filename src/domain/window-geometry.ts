import type { PhysicalPoint, PhysicalSize, PhysicalWorkArea } from "./edge-hide";

/**
 * Traffic Monitor's empty/login state is absolutely positioned and therefore
 * has no intrinsic height. Keep the native window at its configured minimum
 * so the login action cannot be clipped out of the desktop window.
 */
export function resolveTrafficOverlayHeight(measuredHeight: number, minimumHeight: number): number {
  const measured = Number.isFinite(measuredHeight) ? Math.ceil(measuredHeight) : 0;
  const minimum = Number.isFinite(minimumHeight) ? Math.ceil(minimumHeight) : 1;
  return Math.max(1, measured, minimum);
}

export function fitWindowSize(windowSize: PhysicalSize, workArea: PhysicalWorkArea): PhysicalSize {
  return {
    width: Math.min(windowSize.width, Math.max(1, workArea.size.width)),
    height: Math.min(windowSize.height, Math.max(1, workArea.size.height))
  };
}

export function clampWindowPosition(
  position: PhysicalPoint,
  windowSize: PhysicalSize,
  workArea: PhysicalWorkArea
): PhysicalPoint {
  const minX = workArea.position.x;
  const minY = workArea.position.y;
  const maxX = Math.max(minX, minX + workArea.size.width - windowSize.width);
  const maxY = Math.max(minY, minY + workArea.size.height - windowSize.height);

  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY)
  };
}
