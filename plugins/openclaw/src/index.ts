/**
 * OpenClaw Mem0 Plugin (mem0-stack-oss edition)
 *
 * Long-term memory via self-hosted mem0-stack-oss API.
 * Pure HTTP - no mem0 JS SDK dependency.
 *
 * Features:
 * - 8 tools: memory_search, memory_store, memory_get, memory_update,
 *   memory_list, memory_forget, memory_history, memory_feedback
 * - Auto-recall: injects relevant memories before each agent turn
 * - Auto-capture: stores key facts after each agent turn (fire-and-forget)
 * - Per-agent identity resolution (user/agent mapping)
 * - Noise filtering, message cleanup, query sanitization
 * - Session + long-term memory scoping
 * - CLI: openclaw mem0 search, openclaw mem0 stats, openclaw mem0 entities
 */

import type {
  AddOptions,
  OpenClawPluginApi,
  PluginConfig,
  ResolvedIdentity,
  SearchOptions,
} from "./types.js";
import { parseConfig } from "./config.js";
import { resolveIdentity } from "./identity.js";
import { Mem0HTTPProvider } from "./providers.js";
import { registerTools } from "./tools.js";
import { registerHooks } from "./hooks.js";

// ============================================================================
// Re-exports
// ============================================================================

export { parseConfig } from "./config.js";
export { resolveIdentity } from "./identity.js";
export { Mem0HTTPProvider } from "./providers.js";
export {
  isNoiseMessage,
  cleanSearchQuery,
  truncateMessage,
  extractWithSummaries,
  filterMessagesForExtraction,
} from "./filtering.js";

// ============================================================================
// Plugin Definition
// ============================================================================

const memoryPlugin = {
  id: "openclaw-mem0",
  name: "Memory (Mem0)",
  description: "Mem0 memory backend - self-hosted API with identity resolution",
  kind: "memory" as const,

  register(api: OpenClawPluginApi) {
    const cfg = parseConfig(api.pluginConfig);

    if (!cfg.apiUrl) {
      api.logger.error("openclaw-mem0: apiUrl is required");
      return;
    }

    const provider = new Mem0HTTPProvider(cfg.apiUrl, cfg.apiKey);
    let currentSessionId: string | undefined;

    // Startup health check
    provider.health().then((ok) => {
      if (ok) {
        api.logger.info(
          `openclaw-mem0: connected (${cfg.apiUrl}, user: ${cfg.identity.defaultUserId}, agent: ${cfg.identity.defaultAgentId}, app: ${cfg.identity.appId})`,
        );
      } else {
        api.logger.warn(`openclaw-mem0: API unreachable at ${cfg.apiUrl}`);
      }
    });

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function resolve(
      opts?: { userId?: string; agentId?: string },
      ctxAgentId?: string,
    ): ResolvedIdentity {
      return resolveIdentity(cfg.identity, opts, ctxAgentId);
    }

    function buildAddOptions(identity: ResolvedIdentity, runId?: string): AddOptions {
      const opts: AddOptions = {
        user_id: identity.user_id,
        agent_id: identity.agent_id,
        app_id: identity.app_id,
        actor_id: identity.agent_id,
        enable_graph: cfg.enableGraph,
        output_format: "v1.1",
      };
      if (runId) opts.run_id = runId;
      // Only send customInstructions if explicitly configured
      if (cfg.customInstructions) {
        opts.custom_instructions = cfg.customInstructions;
      }
      return opts;
    }

    function buildSearchOptions(
      identity: ResolvedIdentity,
      limit?: number,
      runId?: string,
    ): SearchOptions {
      return {
        user_id: identity.user_id,
        agent_id: identity.agent_id,
        // Note: app_id not sent to search - mem0 SDK doesn't support it
        top_k: limit ?? cfg.topK,
        limit: limit ?? cfg.topK,
        threshold: cfg.searchThreshold,
        keyword_search: true,
        reranking: true,
        ...(runId ? { run_id: runId } : {}),
      };
    }

    // ------------------------------------------------------------------
    // Register tools
    // ------------------------------------------------------------------

    registerTools(
      api,
      provider,
      cfg,
      resolve,
      buildAddOptions,
      buildSearchOptions,
      () => currentSessionId,
    );

    // ------------------------------------------------------------------
    // Register hooks
    // ------------------------------------------------------------------

    registerHooks(api, provider, cfg, resolve, buildAddOptions, buildSearchOptions, {
      setCurrentSessionId: (id: string) => {
        currentSessionId = id;
      },
      getCurrentSessionId: () => currentSessionId,
    });

    // ------------------------------------------------------------------
    // CLI commands
    // ------------------------------------------------------------------

    registerCli(api, provider, cfg, resolve, buildSearchOptions);

    // ------------------------------------------------------------------
    // Service lifecycle
    // ------------------------------------------------------------------

    api.registerService({
      id: "openclaw-mem0",
      start: () =>
        api.logger.info(
          `openclaw-mem0: initialized (user: ${cfg.identity.defaultUserId}, autoRecall: ${cfg.autoRecall}, autoCapture: ${cfg.autoCapture})`,
        ),
      stop: () => api.logger.info("openclaw-mem0: stopped"),
    });
  },
};

// ============================================================================
// CLI Registration
// ============================================================================

type ResolveFn = (opts?: { userId?: string; agentId?: string }, ctxAgentId?: string) => ResolvedIdentity;
type BuildSearchFn = (identity: ResolvedIdentity, limit?: number, runId?: string) => SearchOptions;

function registerCli(
  api: OpenClawPluginApi,
  provider: Mem0HTTPProvider,
  cfg: PluginConfig,
  resolve: ResolveFn,
  buildSearchOptions: BuildSearchFn,
): void {
  api.registerCli(
    ({ program }: { program: any }) => {
      const mem0 = program.command("mem0").description("Mem0 memory plugin commands");

      mem0
        .command("search")
        .description("Search memories")
        .argument("<query>", "Search query")
        .option("--limit <n>", "Max results", String(cfg.topK))
        .option("--agent <agentId>", "Search a specific agent's memories")
        .action(async (query: string, opts: { limit: string; agent?: string }) => {
          try {
            const identity = resolve({ agentId: opts.agent });
            const results = await provider.search(
              query,
              buildSearchOptions(identity, parseInt(opts.limit, 10)),
            );
            if (!results.length) {
              console.log("No memories found.");
              return;
            }
            for (const m of results) {
              const score = m.score ? ` (${m.score.toFixed(3)})` : "";
              const cat = m.metadata?.category ? ` [${m.metadata.category}]` : "";
              console.log(`${m.id.slice(0, 8)} ${m.memory.slice(0, 100)}${score}${cat}`);
            }
            console.log(`\n${results.length} result(s)`);
          } catch (err) {
            console.error(`Search failed: ${err}`);
          }
        });

      mem0
        .command("stats")
        .description("Show memory statistics")
        .option("--agent <agentId>", "Stats for a specific agent")
        .option("--detail", "Show detailed stats from /stats endpoint")
        .action(async (opts: { agent?: string; detail?: boolean }) => {
          try {
            const identity = resolve({ agentId: opts.agent });
            console.log(`API: ${cfg.apiUrl}`);
            console.log(
              `User: ${identity.user_id} | Agent: ${identity.agent_id} | App: ${identity.app_id}`,
            );

            if (opts.detail) {
              const stats = await provider.stats(
                identity.user_id,
                identity.agent_id,
                identity.app_id,
              );
              if ("fallback" in stats) {
                console.log(
                  `Total memories: ${stats.total_memories} (fallback mode - /stats endpoint not available)`,
                );
              } else {
                for (const [key, value] of Object.entries(stats)) {
                  console.log(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
                }
              }
            } else {
              const memories = await provider.getAll({
                user_id: identity.user_id,
                agent_id: identity.agent_id,
                app_id: identity.app_id,
              });
              console.log(`Total memories: ${Array.isArray(memories) ? memories.length : "unknown"}`);
            }
          } catch (err) {
            console.error(`Stats failed: ${err}`);
          }
        });

      mem0
        .command("entities")
        .description("List entities and their memory counts")
        .action(async () => {
          try {
            const identity = resolve();
            const data = await provider.entities(identity.user_id);
            const agents = (data.agents ?? []) as Array<Record<string, unknown>>;
            const apps = (data.apps ?? []) as Array<Record<string, unknown>>;
            const totalMemories = data.total_memories ?? "?";

            if (!agents.length && !apps.length) {
              console.log("No entities found.");
              return;
            }
            console.log(`Entities for user: ${identity.user_id}\n`);

            if (agents.length) {
              console.log("Agents:");
              for (const agent of agents) {
                const id = agent.agent_id ?? agent.name ?? agent.id ?? "unknown";
                const count = agent.memory_count ?? agent.count ?? "?";
                console.log(`  ${id}: ${count} memories`);
              }
            }

            if (apps.length) {
              if (agents.length) console.log("");
              console.log("Apps:");
              for (const app of apps) {
                const id = app.app_id ?? app.name ?? app.id ?? "unknown";
                const count = app.memory_count ?? app.count ?? "?";
                console.log(`  ${id}: ${count} memories`);
              }
            }

            console.log(`\nTotal memories: ${totalMemories}`);
          } catch (err) {
            console.error(`Entities failed: ${err}`);
          }
        });
    },
    { commands: ["mem0"] },
  );
}

export default memoryPlugin;
