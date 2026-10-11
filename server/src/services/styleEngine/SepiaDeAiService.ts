import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  sepiaArchitecturePassPrompt,
  sepiaDiscoursePassPrompt,
  sepiaSurfacePassPrompt,
} from "../../prompting/prompts/sepia/sepia.prompts";
import type { SepiaPassOutput } from "../../prompting/prompts/sepia/sepia.promptSchemas";

/**
 * Sepia 去 AI 味三轮运行时。
 *
 * 来源：Nanako0129/sepia（MIT）。本服务执行 sepia 的完整三轮 pass 协议，
 * 对齐 SKILL.md 的 fiction 路由：narrative-pass → discourse-pass → style-pass，
 * 且 style-pass 明确要求 "Run last, after structure is fixed"。
 *
 * 三轮特性（与「一次诊断三层」的两轮版的关键差异）：
 *   Pass 1 architecture —— 只诊断并修复叙事架构（最深一层）；
 *   Pass 2 discourse    —— 基于 Pass 1 的输出重新诊断，处理语篇流动；
 *   Pass 3 surface      —— 基于 Pass 2 的输出重新诊断，处理表层风格（最后跑）。
 * 每轮都基于上一轮的产出重新诊断，避免模型一次评估三层时坍缩到显著维度。
 *
 * 边界（对齐 AGENTS.md「单一正文执行链」）：
 * - 本服务是「文本进 → 文本出」的纯函数式能力，不写库、不持有正文事实源；
 * - 由章节生产链在「生成后、定稿前」调用；失败一律 fail-open（返回 null），
 *   调用方保留原稿继续，绝不因 sepia 失败阻断章节推进；
 * - 单层失败不阻断后续层：该层跳过、保留该层输入文本继续下一层；
 * - 不新建平行执行链：改写结果仍走既有接收闸门（detectProseQuality / 验收 / 修文）。
 */

export interface SepiaDeAiOptions {
  content: string;
  /** 目标语域，如「中文小说」「网文」。默认「中文小说」。 */
  register?: string;
  provider?: LLMProvider;
  model?: string;
  novelId?: string;
  chapterId?: string;
  /** 是否只诊断不修改；true 时只跑 Pass 1 并对每层输出诊断，不落改写。 */
  diagnoseOnly?: boolean;
  /** 单层温度，默认 0.3。三轮共用一个值以保持一致性。 */
  temperature?: number;
  signal?: AbortSignal;
}

export interface SepiaDeAiResult {
  /** 各层诊断 + 修复记录（按执行顺序）。 */
  diagnosis: {
    findings: SepiaPassOutput["findings"];
    summaries: string[];
    layers: Array<"architecture" | "discourse" | "surface">;
  };
  /** 三轮全部结束后的正文；diagnoseOnly 或全程无改动时为 null。 */
  rewrittenContent: string | null;
  /** 三轮累计应用的修复项摘要。 */
  appliedFixes: Array<{ layer: "architecture" | "discourse" | "surface"; row: string; note: string }>;
  /** 是否实际发生了改写。 */
  rewritten: boolean;
}

const MIN_CONTENT_LENGTH = 40;

function normalizeContent(content: string): string {
  return typeof content === "string" ? content.trim() : "";
}

type PassLayer = "architecture" | "discourse" | "surface";

interface PassSpec {
  layer: PassLayer;
  prompt: typeof sepiaArchitecturePassPrompt;
  stage: string;
}

const PASS_SEQUENCE: readonly PassSpec[] = [
  { layer: "architecture", prompt: sepiaArchitecturePassPrompt, stage: "sepia_architecture" },
  { layer: "discourse", prompt: sepiaDiscoursePassPrompt, stage: "sepia_discourse" },
  { layer: "surface", prompt: sepiaSurfacePassPrompt, stage: "sepia_surface" },
];

interface PassRunOutcome {
  output: SepiaPassOutput;
  content: string;
  changed: boolean;
}

/**
 * 执行单层 pass。失败返回 null（该层被跳过，保留输入文本）。
 */
async function runSinglePass(
  spec: PassSpec,
  content: string,
  options: SepiaDeAiOptions,
  register: string,
): Promise<PassRunOutcome | null> {
  try {
    const result = await runStructuredPrompt({
      asset: spec.prompt,
      promptInput: { content, register },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.3,
        novelId: options.novelId,
        chapterId: options.chapterId,
        stage: spec.stage,
        triggerReason: "chapter_sepia_deai",
      },
    });
    const output = result.output;
    const next = normalizeContent(output.content);
    // 模型未给出可用正文：视为该层无产出，保留输入。
    if (!next) {
      return { output, content, changed: false };
    }
    return { output, content: next, changed: output.changed || next !== content };
  } catch (error) {
    console.warn(`[sepia] ${spec.layer} pass failed, skip this layer`, {
      novelId: options.novelId,
      chapterId: options.chapterId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 执行 sepia 完整三轮去 AI 味（架构 → 语篇 → 表层）。
 *
 * @returns 结果对象；若输入过短返回 null；单层失败不中断，保留该层输入继续。
 */
export async function runSepiaDeAi(
  options: SepiaDeAiOptions,
): Promise<SepiaDeAiResult | null> {
  let content = normalizeContent(options.content);
  if (content.length < MIN_CONTENT_LENGTH) {
    return null;
  }
  const register = options.register?.trim() || "中文小说";

  const findings: SepiaPassOutput["findings"] = [];
  const summaries: string[] = [];
  const layers: PassLayer[] = [];
  const appliedFixes: SepiaDeAiResult["appliedFixes"] = [];
  let changed = false;

  // 只诊断模式：仅跑 Pass 1（架构层），记录诊断后返回。
  const sequence = options.diagnoseOnly === true ? PASS_SEQUENCE.slice(0, 1) : PASS_SEQUENCE;

  for (const spec of sequence) {
    const outcome = await runSinglePass(spec, content, options, register);
    if (!outcome) {
      // 该层失败：跳过，保留当前 content 继续下一层。
      continue;
    }
    layers.push(spec.layer);
    findings.push(...outcome.output.findings);
    for (const fix of outcome.output.appliedFixes) {
      appliedFixes.push(fix);
    }
    if (outcome.output.summary) {
      summaries.push(`[${spec.layer}] ${outcome.output.summary}`);
    }
    if (outcome.changed) {
      content = outcome.content;
      changed = true;
    }
  }

  if (options.diagnoseOnly === true) {
    return {
      diagnosis: { findings, summaries, layers },
      rewrittenContent: null,
      appliedFixes,
      rewritten: false,
    };
  }

  // 三轮都失败（layers 为空）或全程无改动：不改写，避免无谓的风格漂移。
  if (layers.length === 0 || !changed) {
    return {
      diagnosis: { findings, summaries, layers },
      rewrittenContent: null,
      appliedFixes,
      rewritten: false,
    };
  }

  return {
    diagnosis: { findings, summaries, layers },
    rewrittenContent: content,
    appliedFixes,
    rewritten: true,
  };
}
