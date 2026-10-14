export const runtimeChapterSelect = {
  id: true,
  title: true,
  order: true,
  content: true,
  expectation: true,
  targetWordCount: true,
  conflictLevel: true,
  revealLevel: true,
  mustAvoid: true,
  taskSheet: true,
  sceneCards: true,
  hook: true,
} as const;

export function extractChapterOpening(content: string, maxLength: number): string {
  return content.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function extractChapterTail(content: string | null | undefined, maxLength = 520): string {
  const normalized = (content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(Math.max(0, normalized.length - maxLength));
}

/**
 * Tail excerpt aligned to whole sentences, for the "上一章收尾锚点" context block.
 *
 * A mid-sentence fragment invites the model to finish or re-narrate the excerpt,
 * which is what produced chapters that opened by retelling the previous ending.
 * Keeping whole sentences plus a tighter budget removes both the fragment prompt
 * and most of the copyable surface.
 */
export function extractChapterTailAnchor(content: string | null | undefined, maxLength = 240): string {
  const normalized = (content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  const window = normalized.slice(normalized.length - maxLength);
  const boundary = window.search(/[。！？…]["'”’」』）】]*/);
  const aligned = boundary >= 0 && boundary + 1 < window.length ? window.slice(boundary + 1) : window;
  // 片段可能从一个收尾括号起头（例如系统提示的「】」），去掉这些残渣。
  return aligned.replace(/^[\s\u3000]*[】」』）"'”’\]]+/, "").trim();
}
