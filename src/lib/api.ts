import type {
  ArchiveSnapshot,
  AiHealth,
  ApiErrorPayload,
  AuthSession,
  AuthUser,
  CreateArchivePayload,
  PipelineMetadata,
  PipelineRunResponse,
  PipelineSnapshot,
  ReportResult,
  SearchPaper,
  SignupPayload
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

export class ApiError extends Error {
  status?: number;
  errorCode?: string;
  detail?: string;

  constructor(message: string, options?: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.status = options?.status;
    this.errorCode = options?.errorCode;
    this.detail = options?.detail;
  }
}

type RequestOptions = RequestInit & {
  accessToken?: string | null;
};

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.accessToken
        ? { Authorization: `Bearer ${init.accessToken}` }
        : {}),
      ...init?.headers
    }
  });

  if (!response.ok) {
    let payload: ApiErrorPayload | null = null;
    let fallbackMessage = "";

    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      fallbackMessage = await response.text().catch(() => "");
    }

    throw new ApiError(
      payload?.message || payload?.detail || fallbackMessage || `API 요청 실패: ${response.status}`,
      {
        status: response.status,
        errorCode: payload?.errorCode,
        detail: payload?.detail
      }
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export function getApiBaseUrl() {
  return API_BASE_URL || "Next proxy -> Spring :8080";
}

export function getAiHealth() {
  return request<AiHealth>("/api/ai/health");
}

export function getReports() {
  return request<ReportResult[]>("/api/reports");
}

export function getReport(reportId: string | number) {
  return request<ReportResult>(`/api/reports/${reportId}`);
}

export function createReport(topic: string) {
  return request<ReportResult>("/api/reports", {
    method: "POST",
    body: JSON.stringify({ topic })
  });
}

export function runPipeline(topic: string, accessToken?: string | null) {
  return request<PipelineRunResponse>("/api/pipeline/run", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ topic })
  });
}

export function getPipelineResult(runId: string) {
  return request<PipelineSnapshot>(
    `/api/pipeline/result?runId=${encodeURIComponent(runId)}`
  );
}

export function getPipelineMetadata() {
  return request<PipelineMetadata>("/api/pipeline/metadata");
}

export function getSearchResults(runId: string) {
  return request<SearchPaper[]>(
    `/api/papers/search-results?runId=${encodeURIComponent(runId)}`
  );
}

export function getReaderResults(runId: string) {
  return request<SearchPaper[]>(
    `/api/papers/reader-results?runId=${encodeURIComponent(runId)}`
  );
}

export function getRelevanceResults(runId: string) {
  return request<SearchPaper[]>(
    `/api/papers/relevance-results?runId=${encodeURIComponent(runId)}`
  );
}

export function getLatestReport() {
  return request<ReportResult>("/api/reports/latest");
}

export function generateMockReport(topic: string) {
  return request<ReportResult>("/api/ai/reports/generate", {
    method: "POST",
    body: JSON.stringify({ topic })
  });
}

export function signup(payload: SignupPayload) {
  return request<AuthSession>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function login(payload: { email: string; password: string }) {
  return request<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getMe(accessToken: string) {
  return request<AuthUser>("/api/auth/me", {
    method: "GET",
    accessToken
  });
}

export function deleteMe(accessToken: string) {
  return request<void>("/api/auth/me", {
    method: "DELETE",
    accessToken
  });
}

export function createArchive(payload: CreateArchivePayload, accessToken: string) {
  return request<ArchiveSnapshot>("/api/archives", {
    method: "POST",
    accessToken,
    body: JSON.stringify(payload)
  });
}

export function getArchives(accessToken: string) {
  return request<ArchiveSnapshot[]>("/api/archives", {
    method: "GET",
    accessToken
  });
}

export function getArchive(archiveId: string, accessToken: string) {
  return request<ArchiveSnapshot>(`/api/archives/${archiveId}`, {
    method: "GET",
    accessToken
  });
}

export function deleteArchive(archiveId: string, accessToken: string) {
  return request<void>(`/api/archives/${archiveId}`, {
    method: "DELETE",
    accessToken
  });
}
