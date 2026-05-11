import type {
  AiHealth,
  PipelineRunResponse,
  PipelineSnapshot,
  ReportResult,
  SearchPaper
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `API 요청 실패: ${response.status}`);
  }

  return response.json() as Promise<T>;
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

export function runPipeline(topic: string) {
  return request<PipelineRunResponse>("/api/pipeline/run", {
    method: "POST",
    body: JSON.stringify({ topic })
  });
}

export function getPipelineResult(runId: string) {
  return request<PipelineSnapshot>(
    `/api/pipeline/result?runId=${encodeURIComponent(runId)}`
  );
}

export function getSearchResults(runId: string) {
  return request<SearchPaper[]>(
    `/api/papers/search-results?runId=${encodeURIComponent(runId)}`
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
