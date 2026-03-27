/**
 * Memory tools registration.
 *
 * 8 tools: search, store, get, update, list, forget, history, feedback
 */

import { Type } from "@sinclair/typebox";

import type {
  AddOptions,
  ListOptions,
  MemoryItem,
  OpenClawPluginApi,
  PluginConfig,
  ResolvedIdentity,
  SearchOptions,
} from "./types.js";
import type { Mem0HTTPProvider } from "./providers.js";

// ============================================================================
// Types for helper functions
// ============================================================================

type ResolveFn = (opts?: { userId?: string; agentId?: string }, ctxAgentId?: string) => ResolvedIdentity;
type BuildAddFn = (identity: ResolvedIdentity, runId?: string) => AddOptions;
type BuildSearchFn = (identity: ResolvedIdentity, limit?: number, runId?: string) => SearchOptions;

// ============================================================================
// Tool Registration
// ============================================================================

export function registerTools(
  api: OpenClawPluginApi,
  provider: Mem0HTTPProvider,
  cfg: PluginConfig,
  resolve: ResolveFn,
  buildAddOptions: BuildAddFn,
  buildSearchOptions: BuildSearchFn,
  getCurrentSessionId: () => string | undefined,
): void {
  // ------------------------------------------------------------------
  // memory_search
  // ------------------------------------------------------------------

  api.registerTool({
    name: "memory_search",
    label: "Memory Search",
    description: "Search memories by natural language query.",
    parameters: Type.Object({
      query: Type.String({ description: "Natural language search query" }),
      limit: Type.Optional(Type.Number({ description: "Max results" })),
      userId: Type.Optional(Type.String({ description: "Override user ID" })),
      agentId: Type.Optional(Type.String({ description: "Search a specific agent's memories" })),
      scope: Type.Optional(
        Type.Union(
          [Type.Literal("session"), Type.Literal("long-term"), Type.Literal("all")],
          { description: "Memory scope (default: all)" },
        ),
      ),
    }),
    async execute(_toolCallId: string, params: any) {
      const { query, limit, userId, agentId, scope = "all" } = params;
      const currentSessionId = getCurrentSessionId();
      try {
        const identity = resolve({ userId, agentId });
        let results: MemoryItem[] = [];

        if (scope === "session" && currentSessionId) {
          results = await provider.search(query, buildSearchOptions(identity, limit, currentSessionId));
        } else if (scope === "long-term") {
          results = await provider.search(query, buildSearchOptions(identity, limit));
        } else {
          // "all" - use combined search (single embed + UNION + rerank)
          results = await provider.recall(query, buildSearchOptions(identity, limit, currentSessionId));
        }

        if (!results.length) return { content: [{ type: "text", text: "No memories found." }], details: {} };
        const text = results
          .map((m, i) => `${i + 1}. ${m.memory}${m.score ? ` (score: ${m.score.toFixed(3)})` : ""}`)
          .join("\n");
        return { content: [{ type: "text", text }], details: { count: results.length } };
      } catch (err) {
        return { content: [{ type: "text", text: `Search failed: ${String(err)}` }], details: {} };
      }
    },
  });

  // ------------------------------------------------------------------
  // memory_store
  // ------------------------------------------------------------------

  api.registerTool({
    name: "memory_store",
    label: "Memory Store",
    description: "Explicitly save a fact to memory.",
    parameters: Type.Object({
      text: Type.String({ description: "The fact to remember" }),
      userId: Type.Optional(Type.String({ description: "Override user ID" })),
      agentId: Type.Optional(Type.String({ description: "Store under a specific agent" })),
      longTerm: Type.Optional(
        Type.Boolean({ description: "true=long-term (default), false=session-scoped" }),
      ),
      metadata: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), { description: "Optional metadata to attach" }),
      ),
    }),
    async execute(_toolCallId: string, params: any) {
      const { text, userId, agentId, longTerm = true, metadata } = params;
      const currentSessionId = getCurrentSessionId();
      try {
        const identity = resolve({ userId, agentId });
        const runId = !longTerm && currentSessionId ? currentSessionId : undefined;
        const addOpts = buildAddOptions(identity, runId);
        if (metadata && typeof metadata === "object") {
          addOpts.metadata = metadata;
        }
        const result = await provider.add([{ role: "user", content: text }], addOpts);
        const count = result.results?.length ?? 0;
        return {
          content: [
            { type: "text", text: count > 0 ? `Stored ${count} memory item(s).` : "No new memories extracted." },
          ],
          details: { count },
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Store failed: ${String(err)}` }], details: {} };
      }
    },
  });

  // ------------------------------------------------------------------
  // memory_get
  // ------------------------------------------------------------------

  api.registerTool({
    name: "memory_get",
    label: "Memory Get",
    description: "Retrieve a specific memory by ID.",
    parameters: Type.Object({
      memoryId: Type.String({ description: "Memory ID to retrieve" }),
    }),
    async execute(_toolCallId: string, params: any) {
      try {
        const mem = await provider.get(params.memoryId);
        if (!mem) return { content: [{ type: "text", text: "Memory not found." }], details: {} };
        return { content: [{ type: "text", text: mem.memory }], details: { id: mem.id } };
      } catch (err) {
        return { content: [{ type: "text", text: `Get failed: ${String(err)}` }], details: {} };
      }
    },
  });

  // ------------------------------------------------------------------
  // memory_update
  // ------------------------------------------------------------------

  api.registerTool({
    name: "memory_update",
    label: "Memory Update",
    description: "Update the text of an existing memory by ID.",
    parameters: Type.Object({
      memoryId: Type.String({ description: "Memory ID to update" }),
      text: Type.String({ description: "New memory text" }),
    }),
    async execute(_toolCallId: string, params: any) {
      try {
        const mem = await provider.update(params.memoryId, params.text);
        return {
          content: [{ type: "text", text: `Updated memory ${mem.id}.` }],
          details: { id: mem.id, memory: mem.memory },
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Update failed: ${String(err)}` }], details: {} };
      }
    },
  });

  // ------------------------------------------------------------------
  // memory_list
  // ------------------------------------------------------------------

  api.registerTool({
    name: "memory_list",
    label: "Memory List",
    description: "List all stored memories for a user or agent.",
    parameters: Type.Object({
      userId: Type.Optional(Type.String({ description: "Override user ID" })),
      agentId: Type.Optional(Type.String({ description: "List a specific agent's memories" })),
      scope: Type.Optional(
        Type.Union(
          [Type.Literal("session"), Type.Literal("long-term"), Type.Literal("all")],
          { description: "Memory scope (default: all)" },
        ),
      ),
    }),
    async execute(_toolCallId: string, params: any) {
      const { userId, agentId, scope = "all" } = params;
      const currentSessionId = getCurrentSessionId();
      try {
        const identity = resolve({ userId, agentId });
        const listOpts: ListOptions = {
          user_id: identity.user_id,
          agent_id: identity.agent_id,
          app_id: identity.app_id,
        };
        let memories: MemoryItem[] = [];

        if (scope === "session" && currentSessionId) {
          memories = await provider.getAll({ ...listOpts, run_id: currentSessionId });
        } else if (scope === "long-term") {
          memories = await provider.getAll(listOpts);
        } else {
          memories = await provider.getAll(listOpts);
          if (currentSessionId) {
            const session = await provider.getAll({ ...listOpts, run_id: currentSessionId });
            const seen = new Set(memories.map((m) => m.id));
            memories.push(...session.filter((m) => !seen.has(m.id)));
          }
        }

        if (!memories.length) return { content: [{ type: "text", text: "No memories found." }], details: {} };
        const text = memories.map((m, i) => `${i + 1}. [${m.id.slice(0, 8)}] ${m.memory}`).join("\n");
        return { content: [{ type: "text", text }], details: { count: memories.length } };
      } catch (err) {
        return { content: [{ type: "text", text: `List failed: ${String(err)}` }], details: {} };
      }
    },
  });

  // ------------------------------------------------------------------
  // memory_forget
  // ------------------------------------------------------------------

  api.registerTool({
    name: "memory_forget",
    label: "Memory Forget",
    description: "Delete a memory by ID, or search and delete matching memories.",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "Search query to find memories to delete" })),
      memoryId: Type.Optional(Type.String({ description: "Specific memory ID to delete" })),
      agentId: Type.Optional(Type.String({ description: "Scope deletion to a specific agent" })),
    }),
    async execute(_toolCallId: string, params: any) {
      const { query, memoryId, agentId } = params;
      try {
        if (memoryId) {
          await provider.delete(memoryId);
          return { content: [{ type: "text", text: `Deleted memory ${memoryId}.` }], details: {} };
        }
        if (query) {
          const identity = resolve({ agentId });
          const results = await provider.search(query, buildSearchOptions(identity, 5));
          if (!results.length) {
            return { content: [{ type: "text", text: "No matching memories found." }], details: {} };
          }
          // High confidence: single result or score > 0.9 -> delete directly
          const highConfidence = results.filter((m) => m.score && m.score > 0.9);
          if (results.length === 1 || highConfidence.length > 0) {
            const toDelete = results.length === 1 ? results : highConfidence;
            let deleted = 0;
            const errors: string[] = [];
            for (const m of toDelete) {
              try {
                await provider.delete(m.id);
                deleted++;
              } catch (err) {
                errors.push(`${m.id.slice(0, 8)}: ${String(err)}`);
              }
            }
            let msg = `Deleted ${deleted} matching memor${deleted === 1 ? "y" : "ies"}.`;
            if (errors.length) msg += `\nErrors: ${errors.join(", ")}`;
            return { content: [{ type: "text", text: msg }], details: { deleted } };
          }
          // Low confidence: return candidates for user to choose
          const candidates = results
            .map(
              (m, i) =>
                `${i + 1}. [${m.id.slice(0, 8)}] ${m.memory.slice(0, 100)}${m.score ? ` (score: ${m.score.toFixed(3)})` : ""}`,
            )
            .join("\n");
          return {
            content: [
              {
                type: "text",
                text: `Found ${results.length} candidates. Use memoryId to delete a specific one:\n${candidates}`,
              },
            ],
            details: { candidates: results.length },
          };
        }
        return { content: [{ type: "text", text: "Provide either a memoryId or a query." }], details: {} };
      } catch (err) {
        return { content: [{ type: "text", text: `Forget failed: ${String(err)}` }], details: {} };
      }
    },
  });

  // ------------------------------------------------------------------
  // memory_history
  // ------------------------------------------------------------------

  api.registerTool({
    name: "memory_history",
    label: "Memory History",
    description: "View the change history of a specific memory by ID.",
    parameters: Type.Object({
      memoryId: Type.String({ description: "Memory ID to view history for" }),
    }),
    async execute(_toolCallId: string, params: any) {
      try {
        const entries = await provider.history(params.memoryId);
        if (!entries.length) {
          return { content: [{ type: "text", text: "No history found for this memory." }], details: {} };
        }
        const text = entries
          .map((entry, i) => {
            const event = entry.event ?? entry.action ?? "unknown";
            const oldVal = entry.old_memory ?? entry.prev_value ?? "";
            const newVal = entry.new_memory ?? entry.new_value ?? entry.memory ?? "";
            const ts = entry.created_at ?? entry.timestamp ?? "";
            let line = `${i + 1}. [${event}]`;
            if (oldVal) line += ` old: "${oldVal}"`;
            if (newVal) line += ` new: "${newVal}"`;
            if (ts) line += ` (${ts})`;
            return line;
          })
          .join("\n");
        return { content: [{ type: "text", text }], details: { count: entries.length } };
      } catch (err) {
        return { content: [{ type: "text", text: `History failed: ${String(err)}` }], details: {} };
      }
    },
  });

  // ------------------------------------------------------------------
  // memory_feedback
  // ------------------------------------------------------------------

  api.registerTool({
    name: "memory_feedback",
    label: "Memory Feedback",
    description: "Provide feedback on a memory (positive, negative, or very_negative).",
    parameters: Type.Object({
      memoryId: Type.String({ description: "Memory ID to provide feedback on" }),
      feedback: Type.Union(
        [Type.Literal("positive"), Type.Literal("negative"), Type.Literal("very_negative")],
        { description: "Feedback type" },
      ),
      reason: Type.Optional(Type.String({ description: "Reason for the feedback" })),
    }),
    async execute(_toolCallId: string, params: any) {
      const { memoryId, feedback, reason } = params;
      try {
        const identity = resolve();
        const result = await provider.feedback(memoryId, feedback, identity.user_id, reason);
        return {
          content: [{ type: "text", text: `Feedback "${feedback}" submitted for memory ${memoryId}.` }],
          details: result,
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Feedback failed: ${String(err)}` }], details: {} };
      }
    },
  });
}
