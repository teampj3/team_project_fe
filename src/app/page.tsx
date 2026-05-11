"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Archive,
  BookOpenText,
  CheckCircle2,
  Download,
  Ellipsis,
  FileText,
  GitCompare,
  GripVertical,
  Heading1,
  Heading2,
  History,
  Layers3,
  List,
  ListChecks,
  Loader2,
  MessageSquareQuote,
  NotebookPen,
  PanelLeft,
  PencilLine,
  Plus,
  Send,
  TextQuote,
  Trash2,
  UserRound
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FormEvent,
  Fragment,
  KeyboardEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  getPipelineResult,
  getRelevanceResults,
  getReport,
  generateMockReport,
  getReports,
  getSearchResults,
  runPipeline
} from "@/lib/api";
import type {
  PipelineStage,
  PipelineSnapshot,
  ReportResult,
  SearchPaper
} from "@/lib/types";

const quickTopics = [
  "건강보험심사평가원 데이터 API 활용 보고서",
  "병원 추천 AI agent 개발 전략",
  "PDF 텍스트 분석 및 교수 발언 추출",
  "안드로이드 앱 프로젝트 아이디어 추천"
];

const commonMarkClass =
  "rounded-sm bg-[#dff3df] px-1 text-[#1f4d2e] ring-1 ring-[#a7d8ae]";
const differentMarkClass =
  "rounded-sm bg-[#f3e8ff] px-1 text-[#5b3b8a] ring-1 ring-[#d6bdf5]";

type EditorBlock = {
  id: string;
  kind:
    | "heading-1"
    | "heading-2"
    | "paragraph"
    | "bullet"
    | "checklist"
    | "quote"
    | "callout";
  content: string;
  checked?: boolean;
};

type ArchiveDocument = {
  id: string;
  title: string;
  reportId?: string;
  updatedAt: string;
  blocks: EditorBlock[];
};

const archiveStorageKey = "ai-report-workspace-archives";
const hiddenReportsStorageKey = "ai-report-hidden-reports";
type ReportContextMenuState = {
  reportId: string;
  x: number;
  y: number;
} | null;

type WorkspaceTab = "search" | "relevance" | "draft";
type PipelineCardState = "pending" | "running" | "completed" | "failed";

const notionBlockKinds: Array<{
  kind: EditorBlock["kind"];
  label: string;
  hint: string;
}> = [
  { kind: "heading-1", label: "제목 1", hint: "/title" },
  { kind: "heading-2", label: "제목 2", hint: "/heading" },
  { kind: "paragraph", label: "문단", hint: "/text" },
  { kind: "bullet", label: "목록", hint: "/bullet" },
  { kind: "checklist", label: "체크리스트", hint: "/todo" },
  { kind: "quote", label: "인용", hint: "/quote" },
  { kind: "callout", label: "콜아웃", hint: "/callout" }
];

function textOrEmpty(value?: string) {
  return value?.trim() || "아직 결과가 없습니다.";
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createBlock(
  kind: EditorBlock["kind"] = "paragraph",
  content = "",
  checked = false
): EditorBlock {
  return {
    id: makeId("block"),
    kind,
    content,
    checked: kind === "checklist" ? checked : undefined
  };
}

function normalizeBlock(block: {
  id?: string;
  kind?: string;
  content?: string;
  checked?: boolean;
}): EditorBlock {
  const normalizedKind = notionBlockKinds.some((item) => item.kind === block.kind)
    ? (block.kind as EditorBlock["kind"])
    : block.kind === "heading"
      ? "heading-2"
      : "paragraph";

  return {
    id: block.id || makeId("block"),
    kind: normalizedKind,
    content: block.content || "",
    checked: normalizedKind === "checklist" ? Boolean(block.checked) : undefined
  };
}

function makeBlocksFromText(text: string): EditorBlock[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [createBlock("paragraph")];
  }

  return lines.map((line, index) => {
    if (index === 0) return createBlock("heading-2", line);
    if (line.startsWith("- ")) return createBlock("bullet", line.replace(/^- /, ""));
    if (line.startsWith("[ ] ")) return createBlock("checklist", line.replace(/^\[ \] /, ""));
    if (line.startsWith("> ")) return createBlock("quote", line.replace(/^> /, ""));
    return createBlock("paragraph", line);
  });
}

function blocksToSummary(blocks: EditorBlock[]) {
  return blocks
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 96);
}

function formatArchiveTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function uniqueHighlights(items: string[] = []) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).sort(
    (a, b) => b.length - a.length
  );
}

function renderHighlightedText(
  text: string,
  commonHighlights: string[],
  differentHighlights: string[]
) {
  const source = textOrEmpty(text);
  const highlights = [
    ...uniqueHighlights(commonHighlights).map((value) => ({
      value,
      className: commonMarkClass,
      type: "common"
    })),
    ...uniqueHighlights(differentHighlights).map((value) => ({
      value,
      className: differentMarkClass,
      type: "different"
    }))
  ];

  if (highlights.length === 0) return source;

  const segments: Array<{ text: string; className?: string; type?: string }> = [];
  let cursor = 0;

  while (cursor < source.length) {
    let nextMatch:
      | { index: number; value: string; className: string; type: string }
      | undefined;

    for (const highlight of highlights) {
      const index = source.toLowerCase().indexOf(highlight.value.toLowerCase(), cursor);
      if (index === -1) continue;
      if (
        !nextMatch ||
        index < nextMatch.index ||
        (index === nextMatch.index && highlight.value.length > nextMatch.value.length)
      ) {
        nextMatch = { index, ...highlight };
      }
    }

    if (!nextMatch) {
      segments.push({ text: source.slice(cursor) });
      break;
    }

    if (nextMatch.index > cursor) {
      segments.push({ text: source.slice(cursor, nextMatch.index) });
    }

    segments.push({
      text: source.slice(nextMatch.index, nextMatch.index + nextMatch.value.length),
      className: nextMatch.className,
      type: nextMatch.type
    });
    cursor = nextMatch.index + nextMatch.value.length;
  }

  return segments.map((segment, index) =>
    segment.className ? (
      <mark key={`${segment.type}-${index}`} className={segment.className}>
        {segment.text}
      </mark>
    ) : (
      <Fragment key={`text-${index}`}>{segment.text}</Fragment>
    )
  );
}

function buildReportPath(report?: ReportResult) {
  if (report?.pipeline?.reportPath) return report.pipeline.reportPath;
  return "-";
}

function getEffectiveStatus(report: ReportResult | null) {
  return report?.pipeline?.status ?? report?.status;
}

function getEffectiveStage(report: ReportResult | null) {
  return report?.pipeline?.currentStage;
}

function getEffectiveErrorCode(report: ReportResult | null) {
  return report?.pipeline?.errorCode ?? null;
}

function getEffectiveMessage(report: ReportResult | null) {
  return report?.pipeline?.message ?? report?.failureMessage ?? null;
}

function buildPipelineCards(report: ReportResult | null, loading: boolean) {
  const status = getEffectiveStatus(report);
  const stage = getEffectiveStage(report);
  const errorCode = getEffectiveErrorCode(report);
  const stageOrder: PipelineStage[] = ["search", "reader", "relevance", "writer"];
  const currentStageIndex = stage ? stageOrder.indexOf(stage) : -1;

  const hasSearch = Boolean((report?.pipeline?.searchCount ?? 0) > 0 || report?.searchResults?.length);
  const hasReader = Boolean((report?.pipeline?.summaryCount ?? 0) > 0 || report?.gptDraft || report?.claudeDraft);
  const hasRelevance = Boolean((report?.pipeline?.relevanceCount ?? 0) > 0 || report?.relevanceResults?.length);
  const hasWriter = Boolean(report?.mergedReport);

  const resolveState = (
    done: boolean,
    order: number,
    stageKey: PipelineStage
  ): PipelineCardState => {
    if (status === "FAILED") {
      if (currentStageIndex === -1) return done ? "completed" : "failed";
      if (order < currentStageIndex) return "completed";
      if (stageKey === stage) return "failed";
      return "pending";
    }

    if (status === "COMPLETED" && errorCode === "SEARCH_EMPTY_RESULT") {
      return stageKey === "search" ? "completed" : "pending";
    }

    if (status === "COMPLETED") {
      return done ? "completed" : "pending";
    }

    if (status === "PROCESSING") {
      if (currentStageIndex !== -1) {
        if (order < currentStageIndex) return "completed";
        if (stageKey === stage) return "running";
        return "pending";
      }
    }

    if (done) return "completed";
    if (loading && order === 0 && !hasSearch) return "running";
    return "pending";
  };

  const searchCount = report?.pipeline?.searchCount;
  const summaryCount = report?.pipeline?.summaryCount;
  const relevanceCount = report?.pipeline?.relevanceCount;

  return {
    cards: [
      {
        key: "search",
        title: "Search",
        description: "논문 검색 및 메타데이터 수집",
        count: searchCount ?? 0,
        state: resolveState(hasSearch, 0, "search")
      },
      {
        key: "reader",
        title: "Reader",
        description: "논문 요약과 핵심 문장 정리",
        count: summaryCount ?? 0,
        state: resolveState(hasReader, 1, "reader")
      },
      {
        key: "relevance",
        title: "Relevance",
        description: "관련성 점수 계산 및 선별",
        count: relevanceCount ?? 0,
        state: resolveState(hasRelevance, 2, "relevance")
      },
      {
        key: "writer",
        title: "Writer",
        description: "한국어 논문형 보고서 초안 생성",
        count: hasWriter ? 1 : 0,
        state: resolveState(hasWriter, 3, "writer")
      }
    ],
    stats: {
      searchCount: searchCount ?? 0,
      summaryCount: summaryCount ?? 0,
      relevanceCount: relevanceCount ?? 0,
      reportPath: buildReportPath(report || undefined)
    }
  };
}

export default function Home() {
  return (
    <Suspense fallback={<WorkspacePageFallback />}>
      <HomeWorkspace />
    </Suspense>
  );
}

function HomeWorkspace() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportResult | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [useMockEndpoint, setUseMockEndpoint] = useState(false);
  const [archiveDocuments, setArchiveDocuments] = useState<ArchiveDocument[]>([]);
  const [editorTitle, setEditorTitle] = useState("최종 보고서 초안");
  const [editorBlocks, setEditorBlocks] = useState<EditorBlock[]>([createBlock("paragraph")]);
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);
  const [hiddenReportIds, setHiddenReportIds] = useState<string[]>([]);
  const [reportContextMenu, setReportContextMenu] = useState<ReportContextMenuState>(null);
  const [hydratedFromQuery, setHydratedFromQuery] = useState(false);

  const reportsQuery = useQuery({
    queryKey: ["reports"],
    queryFn: getReports
  });

  const reports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);
  const filteredReports = useMemo(
    () => reports.filter((report) => !hiddenReportIds.includes(String(report.id ?? report.topic))),
    [hiddenReportIds, reports]
  );
  const currentReport = activeReport ?? filteredReports[0] ?? null;
  const requestedWorkspace = searchParams.get("workspace") === "1";
  const requestedReportId = searchParams.get("reportId");

  const pipelineResultQuery = useQuery({
    queryKey: ["pipeline-result", activeRunId],
    queryFn: () => getPipelineResult(activeRunId as string),
    enabled: Boolean(activeRunId && !useMockEndpoint),
    refetchInterval: (query) => {
      const result = query.state.data as PipelineSnapshot | undefined;
      if (!result) return 1500;
      return result.status === "COMPLETED" || result.status === "FAILED" ? false : 1500;
    }
  });

  const searchResultsQuery = useQuery({
    queryKey: ["search-results", activeRunId],
    queryFn: () => getSearchResults(activeRunId as string),
    enabled: Boolean(activeRunId && !useMockEndpoint),
    refetchInterval: () =>
      pipelineResultQuery.data?.status === "COMPLETED" ||
      pipelineResultQuery.data?.status === "FAILED"
        ? false
        : 2000
  });

  const relevanceResultsQuery = useQuery({
    queryKey: ["relevance-results", activeRunId],
    queryFn: () => getRelevanceResults(activeRunId as string),
    enabled: Boolean(activeRunId && !useMockEndpoint),
    refetchInterval: () =>
      pipelineResultQuery.data?.status === "COMPLETED" ||
      pipelineResultQuery.data?.status === "FAILED"
        ? false
        : 2000
  });

  const activeRunReportId = pipelineResultQuery.data?.reportId;

  const activeRunReportQuery = useQuery({
    queryKey: ["run-report", activeRunReportId],
    queryFn: () => getReport(activeRunReportId as string),
    enabled: Boolean(activeRunReportId && !useMockEndpoint),
    refetchInterval: () =>
      pipelineResultQuery.data?.status === "COMPLETED" ||
      pipelineResultQuery.data?.status === "FAILED"
        ? false
        : 2000
  });

  const liveRunReport = useMemo(() => {
    if (!activeRunId || useMockEndpoint) return null;

    const report = activeRunReportQuery.data;
    const pipeline = pipelineResultQuery.data;
    const searchResults = searchResultsQuery.data;
    const relevanceResults = relevanceResultsQuery.data;

    return {
      ...(report ?? {}),
      id: report?.id ?? pipeline?.reportId ?? activeRunId,
      topic: report?.topic ?? pipeline?.topic ?? activeReport?.topic,
      status: report?.status ?? pipeline?.status,
      pipeline: pipeline,
      searchResults: searchResults ?? [],
      relevanceResults: relevanceResults ?? []
    } as ReportResult;
  }, [
    activeReport?.topic,
    activeRunId,
    activeRunReportQuery.data,
    pipelineResultQuery.data,
    relevanceResultsQuery.data,
    searchResultsQuery.data,
    useMockEndpoint
  ]);

  const displayReport = liveRunReport ?? currentReport;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(archiveStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ArchiveDocument[];
      setArchiveDocuments(
        parsed.map((document) => ({
          ...document,
          blocks: (document.blocks || []).map(normalizeBlock)
        }))
      );
    } catch {
      // Ignore invalid local data.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(archiveStorageKey, JSON.stringify(archiveDocuments));
  }, [archiveDocuments]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(hiddenReportsStorageKey);
      if (!raw) return;
      setHiddenReportIds(JSON.parse(raw) as string[]);
    } catch {
      // Ignore invalid local data.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(hiddenReportsStorageKey, JSON.stringify(hiddenReportIds));
  }, [hiddenReportIds]);

  useEffect(() => {
    const closeMenu = () => setReportContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  useEffect(() => {
    if (hydratedFromQuery || !requestedWorkspace) return;
    if (reportsQuery.isLoading) return;

    setHasEnteredWorkspace(true);
    setIsSidebarOpen(true);

    if (requestedReportId) {
      const matchedReport = reports.find(
        (report) => String(report.id ?? report.topic) === requestedReportId
      );

      if (matchedReport) {
        setActiveReport(matchedReport);
        setEditorTitle(matchedReport.topic || "최종 보고서 초안");
        setEditorBlocks(makeBlocksFromText(textOrEmpty(matchedReport.mergedReport)));
      }
    }

    setHydratedFromQuery(true);
  }, [
    hydratedFromQuery,
    reports,
    reportsQuery.isLoading,
    requestedReportId,
    requestedWorkspace
  ]);

  useEffect(() => {
    if (pipelineResultQuery.data?.status !== "COMPLETED") return;
    queryClient.invalidateQueries({ queryKey: ["reports"] });
  }, [pipelineResultQuery.data?.status, queryClient]);

  const createMutation = useMutation({
    mutationFn: (nextTopic: string) =>
      useMockEndpoint ? generateMockReport(nextTopic) : runPipeline(nextTopic),
    onSuccess: (result) => {
      setHasEnteredWorkspace(true);
      setIsSidebarOpen(true);
      setActiveArchiveId(null);
      setTopic("");
      if (useMockEndpoint) {
        const report = result as ReportResult;
        setActiveRunId(null);
        setActiveReport(report);
        setEditorTitle(report.topic || "최종 보고서 초안");
        setEditorBlocks(makeBlocksFromText(textOrEmpty(report.mergedReport)));
        queryClient.invalidateQueries({ queryKey: ["reports"] });
        return;
      }

      const pipelineRun = result as { runId: string; topic: string };
      setActiveRunId(pipelineRun.runId);
      setActiveReport({
        id: pipelineRun.runId,
        topic: pipelineRun.topic,
        status: "PROCESSING",
        pipeline: {
          runId: pipelineRun.runId,
          currentStage: "search",
          status: "PROCESSING"
        },
        searchResults: [],
        relevanceResults: []
      });
    }
  });

  function submitTopic() {
    const nextTopic = topic.trim();
    if (!nextTopic || createMutation.isPending) return;
    createMutation.mutate(nextTopic);
  }

  const hasWorkspace =
    hasEnteredWorkspace &&
    (Boolean(displayReport) ||
      createMutation.isPending ||
      pipelineResultQuery.isLoading ||
      Boolean(activeRunId));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitTopic();
  }

  function loadArchive(document: ArchiveDocument) {
    setHasEnteredWorkspace(true);
    setIsSidebarOpen(true);
    setActiveRunId(null);
    setActiveArchiveId(document.id);
    setEditorTitle(document.title);
    setEditorBlocks(document.blocks.map(normalizeBlock));
  }

  function saveArchive() {
    const title = editorTitle.trim() || "이름 없는 문서";
    const blocks = editorBlocks.map((block) => ({
      ...block,
      content: block.content.trimEnd()
    }));
    const nextDocument: ArchiveDocument = {
      id: activeArchiveId ?? makeId("archive"),
      title,
      reportId: currentReport?.id ? String(currentReport.id) : undefined,
      updatedAt: new Date().toISOString(),
      blocks
    };

    setArchiveDocuments((documents) => {
      const remaining = documents.filter((document) => document.id !== nextDocument.id);
      return [nextDocument, ...remaining].slice(0, 24);
    });
    setActiveArchiveId(nextDocument.id);
  }

  function removeArchive(documentId: string) {
    setArchiveDocuments((documents) =>
      documents.filter((document) => document.id !== documentId)
    );
    if (activeArchiveId === documentId) {
      setActiveArchiveId(null);
    }
  }

  function createBlankDocument() {
    setHasEnteredWorkspace(true);
    setIsSidebarOpen(true);
    setActiveRunId(null);
    setActiveArchiveId(null);
    setEditorTitle(displayReport?.topic || "새 작업 문서");
    setEditorBlocks([createBlock("paragraph")]);
  }

  function hideReport(report: ReportResult) {
    const reportKey = String(report.id ?? report.topic);
    setHiddenReportIds((ids) => Array.from(new Set([...ids, reportKey])));
    setReportContextMenu(null);
    if (activeReport?.id === report.id) {
      setActiveReport(null);
      setActiveRunId(null);
    }
  }

  function printWorkspace() {
    window.print();
  }

  return (
    <main className="min-h-screen bg-[#f4f5f2] text-[#202124]">
      {!isSidebarOpen ? (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="fixed left-6 top-6 z-50 grid h-11 w-11 place-items-center rounded-full border border-[#d8dcd2] bg-white text-[#50554d] shadow-[0_8px_28px_rgba(31,38,34,0.08)]"
          aria-label="사이드바 열기"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
      ) : null}

      <div className={`grid min-h-screen ${isSidebarOpen ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[0_minmax(0,1fr)]"}`}>
        <aside
          className={`min-h-screen overflow-hidden border-r border-[#dedfd9] bg-[#fbfbf8] transition-all duration-200 ${
            isSidebarOpen ? "w-[280px] opacity-100" : "w-0 border-r-0 opacity-0"
          }`}
        >
          <div className="flex items-center gap-3 border-b border-[#ebece6] px-5 py-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1f2520] text-white">
              <GitCompare className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">AI Report Workspace</p>
              <div className="flex items-center gap-2">
                <p className="truncate text-xs text-[#7a7f76]">Research drafting studio</p>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#e2e4dd] bg-white text-[#50554d]"
                  aria-label="사이드바 닫기"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <section className="min-h-0 flex-1 px-4 py-4">
            <div className="mb-3 flex items-center gap-2 px-1">
              <History className="h-4 w-4 text-[#666b63]" />
              <p className="text-xs font-semibold uppercase text-[#7a7f76]">최근 보고서</p>
            </div>
            <div className="thin-scrollbar max-h-[42vh] space-y-2 overflow-auto pr-1">
              {filteredReports.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[#dcdfd6] bg-white px-4 py-5 text-sm leading-6 text-[#7c8179]">
                  아직 생성된 보고서가 없습니다.
                </p>
              ) : (
                filteredReports.map((report) => {
                  const active = displayReport?.id === report.id;
                  return (
                    <button
                      key={`${report.id ?? report.topic}`}
                      type="button"
                      onClick={() => {
                        setHasEnteredWorkspace(true);
                        setIsSidebarOpen(true);
                        setActiveRunId(null);
                        setActiveReport(report);
                        setEditorTitle(report.topic || "최종 보고서 초안");
                        setEditorBlocks(makeBlocksFromText(textOrEmpty(report.mergedReport)));
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setReportContextMenu({
                          reportId: String(report.id ?? report.topic),
                          x: event.clientX,
                          y: event.clientY
                        });
                      }}
                      className={`block w-full rounded-2xl border px-4 py-4 text-left transition ${
                        active
                          ? "border-[#b6d2a1] bg-[#f2f8ec]"
                          : "border-[#e3e5de] bg-white hover:bg-[#f5f7f2]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="line-clamp-2 text-sm font-medium leading-6">
                          {report.topic || `보고서 #${report.id}`}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            const rect = event.currentTarget.getBoundingClientRect();
                            setReportContextMenu({
                              reportId: String(report.id ?? report.topic),
                              x: rect.left,
                              y: rect.bottom + 6
                            });
                          }}
                          className="rounded-full px-1.5 py-1 text-[#8b9087] hover:bg-[#eef1eb]"
                        >
                          <Ellipsis className="h-4 w-4" />
                        </button>
                      </div>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs text-[#6d7168]">
                        <Archive className="h-3.5 w-3.5" />
                        {report.status ?? "UNKNOWN"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-6 border-t border-[#ebece6] pt-5">
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <BookOpenText className="h-4 w-4 text-[#666b63]" />
                  <p className="text-xs font-semibold uppercase text-[#7a7f76]">
                    내 아카이브
                  </p>
                </div>
                <button
                  type="button"
                  onClick={createBlankDocument}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-[#dadcd5] bg-white px-2.5 text-xs text-[#4d534b]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  새 문서
                </button>
              </div>
              <div className="thin-scrollbar max-h-[22vh] space-y-2 overflow-auto pr-1">
                {archiveDocuments.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[#dcdfd6] bg-white px-4 py-4 text-sm leading-6 text-[#7c8179]">
                    저장한 문서가 없습니다.
                  </p>
                ) : (
                  archiveDocuments.map((document) => {
                    const active = activeArchiveId === document.id;
                    return (
                      <div
                        key={document.id}
                        className={`rounded-2xl border px-4 py-3 ${
                          active
                            ? "border-[#b6d2a1] bg-[#f2f8ec]"
                            : "border-[#e3e5de] bg-white"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => loadArchive(document)}
                          className="w-full text-left"
                        >
                          <p className="line-clamp-1 text-sm font-medium">{document.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#6d7168]">
                            {blocksToSummary(document.blocks) || "빈 문서"}
                          </p>
                          <p className="mt-2 text-[11px] text-[#8a8f87]">
                            {formatArchiveTime(document.updatedAt)}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeArchive(document.id)}
                          className="mt-2 inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[#8a5b54] hover:bg-[#f9ece8]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          삭제
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          <div className="mt-auto border-t border-[#ebece6] p-3">
            <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#ece9ff] text-sm font-semibold text-[#7f6bff]">
                사
              </div>
              <div>
                <p className="text-sm font-semibold leading-5">사용자</p>
                <p className="text-xs text-[#7a7f76]">연구원</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          {hasWorkspace ? (
            <>
              <header className="sticky top-0 z-20 border-b border-[#d8dcd2] bg-[#fbfbf8]/95 px-4 py-3 backdrop-blur lg:px-6">
                <form onSubmit={handleSubmit} className="mx-auto max-w-[1440px]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Layers3 className="h-4 w-4 text-[#53604c]" />
                        AI 결과 비교 리포트 워크스페이스
                      </div>
                      <p className="mt-1 text-xs text-[#70756d]">
                        주제 입력 {"->"} 초안 비교 {"->"} 공통/차이 강조 {"->"} 리뷰{" "}
                        {"->"} 최종 보고서
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-2xl border border-[#d9ddd4] bg-white px-3 text-sm text-[#444840]">
                        <input
                          checked={useMockEndpoint}
                          onChange={(event) => setUseMockEndpoint(event.target.checked)}
                          type="checkbox"
                          className="h-4 w-4 accent-[#53604c]"
                        />
                        Mock API
                      </label>
                      <button
                        type="button"
                        onClick={submitTopic}
                        disabled={!topic.trim() || createMutation.isPending}
                        className="inline-flex h-9 items-center gap-2 rounded-2xl bg-[#273127] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#a9aea5]"
                      >
                        {createMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        생성
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="보고서 주제를 입력하세요"
                    rows={2}
                    className="min-h-[72px] w-full resize-y rounded-[24px] border border-[#cfd5ca] bg-white px-4 py-3 text-[15px] leading-6 outline-none focus:border-[#7f9f67] focus:ring-2 focus:ring-[#d7ebc8]"
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    {quickTopics.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setTopic(item)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-[#d9ddd4] bg-white px-3 text-xs text-[#484d45] hover:bg-[#f0f3ec]"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {item}
                      </button>
                    ))}
                  </div>

                  {createMutation.error ? (
                    <div className="mt-3 flex items-start gap-2 rounded-2xl border border-[#efc2b7] bg-[#fff3ef] px-3 py-2 text-sm text-[#8d382d]">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>{(createMutation.error as Error).message}</p>
                    </div>
                  ) : null}
                </form>
              </header>

              <div className="thin-scrollbar flex-1 overflow-auto px-4 py-5 lg:px-6">
                <ReportWorkspace
                  report={displayReport}
                  loading={createMutation.isPending && !displayReport}
                  onSaveArchive={saveArchive}
                  onPrintWorkspace={printWorkspace}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <form
                onSubmit={handleSubmit}
                className="w-full max-w-[980px] text-center"
              >
                <div className="mb-6 flex items-center justify-end">
                  <div className="ml-auto flex items-center gap-2">
                    <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-2xl border border-[#d9ddd4] bg-white px-4 text-sm text-[#444840]">
                      <input
                        checked={useMockEndpoint}
                        onChange={(event) => setUseMockEndpoint(event.target.checked)}
                        type="checkbox"
                        className="h-4 w-4 accent-[#53604c]"
                      />
                      Mock API
                    </label>
                  </div>
                </div>

                <div className="mx-auto mb-6 inline-flex rounded-full bg-[#efede7] px-5 py-2 text-sm text-[#868076]">
                  AI 결과 비교 리포트 워크스페이스
                </div>
                <div className="mb-8 flex items-center justify-center gap-4">
                  <span className="grid h-16 w-16 place-items-center rounded-3xl bg-[#f7e9e1] text-[#d67253]">
                    <PencilLine className="h-8 w-8" />
                  </span>
                  <h1 className="text-5xl font-medium tracking-normal text-[#252622]">
                    jjj님, 안녕하십니까
                  </h1>
                </div>
                <p className="mb-8 text-lg text-[#7d8179]">
                  오늘 필요한 보고서 주제를 입력하면 초안 비교부터 최종 편집까지 이어집니다.
                </p>

                <div className="rounded-[34px] border border-[#d8dcd2] bg-white p-6 shadow-[0_18px_48px_rgba(37,38,34,0.08)]">
                  <textarea
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="오늘 어떤 보고서를 만들까요?"
                    rows={4}
                    className="min-h-[150px] w-full resize-none border-0 bg-transparent text-xl leading-8 outline-none placeholder:text-[#9b9f97]"
                  />
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className="grid h-11 w-11 place-items-center rounded-full border border-[#e0e3dc] text-[#50554d]"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={submitTopic}
                      disabled={!topic.trim() || createMutation.isPending}
                      className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#263127] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#a9aea5]"
                    >
                      {createMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      생성
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {quickTopics.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTopic(item)}
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[#d9ddd4] bg-white px-4 text-sm text-[#4b5048]"
                    >
                      <FileText className="h-4 w-4" />
                      {item}
                    </button>
                  ))}
                </div>

                {createMutation.error ? (
                  <div className="mx-auto mt-5 max-w-[760px] rounded-2xl border border-[#efc2b7] bg-[#fff3ef] px-4 py-3 text-sm text-[#8d382d]">
                    {(createMutation.error as Error).message}
                  </div>
                ) : null}
              </form>
            </div>
          )}
        </section>
      </div>

      {reportContextMenu ? (
        <div
          className="fixed z-50 min-w-[170px] rounded-2xl border border-[#d9ddd4] bg-white p-2 shadow-[0_18px_48px_rgba(31,38,34,0.16)]"
          style={{ left: reportContextMenu.x, top: reportContextMenu.y }}
        >
          <button
            type="button"
            onClick={() => {
              const report = filteredReports.find(
                (item) => String(item.id ?? item.topic) === reportContextMenu.reportId
              );
              if (report) hideReport(report);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#8a5b54] hover:bg-[#f9ece8]"
          >
            <Trash2 className="h-4 w-4" />
            목록에서 삭제
          </button>
        </div>
      ) : null}
    </main>
  );
}

function WorkspacePageFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f5f2] text-[#202124]">
      <div className="inline-flex items-center gap-3 rounded-full border border-[#d8dcd2] bg-white px-4 py-2 text-sm text-[#636860]">
        <Loader2 className="h-4 w-4 animate-spin" />
        워크스페이스를 불러오는 중입니다.
      </div>
    </main>
  );
}

function ReportWorkspace({
  report,
  loading,
  onSaveArchive,
  onPrintWorkspace
}: {
  report: ReportResult | null;
  loading: boolean;
  onSaveArchive: () => void;
  onPrintWorkspace: () => void;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("search");
  const commonHighlights = report?.commonHighlights ?? [];
  const differentHighlights = report?.differentHighlights ?? [];
  const status = getEffectiveStatus(report);
  const currentStage = getEffectiveStage(report);
  const errorCode = getEffectiveErrorCode(report);
  const message = getEffectiveMessage(report);
  const papers = useMemo(() => report?.searchResults ?? [], [report]);
  const { cards, stats } = useMemo(
    () => buildPipelineCards(report, loading),
    [loading, report]
  );
  if (!report && !loading) {
    return (
      <section className="mx-auto grid max-w-[1440px] gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-dashed border-[#ccd4c6] bg-white p-8">
          <div className="mb-4 flex items-center gap-3">
            <PencilLine className="h-7 w-7 text-[#667d51]" />
            <div>
              <h1 className="text-2xl font-semibold">비교할 보고서가 없습니다</h1>
              <p className="mt-1 text-sm text-[#666b62]">
                상단 입력 영역에서 주제를 입력하면 GPT 초안과 Claude 초안을 나란히 비교합니다.
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <EmptyStep title="1. 주제 입력" body="Spring /api/pipeline/run으로 실행 요청" />
            <EmptyStep title="2. 초안 비교" body="GPT와 Claude 결과를 2열로 확인" />
            <EmptyStep title="3. 리뷰/최종본" body="검토 결과와 병합 보고서 확인" />
          </div>
        </div>
        <LegendPanel />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1440px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[#d8dcd2] bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[#6d7369]">현재 실행 결과</p>
          <h1 className="mt-1 max-w-[980px] truncate text-xl font-semibold text-[#202124]">
            {report?.topic ?? "보고서 생성 중"}
          </h1>
          <p className="mt-1 text-xs text-[#6f756d]">
            Search {"->"} Reader {"->"} Relevance {"->"} Writer 흐름을 기준으로 결과를
            분리해 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {report?.id ? (
            <Link
              href={`/editor/${report.id}`}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[#d9ddd4] bg-white px-3 text-sm text-[#4e544c] hover:bg-[#f4f7f1]"
            >
              <NotebookPen className="h-4 w-4" />
              편집 가기
            </Link>
          ) : null}
          <StatusBadge loading={loading} status={status} currentStage={currentStage} />
          <LegendInline />
        </div>
      </div>

      {status === "FAILED" ? (
        <ExecutionBanner
          tone="failed"
          title="파이프라인 실행 실패"
          body={message || "실행 중 오류가 발생했습니다. 백엔드 message/errorCode를 확인해 주세요."}
          meta={errorCode || currentStage || "FAILED"}
        />
      ) : null}

      {status === "COMPLETED" && errorCode === "SEARCH_EMPTY_RESULT" ? (
        <ExecutionBanner
          tone="empty"
          title="검색 결과가 없습니다"
          body={message || "주제와 일치하는 논문이 검색되지 않아 다음 단계로 진행하지 않았습니다."}
          meta="SEARCH_EMPTY_RESULT"
        />
      ) : null}

      {status === "PROCESSING" ? (
        <ExecutionBanner
          tone="progress"
          title="파이프라인 실행 중"
          body={`현재 ${currentStage || "search"} 단계 진행 상태를 기다리는 중입니다.`}
          meta={currentStage || "PROCESSING"}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <PipelineStageCard
            key={card.key}
            title={card.title}
            description={card.description}
            count={card.count}
            state={card.state}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-lg border border-[#d8dcd2] bg-white">
          <div className="border-b border-[#e4e8e0] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <TabButton
                active={activeTab === "search"}
                label="검색 결과"
                onClick={() => setActiveTab("search")}
              />
              <TabButton
                active={activeTab === "relevance"}
                label="관련성 결과"
                onClick={() => setActiveTab("relevance")}
              />
              <TabButton
                active={activeTab === "draft"}
                label="보고서 초안"
                onClick={() => setActiveTab("draft")}
              />
            </div>
          </div>

          <div className="p-4">
            {activeTab === "search" ? (
              <PapersTable
                title="검색된 논문 목록"
                description="Search Agent와 Reader Agent 결과를 기반으로 논문 메타데이터와 요약을 확인합니다."
                papers={papers}
                showSelection={false}
                emptyText={
                  status === "PROCESSING"
                    ? "아직 search 결과 파일이 생성되지 않았습니다."
                    : status === "COMPLETED" && errorCode === "SEARCH_EMPTY_RESULT"
                      ? "검색 결과 0건으로 종료되었습니다."
                      : "아직 표시할 논문 결과가 없습니다."
                }
              />
            ) : null}

            {activeTab === "relevance" ? (
              <PapersTable
                title="관련성 선별 결과"
                description="Relevance Agent가 계산한 점수와 선정 여부를 중심으로 검토합니다."
                papers={report?.relevanceResults ?? []}
                showSelection
                emptyText={
                  status === "PROCESSING"
                    ? "아직 relevance 결과 파일이 생성되지 않았습니다."
                    : "아직 표시할 관련성 결과가 없습니다."
                }
              />
            ) : null}

            {activeTab === "draft" ? (
              <div className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <DraftPanel
                    title="GPT 초안"
                    accent="gpt"
                    body={report?.gptDraft}
                    commonHighlights={commonHighlights}
                    differentHighlights={differentHighlights}
                  />
                  <DraftPanel
                    title="Claude 초안"
                    accent="claude"
                    body={report?.claudeDraft}
                    commonHighlights={commonHighlights}
                    differentHighlights={differentHighlights}
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                    <HighlightPanel
                      title="공통 내용"
                      tone="common"
                      items={commonHighlights}
                      emptyText="공통 하이라이트가 없습니다."
                    />
                    <HighlightPanel
                      title="차이 내용"
                      tone="different"
                      items={differentHighlights}
                      emptyText="차이 하이라이트가 없습니다."
                    />
                  </div>

                  <div className="grid gap-4">
                    <DocumentPanel
                      title="Review 결과"
                      icon={<GitCompare className="h-4 w-4" />}
                      body={textOrEmpty(report?.reviewResult)}
                      minHeight="min-h-[160px]"
                    />
                    <DocumentPanel
                      title="Merge 최종 보고서"
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      body={textOrEmpty(report?.mergedReport)}
                      minHeight="min-h-[260px]"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </article>

        <aside className="space-y-4">
          <PipelineSummaryPanel
            searchCount={stats.searchCount}
            summaryCount={stats.summaryCount}
            relevanceCount={stats.relevanceCount}
            reportPath={stats.reportPath}
          />
          <QuickActionPanel
            reportId={report?.id}
            topic={report?.topic}
            onSaveArchive={onSaveArchive}
            onPrintWorkspace={onPrintWorkspace}
          />
        </aside>
      </div>
    </section>
  );
}

function EditorPanel({
  title,
  blocks,
  onTitleChange,
  onBlockChange,
  onBlockCheckedChange,
  onBlockAdd,
  onBlockRemove,
  onBlockDuplicate,
  onSaveArchive,
  onPrintWorkspace
}: {
  title: string;
  blocks: EditorBlock[];
  onTitleChange: (value: string) => void;
  onBlockChange: (
    blockId: string,
    patch: Partial<Pick<EditorBlock, "kind" | "content">>
  ) => void;
  onBlockCheckedChange: (blockId: string, checked: boolean) => void;
  onBlockAdd: (
    kind: EditorBlock["kind"],
    afterBlockId?: string,
    blockId?: string
  ) => void;
  onBlockRemove: (blockId: string) => void;
  onBlockDuplicate: (blockId: string) => void;
  onSaveArchive: () => void;
  onPrintWorkspace: () => void;
}) {
  const blockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null);
  const [slashState, setSlashState] = useState<{ blockId: string; query: string } | null>(
    null
  );

  function resizeTextarea(node: HTMLTextAreaElement | null) {
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${node.scrollHeight}px`;
  }

  useEffect(() => {
    if (!focusTargetId) return;
    const node = blockRefs.current[focusTargetId];
    if (!node) return;
    node.focus();
    const length = node.value.length;
    node.setSelectionRange(length, length);
    resizeTextarea(node);
    setFocusTargetId(null);
  }, [blocks, focusTargetId]);

  useEffect(() => {
    Object.values(blockRefs.current).forEach((node) => resizeTextarea(node));
  }, [blocks]);

  const slashItems = useMemo(() => {
    if (!slashState) return [];
    const query = slashState.query.trim().toLowerCase();
    return notionBlockKinds.filter(
      (item) =>
        item.label.toLowerCase().includes(query) || item.hint.toLowerCase().includes(query)
    );
  }, [slashState]);

  function handleBlockInput(blockId: string, value: string) {
    onBlockChange(blockId, { content: value });
    if (value.startsWith("/")) {
      setSlashState({ blockId, query: value.slice(1) });
    } else if (slashState?.blockId === blockId) {
      setSlashState(null);
    }
  }

  function applySlashCommand(blockId: string, kind: EditorBlock["kind"]) {
    onBlockChange(blockId, { kind, content: "" });
    if (kind === "checklist") {
      onBlockCheckedChange(blockId, false);
    }
    setSlashState(null);
    setFocusTargetId(blockId);
  }

  function handleBlockKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
    block: EditorBlock,
    index: number
  ) {
    if (slashState?.blockId === block.id && event.key === "Escape") {
      setSlashState(null);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const nextKind =
        block.kind === "bullet" || block.kind === "checklist" ? block.kind : "paragraph";
      const newBlockId = makeId("block");
      onBlockAdd(nextKind, block.id, newBlockId);
      setFocusTargetId(newBlockId);
      return;
    }

    if (event.key === "Backspace" && block.content.trim() === "" && blocks.length > 1) {
      event.preventDefault();
      const previousBlock = blocks[index - 1];
      onBlockRemove(block.id);
      setSlashState(null);
      setFocusTargetId(previousBlock?.id ?? null);
    }
  }

  return (
    <article className="rounded-[24px] border border-[#d8dcd2] bg-[#f7f7f4] p-4">
      <div className="mb-4 rounded-[20px] border border-[#dfe3da] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ecefe8] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eff3ec] text-[#51604c]">
              <NotebookPen className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">문서 편집</h2>
              <p className="text-xs text-[#7a7f76]">슬래시 명령과 블록 기반 편집</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {notionBlockKinds.slice(0, 5).map((item) => (
              <button
                key={item.kind}
                type="button"
                onClick={() => onBlockAdd(item.kind)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#d9ddd4] bg-[#fbfcf8] px-3 text-xs text-[#50564d] hover:bg-[#f0f4ee]"
              >
                {blockKindIcon(item.kind)}
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onSaveArchive}
              className="inline-flex h-8 items-center rounded-full bg-[#243024] px-3 text-xs font-semibold text-white"
            >
              아카이브 저장
            </button>
            <button
              type="button"
              onClick={onPrintWorkspace}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-[#d9ddd4] bg-white px-3 text-xs text-[#4d534b]"
            >
              <Download className="h-3.5 w-3.5" />
              PDF 출력
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[860px] px-8 py-10">
          <div className="mb-8 flex items-center gap-3 text-[#8a8f86]">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f2f5ee]">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[#91978d]">
                Final page
              </p>
              <p className="text-sm text-[#6c7269]">
                `/` 명령, Enter로 새 블록, 빈 블록 Backspace 삭제
              </p>
            </div>
          </div>

          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="페이지 제목"
            className="mb-6 w-full border-0 bg-transparent px-0 text-5xl font-semibold tracking-normal outline-none placeholder:text-[#b1b5ae]"
          />

          <div className="space-y-1">
            {blocks.map((block, index) => {
              const slashOpen = slashState?.blockId === block.id;

              return (
                <div key={block.id} className="group relative">
                  <div className="absolute -left-14 top-2 hidden items-center gap-1 group-hover:flex">
                    <button
                      type="button"
                      onClick={() => onBlockAdd("paragraph", block.id)}
                      className="grid h-7 w-7 place-items-center rounded-md text-[#8d9388] hover:bg-[#eef2ea]"
                      aria-label="블록 추가"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onBlockDuplicate(block.id)}
                      className="grid h-7 w-7 place-items-center rounded-md text-[#8d9388] hover:bg-[#eef2ea]"
                      aria-label="블록 복제"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </div>

                  <div className={`rounded-xl px-4 py-2 hover:bg-[#f8faf6] ${block.kind === "callout" ? "bg-[#f4f8ef]" : ""}`}>
                    <div className="flex items-start gap-3">
                      {block.kind === "bullet" ? (
                        <span className="mt-3 text-lg text-[#656b62]">•</span>
                      ) : null}
                      {block.kind === "quote" ? (
                        <TextQuote className="mt-3 h-4 w-4 shrink-0 text-[#7b816f]" />
                      ) : null}
                      {block.kind === "callout" ? (
                        <MessageSquareQuote className="mt-3 h-4 w-4 shrink-0 text-[#6e7f59]" />
                      ) : null}
                      {block.kind === "checklist" ? (
                        <input
                          checked={Boolean(block.checked)}
                          onChange={(event) =>
                            onBlockCheckedChange(block.id, event.target.checked)
                          }
                          type="checkbox"
                          className="mt-3 h-4 w-4 rounded border-[#c8cec2] accent-[#51604c]"
                        />
                      ) : null}

                      <div className="relative min-w-0 flex-1">
                        <textarea
                          ref={(node) => {
                            blockRefs.current[block.id] = node;
                            resizeTextarea(node);
                          }}
                          value={block.content}
                          rows={1}
                          onChange={(event) =>
                            handleBlockInput(block.id, event.currentTarget.value)
                          }
                          onInput={(event) => resizeTextarea(event.currentTarget)}
                          onKeyDown={(event) => handleBlockKeyDown(event, block, index)}
                          onFocus={() => {
                            if (block.content.startsWith("/")) {
                              setSlashState({
                                blockId: block.id,
                                query: block.content.slice(1)
                              });
                            }
                          }}
                          className={editorBlockClassName(block)}
                        />
                        {!block.content ? (
                          <div className={editorPlaceholderClassName(block)}>
                            {editorPlaceholder(block.kind)}
                          </div>
                        ) : null}

                        {slashOpen ? (
                          <div className="mt-3 w-full max-w-[320px] rounded-2xl border border-[#d8dcd2] bg-white p-2 shadow-[0_18px_48px_rgba(31,38,34,0.12)]">
                            <p className="px-2 pb-2 pt-1 text-[11px] uppercase tracking-[0.16em] text-[#91978d]">
                              Slash commands
                            </p>
                            <div className="space-y-1">
                              {slashItems.map((item) => (
                                <button
                                  key={item.kind}
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => applySlashCommand(block.id, item.kind)}
                                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-[#f4f6f1]"
                                >
                                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                                    {blockKindIcon(item.kind)}
                                    {item.label}
                                  </span>
                                  <span className="text-xs text-[#8c9188]">{item.hint}</span>
                                </button>
                              ))}
                              {slashItems.length === 0 ? (
                                <p className="px-3 py-2 text-sm text-[#7a8077]">
                                  해당하는 블록 명령이 없습니다.
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => onBlockRemove(block.id)}
                        className="mt-2 hidden h-8 items-center gap-1 rounded-md px-2 text-xs text-[#9a6a62] hover:bg-[#f9ece8] group-hover:inline-flex"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

function editorPlaceholder(kind: EditorBlock["kind"]) {
  switch (kind) {
    case "heading-1":
      return "큰 제목";
    case "heading-2":
      return "섹션 제목";
    case "bullet":
      return "목록 항목";
    case "checklist":
      return "할 일";
    case "quote":
      return "인용문";
    case "callout":
      return "강조할 메모";
    default:
      return "여기에 내용을 입력하거나 '/'를 눌러 블록을 추가하세요";
  }
}

function editorBlockClassName(block: EditorBlock) {
  const base =
    "relative z-10 w-full whitespace-pre-wrap break-words bg-transparent outline-none";

  switch (block.kind) {
    case "heading-1":
      return `${base} text-3xl font-semibold leading-[1.25] text-[#202124]`;
    case "heading-2":
      return `${base} text-2xl font-semibold leading-[1.35] text-[#2d302a]`;
    case "quote":
      return `${base} text-[15px] leading-7 text-[#4f554c]`;
    case "callout":
      return `${base} text-[15px] leading-7 text-[#355229]`;
    case "checklist":
      return `${base} text-[15px] leading-7 text-[#242823]`;
    default:
      return `${base} text-[15px] leading-7 text-[#242823]`;
  }
}

function editorPlaceholderClassName(block: EditorBlock) {
  const base = "pointer-events-none absolute left-0 top-0 text-[#b0b4ad]";
  switch (block.kind) {
    case "heading-1":
      return `${base} text-3xl font-semibold`;
    case "heading-2":
      return `${base} text-2xl font-semibold`;
    default:
      return `${base} text-[15px] leading-7`;
  }
}

function blockKindIcon(kind: EditorBlock["kind"]) {
  switch (kind) {
    case "heading-1":
      return <Heading1 className="h-3.5 w-3.5" />;
    case "heading-2":
      return <Heading2 className="h-3.5 w-3.5" />;
    case "bullet":
      return <List className="h-3.5 w-3.5" />;
    case "checklist":
      return <ListChecks className="h-3.5 w-3.5" />;
    case "quote":
      return <TextQuote className="h-3.5 w-3.5" />;
    case "callout":
      return <MessageSquareQuote className="h-3.5 w-3.5" />;
    default:
      return <FileText className="h-3.5 w-3.5" />;
  }
}

function PipelineStageCard({
  title,
  description,
  count,
  state
}: {
  title: string;
  description: string;
  count: number;
  state: PipelineCardState;
}) {
  const stateLabel =
    state === "completed"
      ? "완료"
      : state === "running"
        ? "진행 중"
        : state === "failed"
          ? "실패"
          : "대기";
  const stateClass =
    state === "completed"
      ? "bg-[#edf7ec] text-[#2f6c35]"
      : state === "running"
        ? "bg-[#eef5ff] text-[#2f5f93]"
        : state === "failed"
          ? "bg-[#fff0ec] text-[#a04939]"
          : "bg-[#f1f2ef] text-[#71766f]";

  return (
    <article className="rounded-lg border border-[#d8dcd2] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6 text-[#697066]">{description}</p>
        </div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stateClass}`}>
          {stateLabel}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#8b9087]">결과 수</p>
          <p className="mt-1 text-2xl font-semibold text-[#202124]">{count}</p>
        </div>
        <Layers3 className="h-5 w-5 text-[#7b8177]" />
      </div>
    </article>
  );
}

function ExecutionBanner({
  tone,
  title,
  body,
  meta
}: {
  tone: "failed" | "empty" | "progress";
  title: string;
  body: string;
  meta: string;
}) {
  const toneClass =
    tone === "failed"
      ? "border-[#efc2b7] bg-[#fff3ef] text-[#8d382d]"
      : tone === "empty"
        ? "border-[#e5d9a3] bg-[#fff9e9] text-[#7a5d19]"
        : "border-[#c7d8f6] bg-[#f3f8ff] text-[#32598b]";

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6">{body}</p>
        </div>
        <span className="inline-flex rounded-full border border-current/20 px-2.5 py-1 text-xs font-semibold">
          {meta}
        </span>
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center rounded-full border px-4 text-sm transition ${
        active
          ? "border-[#b6d2a1] bg-[#eef7e7] font-semibold text-[#294d26]"
          : "border-[#d9ddd4] bg-white text-[#555b52] hover:bg-[#f3f6ef]"
      }`}
    >
      {label}
    </button>
  );
}

function PapersTable({
  title,
  description,
  papers,
  showSelection,
  emptyText
}: {
  title: string;
  description: string;
  papers: SearchPaper[];
  showSelection: boolean;
  emptyText: string;
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[#6a7068]">{description}</p>
      </div>

      {papers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#d7dcd2] bg-[#fbfcf8] px-4 py-8 text-sm text-[#727871]">
          {emptyText}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#dde1d8]">
          <div className="thin-scrollbar overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[#f6f8f3] text-left text-[#5a6057]">
                <tr>
                  <th className="px-4 py-3 font-semibold">논문 제목</th>
                  <th className="px-4 py-3 font-semibold">저자</th>
                  <th className="px-4 py-3 font-semibold">연도</th>
                  <th className="px-4 py-3 font-semibold">출처</th>
                  <th className="px-4 py-3 font-semibold">요약</th>
                  <th className="px-4 py-3 font-semibold">점수</th>
                  {showSelection ? (
                    <th className="px-4 py-3 font-semibold">선정</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {papers.map((paper) => (
                  <tr key={String(paper.id ?? paper.title)} className="border-t border-[#edf0e9] align-top">
                    <td className="px-4 py-3 font-medium text-[#202124]">{paper.title}</td>
                    <td className="px-4 py-3 text-[#5f655d]">
                      {(paper.authors || []).join(", ") || "-"}
                    </td>
                    <td className="px-4 py-3 text-[#5f655d]">{paper.year ?? "-"}</td>
                    <td className="px-4 py-3 text-[#5f655d]">{paper.source ?? "-"}</td>
                    <td className="max-w-[360px] px-4 py-3 leading-6 text-[#353934]">
                      {paper.summary || "-"}
                    </td>
                    <td className="px-4 py-3 text-[#202124]">
                      {paper.relevanceScore != null ? `${paper.relevanceScore}` : "-"}
                    </td>
                    {showSelection ? (
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            paper.selected
                              ? "bg-[#edf7ec] text-[#2f6c35]"
                              : "bg-[#f1f2ef] text-[#71766f]"
                          }`}
                        >
                          {paper.selected ? "선정" : "제외"}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function PipelineSummaryPanel({
  searchCount,
  summaryCount,
  relevanceCount,
  reportPath
}: {
  searchCount: number;
  summaryCount: number;
  relevanceCount: number;
  reportPath: string;
}) {
  return (
    <aside className="rounded-lg border border-[#d8dcd2] bg-white p-5">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-[#5d6359]" />
        <h2 className="text-sm font-semibold">파이프라인 요약</h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        <StatRow label="검색 수집" value={`${searchCount}편`} />
        <StatRow label="요약 완료" value={`${summaryCount}편`} />
        <StatRow label="선별 논문" value={`${relevanceCount}편`} />
      </div>
      <div className="mt-4 rounded-lg border border-[#e3e6de] bg-[#f8faf6] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b9087]">
          저장 경로
        </p>
        <p className="mt-2 break-all text-sm leading-6 text-[#4f564c]">{reportPath}</p>
      </div>
    </aside>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e3e6de] bg-[#fbfcf8] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-[#8b9087]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#202124]">{value}</p>
    </div>
  );
}

function QuickActionPanel({
  reportId,
  topic,
  onSaveArchive,
  onPrintWorkspace
}: {
  reportId?: string | number;
  topic?: string;
  onSaveArchive: () => void;
  onPrintWorkspace: () => void;
}) {
  return (
    <aside className="rounded-lg border border-[#d8dcd2] bg-white p-5">
      <div className="flex items-center gap-2">
        <NotebookPen className="h-4 w-4 text-[#5d6359]" />
        <h2 className="text-sm font-semibold">후속 작업</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#667064]">
        보고서 초안을 확인한 뒤 전용 편집기로 넘기거나, 현재 결과를 저장 및 PDF로 출력합니다.
      </p>

      <div className="mt-4 space-y-2">
        {reportId ? (
          <Link
            href={`/editor/${reportId}`}
            className="flex w-full items-center justify-between rounded-md border border-[#d9ddd4] bg-[#fbfcf8] px-3 py-3 text-left hover:bg-[#f2f5ee]"
          >
            <span>
              <span className="block text-sm font-medium">편집 가기</span>
              <span className="mt-1 block text-xs text-[#6f756d]">
                노션식 문서 편집 화면으로 이동
              </span>
            </span>
            <NotebookPen className="h-4 w-4 text-[#5f655c]" />
          </Link>
        ) : null}

        <button
          type="button"
          onClick={onSaveArchive}
          className="flex w-full items-center justify-between rounded-md border border-[#d9ddd4] bg-[#fbfcf8] px-3 py-3 text-left hover:bg-[#f2f5ee]"
        >
          <span>
            <span className="block text-sm font-medium">실행 결과 저장</span>
            <span className="mt-1 block text-xs text-[#6f756d]">
              현재 보고서를 아카이브로 저장
            </span>
          </span>
          <Archive className="h-4 w-4 text-[#5f655c]" />
        </button>

        <button
          type="button"
          onClick={onPrintWorkspace}
          className="flex w-full items-center justify-between rounded-md border border-[#d9ddd4] bg-[#fbfcf8] px-3 py-3 text-left hover:bg-[#f2f5ee]"
        >
          <span>
            <span className="block text-sm font-medium">Markdown/PDF 출력</span>
            <span className="mt-1 block text-xs text-[#6f756d]">
              보고서 초안과 경로를 기준으로 출력
            </span>
          </span>
          <Download className="h-4 w-4 text-[#5f655c]" />
        </button>
      </div>

      {topic ? (
        <div className="mt-5 rounded-lg border border-[#e4e7e0] bg-[#f8faf6] p-4 text-sm leading-6 text-[#5c6459]">
          <p className="font-semibold">현재 주제</p>
          <p className="mt-2">{topic}</p>
        </div>
      ) : null}
    </aside>
  );
}

function ComposerPanel({
  report,
  onAppendText
}: {
  report: ReportResult | null;
  onAppendText: (sourceTitle: string, text?: string) => void;
}) {
  const actionItems = [
    { title: "GPT 초안 가져오기", value: report?.gptDraft },
    { title: "Claude 초안 가져오기", value: report?.claudeDraft },
    { title: "Review 결과 가져오기", value: report?.reviewResult },
    { title: "Merge 최종본 가져오기", value: report?.mergedReport }
  ];

  return (
    <aside className="rounded-lg border border-[#d8dcd2] bg-white p-5">
      <div className="flex items-center gap-2">
        <NotebookPen className="h-4 w-4 text-[#5d6359]" />
        <h2 className="text-sm font-semibold">문서 조합 패널</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#667064]">
        비교 결과를 편집기로 바로 가져와 문서처럼 다듬고, 마지막에 브라우저 인쇄로
        PDF 저장까지 이어집니다.
      </p>

      <div className="mt-4 space-y-2">
        {actionItems.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onAppendText(item.title, item.value)}
            className="flex w-full items-center justify-between rounded-md border border-[#d9ddd4] bg-[#fbfcf8] px-3 py-3 text-left hover:bg-[#f2f5ee]"
          >
            <span className="text-sm font-medium">{item.title}</span>
            <Plus className="h-4 w-4 text-[#5f655c]" />
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-[#e4e7e0] bg-[#f8faf6] p-4 text-sm leading-6 text-[#5c6459]">
        <p className="font-semibold">현재 프론트에서 가능한 범위</p>
        <p className="mt-2">
          문서 편집, 로컬 아카이브 저장, 결과 조합, 인쇄 기반 PDF 저장 흐름까지는
          프론트만으로 처리할 수 있습니다.
        </p>
      </div>
    </aside>
  );
}

function EmptyStep({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[#e0e4dc] bg-[#fbfcf8] p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#687064]">{body}</p>
    </div>
  );
}

function StatusBadge({
  loading,
  status,
  currentStage
}: {
  loading: boolean;
  status?: string;
  currentStage?: string;
}) {
  const label =
    status === "FAILED"
      ? "FAILED"
      : status === "COMPLETED"
        ? "COMPLETED"
        : status === "PROCESSING"
          ? `PROCESSING · ${currentStage || "search"}`
          : loading
            ? "생성 중"
            : status ?? "대기";

  const icon =
    status === "PROCESSING" || loading ? (
      <Loader2 className="h-4 w-4 animate-spin text-[#6b7e55]" />
    ) : (
      <Layers3 className="h-4 w-4 text-[#5f665c]" />
    );

  return (
    <div className="inline-flex h-8 items-center gap-2 rounded-md border border-[#d9ddd4] bg-[#fbfcf8] px-3 text-sm">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function LegendInline() {
  return (
    <div className="inline-flex h-8 items-center gap-3 rounded-md border border-[#d9ddd4] bg-[#fbfcf8] px-3 text-xs text-[#555a52]">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-[#dff3df] ring-1 ring-[#a7d8ae]" />
        공통
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-[#f3e8ff] ring-1 ring-[#d6bdf5]" />
        차이
      </span>
    </div>
  );
}

function LegendPanel() {
  return (
    <aside className="rounded-lg border border-[#d8dcd2] bg-white p-5">
      <h2 className="text-sm font-semibold">하이라이트 규칙</h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-[#555b52]">
        <p>
          <mark className={commonMarkClass}>연녹색</mark> 표시는 두 초안에 공통으로
          잡힌 핵심 내용입니다.
        </p>
        <p>
          <mark className={differentMarkClass}>연보라색</mark> 표시는 초안 간 관점,
          표현, 구성 차이입니다.
        </p>
      </div>
    </aside>
  );
}

function DraftPanel({
  title,
  accent,
  body,
  commonHighlights,
  differentHighlights
}: {
  title: string;
  accent: "gpt" | "claude";
  body?: string;
  commonHighlights: string[];
  differentHighlights: string[];
}) {
  const accentClass =
    accent === "gpt"
      ? "border-t-[#3b82f6] bg-[#f8fbff]"
      : "border-t-[#8b5cf6] bg-[#fcfaff]";

  return (
    <article
      className={`flex min-h-[440px] flex-col rounded-lg border border-[#d8dcd2] border-t-4 ${accentClass}`}
    >
      <div className="flex h-12 items-center justify-between border-b border-[#e1e5dd] px-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#5d6359]" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <span className="text-xs text-[#747970]">Draft</span>
      </div>
      <div className="thin-scrollbar max-h-[520px] flex-1 overflow-auto px-5 py-4">
        <p className="whitespace-pre-wrap text-[15px] leading-7 text-[#252823]">
          {renderHighlightedText(
            textOrEmpty(body),
            commonHighlights,
            differentHighlights
          )}
        </p>
      </div>
    </article>
  );
}

function HighlightPanel({
  title,
  tone,
  items,
  emptyText
}: {
  title: string;
  tone: "common" | "different";
  items: string[];
  emptyText: string;
}) {
  const toneClass =
    tone === "common"
      ? "border-[#b7debf] bg-[#f2fbf4] text-[#1f4d2e]"
      : "border-[#dcc7fa] bg-[#faf5ff] text-[#5b3b8a]";

  return (
    <article className="rounded-lg border border-[#d8dcd2] bg-white">
      <div className="flex h-12 items-center gap-2 border-b border-[#e1e5dd] px-4">
        <GitCompare className="h-4 w-4 text-[#5d6359]" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-sm leading-6 text-[#777d73]">{emptyText}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item}
                className={`rounded-md border px-3 py-2 text-sm leading-6 ${toneClass}`}
              >
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function DocumentPanel({
  title,
  icon,
  body,
  minHeight
}: {
  title: string;
  icon: React.ReactNode;
  body: string;
  minHeight: string;
}) {
  return (
    <article className="rounded-lg border border-[#d8dcd2] bg-white">
      <div className="flex h-12 items-center gap-2 border-b border-[#e1e5dd] px-4">
        <span className="text-[#5d6359]">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className={`thin-scrollbar max-h-[520px] overflow-auto px-5 py-4 ${minHeight}`}>
        <p className="whitespace-pre-wrap text-[15px] leading-7 text-[#252823]">
          {body}
        </p>
      </div>
    </article>
  );
}
