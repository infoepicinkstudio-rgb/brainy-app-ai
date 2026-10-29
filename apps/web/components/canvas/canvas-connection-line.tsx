"use client";

import * as React from "react";
import { getBezierPath, Position, type ConnectionLineComponentProps } from "@xyflow/react";
import { getNodeAccent, ribbonSolidVar } from "@/components/canvas/node-chrome";

// Round 5, 5th follow-up (Istiyak: "While dragging also showing old style not the new
// gradient style.") — canvas-edge.tsx only styles a COMPLETED edge (`edgeTypes`); React
// Flow draws an entirely separate "connection line" while a drag-to-connect gesture is
// still in progress (before `onConnect` ever fires), via its own `connectionLineComponent`
// prop, which this codebase had never set — so that preview fell back to React Flow's
// own plain default line the whole time, explaining why it looked like "the old style"
// even after canvas-edge.tsx shipped. This mirrors canvas-edge.tsx's own gradient/dashed
// treatment so the live preview already looks like the edge it's about to become, not a
// different line that then "snaps" into the real style on release.
//
// `toNode` is null for most of the drag (nothing valid under the cursor yet) — there's
// no second accent to fade toward yet, so the line is just a flat dash in the SOURCE
// card's own color until the cursor settles over a valid target handle, at which point
// `toNode` resolves and the gradient (same as the eventual real edge) kicks in.
function CanvasConnectionLine({ fromNode, toNode, fromX, fromY, toX, toY, fromPosition, toPosition }: ConnectionLineComponentProps) {
  const sourceAccent = getNodeAccent(fromNode);
  const targetAccent = toNode ? getNodeAccent(toNode) : sourceAccent;
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition ?? Position.Right,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition ?? Position.Left,
  });

  // A single shared id is fine here (unlike canvas-edge.tsx's per-edge id) — only ONE
  // connection can ever be mid-drag at a time.
  const gradientId = "canvas-connection-line-gradient";

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={fromX} y1={fromY} x2={toX} y2={toY}>
          <stop offset="0%" stopColor={ribbonSolidVar(sourceAccent)} />
          <stop offset="100%" stopColor={ribbonSolidVar(targetAccent)} />
        </linearGradient>
      </defs>
      <path fill="none" stroke={`url(#${gradientId})`} strokeWidth={2} strokeDasharray="6 4" d={path} />
    </g>
  );
}

export default CanvasConnectionLine;
