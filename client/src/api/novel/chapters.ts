import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { AxiosRequestConfig } from "axios";
import type {
  TimelineCheckReport,
  TimelineContextForChapter,
} from "@ai-novel/shared/types/timeline";
import type {
  ChapterEditorAiRevisionRequest,
  ChapterEditorAiRevisionResponse,
  ChapterEditorCursorContinuationRequest,
  ChapterEditorCursorContinuationResponse,
  Chapter,
  ChapterEditorWorkspaceResponse,
  ChapterEditorRewritePreviewRequest,
  ChapterEditorRewritePreviewResponse,
  ChapterStatus,
} from "@ai-novel/shared/types/novel";
import { apiClient, type ApiHttpError } from "../client";

export async function getNovelChapters(id: string) {
  const { data } = await apiClient.get<ApiResponse<Chapter[]>>(`/novels/${id}/chapters`);
  return data;
}

export async function createNovelChapter(
  id: string,
  payload: {
    title: string;
    order: number;
    content?: string;
    expectation?: string;
    chapterStatus?: ChapterStatus;
    targetWordCount?: number;
    conflictLevel?: number;
    revealLevel?: number;
    mustAvoid?: string;
    taskSheet?: string;
    sceneCards?: string;
    repairHistory?: string;
    qualityScore?: number;
    continuityScore?: number;
    characterScore?: number;
    pacingScore?: number;
    riskFlags?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<Chapter>>(`/novels/${id}/chapters`, payload);
  return data;
}

export async function updateNovelChapter(
  id: string,
  chapterId: string,
  payload: Partial<{
    expectedUpdatedAt: string;
    expectedContent: string;
    title: string;
    order: number;
    content: string;
    expectation: string;
    chapterStatus: ChapterStatus;
    targetWordCount: number;
    conflictLevel: number;
    revealLevel: number;
    mustAvoid: string;
    taskSheet: string;
    sceneCards: string;
    repairHistory: string;
    qualityScore: number;
    continuityScore: number;
    characterScore: number;
    pacingScore: number;
    riskFlags: string;
  }>,
  config?: AxiosRequestConfig,
) {
  const { data } = await apiClient.put<ApiResponse<Chapter>>(`/novels/${id}/chapters/${chapterId}`, payload, config);
  return data;
}

/**
 * 保存章节正文，并在「版本令牌过期」时自动重基准一次。
 *
 * 背景资产同步会在正文写入之后异步重写 `Chapter.expectation`，因为 `Chapter.updatedAt`
 * 是 `@updatedAt`，服务端的行版本会在 ~10 秒后继续增长。客户端手里的 `expectedUpdatedAt`
 * 因此变成过期令牌，下一次接受/保存会被误判为「本章保存版本已变化」，而正文其实没被任何人改过。
 *
 * 这里只在服务端正文与我们上次读到的 `savedContent` **逐字节一致**时才用最新版本重放一次；
 * 一旦正文真的不同，就原样抛出 409，保留真实冲突保护。
 */
export async function updateNovelChapterWithRebase(
  id: string,
  chapterId: string,
  payload: { content: string; expectedUpdatedAt: string; expectedContent: string },
) {
  const attempt = (expectedUpdatedAt: string, silentConflict: boolean) => updateNovelChapter(
    id,
    chapterId,
    { content: payload.content, expectedUpdatedAt, expectedContent: payload.expectedContent },
    silentConflict ? { silentErrorStatuses: [409] } : undefined,
  );

  try {
    return await attempt(payload.expectedUpdatedAt, true);
  } catch (error) {
    if ((error as ApiHttpError | undefined)?.status !== 409) throw error;
    const latest = await getNovelChapters(id);
    const serverChapter = latest.data?.find((chapter) => chapter.id === chapterId);
    if (!serverChapter || (serverChapter.content ?? "") !== payload.expectedContent) throw error;
    return attempt(String(serverChapter.updatedAt), false);
  }
}

export async function deleteNovelChapter(id: string, chapterId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}/chapters/${chapterId}`);
  return data;
}

export async function getChapterTraces(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<import("@ai-novel/shared/types/agent").AgentRun[]>>(
    `/novels/${novelId}/chapters/${chapterId}/traces`,
  );
  return data;
}

export async function getChapterTimeline(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<{
    context: TimelineContextForChapter;
    latestReport: TimelineCheckReport | null;
  }>>(`/novels/${novelId}/chapters/${chapterId}/timeline`);
  return data;
}

export async function previewChapterRewrite(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorRewritePreviewRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorRewritePreviewResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/rewrite-preview`,
    payload,
  );
  return data;
}

export async function getChapterEditorWorkspace(novelId: string, chapterId: string) {
  const { data } = await apiClient.get<ApiResponse<ChapterEditorWorkspaceResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/workspace`,
  );
  return data;
}

export async function previewChapterAiRevision(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorAiRevisionRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorAiRevisionResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/ai-revision-preview`,
    payload,
  );
  return data;
}

export async function previewChapterCursorContinuation(
  novelId: string,
  chapterId: string,
  payload: ChapterEditorCursorContinuationRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ChapterEditorCursorContinuationResponse>>(
    `/novels/${novelId}/chapters/${chapterId}/editor/continue-preview`,
    payload,
  );
  return data;
}

export async function resolveChapterAuditIssue(novelId: string, issueId: string) {
  const { data } = await apiClient.post<ApiResponse<unknown>>(
    `/novels/${novelId}/audit-issues/${issueId}/resolve`,
    {},
  );
  return data;
}

export async function generateChapterExecutionContract(
  novelId: string,
  chapterId: string,
  payload: Partial<{
    provider: import("@ai-novel/shared/types/llm").LLMProvider;
    model: string;
    temperature: number;
  }> = {},
) {
  const { data } = await apiClient.post<ApiResponse<Chapter>>(
    `/novels/${novelId}/chapters/${chapterId}/execution-contract`,
    payload,
  );
  return data;
}
