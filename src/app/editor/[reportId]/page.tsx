"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun
} from "docx";
import {
  ArrowLeft,
  BookOpenText,
  Check,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  NotebookPen,
  PanelLeft,
  PencilLine,
  Plus,
  Table2,
  TextQuote
} from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { getReport } from "@/lib/api";
import type { ReportResult } from "@/lib/types";

type EditorBlockKind = "title" | "heading" | "paragraph" | "checklist" | "quote" | "image";

type EditorBlock = {
  id: string;
  kind: EditorBlockKind;
  content: string;
  checked?: boolean;
  headingLevel?: number;
  src?: string;
  alt?: string;
};

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createBlock(
  kind: EditorBlockKind,
  content = "",
  checked = false,
  headingLevel?: number
): EditorBlock {
  return {
    id: makeId("block"),
    kind,
    content,
    checked: kind === "checklist" ? checked : undefined,
    headingLevel: kind === "heading" ? headingLevel ?? 2 : undefined
  };
}

function splitLines(text?: string) {
  return (text || "")
    .split("\n")
    .map((line) => line.trim());
}

function parseMarkdownImage(line: string) {
  const match = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
  if (!match) return null;

  return {
    alt: match[1] || "시각화 이미지",
    src: match[2]
  };
}

function parseMarkdownHeading(line: string) {
  const match = line.match(/^(#{1,6})\s+(.*)$/);
  if (!match) return null;

  return {
    level: match[1].length,
    content: match[2].trim()
  };
}

function normalizeHeadingContent(value: string) {
  return value.replace(/^\s*#{1,6}\s+/, "").trimStart();
}

function parseHeadingInput(value: string) {
  const trimmed = value.replace(/^\s+/, "");
  const withContent = trimmed.match(/^(#{1,6})\s+(.*)$/);
  if (withContent) {
    return {
      level: withContent[1].length,
      content: withContent[2]
    };
  }

  return null;
}

function hasMarkdownImages(text?: string) {
  return /!\[[^\]]*\]\(([^)]+)\)/.test(text || "");
}

function buildEditorBlocks(report?: ReportResult): EditorBlock[] {
  const topic = report?.topic || "새 보고서";
  const mergedLines = splitLines(report?.mergedReport);
  const reviewLines = splitLines(report?.reviewResult);

  const blocks: EditorBlock[] = [createBlock("title", topic)];

  if (mergedLines.length > 0) {
    blocks.push(createBlock("heading", "최종 보고서"));
    mergedLines.forEach((line) => {
      const image = parseMarkdownImage(line);
      if (image) {
        blocks.push({
          ...createBlock("paragraph", ""),
          kind: "image",
          alt: image.alt,
          src: image.src
        });
        return;
      }

      const heading = parseMarkdownHeading(line);
      if (heading) {
        blocks.push(createBlock("heading", heading.content, false, heading.level));
        return;
      }

      if (!line) {
        return;
      }

      blocks.push(createBlock("paragraph", line));
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
    ["초안 상태", report?.claudeDraft ? "Claude" : "-"],
    ["공통 내용", String(report?.commonHighlights?.length ?? 0)],
    ["차이 내용", String(report?.differentHighlights?.length ?? 0)]
  ];
}

function blockToMarkdown(block: EditorBlock) {
  const content = block.content.trim();
  if (block.kind === "image" && block.src) {
    return `![${block.alt || ""}](${block.src})`;
  }

  if (!content) return "";

  if (block.kind === "title") return `# ${content}`;
  if (block.kind === "heading") {
    const level = Math.min(Math.max(block.headingLevel ?? 2, 1), 6);
    return `${"#".repeat(level)} ${normalizeHeadingContent(content)}`;
  }
  if (block.kind === "checklist") return `- [${block.checked ? "x" : " "}] ${content}`;
  if (block.kind === "quote") return `> ${content}`;
  return content;
}

function headingTextClass(level?: number) {
  switch (level) {
    case 1:
      return "text-[58px] font-semibold leading-[1.05]";
    case 2:
      return "text-[34px] font-semibold leading-[1.2]";
    case 3:
      return "text-[26px] font-semibold leading-[1.25]";
    default:
      return "text-[22px] font-semibold leading-[1.3]";
  }
}

function buildMarkdownDocument(blocks: EditorBlock[]) {
  return blocks
    .map(blockToMarkdown)
    .filter(Boolean)
    .join("\n\n");
}

function slugifyFileName(value: string) {
  return (value || "report")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";
}

export default function EditorPage({
  params
}: {
  params: { reportId: string };
}) {
  const reportQuery = useQuery({
    queryKey: ["report", params.reportId],
    queryFn: () => getReport(params.reportId),
    refetchInterval: (query) => {
      const report = query.state.data as ReportResult | undefined;
      return report?.pipeline?.status === "PROCESSING" ? 2000 : false;
    }
  });

  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [undoStack, setUndoStack] = useState<EditorBlock[][]>([]);
  const [redoStack, setRedoStack] = useState<EditorBlock[][]>([]);
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    const handleUndoRedo = (event: globalThis.KeyboardEvent) => {
      const isModifierPressed = event.ctrlKey || event.metaKey;

      if (!isModifierPressed) return;

      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undoBlocks();
        return;
      }

      if (
        (event.key.toLowerCase() === "z" && event.shiftKey) ||
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        redoBlocks();
      }
    };

    window.addEventListener("keydown", handleUndoRedo);
    return () => window.removeEventListener("keydown", handleUndoRedo);
  }, [blocks, undoStack, redoStack]);

  useEffect(() => {
    if (!reportQuery.data || isDirty) return;
    setBlocks(buildEditorBlocks(reportQuery.data));
  }, [isDirty, reportQuery.data]);

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
  const markdownFileName = `${slugifyFileName(currentTitle || reportQuery.data?.topic || "report")}.md`;

  function downloadMarkdown() {
    const markdown = buildMarkdownDocument(blocks);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = markdownFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function printDocument() {
    window.print();
  }

  function resolveHeadingLevel(block: EditorBlock) {
    const level = block.kind === "title" ? 1 : block.headingLevel ?? 2;
    if (level <= 1) return HeadingLevel.HEADING_1;
    if (level === 2) return HeadingLevel.HEADING_2;
    if (level === 3) return HeadingLevel.HEADING_3;
    if (level === 4) return HeadingLevel.HEADING_4;
    if (level === 5) return HeadingLevel.HEADING_5;
    return HeadingLevel.HEADING_6;
  }

  async function loadImageRun(src: string, alt?: string) {
    const response = await fetch(src);
    if (!response.ok) return null;

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      const dimensions = await new Promise<{ width: number; height: number } | null>((resolve) => {
        const image = new window.Image();
        image.onload = () => {
          const maxWidth = 560;
          const naturalWidth = image.naturalWidth || maxWidth;
          const naturalHeight = image.naturalHeight || maxWidth;
          const scale = Math.min(1, maxWidth / naturalWidth);
          resolve({
            width: Math.max(1, Math.round(naturalWidth * scale)),
            height: Math.max(1, Math.round(naturalHeight * scale))
          });
        };
        image.onerror = () => resolve(null);
        image.src = objectUrl;
      });

      if (!dimensions) return null;

      return new ImageRun({
        data: new Uint8Array(await blob.arrayBuffer()),
        transformation: dimensions
      } as any);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function downloadWordDocument() {
    if (isExportingWord) return;
    setIsExportingWord(true);

    try {
      const paragraphs: Paragraph[] = [];

      for (const block of blocks) {
        if (block.kind === "image") {
          if (!block.src) continue;
          const imageRun = await loadImageRun(block.src, block.alt);
          if (!imageRun) {
            paragraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: block.alt || "시각화 이미지",
                    italics: true,
                    color: "6d7269"
                  })
                ],
                spacing: { before: 120, after: 120 }
              })
            );
            continue;
          }

          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 160, after: 80 },
              children: [imageRun]
            })
          );

          if (block.alt) {
            paragraphs.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [
                  new TextRun({
                    text: block.alt,
                    size: 18,
                    color: "6d7269"
                  })
                ]
              })
            );
          }
          continue;
        }

        const content = block.content.trim();
        if (!content) continue;

        if (block.kind === "title") {
          paragraphs.push(
            new Paragraph({
              text: content,
              heading: HeadingLevel.TITLE,
              spacing: { after: 280 }
            })
          );
          continue;
        }

        if (block.kind === "heading") {
          paragraphs.push(
            new Paragraph({
              text: normalizeHeadingContent(content),
              heading: resolveHeadingLevel(block),
              spacing: { before: 220, after: 120 }
            })
          );
          continue;
        }

        if (block.kind === "checklist") {
          paragraphs.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: content,
                  bold: Boolean(block.checked)
                })
              ]
            })
          );
          continue;
        }

        if (block.kind === "quote") {
          paragraphs.push(
            new Paragraph({
              border: {
                left: {
                  color: "CFCFC7",
                  space: 10,
                  style: BorderStyle.SINGLE,
                  size: 10
                }
              },
              indent: { left: 360 },
              spacing: { before: 120, after: 120 },
              children: [
                new TextRun({
                  text: content,
                  italics: true,
                  color: "50564d"
                })
              ]
            })
          );
          continue;
        }

        paragraphs.push(
          new Paragraph({
            text: content,
            spacing: { after: 120 }
          })
        );
      }

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                text: currentTitle || reportQuery.data?.topic || "report",
                heading: HeadingLevel.HEADING_1,
                spacing: { after: 220 }
              }),
              ...paragraphs
            ]
          }
        ],
        styles: {
          default: {
            document: {
              run: {
                font: "Apple SD Gothic Neo",
                size: 22
              }
            }
          }
        }
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugifyFileName(currentTitle || reportQuery.data?.topic || "report")}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingWord(false);
    }
  }

  function pushUndoSnapshot(currentBlocks: EditorBlock[]) {
  setUndoStack((prev) => [...prev.slice(-49), currentBlocks]);
  setRedoStack([]);
}

function undoBlocks() {
  setUndoStack((prev) => {
    if (prev.length === 0) return prev;

    const previous = prev[prev.length - 1];
    const remaining = prev.slice(0, -1);

    setRedoStack((redoPrev) => [...redoPrev.slice(-49), blocks]);
    setBlocks(previous);
    setIsDirty(true);

    return remaining;
  });
}

  function redoBlocks() {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;

      const next = prev[prev.length - 1];
      const remaining = prev.slice(0, -1);

      setUndoStack((undoPrev) => [...undoPrev.slice(-49), blocks]);
      setBlocks(next);
      setIsDirty(true);

      return remaining;
    });
  }

  function updateBlock(blockId: string, patch: Partial<EditorBlock>) {
    setIsDirty(true);
    setBlocks((prev) => {
      pushUndoSnapshot(prev);
      return prev.map((block) => (block.id === blockId ? { ...block, ...patch } : block));
    });
  }

  function applyMarkdownHeadingIfNeeded(block: EditorBlock, value: string) {
    if (
      block.kind === "title" ||
      block.kind === "image" ||
      block.kind === "checklist" ||
      block.kind === "quote"
    ) {
      return false;
    }

    const parsed = parseHeadingInput(value);
    if (!parsed) {
      return false;
    }

    setIsDirty(true);
    setBlocks((prev) =>
      prev.map((item) =>
        item.id === block.id
          ? {
              ...item,
              kind: item.kind === "title" ? "title" : "heading",
              headingLevel: item.kind === "title" ? 1 : parsed.level,
              content: parsed.content
            }
          : item
      )
    );
    return true;
  }

  function handleBlockKeyDown(block: EditorBlock, event: KeyboardEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget;
    const value = target.value;
    const selectionStart = target.selectionStart ?? value.length;
    const selectionEnd = target.selectionEnd ?? value.length;
    const caretAtEnd = selectionStart === value.length && selectionEnd === value.length;

    if (event.key === " " && caretAtEnd) {
      const trimmed = value.trim();
      if (/^#{1,6}$/.test(trimmed)) {
        event.preventDefault();
        if (block.kind === "title") return;
        setIsDirty(true);
        setBlocks((prev) =>
          prev.map((item) =>
            item.id === block.id
              ? {
                  ...item,
                  kind: "heading",
                  headingLevel: trimmed.length,
                  content: ""
                }
              : item
          )
        );
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!value.trim() && block.kind !== "title") {
        removeBlock(block.id);
        return;
      }
      addBlock(block.id, "paragraph");
      return;
    }

    if (event.key === "Backspace" && !value && block.kind !== "title") {
      event.preventDefault();
      removeBlock(block.id);
    }
  }

  function addBlock(afterId?: string, kind: EditorBlockKind = "paragraph") {
    setIsDirty(true);
    const nextBlock = createBlock(kind, "");
    setPendingFocusId(nextBlock.id);

    setBlocks((prev) => {
      pushUndoSnapshot(prev);

      if (!afterId) return [...prev, nextBlock];

      const index = prev.findIndex((block) => block.id === afterId);
      if (index === -1) return [...prev, nextBlock];

      return [...prev.slice(0, index + 1), nextBlock, ...prev.slice(index + 1)];
    });
  }

  function removeBlock(blockId: string) {
    setIsDirty(true);

    setBlocks((prev) => {
      if (prev.length <= 1) return prev;

      pushUndoSnapshot(prev);
      return prev.filter((block) => block.id !== blockId);
    });
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
  const isWriterProcessing = report?.pipeline?.status === "PROCESSING" && report?.pipeline?.currentStage === "writer";
  const visualizationAssets = report?.visualization?.assets ?? report?.pipeline?.visualization?.assets ?? {};
  const hasVisualizationAssets = Object.keys(visualizationAssets).length > 0;
  const hasVisualizationMarkdown = hasMarkdownImages(report?.mergedReport);
  return (
    <main className="min-h-screen bg-[#fafaf7] text-[#232521]">
      <div className="flex min-h-screen">
        <aside
          className={`print:hidden hidden shrink-0 border-r border-[#ebece5] bg-[#f4f4f0] transition-all duration-200 lg:flex lg:flex-col ${
            isNavOpen ? "w-[240px]" : "w-[92px]"
          }`}
        >
          <div className={`flex items-center gap-3 px-5 py-6 ${isNavOpen ? "" : "justify-center"}`}>
            <Link
              href={workspaceHref}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-[#d8dad2] bg-white text-[#555a51] transition hover:scale-[0.98] hover:shadow-[0_8px_20px_rgba(31,38,34,0.12)]"
              aria-label="메인 페이지로 이동"
            >
              <PanelLeft className="h-5 w-5" />
            </Link>
            {isNavOpen ? (
              <Link href={workspaceHref} className="min-w-0">
                <p className="text-sm font-semibold">문서 탐색</p>
                <p className="text-xs text-[#7a7f76]">편집 블록과 이동 링크</p>
              </Link>
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
          <header className="print:hidden sticky top-0 z-20 border-b border-[#eceee7] bg-[#fafaf7]/95 backdrop-blur">
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
                  <div>
                    <p className="truncate text-lg font-semibold">{currentTitle}</p>
                    {isWriterProcessing ? (
                      <p className="mt-1 text-xs text-[#6f756d]">
                        writer가 계속 진행 중입니다. 이 화면으로 이동해도 백엔드 생성은 멈추지 않으며, 편집하지 않은 상태에서는 초안을 자동으로 다시 불러옵니다.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadMarkdown}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d9ddd4] bg-white px-4 text-sm text-[#50564d]"
                >
                  <Download className="h-4 w-4" />
                  Markdown 저장
                </button>
                <button
                  type="button"
                  onClick={downloadWordDocument}
                  disabled={isExportingWord}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d9ddd4] bg-white px-4 text-sm text-[#50564d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <BookOpenText className="h-4 w-4" />
                  {isExportingWord ? "Word 생성 중..." : "Word 저장"}
                </button>
                <button
                  type="button"
                  onClick={printDocument}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d9ddd4] bg-white px-4 text-sm text-[#50564d]"
                >
                  <FileText className="h-4 w-4" />
                  PDF 출력
                </button>
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

          <div className="mx-auto grid max-w-[1240px] gap-8 px-6 py-8 print:mx-0 print:block print:max-w-none print:px-0 print:py-0 xl:grid-cols-[minmax(0,1fr)_280px]">
            <article className="min-w-0">
              <div className="mb-10 print:hidden">
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

              <section className="mb-12 rounded-[28px] border border-[#e6e8e1] bg-white p-6 shadow-[0_16px_48px_rgba(31,38,34,0.06)] print:hidden">
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
                  <button
                    type="button"
                    onClick={downloadMarkdown}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-[#dadcd5] bg-[#fafbf8] px-4 text-sm text-[#50564d]"
                  >
                    <Download className="h-4 w-4" />
                    Markdown 저장
                  </button>
                  <button
                    type="button"
                    onClick={printDocument}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-[#dadcd5] bg-[#fafbf8] px-4 text-sm text-[#50564d]"
                  >
                    <FileText className="h-4 w-4" />
                    PDF 출력
                  </button>
                </div>
              </section>

              <div className="space-y-3">
                {blocks.map((block) => {
                  const displayContent =
                    block.kind === "heading" || block.kind === "title"
                      ? normalizeHeadingContent(block.content)
                      : block.content;

                  return (
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
                        ) : block.kind === "image" ? (
                          <FileText className="h-5 w-5" />
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
                        {block.kind === "image" ? (
                          <div className="overflow-hidden rounded-[28px] border border-[#e3e6df] bg-white">
                            {/* Backend already provides browser-safe visualization URLs through mergedReport. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={block.src}
                              alt={block.alt || "시각화 이미지"}
                              className="max-h-[720px] w-full object-contain bg-[#fbfbf8]"
                            />
                            <div className="border-t border-[#eef0ea] px-4 py-3 text-sm text-[#6c7168]">
                              {block.alt || "시각화 이미지"}
                            </div>
                          </div>
                        ) : (
                          <textarea
                            ref={(node) => {
                              textareaRefs.current[block.id] = node;
                            }}
                            value={displayContent}
                            onFocus={() => setActiveBlockId(block.id)}
                            onChange={(event) => {
                              const nextValue = event.currentTarget.value;
                              if (applyMarkdownHeadingIfNeeded(block, nextValue)) {
                                return;
                              }
                              updateBlock(block.id, { content: nextValue });
                            }}
                            onKeyDown={(event) => handleBlockKeyDown(block, event)}
                            rows={1}
                            className={`w-full resize-none border-0 bg-transparent p-0 outline-none ${
                              block.kind === "title"
                                ? "text-[58px] font-semibold leading-[1.05]"
                                : block.kind === "heading"
                                  ? headingTextClass(block.headingLevel)
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
                                  ? block.headingLevel === 1
                                    ? "제목 1"
                                    : block.headingLevel === 2
                                      ? "섹션 제목"
                                      : "소제목"
                                  : block.kind === "quote"
                                    ? "메모를 입력하세요"
                                    : "내용을 입력하세요"
                            }
                          />
                        )}
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
                  );
                })}
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
                  <FileText className="h-4 w-4 text-[#5e645a]" />
                  <h2 className="text-sm font-semibold">시각화 상태</h2>
                </div>
                {hasVisualizationAssets ? (
                  <ol className="mt-2 space-y-2 pl-5 text-sm leading-6 text-[#6a7067] list-decimal">
                    {Object.entries(visualizationAssets).map(([key, value]) => (
                      <li key={key}>
                        <span className="font-medium text-[#3d443b]">{key}</span>
                        <span className="ml-2 break-all text-[#6a7067]">{value}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm leading-6 text-[#6a7067]">
                    {hasVisualizationMarkdown
                      ? "mergedReport 본문에 시각화 이미지 markdown이 포함되어 있습니다."
                      : "이 run에는 시각화 이미지가 없습니다."}
                  </p>
                )}
              </section>

              <section className="rounded-[28px] border border-[#e6e8e1] bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Download className="h-4 w-4 text-[#5e645a]" />
                  <h2 className="text-sm font-semibold">문서 출력</h2>
                </div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={downloadMarkdown}
                    className="flex w-full items-center justify-between rounded-2xl border border-[#d9ddd4] bg-[#fbfcf8] px-4 py-3 text-left text-sm text-[#4f564c]"
                  >
                    <span>
                      <span className="block font-medium">Markdown 저장</span>
                      <span className="mt-1 block text-xs text-[#70776d]">편집 중인 보고서 내용을 .md 파일로 저장</span>
                    </span>
                    <Download className="h-4 w-4 text-[#5f655c]" />
                  </button>
                  <button
                    type="button"
                    onClick={downloadWordDocument}
                    disabled={isExportingWord}
                    className="flex w-full items-center justify-between rounded-2xl border border-[#d9ddd4] bg-[#fbfcf8] px-4 py-3 text-left text-sm text-[#4f564c] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>
                      <span className="block font-medium">Word 저장</span>
                      <span className="mt-1 block text-xs text-[#70776d]">
                        편집 중인 보고서 내용을 .docx 파일로 저장
                      </span>
                    </span>
                    <BookOpenText className="h-4 w-4 text-[#5f655c]" />
                  </button>
                  <button
                    type="button"
                    onClick={printDocument}
                    className="flex w-full items-center justify-between rounded-2xl border border-[#d9ddd4] bg-[#fbfcf8] px-4 py-3 text-left text-sm text-[#4f564c]"
                  >
                    <span>
                      <span className="block font-medium">PDF 출력</span>
                      <span className="mt-1 block text-xs text-[#70776d]">현재 편집된 보고서를 인쇄 기반 PDF로 출력</span>
                    </span>
                    <FileText className="h-4 w-4 text-[#5f655c]" />
                  </button>
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
