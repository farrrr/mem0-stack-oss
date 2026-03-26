const API_BASE = '/api';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = localStorage.getItem('admin_api_key');
  if (apiKey) headers['X-API-Key'] = apiKey;
  return headers;
}

function getMaintenanceHeaders(): Record<string, string> {
  const headers = getHeaders();
  const maintenanceKey = localStorage.getItem('maintenance_api_key');
  if (maintenanceKey) headers['X-Maintenance-Key'] = maintenanceKey;
  return headers;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem('admin_api_key');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${res.status}`);
  }
  return res.json();
}

async function maintenanceRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getMaintenanceHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
  if (res.status === 403) throw new Error('Invalid maintenance API key');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Health
  health: () => request<{ status: string }>('/health'),

  // Memories
  getMemories: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    return request<{ memories: unknown[]; total: number }>(`/memories?${qs}`);
  },
  getMemory: (id: string) => request<Record<string, unknown>>(`/memories/${id}`),
  deleteMemory: (id: string) => request(`/memories/${id}`, { method: 'DELETE' }),
  updateMemory: (id: string, data: string) =>
    request(`/memories/${id}`, { method: 'PUT', body: JSON.stringify({ data }) }),
  deleteAllMemories: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/memories?${qs}`, { method: 'DELETE' });
  },

  // Source & History
  getMemorySource: (id: string) => request<{ results: unknown[] }>(`/memories/${id}/source`),
  getMemoryHistory: (id: string) => request<{ results: unknown[] }>(`/memories/${id}/history`),

  // Search
  search: (query: string, userId: string, limit = 10) =>
    request('/search', {
      method: 'POST',
      body: JSON.stringify({ query, user_id: userId, limit }),
    }),
  recall: (query: string, userId: string, options: Record<string, unknown> = {}) =>
    request('/search/recall', {
      method: 'POST',
      body: JSON.stringify({ query, user_id: userId, ...options }),
    }),

  // Classification
  getTaxonomy: () => request<{ categories: string[]; subcategories: Record<string, unknown> }>('/taxonomy'),
  reclassify: (id: string) => request(`/memories/${id}/reclassify`, { method: 'POST' }),
  reclassifyAll: (userId: string, onlyUnclassified = true) =>
    request(`/reclassify-all?user_id=${userId}&only_unclassified=${onlyUnclassified}`, { method: 'POST' }),

  // Feedback
  submitFeedback: (memoryId: string, userId: string, feedback: string, reason?: string) =>
    request(`/memories/${memoryId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, feedback, reason }),
    }),
  getFeedback: (memoryId: string) => request<{ feedbacks: unknown[] }>(`/memories/${memoryId}/feedback`),
  feedbackStats: (userId: string) => request(`/feedback/stats?user_id=${userId}`),

  // Stats
  getStats: (userId: string, agentId?: string) => {
    let url = `/stats?user_id=${userId}`;
    if (agentId) url += `&agent_id=${agentId}`;
    return request<Record<string, unknown>>(url);
  },

  // Requests
  getRequests: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    return request<{ items: unknown[]; total: number }>(`/requests?${qs}`);
  },
  getRequest: (id: string) => request<Record<string, unknown>>(`/requests/${id}`),
  getDailyStats: (days = 30) => request<{ stats: unknown[] }>(`/requests/daily-stats?days=${days}`),

  // Entities
  getEntitiesByType: (type: string, limit = 50, offset = 0) =>
    maintenanceRequest<{ entities: unknown[]; total: number }>(
      `/entities/by-type?entity_type=${type}&limit=${limit}&offset=${offset}`
    ),
  getEntityUsers: () => maintenanceRequest<{ users: unknown[] }>('/entities/users'),
  getEntities: (userId: string) => request<Record<string, unknown>>(`/entities?user_id=${userId}`),
  deleteEntity: (type: string, id: string, confirm = true, userId?: string) => {
    let url = `/entities/${type}/${id}?confirm=${confirm}`;
    if (userId) url += `&user_id=${userId}`;
    return maintenanceRequest(url, { method: 'DELETE' });
  },

  // Maintenance
  decay: (userId: string, dryRun = true, lambda = 0.01) =>
    maintenanceRequest(`/maintenance/decay?user_id=${userId}&dry_run=${dryRun}&decay_lambda=${lambda}`, { method: 'POST' }),
  dedup: (userId: string, dryRun = true, threshold = 0.95) =>
    maintenanceRequest(`/maintenance/dedup?user_id=${userId}&dry_run=${dryRun}&threshold=${threshold}`, { method: 'POST' }),
  cleanupExpired: (userId: string, dryRun = true) =>
    maintenanceRequest(`/maintenance/cleanup-expired?user_id=${userId}&dry_run=${dryRun}`, { method: 'POST' }),

  // Configure
  configure: (config: Record<string, unknown>) =>
    request('/configure', { method: 'POST', body: JSON.stringify(config) }),
  reset: () => request('/reset', { method: 'POST' }),
};
