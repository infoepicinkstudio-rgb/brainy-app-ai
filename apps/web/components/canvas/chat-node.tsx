"use client";

// Phase 4 — the first chat node (TF-07/TF-08, architecture.md §4.2/§4.3). Visual pass
// (Istiyak, sharing a reference AI-chat screenshot a second time): "Let's visually match
// it in Frontend UI. make a Chat card bigger in size to fit all in context. Arrange
// elements and make UI As close as possible from the Screenshot." The functional build
// (sessions, web search, thinking, vision, voice) from the prior round is untouched here
// — this pass is layout/visual only: a persistent sessions column (not an overlay) next
// to the thread, a session-title bar, lightweight markdown rendering + copy/regenerate
// on assistant replies, and the model-picker + quick-actions pill row sitting directly
// under the composer — all matching the reference's own arrangement — plus a much larger
// default card size so that arrangement actually has room to breathe.
import * as React from "react";
import type { NodeProps } from "@xyflow/react";
import {
  Bot,
  Brain,
  ChevronDown,
  Copy,
  Cpu,
  Gem,
  Image as ImageIcon,
  Loader2,
  Mic,
  PanelLeft,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useBoardStore, type ChatNodeData } from "@/stores/board-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";
import {
  streamChat,
  listChatSessions,
  createChatSession,
  uploadChatImage,
  type ChatSession,
  type ChatAttachment,
} from "@/lib/chat-stream";
import { api, API_BASE_URL, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<ChatNodeData["provider"], string> = {
  claude: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
};

const PROVIDER_ICONS: Record<ChatNodeData["provider"], LucideIcon> = {
  claude: Bot,
  openai: Cpu,
  gemini: Gem,
};

// Mirrors each provider adapter's own `listModels()` (apps/server/src/providers/*.ts).
// Duplicated here for the same reason board-store.ts's own `DEFAULT_MODEL` already is:
// small, static, and needed synchronously for a dropdown — there's no "list models"
// endpoint yet, and adding one just to avoid this duplication isn't worth a network
// round-trip every time a chat node mounts.
const MODEL_OPTIONS: Record<ChatNodeData["provider"], Array<{ id: string; label: string }>> = {
  claude: [
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  ],
  openai: [{ id: "gpt-5", label: "GPT-5" }],
  gemini: [{ id: "gemini-3-pro", label: "Gemini 3 Pro" }],
};

const EXECUTION_MODE_OPTIONS: Array<{ value: ChatNodeData["executionMode"]; label: string }> = [
  { value: "native", label: "Native API" },
  { value: "local", label: "Local LLM" },
  { value: "manual", label: "Manual input" },
];

// One-click preset prompts (Istiyak: "quick actions like summary, Get key insights
// etc") — sent immediately on click, matching the reference screenshot's own pill-button
// behavior (its "Summarize" / "Get Key Insights" / "Write Email" row under the input).
const QUICK_ACTIONS: Array<{ label: string; prompt: string }> = [
  { label: "Summarize", prompt: "Summarize the connected content for me." },
  { label: "Key Insights", prompt: "What are the key insights from the connected content?" },
  { label: "Write Email", prompt: "Draft an email based on the connected content." },
];

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[] | null;
  // Streamed-but-never-persisted extras (routes/chat.ts never writes these to
  // chat_messages — only the final text is saved) — present for a message sent while
  // this card stayed mounted, absent again after a reload. A deliberate MVP scope cut,
  // not a bug: re-deriving "Claude searched for X and found these 3 pages" after the
  // fact would mean persisting a second, parallel history shape nothing else needs.
  thinking?: string;
  searchResults?: { url: string; title: string }[];
}

// SQLite's CURRENT_TIMESTAMP format ("YYYY-MM-DD HH:MM:SS", UTC, no "T"/"Z") isn't
// directly Date-parseable as UTC — browsers read the space-separated form as LOCAL
// time, silently skewing every session timestamp by the machine's own UTC offset.
// Reshaping it into a real ISO string first fixes that.
function formatRelativeTime(sqliteTimestamp: string): string {
  const parsed = new Date(`${sqliteTimestamp.replace(" ", "T")}Z`);
  const minutes = Math.round((Date.now() - parsed.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// --- Lightweight markdown rendering (visual-match pass) ---------------------------
// The reference screenshot's assistant replies show real headings/bullets/bold, not
// flat text — but the project has no markdown library installed, and this session has
// no shell on Istiyak's machine to run `npm install` for him. Rather than block the
// visual-match request on a dependency he'd have to add himself, this is a small,
// self-contained parser covering exactly what a Claude reply actually tends to use:
// headings (`#`…`######`), bullet/numbered lists, fenced code blocks, and inline
// **bold**/`code`. Not a spec-complete CommonMark implementation — tables, links, and
// nested lists fall back to plain paragraph text, which is a reasonable MVP line to
// draw here.
type MdBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; code: string }
  | { kind: "paragraph"; text: string };

function parseMarkdownLite(source: string): MdBlock[] {
  const lines = source.split("\n");
  const blocks: MdBlock[] = [];
  const isBulletLine = (line: string) => /^[-*]\s+/.test(line);
  const isOrderedLine = (line: string) => /^\d+\.\s+/.test(line);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence
      blocks.push({ kind: "code", code: codeLines.join("\n") });
      continue;
    }
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      blocks.push({ kind: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }
    if (isBulletLine(line) || isOrderedLine(line)) {
      const ordered = isOrderedLine(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? isOrderedLine(lines[i]) : isBulletLine(lines[i]))) {
        items.push(lines[i].replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !isBulletLine(lines[i]) &&
      !isOrderedLine(lines[i]) &&
      !lines[i].startsWith("```")
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "paragraph", text: paraLines.join("\n") });
  }
  return blocks;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((part) => part !== "");
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-background-muted px-1 py-0.5 font-mono text-[10px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function FormattedMessage({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseMarkdownLite(text), [text]);
  return (
    <div className="flex flex-col gap-1.5">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const Tag = block.level <= 2 ? "h3" : "h4";
          return (
            <Tag key={index} className="text-xs font-semibold text-text-primary">
              {renderInline(block.text)}
            </Tag>
          );
        }
        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={index} className={cn("flex flex-col gap-0.5 pl-4 text-xs", block.ordered ? "list-decimal" : "list-disc")}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ListTag>
          );
        }
        if (block.kind === "code") {
          return (
            <pre key={index} className="scrollbar-thin overflow-x-auto rounded-md bg-background-muted px-2 py-1.5 text-[10px] text-text-primary">
              <code className="font-mono">{block.code}</code>
            </pre>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap text-xs leading-relaxed text-text-primary">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

// The Web Speech API (Istiyak: "Voice input in input box needed") has no standard TS
// DOM typing — it's a non-standard, Chrome-family-only API — so this is its own small,
// local shape rather than pulling in `any` everywhere it's touched. Absent entirely in
// browsers that don't support it (Firefox, most of Safari): `getSpeechRecognitionCtor`
// returning null is how the mic button below hides itself instead of erroring.
type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function ChatNodeImpl({ id, data, selected, parentId }: NodeProps) {
  const typedData = data as ChatNodeData;
  const boardId = useBoardStore((state) => state.boardId);
  const updateNodeData = useBoardStore((state) => state.updateNodeData);
  const flushNodeData = useBoardStore((state) => state.flushNodeData);
  const deleteNode = useBoardStore((state) => state.deleteNode);
  const duplicateSelection = useBoardStore((state) => state.duplicateSelection);
  const saveNodeSize = useBoardStore((state) => state.saveNodeSize);

  // Same ADR-0070 pattern every other node type uses — see text-node.tsx's own
  // comment for why this must read `data.cardWidth/cardHeight`, not NodeProps' own
  // measured `width`/`height`.
  const explicitWidth = typedData.cardWidth;
  const explicitHeight = typedData.cardHeight;

  // Sessions ------------------------------------------------------------------
  const [sessions, setSessions] = React.useState<ChatSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = React.useState(false);
  const [activeSessionId, setActiveSessionId] = React.useState<string | undefined>(undefined);
  // Open by default (reference: the "Previous Chats" column sits alongside the thread
  // at all times, not behind a toggle) — now that the card's default size (below) is
  // wide enough to actually fit both side by side. Still closeable via the header icon
  // for anyone who's resized the card down.
  const [showSessions, setShowSessions] = React.useState(true);

  React.useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    listChatSessions(boardId, id)
      .then((list) => {
        if (cancelled) return;
        setSessions(list);
        // Most-recently-active first (backend orders real sessions by updated_at desc
        // and appends any pre-sessions "legacy" history last) — so the most relevant
        // thread is already open the moment the card mounts, no empty-state click
        // needed for a node someone's actually used before.
        if (list.length > 0) setActiveSessionId(list[0].id);
      })
      .finally(() => {
        if (!cancelled) setSessionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per node mount
  }, [boardId, id]);

  // Message history --------------------------------------------------------------
  const [messages, setMessages] = React.useState<DisplayMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!boardId || !sessionsLoaded) return;
    abortRef.current?.abort(); // switching threads mid-stream — nothing left to show it into
    if (!activeSessionId) {
      // Brand-new node, nothing created yet — compose fresh rather than a pointless
      // network round-trip for a session that doesn't exist.
      setMessages([]);
      setHistoryLoaded(true);
      return;
    }
    let cancelled = false;
    setHistoryLoaded(false);
    api
      .get<{ messages: DisplayMessage[] }>(`/api/boards/${boardId}/nodes/${id}/chat-history?sessionId=${activeSessionId}`)
      .then((res) => {
        if (!cancelled) setMessages(res.messages);
      })
      .catch(() => {
        // A failed load just starts the thread empty instead of blocking the card.
      })
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, id, activeSessionId, sessionsLoaded]);

  // Send / stream ----------------------------------------------------------------
  const [prompt, setPrompt] = React.useState("");
  const [streamingText, setStreamingText] = React.useState<string | null>(null);
  const [streamingThinking, setStreamingThinking] = React.useState<string | null>(null);
  const [streamingSearch, setStreamingSearch] = React.useState<{ query?: string; results?: { url: string; title: string }[] } | null>(
    null
  );
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastPromptRef = React.useRef("");
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingText, streamingThinking, streamingSearch]);

  // Per-message toggles (Istiyak: "websearch/thinking on/off") — deliberately NOT part
  // of ChatNodeData: these read as "how should THIS send behave," closer to the
  // model/mode pickers' own per-node-but-user-driven spirit than a persisted setting,
  // and the reference UI treats them the same way (plain toggle pills next to the
  // composer, not a saved preference).
  const [webSearchEnabled, setWebSearchEnabled] = React.useState(false);
  const [thinkingEnabled, setThinkingEnabled] = React.useState(false);

  async function handleNewConversation() {
    if (!boardId) return;
    // Don't pile up empty sessions — if the current one has no messages yet, just stay.
    if (activeSessionId && messages.length === 0) return;
    try {
      const created = await createChatSession(boardId, id);
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
      setMessages([]);
    } catch {
      setError("Couldn't start a new conversation — check the server is running.");
    }
  }

  async function send(text: string) {
    // Double-send guard (F-25-adjacent): a second Enter/click while one reply is still
    // streaming is a no-op rather than a second concurrent request against the same
    // session's history.
    if (!boardId || (!text.trim() && pendingAttachments.length === 0) || isSending) return;
    setError(null);
    setIsSending(true);

    let sessionId = activeSessionId;
    if (!sessionId) {
      // Lazy-create: a brand-new node gets no real session row until its first send,
      // so placing a chat node and never using it never leaves an empty row behind.
      try {
        const created = await createChatSession(boardId, id);
        sessionId = created.id;
        setActiveSessionId(created.id);
        setSessions((prev) => [created, ...prev]);
      } catch {
        setError("Couldn't start a conversation — check the server is running.");
        setIsSending(false);
        return;
      }
    }

    const sendAttachments = pendingAttachments;
    lastPromptRef.current = text;
    setMessages((prev) => [...prev, { id: `local-u-${Date.now()}`, role: "user", content: text, attachments: sendAttachments }]);
    setPrompt("");
    setPendingAttachments([]);
    setStreamingText("");
    setStreamingThinking(null);
    setStreamingSearch(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = "";
    let thinkingAccum = "";
    let searchAccum: { query?: string; results?: { url: string; title: string }[] } = {};
    let sawError: string | null = null;

    for await (const event of streamChat(boardId, id, text, {
      sessionId,
      attachments: sendAttachments.length > 0 ? sendAttachments : undefined,
      webSearchEnabled,
      thinkingEnabled,
      signal: controller.signal,
    })) {
      if (event.type === "text") {
        accumulated += event.text;
        setStreamingText(accumulated);
      } else if (event.type === "thinking") {
        thinkingAccum += event.text;
        setStreamingThinking(thinkingAccum);
      } else if (event.type === "search_query") {
        searchAccum = { ...searchAccum, query: event.query };
        setStreamingSearch(searchAccum);
      } else if (event.type === "search_results") {
        searchAccum = { ...searchAccum, results: event.results };
        setStreamingSearch(searchAccum);
      } else if (event.type === "error") {
        sawError = event.message;
      }
      // "done" needs no branch — falling out of the loop covers it.
    }

    if (sawError) {
      setError(sawError);
    } else if (accumulated) {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-a-${Date.now()}`,
          role: "assistant",
          content: accumulated,
          thinking: thinkingAccum || undefined,
          searchResults: searchAccum.results,
        },
      ]);
      // Picks up the title/updated_at bump chat.ts made for this turn, so a
      // freshly-titled or newly-active session reorders correctly in the sidebar.
      listChatSessions(boardId, id)
        .then(setSessions)
        .catch(() => {});
    }
    setStreamingText(null);
    setStreamingThinking(null);
    setStreamingSearch(null);
    setIsSending(false);
  }

  // Regenerate (reference: a small retry icon under every assistant reply, not just a
  // failed one) — walks back to the nearest preceding user turn and resends its text.
  // Deliberately text-only: re-uploading that turn's original image attachments would
  // need them kept around indefinitely just for this, for a rarely-used action.
  function regenerateFrom(index: number) {
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        void send(messages[i].content);
        return;
      }
    }
  }

  function updateData(patch: Partial<ChatNodeData>) {
    updateNodeData(id, { ...typedData, ...patch });
    flushNodeData(id);
  }

  // Image attachments (Istiyak: "Image upload in chat") -----------------------------
  const [pendingAttachments, setPendingAttachments] = React.useState<ChatAttachment[]>([]);
  const [isUploadingImage, setIsUploadingImage] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // lets the same file be re-selected later
    if (!file || !boardId) return;
    setIsUploadingImage(true);
    setError(null);
    try {
      const attachment = await uploadChatImage(boardId, id, file);
      setPendingAttachments((prev) => [...prev, attachment]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload that image.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  // Voice input (Istiyak: "Voice input in input box needed") ------------------------
  const [isRecording, setIsRecording] = React.useState(false);
  const recognitionRef = React.useRef<SpeechRecognitionInstance | null>(null);
  const speechSupported = React.useMemo(() => getSpeechRecognitionCtor() !== null, []);
  React.useEffect(() => () => recognitionRef.current?.stop(), []);

  function toggleRecording() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (resultEvent) => {
      const transcript = Array.from(resultEvent.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  const [showExtraSettings, setShowExtraSettings] = React.useState(false);

  const Icon = PROVIDER_ICONS[typedData.provider];
  const models = MODEL_OPTIONS[typedData.provider];
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const activeTitle = activeSession?.title ?? "New chat";
  // Drives the composer's single trailing button (mic ↔ send) — see that button's own
  // comment for why it's one control instead of two.
  const hasSendableInput = prompt.trim().length > 0 || pendingAttachments.length > 0;

  // A native <select> dressed as a rounded pill (reference: "Claude 3.5 Sonnet ▾") —
  // `appearance-none` strips the browser's own chrome, a `ChevronDown` is overlaid in
  // its place, and the wrapper stays a plain <select> rather than a custom listbox
  // component: full keyboard/screen-reader support for free, at zero extra UI code.
  const pillSelectClass =
    "h-6 shrink-0 appearance-none rounded-full border border-border-default bg-background-surface-raised py-0 pl-2.5 pr-5 text-[11px] text-text-primary focus-visible:border-border-focus focus-visible:outline-none";
  function toggleClass(active: boolean) {
    return cn(
      "flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors duration-fast",
      active
        ? "border-background-accent bg-background-accent-muted text-text-accent"
        : "border-border-default bg-background-surface-raised text-text-secondary hover:bg-background-muted"
    );
  }

  return (
    <NodeChrome
      id={id}
      selected={selected}
      accent="accent"
      header={
        <NodeHeader
          icon={Icon}
          label={PROVIDER_LABELS[typedData.provider]}
          onDuplicate={() => duplicateSelection([id])}
          onOpen={() => setShowSessions((v) => !v)}
          openLabel={showSessions ? "Hide chats" : "Show chats"}
          actionIcon={showSessions ? PanelLeftClose : PanelLeft}
          accent="accent"
        />
      }
      width={explicitWidth}
      height={explicitHeight}
      onDelete={() => deleteNode(id)}
      onResizeEnd={(size) => saveNodeSize(id, size)}
      hideConnections={Boolean(parentId)}
    >
      <div className="flex min-h-0 flex-1">
        {/* Sessions column (Istiyak: "New session and session list side panel needed",
            now a persistent column rather than an overlay — reference: "Previous
            Chats" sits beside the thread at all times). The card's larger default size
            (board-store.ts's `addChatNode`) is what makes room for this. */}
        {showSessions ? (
          <div className="flex w-36 shrink-0 flex-col border-r border-border-muted bg-background-muted/40">
            <button
              type="button"
              onClick={() => void handleNewConversation()}
              className="nodrag mx-2 mt-2 mb-1.5 flex items-center justify-center gap-1 rounded-md bg-background-accent px-2 py-1.5 text-[11px] font-medium text-text-on-accent hover:bg-background-accent/90"
            >
              <Plus className="size-3" aria-hidden="true" />
              New Chat
            </button>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-1 pb-2">
              {!sessionsLoaded ? (
                <p className="px-2 py-4 text-center text-[11px] text-text-muted">Loading…</p>
              ) : sessions.length === 0 ? (
                <p className="px-2 py-4 text-center text-[11px] text-text-muted">No chats yet.</p>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setActiveSessionId(session.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors duration-fast",
                      session.id === activeSessionId ? "bg-background-accent-muted" : "hover:bg-background-muted"
                    )}
                  >
                    <span className="w-full truncate text-[11px] text-text-primary">{session.title ?? "New chat"}</span>
                    <span className="text-[10px] text-text-muted">{formatRelativeTime(session.updated_at)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Session title bar (reference: "What can you see?" sitting above the
              thread) */}
          <div className="flex shrink-0 items-center border-b border-border-muted px-2.5 py-1.5">
            <span className="truncate text-xs font-medium text-text-primary">{activeTitle}</span>
          </div>

          {/* F-12: "selecting an inert mode should say so plainly, not silently do
              nothing" — MVP only wires up Native API; the card and its controls stay
              fully visible and usable in the other modes, it just can't send yet. */}
          {typedData.executionMode !== "native" ? (
            <p className="shrink-0 border-b border-border-muted px-2.5 py-1.5 text-[11px] text-text-warning">
              {typedData.executionMode === "local"
                ? "Local LLM mode isn't wired up yet — switch to Native API to chat here."
                : "Manual input mode doesn't send automatically — switch to Native API to chat here."}
            </p>
          ) : null}

          {/* Message thread */}
          <div ref={scrollRef} className="nowheel scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2.5 py-2.5">
            {!historyLoaded ? (
              <p className="text-xs text-text-muted">Loading…</p>
            ) : messages.length === 0 && streamingText === null ? (
              <p className="text-xs text-text-muted">Connect a text, file, or link node, then ask about it here.</p>
            ) : null}
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={message.id} className="flex flex-col items-end gap-1">
                  {message.attachments && message.attachments.length > 0 ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      {message.attachments.map((att) => (
                        // eslint-disable-next-line @next/next/no-img-element -- a
                        // locally served chat-image attachment (files.ts's storedName
                        // route), not a remote/optimizable asset.
                        <img
                          key={att.storedName}
                          src={`${API_BASE_URL}/api/files/${att.storedName}`}
                          alt={att.originalName}
                          className="h-16 w-16 rounded-md object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className="max-w-[80%] rounded-lg bg-background-accent-muted px-2.5 py-1.5 text-xs leading-relaxed text-text-primary">
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  </div>
                </div>
              ) : (
                <div key={message.id} className="flex w-full flex-col gap-1">
                  {message.thinking ? (
                    <details className="text-[10px] text-text-muted">
                      <summary className="nodrag cursor-pointer select-none">Thinking</summary>
                      <p className="mt-0.5 whitespace-pre-wrap">{message.thinking}</p>
                    </details>
                  ) : null}
                  <FormattedMessage text={message.content} />
                  {message.searchResults && message.searchResults.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {message.searchResults.map((result) => (
                        <a
                          key={result.url}
                          href={result.url}
                          target="_blank"
                          rel="noreferrer"
                          className="nodrag max-w-40 truncate rounded-full border border-border-default bg-background-surface px-1.5 py-0.5 text-[10px] text-text-accent hover:underline"
                        >
                          {result.title}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {/* Reference: a small Copy + Retry icon row under every assistant
                      reply, not just a failed one. */}
                  <div className="nodrag flex items-center gap-2.5 text-text-muted">
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(message.content)}
                      aria-label="Copy"
                      title="Copy"
                      className="hover:text-text-primary"
                    >
                      <Copy className="size-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => regenerateFrom(index)}
                      disabled={isSending}
                      aria-label="Regenerate"
                      title="Regenerate"
                      className="hover:text-text-primary disabled:opacity-50"
                    >
                      <RotateCcw className="size-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )
            )}
            {streamingText !== null ? (
              <div className="flex w-full flex-col gap-1">
                {streamingThinking ? (
                  <details open className="text-[10px] text-text-muted">
                    <summary className="nodrag cursor-pointer select-none">Thinking…</summary>
                    <p className="mt-0.5 whitespace-pre-wrap">{streamingThinking}</p>
                  </details>
                ) : null}
                {streamingSearch?.query ? (
                  <p className="flex items-center gap-1 text-[10px] text-text-muted">
                    <Search className="size-2.5" aria-hidden="true" />
                    Searching: {streamingSearch.query}
                  </p>
                ) : null}
                {streamingSearch?.results && streamingSearch.results.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {streamingSearch.results.map((result) => (
                      <a
                        key={result.url}
                        href={result.url}
                        target="_blank"
                        rel="noreferrer"
                        className="nodrag max-w-40 truncate rounded-full border border-border-default bg-background-surface px-1.5 py-0.5 text-[10px] text-text-accent hover:underline"
                      >
                        {result.title}
                      </a>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-start text-xs leading-relaxed text-text-primary">
                  <FormattedMessage text={streamingText} />
                  {isSending ? <Loader2 className="ml-1 mt-0.5 size-3 shrink-0 animate-spin" aria-hidden="true" /> : null}
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="flex items-start justify-between gap-2 rounded-md bg-background-danger-muted px-2 py-1 text-xs text-text-danger">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => void send(lastPromptRef.current)}
                  className="nodrag flex shrink-0 items-center gap-0.5 font-medium hover:underline"
                >
                  <RotateCcw className="size-3" aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : null}
          </div>

          {showExtraSettings ? (
            <div className="nodrag flex shrink-0 flex-col gap-1.5 border-t border-border-muted px-2.5 py-2">
              <label className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={typedData.useBrandProfile}
                  onChange={(event) => updateData({ useBrandProfile: event.target.checked })}
                  className="accent-background-accent"
                />
                Use my Brand/Voice Profile
              </label>
              <textarea
                value={typedData.notesForAI}
                onChange={(event) => updateNodeData(id, { ...typedData, notesForAI: event.target.value })}
                onBlur={() => flushNodeData(id)}
                placeholder="Notes for the AI (tone, constraints, anything to keep in mind)…"
                rows={2}
                className="nowheel scrollbar-thin w-full resize-none rounded-md border border-border-default bg-background-surface-raised px-2 py-1 text-[11px] text-text-primary placeholder:text-text-muted focus-visible:border-border-focus focus-visible:outline-none"
              />
            </div>
          ) : null}

          {pendingAttachments.length > 0 ? (
            <div className="nodrag flex shrink-0 flex-wrap gap-1 border-t border-border-muted px-2.5 pt-1.5">
              {pendingAttachments.map((att, index) => (
                <span
                  key={att.storedName}
                  className="flex items-center gap-1 rounded-full border border-border-default bg-background-surface-raised py-0.5 pr-1.5 pl-0.5 text-[10px] text-text-secondary"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- see the message-thread attachment thumbnail above for why */}
                  <img src={`${API_BASE_URL}/api/files/${att.storedName}`} alt="" className="size-4 rounded-full object-cover" />
                  <span className="max-w-20 truncate">{att.originalName}</span>
                  <button
                    type="button"
                    onClick={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== index))}
                    aria-label={`Remove ${att.originalName}`}
                    className="text-text-muted hover:text-text-primary"
                  >
                    <X className="size-2.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {/* Composer (fine-tune pass, Istiyak: "Need to fine tunned ours... looks bit
              immature" against a second reference) — one clean rounded field and a
              SINGLE trailing circular button that does double duty: a mic while the
              field is empty (tap to dictate), a send arrow the moment there's something
              to send — mirrors the reference's own single blue circle exactly, instead
              of a separate mic button living inside the pill alongside a second send
              button outside it. */}
          <div className={cn("nodrag flex shrink-0 items-end gap-1.5 px-2.5 pb-1.5 pt-1.5", pendingAttachments.length === 0 && "border-t border-border-muted")}>
            <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-border-default bg-background-surface-raised px-3 py-2 focus-within:border-border-focus">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(prompt);
                  }
                }}
                placeholder="Ask anything…"
                rows={1}
                disabled={isSending}
                className="nowheel scrollbar-thin min-w-0 max-h-24 flex-1 resize-none bg-transparent text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-none disabled:opacity-50"
              />
            </div>
            <button
              type="button"
              onClick={() => (hasSendableInput ? void send(prompt) : toggleRecording())}
              disabled={isSending || (!hasSendableInput && !speechSupported)}
              aria-label={hasSendableInput ? "Send" : isRecording ? "Stop voice input" : "Voice input"}
              title={hasSendableInput ? "Send" : isRecording ? "Stop voice input" : "Voice input"}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full text-text-on-accent transition-colors duration-fast disabled:opacity-40",
                isRecording && !hasSendableInput ? "bg-background-danger" : "bg-background-accent"
              )}
            >
              {isSending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : hasSendableInput ? (
                <Send className="size-4" aria-hidden="true" />
              ) : (
                <Mic className={cn("size-4", isRecording && "animate-pulse")} aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Controls row (fine-tune pass, matched to the reference's own bottom bar: a
              leading attach icon, the model picker, execution mode, Search/Thinking
              toggles and the notes gear, then quick-action chips — all one row that
              WRAPS rather than horizontally scrolls once it runs out of room, same as
              the reference's own two-line example. Quick actions are filled
              accent-tinted pills (not bordered/neutral) so they read as the one-click
              suggestions they are, distinct from the stateful toggles/pickers next to
              them — also straight from the reference. */}
          <div className="nodrag flex shrink-0 flex-wrap items-center gap-1.5 px-2.5 pb-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
              aria-label="Attach image"
              title="Attach image"
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-background-muted hover:text-text-primary disabled:opacity-50"
            >
              {isUploadingImage ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-3.5" aria-hidden="true" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleFileChosen} />
            <div className="relative shrink-0">
              <select className={pillSelectClass} value={typedData.model} onChange={(event) => updateData({ model: event.target.value })}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-2.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            </div>
            <div className="relative shrink-0">
              <select
                className={pillSelectClass}
                value={typedData.executionMode}
                onChange={(event) => updateData({ executionMode: event.target.value as ChatNodeData["executionMode"] })}
              >
                {EXECUTION_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-2.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            </div>
            <button type="button" onClick={() => setWebSearchEnabled((v) => !v)} className={toggleClass(webSearchEnabled)}>
              <Search className="size-3" aria-hidden="true" />
              Search
            </button>
            <button type="button" onClick={() => setThinkingEnabled((v) => !v)} className={toggleClass(thinkingEnabled)}>
              <Brain className="size-3" aria-hidden="true" />
              Thinking
            </button>
            <button
              type="button"
              onClick={() => setShowExtraSettings((v) => !v)}
              aria-label="More settings"
              title="More settings"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full",
                showExtraSettings ? "bg-background-accent-muted text-text-accent" : "text-text-secondary hover:bg-background-muted hover:text-text-primary"
              )}
            >
              <Settings2 className="size-3.5" aria-hidden="true" />
            </button>
            <span className="h-4 w-px shrink-0 bg-border-muted" aria-hidden="true" />
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={isSending}
                onClick={() => void send(action.prompt)}
                className="flex h-6 shrink-0 items-center rounded-full bg-background-accent-muted px-2.5 text-[11px] font-medium text-text-accent transition-colors duration-fast hover:bg-background-accent-muted/70 disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </NodeChrome>
  );
}

export const ChatNode = React.memo(ChatNodeImpl);
