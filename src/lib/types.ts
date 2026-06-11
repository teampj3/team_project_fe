export type ReportStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | string;

export type PipelineStage = "search" | "reader" | "relevance" | "writer" | string;

export type VisualizationSnapshot = {
  manifestPath?: string;
  visualizedReportPath?: string;
  assets?: Record<string, string>;
};

export type PipelineMetadataStage = {
  key: string;
  title: string;
  description: string;
};

export type PipelineMetadata = {
  retrievalStatus?: string;
  relevanceMode?: string;
  writerMode?: string;
  note?: string;
  stages?: PipelineMetadataStage[];
};

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
  visualization?: VisualizationSnapshot;
  pipelineMetadata?: PipelineMetadata;
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
  readerResults?: SearchPaper[];
  relevanceResults?: SearchPaper[];
  visualization?: VisualizationSnapshot;
};

export type AiHealth = {
  baseUrl?: string;
  stubEnabled?: boolean;
  status?: string;
};

export type AuthSession = {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
  createdAt: string;
};

export type AuthUser = {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
};

export type AuthCredentials = {
  email: string;
  password: string;
};

export type SignupPayload = AuthCredentials & {
  name: string;
};

export type ApiErrorPayload = {
  message?: string;
  detail?: string;
  errorCode?: string;
  status?: number;
};

export type ArchiveSnapshot = {
  archiveId: string;
  reportId: string;
  runId?: string;
  title: string;
  topic?: string;
  status?: ReportStatus;
  claudeDraft?: string;
  commonHighlights?: string[];
  differentHighlights?: string[];
  reviewResult?: string;
  mergedReport?: string;
  failureMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  pipelineResult?: PipelineSnapshot;
  searchResults?: SearchPaper[];
  readerResults?: SearchPaper[];
  relevanceResults?: SearchPaper[];
  visualization?: VisualizationSnapshot;
};

export type CreateArchivePayload = {
  reportId: string;
  title: string;
};
