/**
 * Lifecycle hooks: autoRecall and autoCapture.
 *
 * DEFENSIVE LOGIC - DO NOT REMOVE:
 * 1. event.success check - only capture successful agent runs
 * 2. <relevant-memories> stripping - avoid memory feedback loop
 * 3. extractWithSummaries(messages, 20, 25) - preserve high-density summaries
 * 4. Role filter: only user and assistant messages
 * 5. prompt length < 5 skips recall
 * 6. Fire-and-forget pattern: IIFE + .catch()
 * 7. Noise filtering on both recall and capture
 * 8. Cron/heartbeat session filtering
 */

import type {
  AddOptions,
  MemoryItem,
  OpenClawPluginApi,
  PluginConfig,
  ResolvedIdentity,
  SearchOptions,
} from "./types.js";
import type { Mem0HTTPProvider } from "./providers.js";
import {
  cleanSearchQuery,
  extractWithSummaries,
  filterMessagesForExtraction,
  isNoiseMessage,
} from "./filtering.js";

// ============================================================================
// Types
// ============================================================================

type ResolveFn = (opts?: { userId?: string; agentId?: string }, ctxAgentId?: string) => ResolvedIdentity;
type BuildAddFn = (identity: ResolvedIdentity, runId?: string) => AddOptions;
type BuildSearchFn = (identity: ResolvedIdentity, limit?: number, runId?: string) => SearchOptions;

interface SessionState {
  setCurrentSessionId: (id: string) => void;
  getCurrentSessionId: () => string | undefined;
}

// ============================================================================
// Non-interactive session detection
// ============================================================================

/**
 * Check if a session key indicates a non-interactive (cron/hook/heartbeat) session.
 * These sessions should NOT trigger memory hooks.
 */
function isNonInteractiveSession(sessionKey: string): boolean {
  if (!sessionKey || typeof sessionKey !== "string") return false;
  return (
    sessionKey.includes(":cron:") ||
    sessionKey.startsWith("cron:") ||
    sessionKey.includes(":hook:") ||
    sessionKey.startsWith("hook:") ||
    sessionKey.includes(":heartbeat")
  );
}

// ============================================================================
// Hook Registration
// ============================================================================

export function registerHooks(
  api: OpenClawPluginApi,
  provider: Mem0HTTPProvider,
  cfg: PluginConfig,
  resolve: ResolveFn,
  buildAddOptions: BuildAddFn,
  buildSearchOptions: BuildSearchFn,
  session: SessionState,
): void {
  // ------------------------------------------------------------------
  // autoRecall: before_prompt_build
  // ------------------------------------------------------------------

  api.on("before_prompt_build", async (event: any, ctx: any) => {
    if (!cfg.autoRecall) return;

    const sessionId = ctx?.sessionKey ?? ctx?.sessionId;
    if (sessionId) session.setCurrentSessionId(sessionId);

    // Skip non-interactive sessions (cron, hook, heartbeat)
    const sessionKeyStr: string = ctx?.sessionKey ?? ctx?.sessionId ?? "";
    if (isNonInteractiveSession(sessionKeyStr)) {
      api.logger.debug(`openclaw-mem0: skipping autoRecall for non-user session: ${sessionKeyStr}`);
      return;
    }

    // Noise filtering: system routing, heartbeat, trivial responses
    const rawPrompt: string = event.prompt ?? event.message ?? event.input ?? "";
    if (isNoiseMessage(rawPrompt, "user")) {
      api.logger.debug("openclaw-mem0: skipping autoRecall for noise message");
      return;
    }

    try {
      const identity = resolve({}, ctx?.agentId);
      const prompt = cleanSearchQuery(rawPrompt);
      if (rawPrompt.length !== prompt.length) {
        api.logger.debug(
          `openclaw-mem0: cleanSearchQuery trimmed ${rawPrompt.length} -> ${prompt.length} chars`,
        );
      }

      // Prompt too short - no meaningful query possible
      if (!prompt || prompt.length < 5) return;

      const currentSessionId = session.getCurrentSessionId();
      // Use combined search endpoint (single embed + UNION + rerank)
      const all = await provider.recall(
        prompt,
        buildSearchOptions(identity, undefined, currentSessionId),
      );
      if (!all.length) return;

      const lines = all.map((m: MemoryItem) => {
        let line = `- ${m.memory}`;
        if (m.metadata?.category) line += ` [${m.metadata.category}]`;
        return line;
      });

      api.logger.info(`openclaw-mem0: autoRecall injected ${all.length} memories`);
      return { prependContext: `<relevant-memories>\n${lines.join("\n")}\n</relevant-memories>` };
    } catch (err) {
      api.logger.warn(`openclaw-mem0: autoRecall error: ${String(err)}`);
    }
  });

  // ------------------------------------------------------------------
  // autoCapture: agent_end
  // ------------------------------------------------------------------

  api.on("agent_end", async (event: any, ctx: any) => {
    if (!cfg.autoCapture) return;

    // Debug: log agent_end context for diagnosing cron/heartbeat filtering
    const sessionId = ctx?.sessionKey ?? ctx?.sessionId ?? "unknown";
    const agentId = ctx?.agentId ?? "unknown";
    const source = ctx?.commandSource ?? "unknown";
    const firstMsg = (event.messages ?? [])[0];
    const promptLength = typeof firstMsg?.content === "string" ? firstMsg.content.length : 0;
    api.logger.debug(`openclaw-mem0: [agent_end] session=${sessionId} agent=${agentId} source=${source}`);
    api.logger.debug(`openclaw-mem0: [agent_end] prompt length=${promptLength}`);

    // Skip non-interactive sessions
    const sessionKeyStr: string = ctx?.sessionKey ?? ctx?.sessionId ?? "";
    if (isNonInteractiveSession(sessionKeyStr)) {
      api.logger.debug(`openclaw-mem0: skipping autoCapture for non-user session: ${sessionKeyStr}`);
      return;
    }

    // Check first user message for noise content
    const firstUserMsg = (event.messages ?? []).find(
      (m: any) => (m.role ?? "user") === "user",
    );
    let firstUserContent = "";
    if (firstUserMsg) {
      const c = firstUserMsg.content;
      if (typeof c === "string") {
        firstUserContent = c;
      } else if (Array.isArray(c)) {
        firstUserContent = c
          .filter((b: any) => b && typeof b === "object" && typeof b.text === "string")
          .map((b: any) => b.text)
          .join("\n");
      }
    }
    // Only skip if there IS content and it's noise; empty/missing content is fine
    if (firstUserContent && isNoiseMessage(firstUserContent, "user")) {
      api.logger.debug("openclaw-mem0: skipping autoCapture for noise/heartbeat session");
      return;
    }

    // DEFENSIVE: Skip failed agent runs
    if (event.success === false) return;

    const resolvedSessionId = ctx?.sessionKey ?? ctx?.sessionId;
    if (resolvedSessionId) session.setCurrentSessionId(resolvedSessionId);

    let messages = event.messages ?? [];
    if (!messages.length) return;

    // Thread contamination fix: only capture messages after "[Thread starter" marker
    const threadStarterIdx = messages.findLastIndex((m: any) => {
      const text = typeof m.content === "string" ? m.content : "";
      return text.includes("[Thread starter");
    });
    if (threadStarterIdx >= 0) {
      messages = messages.slice(threadStarterIdx + 1);
    }
    if (!messages.length) return;

    // Summary pattern extraction: preserve high-density summaries before window truncation
    messages = extractWithSummaries(messages, 20, 25, (msg: string) => api.logger.debug(msg));

    // Full extraction pipeline: noise filter, role filter, truncation
    const formatted = filterMessagesForExtraction(messages, (msg: string) => api.logger.debug(msg));
    if (!formatted.length) return;

    const identity = resolve({}, ctx?.agentId);
    const currentSessionId = session.getCurrentSessionId();

    // Inject "name" field so the SDK stores actor_id per message.
    // SDK behavior: msg.get("name") → stored as actor_id in metadata.
    const messagesWithActor = formatted.map((m) => ({
      ...m,
      name: m.role === "user" ? identity.user_id : identity.agent_id,
    }));

    // Fire-and-forget: don't await - agent_end returns immediately
    const capturePromise = (async () => {
      try {
        const addOpts = buildAddOptions(identity, currentSessionId);
        const result = await provider.add(messagesWithActor, addOpts);
        const count = result.results?.length ?? 0;
        if (count > 0) api.logger.info(`openclaw-mem0: auto-captured ${count} memories`);
      } catch (err) {
        api.logger.warn(`openclaw-mem0: capture failed: ${String(err)}`);
      }
    })();
    // Attach catch to prevent unhandled rejection
    capturePromise.catch((err: unknown) =>
      api.logger.warn(`openclaw-mem0: capture unhandled: ${String(err)}`),
    );
  });
}
