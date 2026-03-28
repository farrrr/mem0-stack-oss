/**
 * Shared type definitions for the OpenClaw Mem0 plugin.
 */

// ============================================================================
// Plugin Config
// ============================================================================

export interface IdentityConfig {
  defaultUserId: string;
  defaultAgentId: string;
  appId: string;
  userMapping?: Record<string, string>;
  agentMapping?: Record<string, string>;
}

export interface PluginConfig {
  apiUrl: string;
  apiKey?: string;
  identity: IdentityConfig;
  autoCapture: boolean;
  autoRecall: boolean;
  enableGraph: boolean;
  searchThreshold: number;
  topK: number;
  customInstructions: string;
}

// ============================================================================
// Identity
// ============================================================================

export interface ResolvedIdentity {
  user_id: string;
  agent_id: string;
  app_id: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface AddOptions {
  user_id: string;
  agent_id?: string;
  app_id?: string;
  run_id?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  user_id: string;
  agent_id?: string;
  app_id?: string;
  run_id?: string;
  top_k?: number;
  limit?: number;
  threshold?: number;
  keyword_search?: boolean;
  reranking?: boolean;
  filters?: Record<string, unknown>;
}

export interface ListOptions {
  user_id: string;
  agent_id?: string;
  app_id?: string;
  run_id?: string;
}

export interface MemoryItem {
  id: string;
  memory: string;
  user_id?: string;
  agent_id?: string;
  app_id?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface AddResult {
  results: MemoryItem[];
}

// ============================================================================
// OpenClaw Plugin SDK (ambient types)
// ============================================================================

export interface OpenClawLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

export interface OpenClawPluginApi {
  pluginConfig: Record<string, unknown>;
  logger: OpenClawLogger;
  resolvePath(p: string): string;
  registerTool(definition: Record<string, unknown>, metadata?: Record<string, unknown>): void;
  on(event: string, handler: (event: any, ctx: any) => any): void;
  registerCli(handler: (context: { program: any }) => void, options?: Record<string, unknown>): void;
  registerService(service: { id: string; start: () => void; stop: () => void }): void;
  [key: string]: unknown;
}
