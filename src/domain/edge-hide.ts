export interface PhysicalPoint {
  x: number;
  y: number;
}

export interface PhysicalSize {
  width: number;
  height: number;
}

export interface PhysicalWorkArea {
  position: PhysicalPoint;
  size: PhysicalSize;
}

export interface EdgeHidePlacement {
  edge: "left" | "right" | "top" | "bottom";
  hiddenPosition: PhysicalPoint;
  restoredPosition: PhysicalPoint;
}

export type EdgeHideEdge = EdgeHidePlacement["edge"];

const EDGE_THRESHOLD_PX = 12;
const EDGE_TAB_PX = 14;
// Restore flush with the edge so the pointer that triggered the tab remains
// inside the expanded window. `restoredFromEdge` suppresses a second edge
// classification until the user drags away; the zero inset also prevents a
// hover/polling race from flashing the tab when the pointer is at x/y=0.
const EDGE_RESTORE_INSET_PX = 0;
export const EDGE_POINTER_BUFFER_PX = 24;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function resolveEdgeHidePlacement(
  position: PhysicalPoint,
  windowSize: PhysicalSize,
  workArea: PhysicalWorkArea
): EdgeHidePlacement | undefined {
  const left = workArea.position.x;
  const top = workArea.position.y;
  const right = left + workArea.size.width;
  const bottom = top + workArea.size.height;
  const restoredY = clamp(
    position.y,
    top + EDGE_RESTORE_INSET_PX,
    bottom - windowSize.height - EDGE_RESTORE_INSET_PX
  );
  const restoredX = clamp(
    position.x,
    left + EDGE_RESTORE_INSET_PX,
    right - windowSize.width - EDGE_RESTORE_INSET_PX
  );

  const distances = [
    {
      edge: "left" as const,
      active: position.x <= left + EDGE_THRESHOLD_PX,
      distance: Math.abs(position.x - left)
    },
    {
      edge: "right" as const,
      active: position.x + windowSize.width >= right - EDGE_THRESHOLD_PX,
      distance: Math.abs(position.x + windowSize.width - right)
    },
    {
      edge: "top" as const,
      active: position.y <= top + EDGE_THRESHOLD_PX,
      distance: Math.abs(position.y - top)
    },
    {
      edge: "bottom" as const,
      active: position.y + windowSize.height >= bottom - EDGE_THRESHOLD_PX,
      distance: Math.abs(position.y + windowSize.height - bottom)
    }
  ]
    .filter(({ active }) => active)
    .sort((first, second) => first.distance - second.distance);

  const nearest = distances[0]?.edge;

  if (nearest === "left") {
    return {
      edge: "left",
      hiddenPosition: { x: left - windowSize.width + EDGE_TAB_PX, y: restoredY },
      restoredPosition: { x: left + EDGE_RESTORE_INSET_PX, y: restoredY }
    };
  }

  if (nearest === "right") {
    return {
      edge: "right",
      hiddenPosition: { x: right - EDGE_TAB_PX, y: restoredY },
      restoredPosition: { x: right - windowSize.width - EDGE_RESTORE_INSET_PX, y: restoredY }
    };
  }

  if (nearest === "top") {
    return {
      edge: "top",
      hiddenPosition: { x: restoredX, y: top - windowSize.height + EDGE_TAB_PX },
      restoredPosition: { x: restoredX, y: top + EDGE_RESTORE_INSET_PX }
    };
  }

  if (nearest === "bottom") {
    return {
      edge: "bottom",
      hiddenPosition: { x: restoredX, y: bottom - EDGE_TAB_PX },
      restoredPosition: { x: restoredX, y: bottom - windowSize.height - EDGE_RESTORE_INSET_PX }
    };
  }

  return undefined;
}

/**
 * When the restored window is still under the pointer at a screen edge,
 * delaying the hide prevents a hide/show loop (the visible tab immediately
 * receives the same pointer and restores the window again).
 */
export function isPointerNearEdge(
  pointer: PhysicalPoint,
  workArea: PhysicalWorkArea,
  edge: EdgeHideEdge,
  buffer = EDGE_POINTER_BUFFER_PX,
  attachedWindow?: { position: PhysicalPoint; size: PhysicalSize }
) {
  const left = workArea.position.x;
  const top = workArea.position.y;
  const right = left + workArea.size.width;
  const bottom = top + workArea.size.height;

  if (attachedWindow != null) {
    const windowRight = attachedWindow.position.x + attachedWindow.size.width;
    const windowBottom = attachedWindow.position.y + attachedWindow.size.height;
    const pointerAlongWindow =
      edge === "left" || edge === "right"
        ? pointer.y >= attachedWindow.position.y - buffer && pointer.y <= windowBottom + buffer
        : pointer.x >= attachedWindow.position.x - buffer && pointer.x <= windowRight + buffer;
    if (!pointerAlongWindow) {
      return false;
    }
  }

  switch (edge) {
    case "left":
      return pointer.x <= left + buffer;
    case "right":
      return pointer.x >= right - buffer;
    case "top":
      return pointer.y <= top + buffer;
    case "bottom":
      return pointer.y >= bottom - buffer;
  }
}
