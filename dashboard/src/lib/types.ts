/**
 * Shared Memory types used across pages and components.
 */

/** Raw memory shape returned by the API — metadata fields are nested. */
export interface RawMemory {
  id: string;
  memory: string;
  metadata?: {
    category?: string;
    subcategory?: string[];
    tags?: string[];
    confidence?: string;
    importance_score?: number;
    classified_by?: string;
    verified_by?: string;
    classified_at?: string;
    tags_by?: string;
    last_accessed_at?: string;
    [key: string]: unknown;
  };
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** Normalized memory with metadata fields flattened to the top level. */
export interface Memory {
  id: string;
  memory: string;
  category?: string;
  subcategory?: string;
  tags?: string[];
  confidence?: string;
  importance_score?: number;
  classified_by?: string;
  user_id?: string;
  agent_id?: string;
  run_id?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SearchResult extends Memory {
  score?: number;
  rerank_score?: number;
}

/**
 * Flatten metadata fields from the API response into top-level Memory fields.
 * Handles both already-flat (old format) and nested metadata (current API format).
 */
export function normalizeMemory(raw: RawMemory): Memory {
  const meta = raw.metadata || {};
  return {
    ...raw,
    category: (raw as Record<string, unknown>).category as string | undefined ?? meta.category,
    subcategory: ((raw as Record<string, unknown>).subcategory as string | undefined)
      ?? (Array.isArray(meta.subcategory) ? meta.subcategory.join(', ') : undefined),
    tags: (raw as Record<string, unknown>).tags as string[] | undefined ?? meta.tags,
    confidence: (raw as Record<string, unknown>).confidence as string | undefined ?? meta.confidence,
    importance_score: (raw as Record<string, unknown>).importance_score as number | undefined ?? meta.importance_score,
    classified_by: (raw as Record<string, unknown>).classified_by as string | undefined ?? meta.classified_by ?? meta.verified_by,
    metadata: meta as Record<string, unknown>,
  };
}
