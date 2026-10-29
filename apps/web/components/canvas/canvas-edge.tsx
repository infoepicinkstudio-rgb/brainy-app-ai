"use client";

import * as React from "react";
import { BaseEdge, getBezierPath, useInternalNode, type EdgeProps } from "@xyflow/react";
import { getNodeAccent, ribbonSolidVar } from "@/components/canvas/node-chrome";

// Round 5 (new) — Istiyak, reference screenshot (several source cards converging on one
// chat node, each with a color-matched dot and a dashed line that fades from that dot's
// color toward the target): "Connector streaming lines should be gradient and should
// adapt like from card to card." The old line (page.tsx's DEFAULT_EDGE_OPTIONS) was a
// single flat `var(--color-text-muted)` stroke on every edge regardless of what it
// connected — reads as plumbing, not as "this card feeds that one." This edge instead
// reads BOTH endpoints' own accent color (the same `getNodeAccent` node-chrome.tsx's
// handle dots already use, so a line's two ends visually match the two dots it's
// actually touching) and fades the stroke from one into the other along its own path,
// dashed to read as "flowing" rather than a rigid structural connector.
//
// Registered as the "default" edge type (page.tsx's `edgeTypes`), not a new `type` value
// on the edge data itself — every edge, loaded from the server or freshly drag-connected
// via onConnect, already resolves to React Flow's built-in "default" (bezier) edge type
// when `edge.type` is unset, so overriding that ONE key swaps every edge over to this
// component with no board-store/API/data-shape change at all. Only how an edge is
// painted changed, not what an edge IS.
//
// Each node's accent is looked up LIVE via `useInternalNode` (not baked into edge data
// at connect-time) — the same two IDs this edge already carries (`source`/`target`) are
// enough, and this stays correct even if a node's own accent-determining field changes
// later (e.g. a video node's `platform`) without needing to touch every edge that
// happens to reference it.
function CanvasEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
}: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const sourceAccent = getNodeAccent(sourceNode);
  const targetAccent = getNodeAccent(targetNode);
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  // Unique per edge (not per accent pair) — two edges between the same two accent
  // colors would otherwise collide on one shared gradient/marker id, and an SVG
  // `<defs>` id has to be document-unique regardless of what it's defining.
  const gradientId = `canvas-edge-gradient-${id}`;
  const markerId = `canvas-edge-marker-${id}`;
  const sourceColorVar = ribbonSolidVar(sourceAccent);
  const targetColorVar = ribbonSolidVar(targetAccent);

  return (
    <>
      {/* `gradientUnits="userSpaceOnUse"` + the raw sourceX/Y–targetX/Y coordinates (NOT
          the default "objectBoundingBox") — this is a 0×0 <svg>, not a shape with its
          own bounding box, so the gradient has to be told the actual canvas-space line
          it's painted along directly. The arrowhead marker's own fill is the TARGET's
          color (not a flat gray) — it sits at the line's target end, where the gradient
          has already faded to that same color, so the two read as one continuous shape
          rather than a recolored line meeting a mismatched old gray arrow.
          Round 5 follow-up (Istiyak, reference screenshot: a thin open chevron, not a
          solid wedge): was a FILLED triangle (`fill`, closed path) — visually heavier
          than the thin dashed line feeding it, where the reference's arrow reads as the
          same stroke weight continuing into an open ">" shape. Redrawn as an unfilled,
          stroked two-segment path instead (`fill="none"`, `stroke`+`strokeWidth`,
          rounded joins/caps so the point doesn't look clipped). */}
      <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
            <stop offset="0%" stopColor={sourceColorVar} />
            <stop offset="100%" stopColor={targetColorVar} />
          </linearGradient>
          {/* Round 5, 5th follow-up (Istiyak, cropped reference: the chevron reads bulkier
              than the dot it's meeting) — shrunk from 8x8/strokeWidth 2 to 6x6/1.5 so the
              arrow reads as a thin continuation of the dashed line into the now-13px dot,
              not a separate, heavier mark bolted onto it. */}
          <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path
              d="M 1 1 L 8 5 L 1 9"
              fill="none"
              stroke={targetColorVar}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        </defs>
      </svg>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${markerId})`}
        style={{ ...style, stroke: `url(#${gradientId})`, strokeWidth: 2, strokeDasharray: "6 4" }}
      />
    </>
  );
}

export default CanvasEdge;
