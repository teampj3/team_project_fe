export type ReportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | string;

export type PipelineStage = "search" | "reader" | "relevance" | "writer" | string;

export type SearchPaper = {
  id?: string | number;
  title: string;
  authors?: string[];
  year?: number | string;
  source?: string;
  summary?: string;
  relevanceScore?: number;
  selected?: boolean;
};

export type PipelineSnapshot = {
  runId?: string;
  reportId?: string;
  topic?: string;
  currentStage?: PipelineStage;
  searchCount?: number;
  summaryCount?: number;
  relevanceCount?: number;
  reportPath?: string;
  startedAt?: string;
  finishedAt?: string;
  status?: ReportStatus;
  message?: string | null;
  errorCode?: string | null;
};

export type PipelineRunResponse = {
  runId: string;
  topic: string;
  status: ReportStatus;
  currentStage?: PipelineStage;
  message?: string | null;
  errorCode?: string | null;
};

export type ReportResult = {
  id?: number | string;
  topic?: string;
  status?: ReportStatus;
  gptDraft?: string;
  claudeDraft?: string;
  commonHighlights?: string[];
  differentHighlights?: string[];
  reviewResult?: string;
  mergedReport?: string;
  failureMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  pipeline?: PipelineSnapshot;
  searchResults?: SearchPaper[];
  relevanceResults?: SearchPaper[];
};

export type AiHealth = {
  baseUrl?: string;
  stubEnabled?: boolean;
  status?: string;
};
