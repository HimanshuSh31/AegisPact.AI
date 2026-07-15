/**
 * AegisPact.AI — Typed API Client
 * Wraps all /api/v1/ endpoints with proper TypeScript types.
 * Manages JWT auth token from localStorage automatically.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// ─── Types ───────────────────────────────────────────────

export interface APIError {
  error: string;
  message: string;
  status_code: number;
  request_id: string;
  path: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  organization_id: number;
  is_admin: boolean;
}

export interface Document {
  id: number;
  name: string;
  file_type: string;
  size_bytes: number;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  created_at: string;
  organization_id: number;
  uploader_id: number;
}

export interface ComplianceRule {
  rule_id: string;
  title: string;
  description: string;
  severity?: string;
}

export interface Framework {
  id: number;
  name: string;
  description: string;
  rules: ComplianceRule[];
}

export interface AuditJob {
  id: number;
  document_id: number;
  framework_id: number;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  compliance_score: number | null;
  ragas_faithfulness: number | null;
  ragas_relevance: number | null;
  ragas_recall: number | null;
  created_at: string;
}

export interface AuditFinding {
  id: number;
  audit_job_id: number;
  rule_id: string;
  rule_title: string;
  verdict: "COMPLIANT" | "NON_COMPLIANT" | "NEEDS_REVIEW" | "NOT_APPLICABLE";
  explanation: string;
  clause_text: string | null;
  page_number: number | null;
  is_overridden?: boolean;
  overridden_status?: string | null;
  overridden_explanation?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// ─── Auth Token Helpers ───────────────────────────────────

export const TokenStore = {
  get: (): string | null => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("aegispact_token");
  },
  set: (token: string) => {
    if (typeof window !== "undefined") localStorage.setItem("aegispact_token", token);
  },
  clear: () => {
    if (typeof window !== "undefined") localStorage.removeItem("aegispact_token");
  },
};

// ─── Core Fetch Wrapper ───────────────────────────────────

let isRefreshing = false;

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = TokenStore.get();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const requestOptions: RequestInit = {
    ...options,
    headers,
    credentials: "include",
  };

  let res = await fetch(`${API_BASE}${path}`, requestOptions);

  if (res.status === 401 && path !== "/auth/refresh" && !isRefreshing) {
    isRefreshing = true;
    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        TokenStore.set(data.access_token);
        headers["Authorization"] = `Bearer ${data.access_token}`;
        res = await fetch(`${API_BASE}${path}`, {
          ...requestOptions,
          headers,
        });
      } else {
        TokenStore.clear();
      }
    } catch {
      TokenStore.clear();
    } finally {
      isRefreshing = false;
    }
  }

  if (!res.ok) {
    let errorBody: APIError;
    try {
      errorBody = await res.json();
    } catch {
      errorBody = {
        error: "NetworkError",
        message: `HTTP ${res.status} — ${res.statusText}`,
        status_code: res.status,
        request_id: res.headers.get("X-Request-ID") || "unknown",
        path,
      };
    }
    throw errorBody;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Auth API ────────────────────────────────────────────

export const authApi = {
  register: (data: {
    email: string;
    password: string;
    full_name: string;
    organization_name: string;
  }): Promise<User> =>
    apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: async (email: string, password: string): Promise<TokenResponse> => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    const res = await fetch(`${API_BASE}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      credentials: "include",
      body: form.toString(),
    });
    if (!res.ok) {
      const err = await res.json();
      throw err;
    }
    return res.json();
  },

  logout: (): Promise<void> =>
    apiFetch("/auth/logout", { method: "POST" }),
};

// ─── Documents API ────────────────────────────────────────

export const documentsApi = {
  list: (page = 1, limit = 20): Promise<Document[]> =>
    apiFetch(`/documents?page=${page}&limit=${limit}`),

  get: (id: number): Promise<Document> =>
    apiFetch(`/documents/${id}`),

  upload: (file: File): Promise<Document> => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch("/documents/upload", {
      method: "POST",
      body: form,
    });
  },

  search: (id: number, query: string, limit = 5): Promise<any[]> =>
    apiFetch(`/documents/${id}/search?query=${encodeURIComponent(query)}&top_k=${limit}`),

  chat: (id: number, message: string, history: Array<{ role: string; content: string }>): Promise<{ answer: string; citations: Array<{ text: string; page_number: number }> }> =>
    apiFetch(`/documents/${id}/chat`, {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),
};

// ─── Frameworks API ───────────────────────────────────────

export const frameworksApi = {
  list: (page = 1, limit = 20): Promise<Framework[]> =>
    apiFetch(`/frameworks?page=${page}&limit=${limit}`),

  create: (data: {
    name: string;
    description: string;
    rules: ComplianceRule[];
  }): Promise<Framework> =>
    apiFetch("/frameworks", { method: "POST", body: JSON.stringify(data) }),

  update: (id: number, data: {
    name?: string;
    description?: string;
    rules?: ComplianceRule[];
  }): Promise<Framework> =>
    apiFetch(`/frameworks/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  delete: (id: number): Promise<{ status: string; message: string }> =>
    apiFetch(`/frameworks/${id}`, { method: "DELETE" }),
};

// ─── Audits API ───────────────────────────────────────────

export const auditsApi = {
  run: (document_id: number, framework_id: number): Promise<AuditJob> =>
    apiFetch("/audits/run", {
      method: "POST",
      body: JSON.stringify({ document_id, framework_id }),
    }),

  runBatch: (document_ids: number[], framework_id: number): Promise<AuditJob[]> =>
    apiFetch("/audits/batch", {
      method: "POST",
      body: JSON.stringify({ document_ids, framework_id }),
    }),

  get: (id: number): Promise<AuditJob> =>
    apiFetch(`/audits/${id}`),

  list: (): Promise<AuditJob[]> =>
    apiFetch("/audits"),

  findings: (id: number): Promise<AuditFinding[]> =>
    apiFetch(`/audits/${id}/findings`),

  overrideFinding: (
    jobId: number,
    findingId: number,
    status: string,
    explanation: string
  ): Promise<any> =>
    apiFetch(`/audits/${jobId}/findings/${findingId}/override`, {
      method: "POST",
      body: JSON.stringify({ status, explanation }),
    }),

  compare: (jobA: number, jobB: number): Promise<any> =>
    apiFetch(`/audits/compare?job_a=${jobA}&job_b=${jobB}`),

  /**
   * Returns an EventSource connected to the SSE progress stream.
   * Usage: const es = auditsApi.streamProgress(jobId, onMessage, onDone)
   */
  streamProgress: (
    jobId: number,
    onMessage: (data: { step: number; total: number; message: string; done: boolean }) => void,
    onDone?: () => void
  ): EventSource => {
    const es = new EventSource(`${API_BASE}/audits/${jobId}/stream`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      onMessage(data);
      if (data.done) {
        es.close();
        onDone?.();
      }
    };
    es.onerror = () => es.close();
    return es;
  },
};

// ─── Health ───────────────────────────────────────────────

export const healthApi = {
  check: (): Promise<{ status: string; version: string; service: string; timestamp: string }> =>
    apiFetch("/health"),
};

// ─── Scheduler API ─────────────────────────────────────────

export interface AuditSchedule {
  id: number;
  document_id: number;
  framework_id: number;
  cron_expression: string;
  next_run_at: string;
  created_at: string;
}

export const schedulesApi = {
  list: (): Promise<AuditSchedule[]> =>
    apiFetch("/schedules"),

  create: (data: { document_id: number; framework_id: number; cron_expression: string }): Promise<AuditSchedule> =>
    apiFetch("/schedules", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  delete: (id: number): Promise<{ status: string; message: string }> =>
    apiFetch(`/schedules/${id}`, { method: "DELETE" }),
};
