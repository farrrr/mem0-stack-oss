/**
 * Mem0HTTPProvider - HTTP client for the mem0-stack-oss API server.
 *
 * All memory operations go through HTTP to the self-hosted API.
 * No mem0 JS SDK dependency - pure fetch() calls.
 */

import type { AddOptions, AddResult, ListOptions, MemoryItem, SearchOptions } from "./types.js";

// ============================================================================
// Response Normalization
// ============================================================================

/** Normalize a raw API response item into a MemoryItem. */
function normalizeItem(raw: any): MemoryItem {
  return {
    id: raw.id ?? "",
    memory: raw.memory ?? raw.text ?? raw.content ?? raw.data ?? "",
    user_id: raw.user_id ?? raw.userId,
    agent_id: raw.agent_id ?? raw.agentId,
    app_id: raw.app_id ?? raw.appId,
    score: raw.score,
    metadata: raw.metadata,
    created_at: raw.created_at ?? raw.createdAt,
    updated_at: raw.updated_at ?? raw.updatedAt,
  };
}

/**
 * Extract MemoryItem[] from any API response shape.
 * Handles:
 *   { result: { results: [...] } }     - POST /memories
 *   { results: { results: [...] } }    - POST /search
 *   { results: [...] }                 - generic
 *   { memories: [...] }                - GET /memories
 *   { memories: { results: [...] } }   - GET /memories (wrapped)
 */
function extractResults(data: unknown): MemoryItem[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;

  // { result: { results: [...] } } - POST /memories
  if (obj.result && typeof obj.result === "object") {
    const inner = obj.result as Record<string, unknown>;
    if (Array.isArray(inner.results)) return inner.results.map(normalizeItem);
  }
  // { results: { results: [...] } } - POST /search
  if (obj.results && typeof obj.results === "object" && !Array.isArray(obj.results)) {
    const inner = obj.results as Record<string, unknown>;
    if (Array.isArray(inner.results)) return inner.results.map(normalizeItem);
  }
  // { results: [...] }
  if (Array.isArray(obj.results)) return obj.results.map(normalizeItem);
  // { memories: { results: [...] } }
  if (obj.memories && typeof obj.memories === "object" && !Array.isArray(obj.memories)) {
    const inner = obj.memories as Record<string, unknown>;
    if (Array.isArray(inner.results)) return inner.results.map(normalizeItem);
  }
  // { memories: [...] }
  if (Array.isArray(obj.memories)) return obj.memories.map(normalizeItem);
  return [];
}

// ============================================================================
// HTTP Provider
// ============================================================================

export class Mem0HTTPProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  /** Build common headers for all requests. */
  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h["X-API-Key"] = this.apiKey;
    return h;
  }

  // ------------------------------------------------------------------
  // POST /memories - Create memories
  // ------------------------------------------------------------------

  async add(
    messages: Array<{ role: string; content: string }>,
    options: AddOptions,
  ): Promise<AddResult> {
    const body: Record<string, unknown> = {
      messages,
      user_id: options.user_id,
    };
    if (options.agent_id) body.agent_id = options.agent_id;
    if (options.app_id) body.app_id = options.app_id;
    if (options.run_id) body.run_id = options.run_id;
    if (options.custom_instructions) body.custom_instructions = options.custom_instructions;
    if (options.enable_graph != null) body.enable_graph = options.enable_graph;
    if (options.output_format) body.output_format = options.output_format;
    if (options.actor_id) body.actor_id = options.actor_id;
    if (options.metadata) body.metadata = options.metadata;

    const resp = await fetch(`${this.baseUrl}/memories`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) throw new Error(`add() HTTP ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as Record<string, unknown>;
    return { results: extractResults(data) };
  }

  // ------------------------------------------------------------------
  // POST /search - Search memories
  // ------------------------------------------------------------------

  async search(query: string, options: SearchOptions): Promise<MemoryItem[]> {
    const body: Record<string, unknown> = {
      query,
      user_id: options.user_id,
      limit: options.limit ?? options.top_k ?? 10,
    };
    if (options.agent_id) body.agent_id = options.agent_id;
    if (options.run_id) body.run_id = options.run_id;
    if (options.threshold != null) body.threshold = options.threshold;
    if (options.filters) body.filters = options.filters;
    // Note: app_id not sent to search - mem0 SDK doesn't support it

    const resp = await fetch(`${this.baseUrl}/search`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`search() HTTP ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as Record<string, unknown>;
    return extractResults(data);
  }

  // ------------------------------------------------------------------
  // POST /search/recall - Combined long-term + session search
  // ------------------------------------------------------------------

  /**
   * Combined search endpoint (single embed + UNION + rerank).
   * Falls back to regular search if /search/recall is not available.
   */
  async recall(query: string, options: SearchOptions): Promise<MemoryItem[]> {
    const body: Record<string, unknown> = {
      query,
      user_id: options.user_id,
      limit: options.limit ?? options.top_k ?? 10,
    };
    if (options.agent_id) body.agent_id = options.agent_id;
    if (options.run_id) body.run_id = options.run_id;
    if (options.threshold != null) body.threshold = options.threshold;

    const resp = await fetch(`${this.baseUrl}/search/recall`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (resp.status === 404) {
      // /search/recall endpoint not available - fallback
      return this.search(query, options);
    }
    if (!resp.ok) throw new Error(`recall() HTTP ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as Record<string, unknown>;
    return extractResults(data);
  }

  // ------------------------------------------------------------------
  // GET /memories - List memories
  // ------------------------------------------------------------------

  async getAll(options: ListOptions): Promise<MemoryItem[]> {
    const params = new URLSearchParams();
    if (options.user_id) params.set("user_id", options.user_id);
    if (options.agent_id) params.set("agent_id", options.agent_id);
    if (options.app_id) params.set("app_id", options.app_id);
    if (options.run_id) params.set("run_id", options.run_id);

    const resp = await fetch(`${this.baseUrl}/memories?${params}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`getAll() HTTP ${resp.status}`);
    const data = (await resp.json()) as Record<string, unknown>;
    return extractResults(data);
  }

  // ------------------------------------------------------------------
  // GET /memories/:id - Get a single memory
  // ------------------------------------------------------------------

  async get(memoryId: string): Promise<MemoryItem | null> {
    const resp = await fetch(`${this.baseUrl}/memories/${memoryId}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, unknown>;
    const raw = data.memory ?? data;
    return raw ? normalizeItem(raw) : null;
  }

  // ------------------------------------------------------------------
  // PUT /memories/:id - Update a memory
  // ------------------------------------------------------------------

  async update(memoryId: string, data: string): Promise<MemoryItem> {
    const resp = await fetch(`${this.baseUrl}/memories/${memoryId}`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`update() HTTP ${resp.status}: ${await resp.text()}`);
    const result = (await resp.json()) as Record<string, unknown>;
    const raw = result.result ?? result.memory ?? result;
    return normalizeItem(raw);
  }

  // ------------------------------------------------------------------
  // DELETE /memories/:id - Delete a memory
  // ------------------------------------------------------------------

  async delete(memoryId: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/memories/${memoryId}`, {
      method: "DELETE",
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`delete() HTTP ${resp.status}`);
  }

  // ------------------------------------------------------------------
  // GET /memories/:id/history - Memory change history
  // ------------------------------------------------------------------

  async history(memoryId: string): Promise<Record<string, unknown>[]> {
    const resp = await fetch(`${this.baseUrl}/memories/${memoryId}/history`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`history() HTTP ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as Record<string, unknown>;
    const results = data.results;
    return Array.isArray(results) ? results : [];
  }

  // ------------------------------------------------------------------
  // POST /memories/:id/feedback - Memory feedback
  // ------------------------------------------------------------------

  async feedback(
    memoryId: string,
    feedbackType: string,
    userId: string,
    reason?: string,
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { feedback: feedbackType, user_id: userId };
    if (reason) body.reason = reason;

    const resp = await fetch(`${this.baseUrl}/memories/${memoryId}/feedback`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`feedback() HTTP ${resp.status}: ${await resp.text()}`);
    return (await resp.json()) as Record<string, unknown>;
  }

  // ------------------------------------------------------------------
  // GET /stats - Memory statistics
  // ------------------------------------------------------------------

  async stats(
    userId: string,
    agentId?: string,
    appId?: string,
  ): Promise<Record<string, unknown>> {
    const params = new URLSearchParams();
    params.set("user_id", userId);
    if (agentId) params.set("agent_id", agentId);
    if (appId) params.set("app_id", appId);

    try {
      const resp = await fetch(`${this.baseUrl}/stats?${params}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(15000),
      });
      if (resp.status === 404) {
        // /stats endpoint not deployed yet - fallback to getAll count
        return this.statsFallback(userId, agentId, appId);
      }
      if (!resp.ok) throw new Error(`stats() HTTP ${resp.status}: ${await resp.text()}`);
      return (await resp.json()) as Record<string, unknown>;
    } catch (err) {
      throw err;
    }
  }

  private async statsFallback(
    userId: string,
    agentId?: string,
    appId?: string,
  ): Promise<Record<string, unknown>> {
    const listOpts: ListOptions = { user_id: userId };
    if (agentId) listOpts.agent_id = agentId;
    if (appId) listOpts.app_id = appId;
    const memories = await this.getAll(listOpts);
    return {
      fallback: true,
      total_memories: memories.length,
      user_id: userId,
      agent_id: agentId,
      app_id: appId,
    };
  }

  // ------------------------------------------------------------------
  // GET /entities - List entities
  // ------------------------------------------------------------------

  async entities(userId: string): Promise<Record<string, unknown>> {
    const params = new URLSearchParams();
    params.set("user_id", userId);

    const resp = await fetch(`${this.baseUrl}/entities?${params}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`entities() HTTP ${resp.status}: ${await resp.text()}`);
    return (await resp.json()) as Record<string, unknown>;
  }

  // ------------------------------------------------------------------
  // GET /health - Health check
  // ------------------------------------------------------------------

  async health(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
