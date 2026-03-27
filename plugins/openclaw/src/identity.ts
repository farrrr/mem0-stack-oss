/**
 * Identity resolution for multi-agent setups.
 *
 * Resolves user_id, agent_id, and app_id from various sources:
 *   1. Explicit tool params (userId, agentId)
 *   2. Hook context (ctx.agentId)
 *   3. Config defaults + mapping
 *
 * Handles legacy "far:agent:jun" format - extracts both userId and agentId.
 */

import type { IdentityConfig, ResolvedIdentity } from "./types.js";

/**
 * Resolve identity from various sources with priority:
 * 1. Explicit tool params (userId, agentId)
 * 2. Hook context (ctx.agentId)
 * 3. Config defaults + mapping
 */
export function resolveIdentity(
  config: IdentityConfig,
  opts?: { userId?: string; agentId?: string },
  ctxAgentId?: string,
): ResolvedIdentity {
  let userId = config.defaultUserId;
  let agentId = config.defaultAgentId;

  // Handle explicit userId - including legacy format "far:agent:jun"
  if (opts?.userId) {
    const legacyMatch = opts.userId.match(/^(.+):agent:(.+)$/);
    if (legacyMatch) {
      userId = legacyMatch[1];
      // Extract agent from legacy format (only if no explicit agentId)
      if (!opts.agentId) agentId = legacyMatch[2];
    } else {
      userId = opts.userId;
    }
  }

  // Explicit agentId takes highest priority
  if (opts?.agentId) {
    agentId = opts.agentId;
  } else if (!opts?.userId && ctxAgentId) {
    // No explicit override - use hook context
    agentId = ctxAgentId;
  }

  // Apply mappings
  if (config.userMapping?.[userId]) {
    userId = config.userMapping[userId];
  }
  if (config.agentMapping?.[agentId]) {
    agentId = config.agentMapping[agentId];
  }

  return { user_id: userId, agent_id: agentId, app_id: config.appId };
}
