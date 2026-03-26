/**
 * Shared Memory types used across pages and components.
 */

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
  [key: string]: unknown;
}

export interface SearchResult extends Memory {
  score?: number;
  rerank_score?: number;
}
