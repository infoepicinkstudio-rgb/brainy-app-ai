import type { Provider, ProviderStatus } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
};

// Proves isConfigured() (architecture.md §4.2) correctly reflects saved/cleared keys —
// the real tools panel UI is Phase 4, this stub only needs to show enabled/disabled
// state per provider node type, nothing more.
export function ToolsPanelStub({ providers }: { providers: ProviderStatus[] }) {
  return (
    <div className="rounded-lg border border-border-default p-3">
      <p className="text-xs text-text-muted">Chat node availability (preview — the full tools panel arrives in Phase 4)</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {providers.map((status) => (
          <li key={status.provider} className="flex items-center justify-between text-sm">
            <span className={cn(status.isConfigured ? "text-text-primary" : "text-text-muted")}>
              {PROVIDER_LABELS[status.provider]} chat node
            </span>
            <span className={cn("text-xs", status.isConfigured ? "text-text-success" : "text-text-muted")}>
              {status.isConfigured ? "Enabled" : "Disabled — add a key"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
