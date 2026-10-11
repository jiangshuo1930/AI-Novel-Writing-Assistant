import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  sepiaDiagnosisPrompt,
  sepiaRewritePrompt,
} from "../../prompting/prompts/sepia/sepia.prompts";
import type {
  SepiaDiagnosisOutput,
  SepiaRewriteOutput,
} from "../../prompting/prompts/sepia/sepia.promptSchemas";

/**
 * Sepia 去 AI 味应用服务。
 *
 * 来源：Nanako0129/sepia（MIT）。本服务只做两件事：
 * - diagnose：对给定文本做「架构 → 语篇 → 表层」三层诊断，只诊断不修改；
 * - rewrite：基于诊断做最小化就地改写，保留结构、声音与意图。
 *
 * 边界（对齐 AGENTS.md）：
 * - 这是通用文本能力，不持有小说/章节正文事实源，不写库，不参与章节生产链的
 *   正文写入；调用方（如写作台或显式 API）负责把结果应用到目标文本。
 * - 结构化输出由 prompt schema 保证；本服务不做关键字路由或 AI 结果的事后改写。
 */

export interface SepiaDiagnoseOptions {
  content: string;
  register?: string;
  diagnoseOnly?: boolean;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  novelId?: string;
  signal?: AbortSignal;
}

export interface SepiaRewriteOptions {
  content: string;
  planText?: string;
  register?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  novelId?: string;
  signal?: AbortSignal;
}

export interface SepiaResult<TOutput> {
  output: TOutput;
  provider?: string;
  model?: string;
}

function normalizeContent(content: string): string {
  return typeof content === "string" ? content.trim() : "";
}

export async function diagnoseSepiaText(
  options: SepiaDiagnoseOptions,
): Promise<SepiaResult<SepiaDiagnosisOutput>> {
  const content = normalizeContent(options.content);
  if (!content) {
    throw new Error("sepia diagnose: content is required.");
  }

  const result = await runStructuredPrompt({
    asset: sepiaDiagnosisPrompt,
    promptInput: {
      content,
      register: options.register,
      diagnoseOnly: options.diagnoseOnly,
    },
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.2,
      novelId: options.novelId,
      stage: "sepia_diagnose",
      triggerReason: "sepia-diagnose",
    },
  });

  return { output: result.output };
}

export async function rewriteSepiaText(
  options: SepiaRewriteOptions,
): Promise<SepiaResult<SepiaRewriteOutput>> {
  const content = normalizeContent(options.content);
  if (!content) {
    throw new Error("sepia rewrite: content is required.");
  }

  const result = await runStructuredPrompt({
    asset: sepiaRewritePrompt,
    promptInput: {
      content,
      register: options.register,
      planText: options.planText,
    },
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.4,
      novelId: options.novelId,
      stage: "sepia_rewrite",
      triggerReason: "sepia-rewrite",
    },
  });

  return { output: result.output };
}
