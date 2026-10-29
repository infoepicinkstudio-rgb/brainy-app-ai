"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  SelectionMode,
  useReactFlow,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  type OnNodeDrag,
  type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Type, Link2, FileUp, Bot, Cpu, Gem, Undo2, Redo2, Plus, Minus, Maximize2, Compass } from "lucide-react";
import { useBoardStore, RF_GROUP_TYPE, type ChatNodeData } from "@/stores/board-store";
import { useToastStore } from "@/stores/toast-store";
import { useSettingsStore } from "@/stores/settings-store";
import { TextNode } from "@/components/canvas/text-node";
import { FileNode } from "@/components/canvas/file-node";
import { LinkNode } from "@/components/canvas/link-node";
import { VideoNode } from "@/components/canvas/video-node";
import { AudioNode } from "@/components/canvas/audio-node";
import { GroupNode } from "@/components/canvas/group-node";
import { ChatNode } from "@/components/canvas/chat-node";
import { MindmapNode } from "@/components/canvas/mindmap-node";
import CanvasEdge from "@/components/canvas/canvas-edge";
import CanvasConnectionLine from "@/components/canvas/canvas-connection-line";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { OutliersPanel } from "@/components/canvas/outliers-panel";
import { Button } from "@/components/ui/button";
import { ToastHost } from "@/components/ui/toast-host";

// TF-03 — React Flow canvas mount (implementation_plan.md Phase 2 step 4). The
// board-store (ADR-0012) owns nodes/edges/autosave; this file is just the view.

const nodeTypes: NodeTypes = {
  text: TextNode,
  file: FileNode,
  link: LinkNode,
  video: VideoNode,
  audio: AudioNode,
  chat: ChatNode,
  mindmap: MindmapNode,
  [RF_GROUP_TYPE]: GroupNode,
};

// Round 5 (new) — Istiyak: "Connector streaming lines should be gradient and should
// adapt like from card to card." Registered under React Flow's own built-in "default"
// key, NOT a new custom `type` string: every edge (loaded from the server or freshly
// drag-connected) already resolves to "default" whenever `edge.type` is unset, which is
// every edge today (nothing in board-store.ts ever sets one) — overriding this one key
// swaps every edge's RENDERING over to canvas-edge.tsx with no data-shape or API change
// anywhere. See that file for how it reads each endpoint's own accent color.
const edgeTypes: EdgeTypes = {
  default: CanvasEdge,
};

// Phase 4 — one toolbar button per provider's chat node. Icon/label duplicated from
// chat-node.tsx's own PROVIDER_ICONS/PROVIDER_LABELS rather than imported — these are
// two different UI surfaces (a toolbar glyph vs. a card header) that happen to agree
// today, not one shared concept that must always stay in lockstep.
const CHAT_PROVIDERS: Array<{ provider: ChatNodeData["provider"]; label: string; icon: React.ElementType }> = [
  { provider: "claude", label: "Add Claude chat", icon: Bot },
  { provider: "openai", label: "Add OpenAI chat", icon: Cpu },
  { provider: "gemini", label: "Add Gemini chat", icon: Gem },
];

// Grouping (Phase 3) — padding around the selected members' combined bounding box when
// Ctrl+G computes a new group's frame (handleGroupShortcut below). Purely cosmetic
// breathing room, not a layout constraint React Flow enforces itself.
const GROUP_PADDING = 48;

// Node-card-overhaul pass (ADR-0065/ADR-0066): minZoom/maxZoom and fitView's own cap
// are tuned against the SMALLER card footprint (node-chrome.tsx, w-56 not w-64) — fit
// is capped at 100% so a board with only one or two small nodes doesn't zoom in past
// their natural size, and padding gives real breathing room around the default view.
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const FIT_VIEW_OPTIONS = { padding: 0.4, maxZoom: 1 };

// BUG-011: React Flow's own stylesheet applies `fill: currentColor` to every
// `.react-flow__controls-button svg` — tuned for its own solid-glyph icons (Plus/
// Minus/FitView), which have no `fill` attribute of their own to conflict with. Lucide
// icons are stroke-based (`fill="none" stroke="currentColor"`), so that blanket rule
// was overriding `fill="none"` on every custom control button we added, rendering them
// as solid filled blobs instead of clean line icons. A plain Tailwind className can't
// win here — `.react-flow__controls-button svg` is a class+element compound selector,
// more specific than a single utility class — so this uses an inline `style` (highest
// specificity short of `!important`) instead, on every custom icon in this cluster.
const CONTROL_ICON_STYLE: React.CSSProperties = { fill: "none" };

export default function BoardCanvasPage() {
  // useParams() is only resolvable at request time, which next.config.ts's
  // cacheComponents option (Phase 0 scaffolding) requires a Suspense boundary
  // around — there's nothing meaningful to prerender for a per-board canvas
  // anyway, since every board's nodes/edges come from the Fastify backend at
  // runtime, not from anything Next could bake in at build time.
  return (
    <React.Suspense fallback={<main className="flex flex-1" aria-busy="true" />}>
      <BoardCanvasRoute />
    </React.Suspense>
  );
}

function BoardCanvasRoute() {
  const params = useParams<{ id: string }>();
  return (
    <ReactFlowProvider>
      <CanvasShell boardId={params.id} />
    </ReactFlowProvider>
  );
}

function CanvasShell({ boardId }: { boardId: string }) {
  const {
    nodes,
    edges,
    loaded,
    loadError,
    loadBoard,
    onNodesChange,
    onEdgesChange,
    connectNodes,
    saveNodePosition,
    reparentNode,
    addTextNode,
    addLinkNode,
    addFileNode,
    addChatNode,
    addVideoNodeFromUrl,
    groupSelectedNodes,
    ungroupNode,
    duplicateSelection,
    copySelection,
    pasteClipboard,
    hasClipboardContent,
    deselectAllNodes,
    undo,
    redo,
  } = useBoardStore();
  const canUndo = useBoardStore((state) => state.past.length > 0);
  const canRedo = useBoardStore((state) => state.future.length > 0);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView, getNodes, getIntersectingNodes, getViewport, setViewport } =
    useReactFlow();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Round 1 bug #6 (Istiyak: "Trackpad zoom/pan blocked when mouse is over a card") —
  // card content that needs its own scroll (a text card's body, a chat's message list)
  // is wrapped in React Flow's own "nowheel" class so a two-finger scroll there moves
  // that content instead of the whole canvas — correct, and not what was reported
  // broken. But @xyflow/react's own pane-level wheel handler (confirmed via its
  // compiled source — createPanOnScrollHandler/createZoomOnScrollHandler in
  // @xyflow/system) treats "nowheel" as a blanket switch: it ALSO swallows PINCH-zoom
  // (ctrlKey+wheel, how every browser reports a trackpad pinch) over that same region,
  // with nothing underneath to catch it — so pinching while the cursor sits over a
  // card's text or chat body does nothing at all: no canvas zoom, and no page zoom
  // either (that part's deliberately prevented by the library itself). There's no
  // built-in option in this version to exempt pinch from "nowheel", so this
  // reimplements just the pinch case by hand — using the same cursor-anchored zoom
  // math React Flow's own pinch handler uses internally (confirmed against its
  // source) — and only steps in when the wheel event actually originated inside a
  // "nowheel" region. Everywhere else on the canvas, React Flow's existing pinch/pan
  // handling is untouched, so plain two-finger scroll still scrolls card content
  // exactly as before.
  const canvasWrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const wrapperEl = canvasWrapperRef.current;
    if (!wrapperEl) return;
    // Re-bound with an explicit non-null type: handleWheel below is a closure invoked
    // later by addEventListener, and TS doesn't carry a null-check's narrowing across
    // a function boundary like that — it would otherwise still see `el` as possibly
    // null inside handleWheel despite the guard immediately above.
    const el: HTMLDivElement = wrapperEl;

    const isMacOs = typeof navigator !== "undefined" && navigator.userAgent.indexOf("Mac") >= 0;

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey) return; // plain two-finger scroll — leave nowheel's local-scroll behavior exactly as today

      // Round 1 bug #6 follow-up (Istiyak: after the fix above, pinching over the
      // Outliers panel or the navbar zoomed the actual BROWSER PAGE instead — the
      // panel got cut off and the profile menu vanished, both pushed past the
      // now-zoomed viewport). Root cause: the Outliers panel and the navbar are
      // rendered OUTSIDE React Flow's own DOM tree entirely (siblings of it, not
      // descendants — see page.tsx's <main>/OutliersPanel and layout.tsx's
      // <Navbar>/{children}), so a pinch there never reached ANY handler that calls
      // preventDefault — not React Flow's own (it only ever sees events that land
      // inside its pane), and not the handler below either, since that was only
      // attached to the canvas wrapper. Listening on `document` instead closes that
      // gap: every ctrlKey+wheel (pinch) anywhere on this page has its native
      // page-zoom suppressed unconditionally, before deciding whether there's
      // anything to hand-zoom.
      event.preventDefault();

      const target = event.target as HTMLElement | null;
      if (!target?.closest(".nowheel")) return; // not a nowheel region — React Flow's own pinch handling already covers plain canvas/cards; nothing to hand-zoom when pinching over the Outliers panel or navbar, so preventDefault above is all that's needed there

      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;

      // Same formula @xyflow/system's own wheelDelta uses — a trackpad pinch reports a
      // much smaller deltaY per pinch-amount on macOS than on Windows, hence the 10x.
      const factor = isMacOs ? 10 : 1;
      const pinchDelta = -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002) * factor;

      const { x, y, zoom } = getViewport();
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.pow(2, pinchDelta)));
      const ratio = nextZoom / zoom;
      // Keeps the flow-space point under the cursor fixed on screen through the zoom
      // change — the standard "zoom toward cursor" formula, same effect as d3-zoom's
      // own scaleTo(selection, k, point) that the library uses for every other pinch.
      void setViewport({
        x: px - (px - x) * ratio,
        y: py - (py - y) * ratio,
        zoom: nextZoom,
      });
    }

    // Attached to `document`, not `el` — see handleWheel's own comment above for why
    // the canvas wrapper alone isn't enough to catch every pinch on this page.
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, [getViewport, setViewport]);

  // Phase 4 — gates the three chat-provider toolbar buttons below by the same
  // `isConfigured()` the backend itself checks at send time (chat.ts), so a button
  // is never clickable here only to have the very first send fail for lack of a key.
  // Settings is the only other place this loads today, so a board opened directly
  // (no prior Settings visit this session) needs its own load, same pattern as there.
  const providers = useSettingsStore((state) => state.providers);
  const providersLoaded = useSettingsStore((state) => state.providersLoaded);
  const loadProviders = useSettingsStore((state) => state.loadProviders);
  React.useEffect(() => {
    if (!providersLoaded) loadProviders();
  }, [providersLoaded, loadProviders]);
  // error-handling-conventions.md: data-mutating actions disable their control for the
  // duration of the in-flight request — a file upload (saves a file + creates a node)
  // qualifies, and without this a second click while one upload is still running could
  // kick off a concurrent second upload.
  const [isUploading, setIsUploading] = React.useState(false);
  // Phase 6 (F-15/TF-09) — the Outliers panel is a floating overlay, not a route of
  // its own (quick-add needs to create a node on THIS board, which only makes sense
  // while the canvas it's adding to is actually mounted).
  const [isOutliersOpen, setIsOutliersOpen] = React.useState(false);
  // Keyed by node id, populated on drag start and read on drag stop — lets a drag's
  // undo entry record where the node actually came FROM, not just where it ended up
  // (board-store.ts's `saveNodePosition`, ADR-0066).
  const dragStartPositions = React.useRef<Map<string, { x: number; y: number }>>(new Map());

  React.useEffect(() => {
    loadBoard(boardId);
  }, [boardId, loadBoard]);

  const centerPosition = React.useCallback(() => {
    // Drop new nodes near the middle of the viewport, not always stacked at (0,0).
    const viewportCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return screenToFlowPosition(viewportCenter);
  }, [screenToFlowPosition]);

  const handleNodeDragStart: OnNodeDrag<Node> = React.useCallback((_event, node) => {
    dragStartPositions.current.set(node.id, { ...node.position });
  }, []);

  // BUG (Phase 3 testing, Istiyak: "if want to remove selection on canvas click does
  // not work" — and, same root cause, a link card's URL field "stays as input" after
  // clicking the canvas instead of converting back to its preview): `panOnDrag`
  // includes the left button (ADR-0080, above), so React Flow's own pan/zoom gesture
  // handling owns a plain click on the pane — in practice that swallows the browser's
  // normal "focus moves elsewhere → blur fires" behavior for whatever was focused
  // inside a card (an in-progress edit), and nothing here was forcing a deselect either.
  // `onPaneClick` fires for a genuine click (no/near-zero drag distance) regardless of
  // that pan config, so both are handled explicitly here instead of relying on
  // behavior the pan gesture was quietly eating. Deselecting goes through the STORE
  // (`deselectAllNodes`), not React Flow's own `useReactFlow().setNodes` — this board's
  // `nodes` are controlled externally from board-store.ts, so a call to RF's internal
  // setter here would just be overwritten by the next render of the controlled prop.
  const handlePaneClick = React.useCallback(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    deselectAllNodes();
  }, [deselectAllNodes]);

  // TF-06 — rejects a self-loop WHILE dragging (React Flow shows its own "not allowed"
  // cursor/connection-line styling for a connection this returns false for), not just
  // after the drop — connectNodes also guards this server-side/in the store, but
  // catching it live here means a drag back onto the same card never even looks like it
  // might succeed. Duplicate-edge rejection is NOT duplicated here on purpose: that one
  // depends on the current edges list and is already handled in one place
  // (connectNodes) rather than kept in sync across two.
  const isValidConnection: IsValidConnection = React.useCallback(
    (connection) => connection.source !== connection.target,
    []
  );

  // Round 1 bug #2 — a plain drag that lands a node inside/outside a group's frame
  // joins/leaves that group. Uses React Flow's own getIntersectingNodes (the same
  // mechanism its own grouping examples use) rather than hand-rolled bounding-box math.
  // A member's `node.position` is relative to its parent (React Flow's convention), so
  // this converts to/from absolute canvas coordinates explicitly wherever needed.
  const handleGroupMembershipAfterDrag = React.useCallback(
    (node: Node) => {
      if (node.type === RF_GROUP_TYPE) return; // no nesting a group into another group
      const width = node.measured?.width ?? node.width ?? 0;
      const height = node.measured?.height ?? node.height ?? 0;
      const currentParent = node.parentId ? getNodes().find((n) => n.id === node.parentId) : undefined;
      const absoluteX = currentParent ? currentParent.position.x + node.position.x : node.position.x;
      const absoluteY = currentParent ? currentParent.position.y + node.position.y : node.position.y;

      const overlappingGroup = getIntersectingNodes({ x: absoluteX, y: absoluteY, width, height }).find(
        (n) => n.type === RF_GROUP_TYPE
      );

      if (overlappingGroup && overlappingGroup.id !== node.parentId) {
        // Joining a group it wasn't already in (whether it was standalone or switching
        // straight from a different group).
        const fromPosition = { x: node.position.x, y: node.position.y }; // already in its current parent's space (or absolute, if it had none)
        const toPosition = { x: absoluteX - overlappingGroup.position.x, y: absoluteY - overlappingGroup.position.y };
        reparentNode(node.id, node.parentId ?? null, fromPosition, overlappingGroup.id, toPosition);
      } else if (!overlappingGroup && node.parentId) {
        // Dragged fully outside its current group's frame — release onto the open canvas.
        const fromPosition = { x: node.position.x, y: node.position.y };
        reparentNode(node.id, node.parentId, fromPosition, null, { x: absoluteX, y: absoluteY });
      }
      // Otherwise: still inside the same group (ordinary in-group repositioning, the
      // "move" entry from saveNodePosition above already covers it), or never touched a
      // group at all either way — nothing to reparent.
    },
    [getNodes, getIntersectingNodes, reparentNode]
  );

  const handleNodeDragStop: OnNodeDrag<Node> = React.useCallback(
    (_event, node) => {
      const from = dragStartPositions.current.get(node.id) ?? node.position;
      dragStartPositions.current.delete(node.id);
      saveNodePosition(node.id, from, { x: node.position.x, y: node.position.y });
      handleGroupMembershipAfterDrag(node);
    },
    [saveNodePosition, handleGroupMembershipAfterDrag]
  );

  // Undo/redo/group/ungroup keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y —
  // ADR-0066; Ctrl+G / Ctrl+Shift+G — Phase 3 grouping). Guarded on
  // `document.activeElement` the same way the paste handler below is: while actually
  // typing in a node's textarea/input (including the group name tag's own rename
  // input, group-node.tsx), this leaves native text-field behavior alone instead of
  // hijacking the key for a canvas-level action.
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const active = document.activeElement;
      const isEditingSomething =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (isEditingSomething) return;

      const isMod = event.ctrlKey || event.metaKey;
      if (!isMod) return;

      if (event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (event.key.toLowerCase() === "g" && event.shiftKey) {
        // Ungroup — operates on whatever group node(s) are currently selected. Looping
        // (rather than assuming exactly one) costs nothing and means multi-selecting
        // several groups and ungrouping them together just works.
        event.preventDefault();
        const selectedGroupIds = getNodes()
          .filter((n) => n.selected && n.type === RF_GROUP_TYPE)
          .map((n) => n.id);
        for (const groupId of selectedGroupIds) {
          ungroupNode(groupId);
        }
      } else if (event.key.toLowerCase() === "g") {
        // Group — the selected, currently-ungrouped nodes (excluding any selected
        // group itself; nested groups aren't supported, Phase 3 scope) become members
        // of one new group frame sized to their combined bounding box plus padding.
        // `getNodes()` (not the store's own `nodes`) is used specifically for its
        // `measured` field — the actual on-screen size React Flow has observed via
        // ResizeObserver, which is the only reliable size for a content card that
        // hasn't been manually resized yet (board-store.ts's `toRfNode` only sets an
        // explicit `width`/`height` once a card HAS been resized — see its own comment
        // on why `NodeProps`' measured size, not an assumed default, is required here).
        event.preventDefault();
        const selected = getNodes().filter((n) => n.selected && n.type !== RF_GROUP_TYPE && !n.parentId);
        if (selected.length >= 2) {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const n of selected) {
            const width = n.measured?.width ?? n.width ?? 224;
            const height = n.measured?.height ?? n.height ?? 120;
            minX = Math.min(minX, n.position.x);
            minY = Math.min(minY, n.position.y);
            maxX = Math.max(maxX, n.position.x + width);
            maxY = Math.max(maxY, n.position.y + height);
          }
          const bounds = {
            x: minX - GROUP_PADDING,
            y: minY - GROUP_PADDING,
            width: maxX - minX + GROUP_PADDING * 2,
            height: maxY - minY + GROUP_PADDING * 2,
          };
          groupSelectedNodes(selected.map((n) => n.id), bounds);
        }
      } else if (event.key.toLowerCase() === "d") {
        // Duplicate (Phase 3, F-07) — the current selection, in place, on this board.
        // `duplicateSelection` itself expands any selected group to include its
        // members and drops any edge reaching outside the selection; this handler's
        // only job is reading which nodes are currently selected.
        event.preventDefault();
        const selectedIds = getNodes()
          .filter((n) => n.selected)
          .map((n) => n.id);
        if (selectedIds.length > 0) duplicateSelection(selectedIds);
      } else if (event.key.toLowerCase() === "c") {
        // Copy (Phase 3, F-19) — freezes the current selection into the app's own
        // clipboard (board-store.ts), independent of the browser's OS-level clipboard.
        // Deliberately NOT unified with the browser's native `copy`/`paste` events the
        // paste-to-create handler below listens for: those two clipboards can
        // technically coexist (e.g. real OS clipboard text left over from before this
        // copy would still trigger that handler on the next Ctrl+V too) — an accepted
        // edge case rather than plumbing our node data through the real OS clipboard
        // for this pass.
        const selectedIds = getNodes()
          .filter((n) => n.selected)
          .map((n) => n.id);
        if (selectedIds.length > 0) {
          event.preventDefault();
          copySelection(selectedIds);
        }
      } else if (event.key.toLowerCase() === "v") {
        // Paste (Phase 3, F-19) — materializes whatever's in OUR clipboard onto
        // whichever board is currently loaded (works across a board switch precisely
        // because that clipboard lives outside this store's per-board state — see its
        // own comment in board-store.ts).
        //
        // BUG-028 fix: this used to call `event.preventDefault()` unconditionally, on
        // EVERY Ctrl+V, regardless of whether our own clipboard actually had anything
        // in it — the comment here claimed that made it "a no-op... [that] never fights
        // with the native OS-paste handler below," but `preventDefault()` on this
        // `keydown` event runs BEFORE the browser ever generates the native `paste`
        // event that handler listens for, so an empty internal clipboard was silently
        // swallowing every single Ctrl+V on bare canvas — including the one the OTHER
        // paste handler below needs to create a link/video/text node from whatever's
        // actually on the OS clipboard (Istiyak: "copy paste on canvas doesn't work").
        // Mirrors the "c" (copy) branch above: only intercept when there's actually
        // something of OURS to act on; an empty clipboard now falls straight through to
        // the native paste event instead of being eaten here first.
        if (hasClipboardContent()) {
          event.preventDefault();
          pasteClipboard(centerPosition());
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    undo,
    redo,
    getNodes,
    groupSelectedNodes,
    ungroupNode,
    duplicateSelection,
    copySelection,
    pasteClipboard,
    hasClipboardContent,
    centerPosition,
  ]);

  // Paste-to-create (Istiyak: "paste a URL directly onto the canvas" originally did
  // nothing — he had to add a link node first, then paste inside it; round 2 widened
  // this to ANY pasted content, not just URLs — "anything pasted on canvas should
  // immediately adapt its visual preview according to the type"). Listens on
  // `document`, not a specific element, because paste events only fire on the
  // currently focused element and there's nothing on the bare canvas to focus; guarded
  // on `document.activeElement` so pasting into an actual input — a link node's own URL
  // field, a node being edited, a dialog's text field — is completely untouched and
  // keeps its native paste behavior.
  //
  // Type-adaptive card on paste (ADR-0065/ADR-0069): a recognizable video URL (YouTube
  // or Vimeo) creates a `video` node directly, in its final visual style from the first
  // frame, instead of creating a generic link node that then has to convert itself a
  // moment later; any other URL creates a `link` node (which kicks off its own
  // lightweight title/favicon fetch, ADR-0067); plain text creates a filled `text` node.
  //
  // BUG-018 fix (round 6, Istiyak: "On dropping any file on canvas / or / copy pasting
  // from desktop its node card not getting generated. Its directly getting towards
  // browsers default open / save functionality"): an actual FILE on the clipboard (e.g.
  // a file copied in the OS's file explorer, not a URL/text selection) was never checked
  // for here at all — only `text/plain` was ever read, so a pasted file fell through
  // every branch below and the browser's own default paste handling took over. Checked
  // FIRST, before the text/plain branch, and routed through the exact same
  // `addFileNode` upload path the toolbar's "File" button already uses.
  React.useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const active = document.activeElement;
      const isEditingSomething =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (isEditingSomething) return;

      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        const position = centerPosition();
        setIsUploading(true);
        (async () => {
          try {
            for (const file of files) {
              await addFileNode(position, file);
              position.x += 24;
              position.y += 24;
            }
          } catch (err) {
            // A genuinely unsupported type never throws here — addFileNode catches
            // that itself and shows its own toast (board-store.ts). This catch is for
            // everything else (network error, the server's own 415 backstop, …) —
            // `ApiError`/fetch errors already carry a real message (lib/api.ts), so
            // prefer that over a flattened generic string.
            useToastStore
              .getState()
              .showToast(err instanceof Error ? err.message : "Couldn't add that file. Please try again.");
          } finally {
            setIsUploading(false);
          }
        })();
        return;
      }

      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

      event.preventDefault();
      const position = centerPosition();

      // New URL(text) is also the "is this a URL" check.
      let url: URL | null;
      try {
        url = new URL(text);
      } catch {
        url = null;
      }

      if (url) {
        const urlString = url.toString();
        addVideoNodeFromUrl(position, urlString).then((wasVideo) => {
          if (!wasVideo) addLinkNode(position, { url: urlString });
        });
      } else {
        addTextNode(position, text);
      }
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [addFileNode, addLinkNode, addTextNode, addVideoNodeFromUrl, centerPosition]);

  // BUG-018 fix, drag-and-drop half (round 6): the canvas had no `dragover`/`drop`
  // handlers at all, so a file dragged onto it fell straight through to the BROWSER's
  // own default handling (opening/saving the file), never reaching React at all. A
  // `dragover` handler must call `preventDefault()` for the browser to even consider the
  // subsequent `drop` a valid drop target in the first place — without it, `drop` never
  // fires as a droppable-here event and the browser reverts to its native behavior
  // regardless of what a `drop` handler alone might try to do.
  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length === 0) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setIsUploading(true);
      (async () => {
        try {
          for (const file of files) {
            await addFileNode(position, file);
            position.x += 24;
            position.y += 24;
          }
        } catch (err) {
          // See handlePaste's own comment above — same reasoning, same toast.
          useToastStore
            .getState()
            .showToast(err instanceof Error ? err.message : "Couldn't add that file. Please try again.");
        } finally {
          setIsUploading(false);
        }
      })();
    },
    [addFileNode, screenToFlowPosition]
  );

  const handleFileChosen = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ""; // allow re-selecting the same file later
      if (!file) return;
      setIsUploading(true);
      try {
        await addFileNode(centerPosition(), file);
      } catch (err) {
        // See handlePaste's own comment above — same reasoning, same toast.
        useToastStore
          .getState()
          .showToast(err instanceof Error ? err.message : "Couldn't add that file. Please try again.");
      } finally {
        setIsUploading(false);
      }
    },
    [addFileNode, centerPosition]
  );

  // Grouping (Phase 3) — React Flow requires a parent node to appear in the `nodes`
  // array BEFORE any of its children (its own docs: a node with a `parentId` must come
  // after the node it names). The store's own `nodes` array doesn't guarantee that: a
  // board loaded fresh from the server lists rows in insertion order, and a group is
  // always created AFTER the members it groups, so an unordered reload would put
  // children before their own parent without this. Nested groups aren't supported
  // (Phase 3 scope — see group-node.tsx), so a single stable partition — every
  // parentless node first, then every child, each preserving its original relative
  // order — is sufficient here; no general topological sort is needed.
  const orderedNodes = React.useMemo(
    () => [...nodes.filter((n) => !n.parentId), ...nodes.filter((n) => n.parentId)],
    [nodes]
  );

  if (loadError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-text-danger">{loadError}</p>
        <Button variant="secondary" size="sm" onClick={() => loadBoard(boardId)}>
          Try again
        </Button>
      </main>
    );
  }

  if (!loaded) {
    return <main className="flex flex-1" aria-busy="true" />;
  }

  return (
    <main className="relative flex flex-1 flex-col">
      {/* Toolbar makeover (Istiyak, Phase 2.5 round 7): the old "← Boards / title /
          labeled buttons" strip is gone — the board's identity now lives in the global
          Navbar's breadcrumb above this page entirely, so this is just the canvas plus
          a floating, icon-only creation toolbar (Poppy's own layout) over it, not a
          second header bar competing for the same space. */}
      <CanvasToolbar
        actions={[
          { key: "text", label: "Add text note", icon: Type, onClick: () => addTextNode(centerPosition()) },
          { key: "link", label: "Add link", icon: Link2, onClick: () => addLinkNode(centerPosition()) },
          {
            key: "file",
            label: isUploading ? "Uploading…" : "Upload file",
            icon: FileUp,
            onClick: () => fileInputRef.current?.click(),
            disabled: isUploading,
            busy: isUploading,
          },
          {
            key: "outliers",
            label: "Outliers research panel",
            icon: Compass,
            onClick: () => setIsOutliersOpen(true),
          },
          ...CHAT_PROVIDERS.map(({ provider, label, icon }) => {
            const status = providers.find((p) => p.provider === provider);
            const isConfigured = Boolean(status?.isConfigured);
            // Istiyak (Phase 4 follow-up): a key is only required for Native API — Local
            // LLM and Manual Input need no key at all (F-12: "Local LLM — no key
            // needed"), so gating EVERY provider's placement on isConfigured blocked
            // exactly the workflow those two modes exist for. A newly placed node is
            // seeded from this provider's Settings "Default execution mode"
            // (board-store.ts's addChatNode) — so if that default is already Local LLM
            // or Manual Input, the node needs no key to be usable the moment it lands,
            // and placement is allowed on that basis alone. Only when the default is
            // still Native API (the out-of-the-box default) and no key is saved does
            // placing the node lead nowhere, so that's the only case still blocked.
            const startsKeyless = status?.executionMode === "local" || status?.executionMode === "manual";
            const canPlace = isConfigured || startsKeyless;
            return {
              key: `chat-${provider}`,
              icon,
              onClick: () => addChatNode(centerPosition(), provider),
              disabled: !providersLoaded || !canPlace,
              label: !providersLoaded
                ? label
                : canPlace
                  ? label
                  : `${label} — add a key, or set its default mode to Local LLM/Manual Input in Settings`,
            };
          }),
        ]}
      />
      <input
        ref={fileInputRef}
        type="file"
        // Narrows the OS picker's own file list to what addFileNode will actually
        // accept (board-store.ts's SUPPORTED_FILE_EXTENSIONS) — a nice-to-have, not the
        // real gate: `accept` is only a hint most file dialogs use to gray out/filter
        // by default, and a user can usually still override it to "All Files," plus it
        // does nothing at all for drag-drop or OS paste. addFileNode's own check is
        // what actually blocks an unsupported type from reaching the board.
        // Phase 5 (ADR-0085/ADR-0086): widened to include the new audio/video upload
        // extensions, kept in sync with board-store.ts's AUDIO_UPLOAD_EXTENSIONS/
        // VIDEO_UPLOAD_EXTENSIONS exactly as this already tracks SUPPORTED_FILE_EXTENSIONS.
        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.heic,.mp3,.wav,.m4a,.ogg,.flac,.aac,.mp4,.mov,.webm,.mkv,.avi"
        className="hidden"
        onChange={handleFileChosen}
        disabled={isUploading}
      />
      <ToastHost />

      <OutliersPanel
        open={isOutliersOpen}
        onOpenChange={setIsOutliersOpen}
        // Round 2 select-then-bulk-add (outliers-panel.tsx's top comment) — fans the
        // batch out diagonally from the same base center point, same +40px-per-item
        // convention board-store.ts's `addMindmapNode` already uses for "repeated
        // generations from one source," so N selected videos land as N visibly
        // separate cards instead of stacking exactly on top of each other.
        onQuickAdd={async (urls) => {
          const base = centerPosition();
          const results = await Promise.all(
            urls.map((url, index) => addVideoNodeFromUrl({ x: base.x + index * 40, y: base.y + index * 40 }, url))
          );
          const failedCount = results.filter((wasVideo) => !wasVideo).length;
          if (failedCount > 0) {
            useToastStore.getState().showToast(
              failedCount === urls.length
                ? "Couldn't add those videos to the board. Try again."
                : `Added ${urls.length - failedCount} of ${urls.length} — the rest couldn't be added. Try again.`
            );
          }
        }}
      />

      <div ref={canvasWrapperRef} className="flex-1" onDragOver={handleDragOver} onDrop={handleDrop}>
        <ReactFlow
          nodes={orderedNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          // Istiyak: "While dragging also showing old style not the new gradient style."
          // `edgeTypes` above only styles a COMPLETED edge — the in-progress drag preview
          // (before onConnect ever fires) is a separate React Flow render path, governed
          // by this prop alone. canvas-connection-line.tsx mirrors canvas-edge.tsx's own
          // gradient/dashed look so the preview already matches the edge it's about to
          // become.
          connectionLineComponent={CanvasConnectionLine}
          onNodesChange={onNodesChange}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          // TF-06 (Phase 3) — drag-to-connect: React Flow calls onConnect once a drag
          // from one card's handle is released over a valid target handle on another;
          // connectNodes (board-store.ts) does the actual create + history entry.
          // onEdgesChange is edges' counterpart to onNodesChange above (same
          // select-is-local/remove-goes-through-the-store split). Styling (the gradient
          // line + its own colored arrowhead) now lives entirely in canvas-edge.tsx via
          // `edgeTypes` above, not a `defaultEdgeOptions` prop here.
          onConnect={connectNodes}
          onEdgesChange={onEdgesChange}
          isValidConnection={isValidConnection}
          // Deletion UX overhaul (ADR-0065): Delete key only — Backspace used to also be
          // bound here, which meant merely SELECTING a node and then pressing Backspace
          // for any ordinary reason silently deleted it with no confirmation and (at the
          // time) no undo (bugs.md BUG-008). The 3-dot menu's own Delete action is the
          // node header's equivalent — both go through the same board-store `deleteNode`.
          deleteKeyCode={["Delete"]}
          // Pan/select reconciliation (ADR-0080, reverses part of ADR-0066): Istiyak's
          // original Figma-style ask (plain drag = marquee-select, pan via space+drag
          // or scroll) is now reversed — plain left-drag pans directly, no space-bar
          // step. `selectionOnDrag` removed (defaults to false) and `panOnDrag` now
          // includes button 0 (left) alongside the existing 1/2 (middle/right), so all
          // three buttons pan. Marquee-select isn't dropped, just moved to a modifier:
          // `selectionKeyCode="Shift"` makes Shift+drag always draw a selection box
          // regardless of panOnDrag — same Shift key Shift+click already uses for
          // single-node toggle-select, so one modifier covers both. See ADR-0080 for
          // the full before/after reasoning.
          panOnDrag={[0, 1, 2]}
          panOnScroll
          selectionKeyCode="Shift"
          multiSelectionKeyCode={["Shift"]}
          // Istiyak (Phase 3 testing): "if full card is not under selection it is not
          // selected... even 30-40% covered then card should come under selection" —
          // React Flow's default (`Full`) requires a node's ENTIRE box inside the drag
          // rectangle; `Partial` selects on any overlap at all, matching how marquee
          // selection works in every other canvas tool this app is modeled on (Figma,
          // Miro, Poppy).
          selectionMode={SelectionMode.Partial}
          onPaneClick={handlePaneClick}
          // BUG fix (Istiyak, still reported after the onPaneClick fix above: "once
          // link edit then on canvas its not reverting to preview and stays as input"):
          // the real remaining cause — React Flow's own click-vs-drag distinction
          // (`paneClickDistance`, default 1px) decides whether a mousedown-then-mouseup
          // counts as a genuine click at all. A real mouse/trackpad click almost always
          // moves a couple of pixels between down and up, and with `panOnDrag`
          // including the left button, anything past that 1px default gets classified
          // as the START of a pan gesture instead — React Flow then suppresses the
          // click outright, so `onPaneClick` (and the blur/deselect it drives) silently
          // never fires at all for an ordinary human click, even though the handler
          // itself was always correct. Widened to a much more forgiving 8px so a normal
          // click still reads as a click, while an intentional drag (which moves far
          // more than that) still pans exactly as before.
          paneClickDistance={8}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          // BUG-021: this className never actually painted anything — React Flow's own
          // unlayered `.react-flow { background-color: transparent }` rule always beat
          // Tailwind's layered utility regardless of this prop. The real fix is a plain
          // CSS override in globals.css (`.react-flow { background-color: ... }`); kept
          // removed here rather than left in as dead, misleading markup.
        >
          {/* gap/size mirror packages/tokens/tokens/primitives.json's canvas.dotGap /
              canvas.dotSize — React Flow's Background takes raw numbers, not a CSS
              class, so these can't go through a Tailwind utility the way colors do
              (same reasoning as profile-menu.tsx's AVATAR_BUTTON_CLASSNAME comment:
              outside what the token-enforcement lint rule polices). The color itself
              IS token-driven, via the generated CSS variable. Round 8 (ADR-0081,
              Istiyak: canvas "looks very plain... dots grid... very unnoticeable"):
              size bumped 1→1.5 and the color token itself darkened (semantic.json's
              canvasDot, gray.200→gray.400) so the grid actually reads against the new
              tinted background below, not just a barely-there texture. */}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="var(--color-background-canvas-dot)" />
          {/* Undo/Redo/zoom/fit live together in one horizontal pill, bottom-right
              (Istiyak's follow-up: match Poppy's layout — undo, redo, zoom controls,
              left to right). React Flow always renders a <Controls> child AFTER its
              own built-in zoom/fit/interactive buttons, with no supported way to
              interleave earlier ones before them — so every button here, including
              zoom in/out/fit-view, is a custom ControlButton wired to useReactFlow()'s
              own zoomIn/zoomOut/fitView, in the exact order they should visually
              appear. This also keeps each button's border styling correct (React
              Flow's horizontal-orientation CSS strips the border from whichever button
              is LAST IN THE DOM, so DOM order has to equal visual order, not just be
              reordered after the fact with CSS). */}
          <Controls position="bottom-right" orientation="horizontal" showZoom={false} showFitView={false} showInteractive={false}>
            <ControlButton onClick={() => undo()} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
              <Undo2 size={12} style={CONTROL_ICON_STYLE} aria-hidden="true" />
            </ControlButton>
            <ControlButton onClick={() => redo()} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
              <Redo2 size={12} style={CONTROL_ICON_STYLE} aria-hidden="true" />
            </ControlButton>
            <ControlButton onClick={() => zoomIn()} aria-label="Zoom in" title="Zoom in">
              <Plus size={12} style={CONTROL_ICON_STYLE} aria-hidden="true" />
            </ControlButton>
            <ControlButton onClick={() => zoomOut()} aria-label="Zoom out" title="Zoom out">
              <Minus size={12} style={CONTROL_ICON_STYLE} aria-hidden="true" />
            </ControlButton>
            <ControlButton onClick={() => fitView(FIT_VIEW_OPTIONS)} aria-label="Fit view" title="Fit view">
              <Maximize2 size={12} style={CONTROL_ICON_STYLE} aria-hidden="true" />
            </ControlButton>
          </Controls>
        </ReactFlow>
      </div>
    </main>
  );
}
