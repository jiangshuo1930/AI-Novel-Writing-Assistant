import { z } from "zod";
import { styleSignalPolicySchema } from "@ai-novel/shared/types/styleEngine";
import { llmProviderSchema } from "../../../llm/providerSchema";

const chapterRuntimeControlPolicySchema = z.object({
  kickoffMode: z.enum(["manual_start", "director_start", "takeover_start"]),
  advanceMode: z.enum(["manual", "stage_review", "auto_to_ready", "auto_to_execution", "full_book_autopilot"]),
  reviewCheckpoints: z.array(z.string()).default([]),
  autoExecutionRange: z.object({
    mode: z.enum(["book", "volume", "chapter_range"]),
    start: z.number().int().nullable().optional(),
    end: z.number().int().nullable().optional(),
    volumeOrder: z.number().int().nullable().optional(),
  }).nullable().optional(),
});

export const chapterRuntimeRequestSchema = z.object({
  workflowTaskId: z.string().trim().optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  previousChaptersSummary: z.array(z.string()).optional(),
  taskStyleProfileId: z.string().trim().optional(),
  styleSignalPolicy: styleSignalPolicySchema.optional(),
  artifactSyncMode: z.enum(["adaptive", "deferred", "strict"]).optional(),
  controlPolicy: chapterRuntimeControlPolicySchema.optional(),
  /**
   * sepia 去 AI 味：单章流式生成时，在「生成后、接收闸门之前」执行三轮
   * （叙事架构 → 语篇流动 → 表层风格）。未传时回退到小说级配置，再回退默认开启。
   */
  sepiaDeAi: z.boolean().optional(),
  /** sepia 目标语域，默认「中文小说」。 */
  sepiaRegister: z.string().trim().max(40).optional(),
});

export type ChapterRuntimeRequestInput = z.infer<typeof chapterRuntimeRequestSchema>;
