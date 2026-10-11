import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { llmProviderSchema } from "../llm/providerSchema";
import { validate } from "../middleware/validate";
import {
  diagnoseSepiaText,
  rewriteSepiaText,
} from "../services/styleEngine/SepiaService";
import type {
  SepiaDiagnosisOutput,
  SepiaRewriteOutput,
} from "../prompting/prompts/sepia/sepia.promptSchemas";

/**
 * Sepia 去 AI 味 HTTP 入口。
 *
 * 来源：Nanako0129/sepia（MIT）。
 * 对齐 AGENTS.md：本路由只做控制层（校验入参、转发给应用服务、返回结果），
 * 不持有正文事实源、不写库、不参与章节生产链的正文写入。
 */

const router = Router();

const diagnoseSchema = z.object({
  content: z.string().trim().min(1),
  register: z.string().trim().optional(),
  diagnoseOnly: z.boolean().optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  novelId: z.string().trim().optional(),
});

const rewriteSchema = z.object({
  content: z.string().trim().min(1),
  planText: z.string().trim().optional(),
  register: z.string().trim().optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  novelId: z.string().trim().optional(),
});

router.post("/sepia/diagnose", validate({ body: diagnoseSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof diagnoseSchema>;
    const data: SepiaDiagnosisOutput = (await diagnoseSepiaText(body)).output;
    res.status(200).json({
      success: true,
      data,
      message: "sepia 诊断完成。",
    } satisfies ApiResponse<SepiaDiagnosisOutput>);
  } catch (error) {
    next(error);
  }
});

router.post("/sepia/rewrite", validate({ body: rewriteSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof rewriteSchema>;
    const data: SepiaRewriteOutput = (await rewriteSepiaText(body)).output;
    res.status(200).json({
      success: true,
      data,
      message: "sepia 改写完成。",
    } satisfies ApiResponse<SepiaRewriteOutput>);
  } catch (error) {
    next(error);
  }
});

export default router;
