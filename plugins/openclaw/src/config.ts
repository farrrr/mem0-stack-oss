/**
 * Configuration parsing and defaults.
 */

import type { IdentityConfig, PluginConfig } from "./types.js";

// ============================================================================
// Helpers
// ============================================================================

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

// ============================================================================
// Config Parser
// ============================================================================

/**
 * Parse raw plugin config into a typed PluginConfig.
 * Handles backward compatibility with legacy field names.
 */
export function parseConfig(raw: Record<string, unknown> | undefined): PluginConfig {
  const cfg = raw ?? {};

  // Identity - backward compatible with old "userId" field
  const rawId = (cfg.identity ?? {}) as Record<string, unknown>;
  const identity: IdentityConfig = {
    defaultUserId: str(rawId.defaultUserId) ?? str(cfg.userId) ?? "default",
    defaultAgentId: str(rawId.defaultAgentId) ?? "default",
    appId: str(rawId.appId) ?? "openclaw",
    userMapping: (rawId.userMapping as Record<string, string>) ?? undefined,
    agentMapping: (rawId.agentMapping as Record<string, string>) ?? undefined,
  };

  // API URL
  const apiUrl = str(cfg.apiUrl) ?? "";

  // API Key - support env var syntax ${MEM0_API_KEY}
  let apiKey = str(cfg.apiKey);
  if (apiKey) {
    apiKey = apiKey.replace(/\$\{([^}]+)\}/g, (_, envVar: string) => {
      return process.env[envVar] ?? "";
    });
    if (!apiKey) apiKey = undefined;
  }

  return {
    apiUrl,
    apiKey,
    identity,
    autoCapture: cfg.autoCapture !== false,
    autoRecall: cfg.autoRecall !== false,
    enableGraph: cfg.enableGraph !== false,
    searchThreshold: typeof cfg.searchThreshold === "number" ? cfg.searchThreshold : 0.3,
    topK: typeof cfg.topK === "number" ? cfg.topK : 6,
    customInstructions: str(cfg.customInstructions) ?? "",
  };
}
