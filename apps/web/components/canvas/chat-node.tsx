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
  MessageSquare,
  Mic,
  Network,
  PanelLeft,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import { useBoardStore, type ChatNodeData } from "@/stores/board-store";
import { useToastStore } from "@/stores/toast-store";
import { NodeChrome } from "@/components/canvas/node-chrome";
import { NodeHeader } from "@/components/canvas/node-header";
import {
  streamChat,
  listChatSessions,
  createChatSession,
  uploadChatImage,
  assembleManualPrompt,
  saveManualTurn,
  generateMindmap,
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
  openai: [
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna (fast, cheap)" },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra (balanced)" },
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol (strongest)" },
  ],
  gemini: [
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (fast, cheap)" },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (balanced)" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (strongest)" },
  ],
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
  const refreshNodesData = useBoardStore((state) => state.refreshNodesData);
  const addMindmapNode = useBoardStore((state) => state.addMindmapNode);

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
  // Phase 5 (ADR-0044/ADR-0085/ADR-0086/ADR-0087) — the chat SSE stream's "extracting"
  // event (chat.ts, mid-`assembleContext`). Label-only; which connected node(s) it fired
  // for is tracked separately below so their cards can be refreshed once the turn ends.
  const [streamingExtraction, setStreamingExtraction] = React.useState<{ nodeId: string; label: string } | null>(null);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastPromptRef = React.useRef("");
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamingText, streamingThinking, streamingSearch, streamingExtraction]);

  // Per-message toggles (Istiyak: "websearch/thinking on/off") — deliberately NOT part
  // of ChatNodeData: these read as "how should THIS send behave," closer to the
  // model/mode pickers' own per-node-but-user-driven spirit than a persisted setting,
  // and the reference UI treats them the same way (plain toggle pills next to the
  // composer, not a saved preference).
  const [webSearchEnabled, setWebSearchEnabled] = React.useState(false);
  const [thinkingEnabled, setThinkingEnabled] = React.useState(false);

  // Local LLM (Ollama) status — live, not static like the cloud providers' model lists,
  // since what's actually usable depends on what's installed/running on Istiyak's own
  // machine right now and that can change between page loads (apps/server/src/providers/
  // ollama.ts's own comment has the full reasoning). Fetched once on mount, not only
  // when execution mode is already "local", so switching INTO Local LLM mode shows a
  // ready model list immediately rather than a blank dropdown for one extra round trip.
  const [localStatus, setLocalStatus] = React.useState<{ available: boolean; models: { id: string; label: string }[] } | null>(null);
  React.useEffect(() => {
    api
      .get<{ available: boolean; models: { id: string; label: string }[] }>("/api/providers/local-models")
      .then(setLocalStatus)
      .catch(() => setLocalStatus({ available: false, models: [] }));
  }, []);

  // Switching a node INTO Local LLM mode while it still holds a cloud model id (e.g.
  // "claude-sonnet-5-5") would otherwise send that id straight to Ollama, which won't
  // recognize it — this keeps `data.model` always valid for whichever mode is active,
  // the same "never blocks on a choice" spirit F-12 already asks of the model selector.
  React.useEffect(() => {
    if (typedData.executionMode !== "local" || !localStatus || localStatus.models.length === 0) return;
    const stillValid = localStatus.models.some((m) => m.id === typedData.model);
    if (!stillValid) updateData({ model: localStatus.models[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when mode/status change, not on every model edit
  }, [typedData.executionMode, localStatus]);

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
    setStreamingExtraction(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = "";
    let thinkingAccum = "";
    let searchAccum: { query?: string; results?: { url: string; title: string }[] } = {};
    let sawError: string | null = null;
    // Phase 5 — every node id an "extracting" event named this turn, so their cards
    // (video/audio/link, each showing their own NodeExtractionStatus) can be refreshed
    // once the turn ends rather than staying on a stale "pending"/absent status until
    // the next full board reload.
    const extractedNodeIds = new Set<string>();

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
      } else if (event.type === "extracting") {
        extractedNodeIds.add(event.nodeId);
        setStreamingExtraction({ nodeId: event.nodeId, label: event.label });
      } else if (event.type === "error") {
        sawError = event.message;
      }
      // "done" needs no branch — falling out of the loop covers it.
    }

    if (extractedNodeIds.size > 0) {
      void refreshNodesData([...extractedNodeIds]);
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
    setStreamingExtraction(null);
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

  // Mindmap generation (F-17/TF-10, ADR-0101) --------------------------------------
  // A single `generatingMessageId` (not a per-message busy set) is enough here —
  // generating more than one mindmap at once from the same card would be an odd thing
  // to even attempt, and this keeps every other message's button correctly disabled
  // while one generation is in flight, matching `isSending`'s own all-or-nothing gate
  // on Regenerate above.
  const [generatingMessageId, setGeneratingMessageId] = React.useState<string | null>(null);
  async function handleGenerateMindmap(message: DisplayMessage) {
    if (isManualMode) {
      useToastStore
        .getState()
        .showToast("Generate mindmap isn't available in Manual Input mode — switch this node to Native API or Local LLM first.");
      return;
    }
    if (!boardId || generatingMessageId) return;
    setGeneratingMessageId(message.id);
    try {
      const result = await generateMindmap(boardId, id, message.content);
      await addMindmapNode(id, result.topic, result.children);
    } catch (err) {
      useToastStore.getState().showToast(err instanceof ApiError ? err.message : "Couldn't generate a mindmap. Try again.");
    } finally {
      setGeneratingMessageId(null);
    }
  }

  // Manual Input bridge (F-12/F-20, Phase 6) ---------------------------------------
  // Not a send — a copy/paste convenience. `prompt`/`setPrompt` (the normal composer
  // state above) doubles as the draft here too; `manualAssembled` just tracks whether
  // that draft has been turned into a copyable block yet. Resets whenever the thread
  // itself changes, same as `messages` does, so switching sessions never leaves a
  // stale assembled prompt sitting over the wrong conversation.
  const isManualMode = typedData.executionMode === "manual";
  const [manualAssembled, setManualAssembled] = React.useState<string | null>(null);
  const [manualResponseDraft, setManualResponseDraft] = React.useState("");
  const [isAssembling, setIsAssembling] = React.useState(false);
  const [isSavingManualTurn, setIsSavingManualTurn] = React.useState(false);

  React.useEffect(() => {
    setManualAssembled(null);
    setManualResponseDraft("");
  }, [activeSessionId]);

  // Optional `text` lets a quick-action pill assemble its own canned prompt directly,
  // the same way it calls `send(action.prompt)` in every other mode, without a
  // setPrompt-then-read-stale-state round trip.
  async function assembleManual(text?: string) {
    const toAssemble = (text ?? prompt).trim();
    if (!boardId || !toAssemble || isAssembling) return;
    setError(null);
    setIsAssembling(true);
    setPrompt(toAssemble);
    try {
      setManualAssembled(await assembleManualPrompt(boardId, id, toAssemble));
    } catch {
      setError("Couldn't assemble the prompt — check the server is running.");
    } finally {
      setIsAssembling(false);
    }
  }

  function cancelManualAssembled() {
    setManualAssembled(null);
    setManualResponseDraft("");
  }

  async function saveManualResponse() {
    if (!boardId || manualAssembled === null || !manualResponseDraft.trim() || isSavingManualTurn) return;
    setError(null);
    setIsSavingManualTurn(true);

    let sessionId = activeSessionId;
    if (!sessionId) {
      // Same lazy-create as the real send path — a brand-new node gets no session
      // row until its first turn, manual or otherwise.
      try {
        const created = await createChatSession(boardId, id);
        sessionId = created.id;
        setActiveSessionId(created.id);
        setSessions((prev) => [created, ...prev]);
      } catch {
        setError("Couldn't start a conversation — check the server is running.");
        setIsSavingManualTurn(false);
        return;
      }
    }

    try {
      const { userMessage, assistantMessage } = await saveManualTurn(boardId, id, prompt.trim(), manualResponseDraft.trim(), sessionId);
      setMessages((prev) => [
        ...prev,
        { id: userMessage.id, role: "user", content: userMessage.content },
        { id: assistantMessage.id, role: "assistant", content: assistantMessage.content },
      ]);
      setPrompt("");
      setManualAssembled(null);
      setManualResponseDraft("");
      listChatSessions(boardId, id)
        .then(setSessions)
        .catch(() => {});
    } catch {
      setError("Couldn't save that turn — check the server is running.");
    } finally {
      setIsSavingManualTurn(false);
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
  // Local LLM mode swaps in Ollama's real installed models instead of this provider's
  // static cloud list — the node keeps its provider icon/branding either way (see
  // routes/chat.ts's own comment on why "local" bypasses `provider` only for routing,
  // not for the rest of the node's identity).
  const models = typedData.executionMode === "local" ? (localStatus?.models ?? []) : MODEL_OPTIONS[typedData.provider];
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
                // Round 2 #4 (empty-states polish) — was bare text. This column is only
                // 144px wide (w-36 on the parent), too narrow for the full icon-chip
                // treatment used elsewhere, so this is a compact icon-above-text version
                // instead.
                <div className="flex flex-col items-center gap-1.5 px-2 py-6 text-center">
                  <MessageSquare className="size-4 text-text-muted" aria-hidden="true" />
                  <p className="text-[11px] text-text-muted">No chats yet.</p>
                </div>
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
              nothing". Local LLM actually sends now (Ollama); Manual Input is a real
              copy/paste bridge now too (Phase 6, F-12/F-20) — this is informational,
              not a warning, since the mode itself isn't broken or unreachable. */}
          {isManualMode ? (
            <p className="shrink-0 border-b border-border-muted px-2.5 py-1.5 text-[11px] text-text-muted">
              Manual Input — write a prompt below, copy the assembled version, then paste the reply back in once you have it.
            </p>
          ) : typedData.executionMode === "local" && localStatus && !localStatus.available ? (
            <p className="shrink-0 border-b border-border-muted px-2.5 py-1.5 text-[11px] text-text-warning">
              Ollama isn't reachable — install it from{" "}
              <a href="https://ollama.com" target="_blank" rel="noreferrer" className="nodrag underline">
                ollama.com
              </a>
              , run <code className="rounded bg-background-muted px-1 py-0.5">ollama pull llama3.2</code> (or any model), and make sure
              it's running.
            </p>
          ) : null}

          {/* Message thread */}
          <div ref={scrollRef} className="nowheel scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2.5 py-2.5">
            {!historyLoaded ? (
              <p className="text-xs text-text-muted">Loading…</p>
            ) : messages.length === 0 && streamingText === null ? (
              // Round 2 #4 (empty-states polish) — was a plain top-aligned line sitting
              // like a stray system message. This container is the sole child in both
              // cases, so `flex-1` here correctly fills and centers within the whole
              // available thread area instead of sitting flush at the top.
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-background-muted text-text-muted">
                  <Bot className="size-5" aria-hidden="true" />
                </span>
                <p className="max-w-[220px] text-xs text-text-muted">
                  Connect a text, file, or link node, then ask about it here.
                </p>
              </div>
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
                    <button
                      type="button"
                      onClick={() => void handleGenerateMindmap(message)}
                      disabled={generatingMessageId !== null}
                      aria-label={isManualMode ? "Generate mindmap (switch to Native API or Local LLM first)" : "Generate mindmap"}
                      title={isManualMode ? "Generate mindmap (switch to Native API or Local LLM first)" : "Generate mindmap"}
                      className="hover:text-text-primary disabled:opacity-50"
                    >
                      {generatingMessageId === message.id ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Network className="size-3" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              )
            )}
            {streamingText !== null ? (
              <div className="flex w-full flex-col gap-1">
                {streamingExtraction ? (
                  // Phase 5 — a connected video/audio/link node's content wasn't
                  // cached yet, so the lazy pipeline is running for it right now; this
                  // can take minutes (media-extraction.ts's own pipeline timeout), so
                  // it gets its own clearly-labeled line rather than looking like a
                  // frozen response.
                  <p className="flex items-center gap-1 text-[10px] text-text-muted">
                    <Loader2 className="size-2.5 animate-spin" aria-hidden="true" />
                    {streamingExtraction.label}
                  </p>
                ) : null}
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

          {isManualMode && manualAssembled !== null ? (
            /* Manual Input bridge, stage 2 (F-12/F-20, Phase 6) — the prompt composer
               below is hidden while this is showing; the two states don't overlap, so
               there's never a question of which text box is "live". */
            <div className="nodrag flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-text-secondary">Assembled prompt — copy this</span>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(manualAssembled)}
                    className="nodrag flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-text-accent hover:bg-background-accent-muted"
                  >
                    <Copy className="size-3" aria-hidden="true" />
                    Copy
                  </button>
                </div>
                <textarea
                  readOnly
                  value={manualAssembled}
                  rows={6}
                  className="nowheel scrollbar-thin min-h-0 w-full resize-none rounded-md border border-border-default bg-background-surface-raised p-2 text-xs text-text-primary"
                />
              </div>
              <p className="text-[11px] text-text-muted">
                Paste the prompt above into {PROVIDER_LABELS[typedData.provider]} (or anywhere else), then bring the reply back here.
              </p>
              <div className="flex min-h-0 flex-1 flex-col gap-1">
                <span className="text-[11px] font-medium text-text-secondary">Paste the response</span>
                <textarea
                  value={manualResponseDraft}
                  onChange={(event) => setManualResponseDraft(event.target.value)}
                  placeholder="Paste the reply you got back…"
                  rows={6}
                  disabled={isSavingManualTurn}
                  className="nowheel scrollbar-thin min-h-0 w-full flex-1 resize-none rounded-md border border-border-default bg-background-surface-raised p-2 text-xs text-text-primary placeholder:text-text-muted disabled:opacity-50"
                />
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelManualAssembled}
                  disabled={isSavingManualTurn}
                  className="nodrag rounded-full px-3 py-1.5 text-[11px] text-text-secondary hover:bg-background-muted disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveManualResponse()}
                  disabled={isSavingManualTurn || !manualResponseDraft.trim()}
                  className="nodrag flex items-center gap-1.5 rounded-full bg-background-accent px-3 py-1.5 text-[11px] font-medium text-text-on-accent disabled:opacity-40"
                >
                  {isSavingManualTurn ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
                  Save response
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Composer (fine-tune pass, Istiyak: "Need to fine tunned ours... looks bit
                  immature" against a second reference) — one clean rounded field and a
                  SINGLE trailing circular button that does double duty: a mic while the
                  field is empty (tap to dictate), a send arrow the moment there's something
                  to send — mirrors the reference's own single blue circle exactly, instead
                  of a separate mic button living inside the pill alongside a second send
                  button outside it. In Manual Input mode (F-12/F-20, Phase 6), that same
                  trailing button assembles the prompt for copying instead of sending it. */}
              <div className={cn("nodrag flex shrink-0 items-end gap-1.5 px-2.5 pb-1.5 pt-1.5", pendingAttachments.length === 0 && "border-t border-border-muted")}>
                <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-border-default bg-background-surface-raised px-3 py-2 focus-within:border-border-focus">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void (isManualMode ? assembleManual() : send(prompt));
                      }
                    }}
                    placeholder="Ask anything…"
                    rows={1}
                    disabled={isSending || isAssembling}
                    className="nowheel scrollbar-thin min-w-0 max-h-24 flex-1 resize-none bg-transparent text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-none disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  // Round 1 bug #4 (Istiyak: "User should be able to stop response in
                  // between by stop button. Currently button is in processing mode so
                  // can't cancel the response in between") — this was a disabled
                  // spinner for the whole `isSending` window, no click handler at all.
                  // Now an active Stop control for that one case: aborts `send`'s own
                  // AbortController (already wired through to the fetch and, as of
                  // this fix, the server's provider call too — board-store.ts/
                  // chat-stream.ts's `for await` loop ends cleanly on an abort, same
                  // path as a normal finish, so whatever streamed in before the click
                  // is still kept as the saved reply). `isAssembling` (Manual Input's
                  // one-shot, non-streamed prompt build) is untouched — nothing there
                  // runs long enough to need a cancel.
                  onClick={() =>
                    isSending
                      ? abortRef.current?.abort()
                      : hasSendableInput
                        ? void (isManualMode ? assembleManual() : send(prompt))
                        : toggleRecording()
                  }
                  disabled={isAssembling || (!isSending && !hasSendableInput && !speechSupported)}
                  aria-label={
                    isSending
                      ? "Stop response"
                      : hasSendableInput
                        ? isManualMode
                          ? "Assemble prompt"
                          : "Send"
                        : isRecording
                          ? "Stop voice input"
                          : "Voice input"
                  }
                  title={
                    isSending
                      ? "Stop response"
                      : hasSendableInput
                        ? isManualMode
                          ? "Assemble prompt"
                          : "Send"
                        : isRecording
                          ? "Stop voice input"
                          : "Voice input"
                  }
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full text-text-on-accent transition-colors duration-fast disabled:opacity-40",
                    isRecording && !hasSendableInput ? "bg-background-danger" : "bg-background-accent"
                  )}
                >
                  {isSending ? (
                    <Square className="size-3.5 fill-current" aria-hidden="true" />
                  ) : isAssembling ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : hasSendableInput ? (
                    isManualMode ? (
                      <Copy className="size-4" aria-hidden="true" />
                    ) : (
                      <Send className="size-4" aria-hidden="true" />
                    )
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
                {/* Manual Input is a plain-text copy/paste bridge — an attached image
                    has nowhere to go (manual-assemble only ever builds text), so the
                    affordance is hidden here rather than letting it attach and then
                    silently vanish at assemble time. */}
                {!isManualMode && (
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
                )}
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleFileChosen} />
                <div className="relative shrink-0">
                  <select
                    className={pillSelectClass}
                    value={typedData.model}
                    onChange={(event) => updateData({ model: event.target.value })}
                    disabled={typedData.executionMode === "local" && models.length === 0}
                  >
                    {models.length > 0 ? (
                      models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))
                    ) : (
                      <option value={typedData.model}>{localStatus === null ? "Loading models…" : "No local models found"}</option>
                    )}
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
                    disabled={isSending || isAssembling}
                    onClick={() => void (isManualMode ? assembleManual(action.prompt) : send(action.prompt))}
                    className="flex h-6 shrink-0 items-center rounded-full bg-background-accent-muted px-2.5 text-[11px] font-medium text-text-accent transition-colors duration-fast hover:bg-background-accent-muted/70 disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </NodeChrome>
  );
}

export const ChatNode = React.memo(ChatNodeImpl);
