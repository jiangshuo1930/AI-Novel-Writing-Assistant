import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  SepiaDiagnoseRequest,
  SepiaDiagnosisResult,
  SepiaRewriteRequest,
  SepiaRewriteResult,
} from "@ai-novel/shared/types/sepia";
import { apiClient } from "./client";

/**
 * Sepia 去 AI 味能力（来源：Nanako0129/sepia, MIT）。
 *
 * 与 styleEngine 系列 API 并列，只做 HTTP 调用与响应解包；
 * 结果的应用（写回正文/编辑器）由调用方决定，本模块不持有状态。
 */

export async function diagnoseSepia(payload: SepiaDiagnoseRequest) {
  const { data } = await apiClient.post<ApiResponse<SepiaDiagnosisResult>>("/sepia/diagnose", payload);
  return data;
}

export async function rewriteSepia(payload: SepiaRewriteRequest) {
  const { data } = await apiClient.post<ApiResponse<SepiaRewriteResult>>("/sepia/rewrite", payload);
  return data;
}
