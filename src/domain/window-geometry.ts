import type { PhysicalPoint, PhysicalSize, PhysicalWorkArea } from "./edge-hide";

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
