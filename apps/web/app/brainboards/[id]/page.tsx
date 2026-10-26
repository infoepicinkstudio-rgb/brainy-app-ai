"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
  type Node,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Type, Link2, FileUp } from "lucide-react";
import { useBoardStore } from "@/stores/board-store";
import { TextNode } from "@/components/canvas/text-node";
import { FileNode } from "@/components/canvas/file-node";
import { LinkNode } from "@/components/canvas/link-node";
import { Button } from "@/components/ui/button";

// TF-03 — React Flow canvas mount (implementation_plan.md Phase 2 step 4). The
// board-store (ADR-0012) owns nodes/edges/autosave; this file is just the view.

const nodeTypes: NodeTypes = {
  text: TextNode,
  file: FileNode,
  link: LinkNode,
};

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
  const { nodes, edges, loaded, loadError, boardTitle, loadBoard, onNodesChange, saveNodePosition, addTextNode, addLinkNode, addFileNode } =
    useBoardStore();
  const { screenToFlowPosition } = useReactFlow();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // error-handling-conventions.md: data-mutating actions disable their control for the
  // duration of the in-flight request — a file upload (saves a file + creates a node)
  // qualifies, and without this a second click while one upload is still running could
  // kick off a concurrent second upload.
  const [isUploading, setIsUploading] = React.useState(false);

  React.useEffect(() => {
    loadBoard(boardId);
  }, [boardId, loadBoard]);

  const centerPosition = React.useCallback(() => {
    // Drop new nodes near the middle of the viewport, not always stacked at (0,0).
    const viewportCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return screenToFlowPosition(viewportCenter);
  }, [screenToFlowPosition]);

  const handleNodeDragStop: OnNodeDrag<Node> = React.useCallback(
    (_event, node) => {
      saveNodePosition(node.id, node.position.x, node.position.y);
    },
    [saveNodePosition]
  );

  // Paste-URL-to-create-link-node (Istiyak: "paste a URL directly onto the canvas"
  // currently does nothing — he has to add a link node first, then paste inside it).
  // Listens on `document`, not a specific element, because paste events only fire on
  // the currently focused element and there's nothing on the bare canvas to focus;
  // guarded on `document.activeElement` so pasting into an actual input — a link
  // node's own URL field, a node being edited, a dialog's text field — is completely
  // untouched and keeps its native paste behavior.
  React.useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const active = document.activeElement;
      const isEditingSomething =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (isEditingSomething) return;

      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

      // New URL(text) is also the "is this a URL" check — a non-URL paste (plain
      // text, an image, etc.) falls through and does nothing; the explicit ask was
      // specifically about URLs, so a plain-text-node fallback is left out rather
      // than guessed at.
      let url: URL;
      try {
        url = new URL(text);
      } catch {
        return;
      }

      event.preventDefault();
      addLinkNode(centerPosition(), { url: url.toString() });
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [addLinkNode, centerPosition]);

  const handleFileChosen = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ""; // allow re-selecting the same file later
      if (!file) return;
      setIsUploading(true);
      try {
        await addFileNode(centerPosition(), file);
      } catch {
        // addFileNode already leaves the board state untouched on failure; a toast
        // system doesn't exist yet in this app (Phase 1 scope), so this is a silent,
        // non-crashing no-op for now — flagged as a UX gap worth a real error toast
        // once one exists elsewhere in the app.
      } finally {
        setIsUploading(false);
      }
    },
    [addFileNode, centerPosition]
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
    <main className="flex flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-muted bg-background-surface px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/brainboards/all"
            className="flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Boards
          </Link>
          <span className="h-4 w-px bg-border-muted" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-text-primary">{boardTitle}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => addTextNode(centerPosition())}>
            <Type className="size-3.5" aria-hidden="true" />
            Text
          </Button>
          <Button variant="ghost" size="sm" onClick={() => addLinkNode(centerPosition())}>
            <Link2 className="size-3.5" aria-hidden="true" />
            Link
          </Button>
          <Button variant="ghost" size="sm" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
            <FileUp className="size-3.5" aria-hidden="true" />
            {isUploading ? "Uploading…" : "File"}
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChosen} disabled={isUploading} />
        </div>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={handleNodeDragStop}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          className="bg-background-canvas"
        >
          {/* gap/size mirror packages/tokens/tokens/primitives.json's canvas.dotGap /
              canvas.dotSize — React Flow's Background takes raw numbers, not a CSS
              class, so these can't go through a Tailwind utility the way colors do
              (same reasoning as profile-menu.tsx's AVATAR_BUTTON_CLASSNAME comment:
              outside what the token-enforcement lint rule polices). The color itself
              IS token-driven, via the generated CSS variable. */}
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-background-canvas-dot)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </main>
  );
}
