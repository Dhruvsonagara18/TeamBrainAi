/**
 * Axios API client for TEAMBrain backend.
 * All API calls go through this single instance.
 */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    // Try refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, options);
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = "/auth";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    request<{ access_token: string; refresh_token: string; user: User }>("/auth/register", { method: "POST", body: data }),
  login: (data: { email: string; password: string }) =>
    request<{ access_token: string; refresh_token: string; user: User }>("/auth/login", { method: "POST", body: data }),
  me: () => request<User>("/auth/me"),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersApi = {
  getProfile: () => request<User>("/users/me"),
  updateProfile: (data: Partial<User>) => request<User>("/users/me", { method: "PATCH", body: data }),
  changePassword: (data: { current_password: string; new_password: string }) =>
    request<{ message: string }>("/users/me/change-password", { method: "POST", body: data }),
  updateSettings: (settings: Record<string, unknown>) =>
    request<{ message: string }>("/users/me/settings", { method: "PATCH", body: settings }),
};

// ─── Workspaces ──────────────────────────────────────────────────────────────
export const workspacesApi = {
  list: () => request<Workspace[]>("/workspaces"),
  create: (data: { name: string; description?: string }) =>
    request<Workspace>("/workspaces", { method: "POST", body: data }),
  get: (id: string) => request<Workspace>(`/workspaces/${id}`),
  update: (id: string, data: Partial<Workspace>) =>
    request<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: data }),
  members: (id: string) => request<Member[]>(`/workspaces/${id}/members`),
  invite: (id: string, data: { email: string; role: string }) =>
    request<{ message: string }>(`/workspaces/${id}/invite`, { method: "POST", body: data }),
  removeMember: (wsId: string, userId: string) =>
    request<{ message: string }>(`/workspaces/${wsId}/members/${userId}`, { method: "DELETE" }),
  activity: (id: string, limit = 20) =>
    request<ActivityLog[]>(`/workspaces/${id}/activity?limit=${limit}`),
};

// ─── Projects ────────────────────────────────────────────────────────────────
export const projectsApi = {
  list: (workspaceId: string) => request<{ tasks: Project[]; total: number }>(`/projects?workspace_id=${workspaceId}`),
  create: (data: { name: string; description?: string; stack?: string[]; workspace_id: string }) =>
    request<Project>("/projects", { method: "POST", body: data }),
  get: (id: string) => request<Project>(`/projects/${id}`),
  update: (id: string, data: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
};

// ─── Chat ────────────────────────────────────────────────────────────────────
export const chatApi = {
  listConversations: (workspaceId: string) =>
    request<Conversation[]>(`/chat/conversations?workspace_id=${workspaceId}`),
  createConversation: (data: { workspace_id: string; project_id?: string; title?: string }) =>
    request<Conversation>("/chat/conversations", { method: "POST", body: data }),
  getMessages: (conversationId: string) =>
    request<Message[]>(`/chat/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, data: { content: string; project_id?: string }) =>
    request<{ user_message: Message; ai_message: Message; extracted_memories_count: number }>(
      `/chat/conversations/${conversationId}/messages`,
      { method: "POST", body: data }
    ),
  deleteConversation: (id: string) =>
    request<void>(`/chat/conversations/${id}`, { method: "DELETE" }),
};

// ─── Memories ────────────────────────────────────────────────────────────────
export const memoriesApi = {
  list: (workspaceId: string, params?: { project_id?: string; memory_type?: string; privacy_scope?: string; skip?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.project_id) qs.set("project_id", params.project_id);
    if (params?.memory_type) qs.set("memory_type", params.memory_type);
    if (params?.privacy_scope) qs.set("privacy_scope", params.privacy_scope);
    if (params?.skip !== undefined) qs.set("skip", String(params.skip));
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    return request<{ memories: Memory[]; total: number }>(`/memories/workspace/${workspaceId}?${qs}`);
  },
  create: (workspaceId: string, data: Partial<Memory>) =>
    request<Memory>(`/memories/workspace/${workspaceId}`, { method: "POST", body: data }),
  get: (id: string, workspaceId: string) =>
    request<Memory>(`/memories/${id}?workspace_id=${workspaceId}`),
  update: (id: string, workspaceId: string, data: Partial<Memory>) =>
    request<Memory>(`/memories/${id}?workspace_id=${workspaceId}`, { method: "PATCH", body: data }),
  correct: (id: string, workspaceId: string, data: { corrected_content: string; reason?: string }) =>
    request<Memory>(`/memories/${id}/correct?workspace_id=${workspaceId}`, { method: "POST", body: data }),
  delete: (id: string, workspaceId: string) =>
    request<void>(`/memories/${id}?workspace_id=${workspaceId}`, { method: "DELETE" }),
  search: (data: { query: string; workspace_id: string; project_id?: string; limit?: number }) =>
    request<{ results: Memory[]; count: number }>("/memories/search", { method: "POST", body: data }),
  stats: (workspaceId: string) =>
    request<MemoryStats>(`/memories/workspace/${workspaceId}/stats`),
  feedback: (id: string, workspaceId: string, data: { rating: number; comment?: string }) =>
    request<{ message: string }>(`/memories/${id}/feedback?workspace_id=${workspaceId}`, { method: "POST", body: data }),
};

// ─── Decisions ───────────────────────────────────────────────────────────────
export const decisionsApi = {
  list: (workspaceId: string, params?: { project_id?: string; status?: string }) => {
    const qs = new URLSearchParams({ workspace_id: workspaceId });
    if (params?.project_id) qs.set("project_id", params.project_id);
    if (params?.status) qs.set("status", params.status);
    return request<{ decisions: Decision[]; total: number }>(`/decisions?${qs}`);
  },
  create: (data: Partial<Decision> & { workspace_id: string }) =>
    request<Decision>("/decisions", { method: "POST", body: data }),
  update: (id: string, workspaceId: string, data: Partial<Decision>) =>
    request<Decision>(`/decisions/${id}?workspace_id=${workspaceId}`, { method: "PATCH", body: data }),
  approve: (id: string, workspaceId: string) =>
    request<Decision>(`/decisions/${id}/approve?workspace_id=${workspaceId}`, { method: "POST" }),
  reject: (id: string, workspaceId: string) =>
    request<Decision>(`/decisions/${id}/reject?workspace_id=${workspaceId}`, { method: "POST" }),
  stats: (workspaceId: string) =>
    request<DecisionStats>(`/decisions/workspace/${workspaceId}/stats`),
};

// ─── Tasks ───────────────────────────────────────────────────────────────────
export const tasksApi = {
  list: (workspaceId: string, params?: { project_id?: string; status?: string; assignee_id?: string }) => {
    const qs = new URLSearchParams({ workspace_id: workspaceId });
    if (params?.project_id) qs.set("project_id", params.project_id);
    if (params?.status) qs.set("status", params.status);
    if (params?.assignee_id) qs.set("assignee_id", params.assignee_id);
    return request<{ tasks: Task[]; total: number }>(`/tasks?${qs}`);
  },
  create: (data: Partial<Task> & { workspace_id: string }) =>
    request<Task>("/tasks", { method: "POST", body: data }),
  update: (id: string, workspaceId: string, data: Partial<Task>) =>
    request<Task>(`/tasks/${id}?workspace_id=${workspaceId}`, { method: "PATCH", body: data }),
  delete: (id: string, workspaceId: string) =>
    request<void>(`/tasks/${id}?workspace_id=${workspaceId}`, { method: "DELETE" }),
  addComment: (id: string, workspaceId: string, content: string) =>
    request<{ id: string; content: string }>(`/tasks/${id}/comments?workspace_id=${workspaceId}`, { method: "POST", body: { content } }),
  stats: (workspaceId: string) =>
    request<TaskStats>(`/tasks/workspace/${workspaceId}/stats`),
};

// ─── Health ──────────────────────────────────────────────────────────────────
export const healthApi = {
  check: () => request<{ status: string }>("/health"),
  detailed: () => request<{ status: string; checks: Record<string, string> }>("/health/detailed"),
};

// ─── Types ───────────────────────────────────────────────────────────────────
export type User = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  bio?: string;
  settings?: Record<string, unknown>;
  created_at: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  owner_id: string;
  role?: string;
  member_count?: number;
  project_count?: number;
  memory_count?: number;
  created_at: string;
};

export type Member = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  joined_at: string;
};

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  stack: string[];
  status: string;
  progress: number;
  memory_count?: number;
  decision_count?: number;
  task_count?: number;
  creator_name?: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  workspace_id: string;
  project_id?: string;
  title: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  used_memories?: UsedMemory[];
  extracted_memories?: string[];
  created_at: string;
};

export type UsedMemory = {
  memory_id: string;
  content: string;
  memory_type: string;
  importance: number;
  relevance_score: number;
};

export type Memory = {
  id: string;
  workspace_id: string;
  project_id?: string;
  user_id: string;
  owner_name?: string;
  memory_type: string;
  content: string;
  source?: string;
  importance: number;
  confidence?: number;
  privacy_scope: string;
  status: string;
  version?: number;
  history?: unknown[];
  expires_at?: string;
  created_at: string;
  updated_at: string;
};

export type MemoryStats = {
  total: number;
  by_type: Record<string, number>;
  recent_7_days: number;
};

export type Decision = {
  id: string;
  workspace_id: string;
  project_id?: string;
  title: string;
  description?: string;
  reasoning?: string;
  alternatives?: { title: string; description: string }[];
  status: string;
  owner_id: string;
  owner_name: string;
  has_conflict?: boolean;
  conflicts?: { decision: string; reason: string }[];
  created_at: string;
  updated_at: string;
};

export type DecisionStats = {
  total: number;
  approved: number;
  proposed: number;
  superseded: number;
  rejected: number;
};

export type Task = {
  id: string;
  workspace_id: string;
  project_id?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignee_id?: string;
  assignee_name?: string;
  due_date?: string;
  comments?: Comment[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TaskStats = {
  total: number;
  by_status: Record<string, number>;
};

export type ActivityLog = {
  id: string;
  action: string;
  detail: string;
  user_name: string;
  created_at: string;
};

export type Comment = {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
};
