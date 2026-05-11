"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenText,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  NotebookPen,
  PanelLeft,
  PencilLine,
  Plus,
  Table2,
  TextQuote
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getReport } from "@/lib/api";
import type { ReportResult } from "@/lib/types";

type EditorBlockKind = "title" | "heading" | "paragraph" | "checklist" | "quote";

type EditorBlock = {
  id: string;
  kind: EditorBlockKind;
  content: string;
  checked?: boolean;
};

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createBlock(
  kind: EditorBlockKind,
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

function splitLines(text?: string) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildEditorBlocks(report?: ReportResult): EditorBlock[] {
  const topic = report?.topic || "새 보고서";
  const mergedLines = splitLines(report?.mergedReport);
  const reviewLines = splitLines(report?.reviewResult);

  const blocks: EditorBlock[] = [createBlock("title", topic)];

  if (mergedLines.length > 0) {
    blocks.push(createBlock("heading", "최종 보고서"));
    mergedLines.forEach((line, index) => {
      blocks.push(
        createBlock(index === 0 && line.length < 70 ? "paragraph" : "paragraph", line)
      );
    });
  }

  if ((report?.commonHighlights || []).length > 0) {
    blocks.push(createBlock("heading", "공통 핵심"));
    report?.commonHighlights?.forEach((item) => {
      blocks.push(createBlock("checklist", item, true));
    });
  }

  if ((report?.differentHighlights || []).length > 0) {
    blocks.push(createBlock("heading", "차이 메모"));
    report?.differentHighlights?.forEach((item) => {
      blocks.push(createBlock("quote", item));
    });
  }

  if (reviewLines.length > 0) {
    blocks.push(createBlock("heading", "Review"));
    reviewLines.forEach((line) => {
      blocks.push(createBlock("paragraph", line));
    });
  }

  if (blocks.length === 1) {
    blocks.push(createBlock("paragraph", ""));
  }

  return blocks;
}

function summaryRows(report?: ReportResult) {
  return [
    ["상태", report?.status || "UNKNOWN"],
    ["초안 비교", `${report?.gptDraft ? "GPT" : "-"} / ${report?.claudeDraft ? "Claude" : "-"}`],
    ["공통 내용", String(report?.commonHighlights?.length ?? 0)],
    ["차이 내용", String(report?.differentHighlights?.length ?? 0)]
  ];
}

export default function EditorPage({
  params
}: {
  params: { reportId: string };
}) {
  const reportQuery = useQuery({
    queryKey: ["report", params.reportId],
    queryFn: () => getReport(params.reportId)
  });

  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    if (!reportQuery.data) return;
    setBlocks(buildEditorBlocks(reportQuery.data));
  }, [reportQuery.data]);

  useEffect(() => {
    Object.values(textareaRefs.current).forEach((node) => {
      if (!node) return;
      node.style.height = "0px";
      node.style.height = `${node.scrollHeight}px`;
    });
  }, [blocks]);

  useEffect(() => {
    if (!pendingFocusId) return;
    const nextNode = textareaRefs.current[pendingFocusId];
    if (!nextNode) return;
    nextNode.focus();
    const length = nextNode.value.length;
    nextNode.setSelectionRange(length, length);
    nextNode.scrollIntoView({ block: "center", behavior: "smooth" });
    setPendingFocusId(null);
  }, [blocks, pendingFocusId]);

  const currentTitle = useMemo(
    () => blocks.find((block) => block.kind === "title")?.content || reportQuery.data?.topic || "",
    [blocks, reportQuery.data?.topic]
  );
  const workspaceHref = reportQuery.data?.id
    ? `/?workspace=1&reportId=${reportQuery.data.id}`
    : "/?workspace=1";
  const quickInsertTargetId =
    activeBlockId || blocks.find((block) => block.kind === "title")?.id || blocks[0]?.id;

  function updateBlock(blockId: string, patch: Partial<EditorBlock>) {
    setBlocks((prev) =>
      prev.map((block) => (block.id === blockId ? { ...block, ...patch } : block))
    );
  }

  function addBlock(afterId?: string, kind: EditorBlockKind = "paragraph") {
    const nextBlock = createBlock(kind, "");
    setPendingFocusId(nextBlock.id);
    setBlocks((prev) => {
      if (!afterId) return [...prev, nextBlock];
      const index = prev.findIndex((block) => block.id === afterId);
      if (index === -1) return [...prev, nextBlock];
      return [...prev.slice(0, index + 1), nextBlock, ...prev.slice(index + 1)];
    });
  }

  function removeBlock(blockId: string) {
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((block) => block.id !== blockId)));
  }

  if (reportQuery.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fafaf7] text-[#232521]">
        <div className="flex items-center gap-3 text-sm text-[#6d7269]">
          <Loader2 className="h-4 w-4 animate-spin" />
          편집 페이지를 불러오는 중입니다.
        </div>
      </main>
    );
  }

  if (reportQuery.isError || !reportQuery.data) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fafaf7] text-[#232521]">
        <div className="rounded-3xl border border-[#dddfd8] bg-white px-8 py-7 text-center">
          <p className="text-lg font-semibold">문서를 불러오지 못했습니다.</p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-[#d9ddd4] px-4 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            홈으로 돌아가기
          </Link>
        </div>
      </main>
    );
  }

  const report = reportQuery.data;

  return (
    <main className="min-h-screen bg-[#fafaf7] text-[#232521]">
      <div className="flex min-h-screen">
        <aside
          className={`hidden shrink-0 border-r border-[#ebece5] bg-[#f4f4f0] transition-all duration-200 lg:flex lg:flex-col ${
            isNavOpen ? "w-[240px]" : "w-[92px]"
          }`}
        >
          <div className={`flex items-center gap-3 px-5 py-6 ${isNavOpen ? "" : "justify-center"}`}>
            <button
              type="button"
              onClick={() => setIsNavOpen((prev) => !prev)}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d8dad2] bg-white text-[#555a51]"
              aria-label="사이드 패널 토글"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            {isNavOpen ? (
              <div className="min-w-0">
                <p className="text-sm font-semibold">문서 탐색</p>
                <p className="text-xs text-[#7a7f76]">편집 블록과 이동 링크</p>
              </div>
            ) : null}
          </div>

          {isNavOpen ? (
            <div className="flex-1 space-y-6 px-4 pb-6">
              <div className="rounded-[24px] border border-[#e1e4dc] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8d9288]">
                  이동
                </p>
                <div className="mt-3 space-y-2">
                  <Link
                    href={workspaceHref}
                    className="flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-[#475047] hover:bg-[#f3f6ef]"
                  >
                    <BookOpenText className="h-4 w-4" />
                    원래 워크스페이스
                  </Link>
                  <button
                    type="button"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm text-[#475047] hover:bg-[#f3f6ef]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    상단으로 이동
                  </button>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#e1e4dc] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8d9288]">
                  문서 섹션
                </p>
                <div className="mt-3 space-y-2">
                  {blocks
                    .filter((block) => block.kind === "title" || block.kind === "heading")
                    .map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        onClick={() => {
                          const node = textareaRefs.current[block.id];
                          if (!node) return;
                          node.scrollIntoView({ block: "center", behavior: "smooth" });
                          node.focus();
                        }}
                        className="block w-full rounded-2xl px-3 py-2 text-left text-sm text-[#475047] hover:bg-[#f3f6ef]"
                      >
                        {block.content || "제목 없음"}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          ) : null}
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-[#eceee7] bg-[#fafaf7]/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-6 py-4">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-sm text-[#7a7f76]">
                  <Link
                    href={workspaceHref}
                    className="inline-flex items-center gap-1 hover:text-[#232521]"
                  >
                    <BookOpenText className="h-4 w-4" />
                    워크스페이스
                  </Link>
                  <ChevronRight className="h-4 w-4" />
                  <span className="truncate">{currentTitle}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#ecf3e8] text-[#587045]">
                    <NotebookPen className="h-5 w-5" />
                  </span>
                  <p className="truncate text-lg font-semibold">{currentTitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={workspaceHref}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d9ddd4] bg-white px-4 text-sm text-[#50564d]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  비교로 돌아가기
                </Link>
              </div>
            </div>
          </header>

          <div className="mx-auto grid max-w-[1240px] gap-8 px-6 py-8 xl:grid-cols-[minmax(0,1fr)_280px]">
            <article className="min-w-0">
              <div className="mb-10">
                <div className="mb-4 flex items-center gap-3 text-[#8a8f86]">
                  <span className="grid h-16 w-16 place-items-center rounded-[24px] bg-[#eff4ea] text-[#6c8753]">
                    <FileText className="h-8 w-8" />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#9aa094]">
                      Draft page
                    </p>
                    <p className="text-sm text-[#6d7269]">보고서 내용을 문서 형태로 정리합니다.</p>
                  </div>
                </div>
                <h1 className="text-[58px] font-semibold leading-[1.05] tracking-normal text-[#222420]">
                  {currentTitle}
                </h1>
                <div className="mt-6 h-px bg-[#e2e5de]" />
              </div>

              <section className="mb-12 rounded-[28px] border border-[#e6e8e1] bg-white p-6 shadow-[0_16px_48px_rgba(31,38,34,0.06)]">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#f1f4ed] text-[#5f7055]">
                    <PencilLine className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-2xl font-semibold">문서 편집</p>
                    <p className="text-sm text-[#7c8179]">
                      블록을 추가하고 내용을 바로 수정할 수 있습니다.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {["paragraph", "heading", "checklist", "quote"].map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() =>
                        addBlock(
                          quickInsertTargetId,
                          kind as EditorBlockKind
                        )
                      }
                      className="inline-flex h-9 items-center rounded-full border border-[#dadcd5] bg-[#fafbf8] px-4 text-sm text-[#50564d]"
                    >
                      {kind === "paragraph" ? "문단" : ""}
                      {kind === "heading" ? "제목" : ""}
                      {kind === "checklist" ? "체크리스트" : ""}
                      {kind === "quote" ? "메모" : ""}
                    </button>
                  ))}
                </div>
              </section>

              <div className="space-y-3">
                {blocks.map((block) => (
                  <div key={block.id} className="group rounded-[24px] px-2 py-1 hover:bg-[#f3f5ef]">
                    <div className="flex items-start gap-4">
                      <div className="mt-3 w-8 shrink-0 text-[#9ca197]">
                        {block.kind === "checklist" ? (
                          <input
                            checked={Boolean(block.checked)}
                            onChange={(event) =>
                              updateBlock(block.id, { checked: event.target.checked })
                            }
                            type="checkbox"
                            className="h-4 w-4 accent-[#657c50]"
                          />
                        ) : block.kind === "quote" ? (
                          <TextQuote className="h-5 w-5" />
                        ) : block.kind === "heading" ? (
                          <NotebookPen className="h-5 w-5" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => addBlock(block.id, "paragraph")}
                            className="grid h-8 w-8 place-items-center rounded-full text-[#8e938a] opacity-0 transition hover:bg-[#e9ede5] group-hover:opacity-100"
                            aria-label="다음 블록 추가"
                          >
                            <Plus className="h-5 w-5" />
                          </button>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <textarea
                          ref={(node) => {
                            textareaRefs.current[block.id] = node;
                          }}
                          value={block.content}
                          onFocus={() => setActiveBlockId(block.id)}
                          onChange={(event) =>
                            updateBlock(block.id, { content: event.currentTarget.value })
                          }
                          rows={1}
                          className={`w-full resize-none border-0 bg-transparent p-0 outline-none ${
                            block.kind === "title"
                              ? "text-[58px] font-semibold leading-[1.05]"
                              : block.kind === "heading"
                                ? "text-[34px] font-semibold leading-[1.2]"
                                : block.kind === "quote"
                                  ? "rounded-r-2xl border-l-4 border-[#d4dacd] bg-[#fafbf8] px-5 py-4 text-[18px] leading-8 text-[#50564d]"
                                  : block.kind === "checklist"
                                    ? "text-[18px] leading-8"
                                    : "text-[18px] leading-8"
                          }`}
                          placeholder={
                            block.kind === "title"
                              ? "제목 없음"
                              : block.kind === "heading"
                                ? "섹션 제목"
                                : block.kind === "quote"
                                  ? "메모를 입력하세요"
                                  : "내용을 입력하세요"
                          }
                        />
                      </div>

                      {block.kind !== "title" ? (
                        <button
                          type="button"
                          onClick={() => removeBlock(block.id)}
                          className="mt-2 rounded-full px-2 py-1 text-xs text-[#9b6e67] opacity-0 transition group-hover:opacity-100 hover:bg-[#f9ece8]"
                        >
                          삭제
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <aside className="space-y-4">
              <section className="rounded-[28px] border border-[#e6e8e1] bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-[#5e645a]" />
                  <h2 className="text-sm font-semibold">문서 개요</h2>
                </div>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {summaryRows(report).map(([key, value]) => (
                      <tr key={key} className="border-t border-[#eef0ea] first:border-t-0">
                        <th className="w-[92px] py-3 text-left font-medium text-[#7b8078]">
                          {key}
                        </th>
                        <td className="py-3 text-[#2c2f2a]">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="rounded-[28px] border border-[#e6e8e1] bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <TextQuote className="h-4 w-4 text-[#5e645a]" />
                  <h2 className="text-sm font-semibold">핵심 포인트</h2>
                </div>
                <div className="space-y-2">
                  {(report.commonHighlights || []).map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl bg-[#f2faef] px-4 py-3 text-sm leading-6 text-[#32522f]"
                    >
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#8fd18c]" />
                      {item}
                    </div>
                  ))}
                  {(report.differentHighlights || []).map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl bg-[#faf4ff] px-4 py-3 text-sm leading-6 text-[#634b88]"
                    >
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-[#c5a4ff]" />
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[28px] border border-[#e6e8e1] bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Check className="h-4 w-4 text-[#5e645a]" />
                  <h2 className="text-sm font-semibold">상태</h2>
                </div>
                <p className="text-sm leading-6 text-[#6a7067]">
                  이 페이지는 홈의 비교 화면과 분리된 편집 전용 화면입니다. 보고서 내용을
                  정리하고 문서처럼 다듬는 데 집중합니다.
                </p>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
