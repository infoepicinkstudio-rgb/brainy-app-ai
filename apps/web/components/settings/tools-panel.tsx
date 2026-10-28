"use client";

// Real tools panel (Phase 4) — replaces tools-panel-stub.tsx now that chat nodes
// actually exist. Two jobs: (1) show which provider's chat node is placeable on the
// canvas right now, straight from the same `isConfigured()` the backend uses to gate
// the toolbar buttons (page.tsx) and the send route itself (chat.ts) — so this panel
// can never claim a provider is "enabled" when a placement attempt would actually be
// rejected; (2) F-29's running cost total per provider, summed server-side from
// `chat_messages.estimated_cost` (Native API turns only — Local/Manual never populate
// that column, so they correctly never contribute here).

import * as React from "react";
import { CircleCheck, CircleDashed } from "lucide-react";
import type { Provider, ProviderStatus } from "@/stores/settings-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
};

interface CostSummary {
  totals: Array<{ provider: Provider; estimatedCostUsd: number }>;
}

function formatUsd(amount: number): string {
  // Running estimates can be fractions of a cent on the first few messages — four
  // decimal places until the total clears $1, then the usual two, so a brand-new
  // provider doesn't just read "$0.00" after real usage.
  if (amount > 0 && amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function ToolsPanel({ providers }: { providers: ProviderStatus[] }) {
  const [costSummary, setCostSummary] = React.useState<CostSummary | null>(null);
  const [costError, setCostError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<CostSummary>("/api/providers/cost-summary")
      .then((summary) => {
        if (!cancelled) setCostSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setCostError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const costByProvider = new Map(costSummary?.totals.map((t) => [t.provider, t.estimatedCostUsd]) ?? []);
  const grandTotal = costSummary?.totals.reduce((sum, t) => sum + t.estimatedCostUsd, 0) ?? 0;

  return (
    <div className="rounded-lg border border-border-default p-3">
      <p className="text-xs text-text-muted">Chat node availability</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {providers.map((status) => {
          // A key is only required for Native API — Local LLM/Manual Input need none
          // (F-12), so "placeable on the canvas" and "Native API ready" are two
          // different things now; this list and the canvas toolbar's own gate
          // (page.tsx) agree on exactly this condition so neither contradicts the other.
          const startsKeyless = status.executionMode === "local" || status.executionMode === "manual";
          const canPlace = status.isConfigured || startsKeyless;
          return (
            <li key={status.provider} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                {canPlace ? (
                  <CircleCheck className="size-3.5 shrink-0 text-text-success" aria-hidden="true" />
                ) : (
                  <CircleDashed className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                )}
                <span className={cn(canPlace ? "text-text-primary" : "text-text-muted")}>
                  {PROVIDER_LABELS[status.provider]} chat node
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {!costError && costSummary ? (
                  <span className="text-xs tabular-nums text-text-muted">{formatUsd(costByProvider.get(status.provider) ?? 0)}</span>
                ) : null}
                <span className={cn("text-xs", canPlace ? "text-text-success" : "text-text-muted")}>
                  {status.isConfigured ? "Enabled" : startsKeyless ? "Enabled (no key needed)" : "Add a key"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* F-29 running total — Native API estimated spend only; a rough estimate from
          each model's published per-1k-token rate (providers/*.ts), not a billed
          figure, so it's labeled accordingly rather than implying precision it doesn't
          have. */}
      <div className="mt-3 flex items-center justify-between border-t border-border-muted pt-2 text-xs">
        <span className="text-text-muted">Estimated spend (Native API)</span>
        {costError ? (
          <span className="text-text-muted">—</span>
        ) : costSummary ? (
          <span className="font-medium tabular-nums text-text-secondary">{formatUsd(grandTotal)}</span>
        ) : (
          <span className="text-text-muted">Loading…</span>
        )}
      </div>
    </div>
  );
}
