import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runSepiaDeAi } from "../../styleEngine/SepiaDeAiService";

/**
 * Sepia 去 AI 味章节级运行时（两条正文生成入口共用）。
 *
 * 背景：项目有两条正文生成入口——
 *   入口 A（批量流水线 / 导演模式）：ChapterPipelineRuntimeAdapter → runPipelineChapterWithRuntime；
 *   入口 B（单章 SSE 流式）：ChapterStreamGenerationOrchestrator.createChapterStream。
 * 两条入口都要在「草稿生成后、接收闸门之前」执行同样的 sepia 三轮去 AI 味，
 * 因此把「开关解析」与「执行三轮」收敛到本模块，避免两处逻辑分叉。
 *
 * 边界（对齐 AGENTS.md「单一正文执行链」「模块边界」）：
 * - 本模块只做「解析开关 → 调 runSepiaDeAi → 返回替换后的正文」，不写库、
 *   不持有正文事实源、不决定修文，落库由调用方负责；
 * - 失败与无改动一律 fail-open 保留原稿，绝不因 sepia 阻断章节推进；
 * - 三轮实现仍由 SepiaDeAiService 提供，本模块不重复声明 pass 编排。
 */

const SEPIA_REGISTER_DEFAULT = "中文小说";

export interface SepiaDeAiChapterInput {
  novelId: string;
  chapterId: string;
  content: string;
  /** 调用方显式开关；未传时回退到小说级配置（开书时选定），再回退默认开启。 */
  sepiaDeAi?: boolean;
  /** 目标语域，默认「中文小说」。 */
  sepiaRegister?: string;
  provider?: LLMProvider;
  model?: string;
}

export type LoadNovelSepiaConfig = (novelId: string) => Promise<{ sepiaDeAi: boolean } | null>;

export interface SepiaDeAiChapterResult {
  /** 处理后的正文；未改写时为原样输入。 */
  content: string;
  /** 是否实际发生了改写。 */
  rewritten: boolean;
}

/**
 * 解析本章是否启用 sepia 去 AI 味。
 *
 * 优先级：调用方显式传入 > 小说级配置（开书时选定）> 默认开启。
 */
export async function resolveSepiaDeAiEnabled(
  input: { novelId: string; sepiaDeAi?: boolean },
  loadNovelSepiaConfig?: LoadNovelSepiaConfig,
): Promise<boolean> {
  if (typeof input.sepiaDeAi === "boolean") {
    return input.sepiaDeAi;
  }
  const novelConfig = await loadNovelSepiaConfig?.(input.novelId).catch(() => null);
  return novelConfig?.sepiaDeAi ?? true;
}

/**
 * 对章节正文执行 sepia 三轮去 AI 味（架构 → 语篇 → 表层）。
 *
 * - 正文为空时原样返回，不发起调用；
 * - sepia 失败 / 三轮无改动时保留原稿（fail-open），不抛错。
 */
export async function applySepiaDeAiToChapter(
  input: SepiaDeAiChapterInput,
): Promise<SepiaDeAiChapterResult> {
  if (!input.content.trim()) {
    return { content: input.content, rewritten: false };
  }
  const result = await runSepiaDeAi({
    content: input.content,
    register: input.sepiaRegister?.trim() || SEPIA_REGISTER_DEFAULT,
    provider: input.provider,
    model: input.model,
    novelId: input.novelId,
    chapterId: input.chapterId,
  }).catch(() => null);
  if (result?.rewritten && result.rewrittenContent) {
    return { content: result.rewrittenContent, rewritten: true };
  }
  return { content: input.content, rewritten: false };
}
