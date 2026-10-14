/**
 * Deterministic guard against a chapter that retells the previous chapter.
 *
 * The writer prompt injects the previous chapter's closing excerpt as a
 * "收尾锚点". Models frequently respond by re-narrating that excerpt, which yields
 * a new chapter whose opening is a verbatim copy of the previous ending. Prompt
 * wording reduces the odds; this guard removes whatever still slips through, so
 * the stored prose never duplicates the previous chapter.
 *
 * Two matching levels are supported:
 * - exact (default, similarityThreshold = 1): sentences that normalize to the
 *   same string. This is what chapterWriter needs.
 * - approximate (similarityThreshold < 1): long sentences whose character-bigram
 *   Dice similarity clears the threshold. Editor rewrites paraphrase instead of
 *   copying, so 「一个穿浅蓝制服的身影正靠在警车旁」 must still be recognised as
 *   an echo of 「一个穿浅蓝制服的身影靠在警车旁」.
 */

const DEFAULT_MIN_SENTENCE_LENGTH = 10;
/**
 * Approximate matching is restricted to long sentences: short generic lines are
 * too easy to collide by chance, so they still require an exact hit.
 */
const APPROXIMATE_MIN_SENTENCE_LENGTH = 16;
/** 1 = exact match only. */
const DEFAULT_SIMILARITY_THRESHOLD = 1;
const DEFAULT_SCAN_RATIO = 0.45;
const DEFAULT_MIN_SCAN_CHARS = 600;
const DEFAULT_MAX_REMOVAL_RATIO = 0.35;
/** 至少裁掉这么多字才认为是一次真实复述，避免为个别短句触发写回。 */
const DEFAULT_MIN_REMOVAL_CHARS = 20;

const SENTENCE_BOUNDARY_PATTERN = /[。！？…]+["'”’」』）】]*/g;

export interface PreviousChapterEchoOptions {
  /**
   * Sentences shorter than this (after normalization) are never treated as echoes.
   * 10 keeps very short generic lines（如「他不知道该说什么」）safe while still
   * catching distinctive short scene beats like「马尾扎得很高，肩线笔直」.
   */
  minSentenceLength?: number;
  /** Only this leading share of the new chapter is inspected. */
  scanRatio?: number;
  minScanChars?: number;
  /** Refuse to edit when the removal would exceed this share of the chapter. */
  maxRemovalRatio?: number;
  minRemovalChars?: number;
  /**
   * Character-bigram Dice threshold for approximate sentence matching.
   * 1 (default) disables approximation and keeps the exact-match behaviour.
   * Values around 0.8 catch rewritten echoes such as
   * 「一个穿浅蓝制服的身影正靠在警车旁」→「一个穿浅蓝制服的身影靠在警车旁」.
   */
  similarityThreshold?: number;
}

export interface PreviousChapterEchoResult {
  content: string;
  /** Sentences dropped from the new chapter (trimmed excerpts, for logging). */
  removedSentences: string[];
  removedChars: number;
  edited: boolean;
  /** True when duplicates were found but the removal was rejected as too large. */
  skippedForSize: boolean;
}

interface SentenceChunk {
  text: string;
  start: number;
}

function normalizeForComparison(text: string): string {
  return text.replace(/[\s\u3000]+/g, "").replace(/["'“”‘’「」『』（）()【】\[\]]/g, "");
}

/** Character bigrams, used for the Dice similarity of two normalized sentences. */
function buildBigrams(text: string): Set<string> {
  const grams = new Set<string>();
  if (text.length === 1) {
    grams.add(text);
    return grams;
  }
  for (let index = 0; index + 2 <= text.length; index += 1) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
}

interface EchoProfile {
  key: string;
  grams: Set<string>;
}

function diceSimilarity(grams: Set<string>, profile: EchoProfile): number {
  const total = grams.size + profile.grams.size;
  if (total === 0) {
    return 0;
  }
  let shared = 0;
  for (const gram of grams) {
    if (profile.grams.has(gram)) {
      shared += 1;
    }
  }
  return (2 * shared) / total;
}

function splitSentences(text: string): SentenceChunk[] {
  const chunks: SentenceChunk[] = [];
  let cursor = 0;
  SENTENCE_BOUNDARY_PATTERN.lastIndex = 0;
  let match = SENTENCE_BOUNDARY_PATTERN.exec(text);
  while (match) {
    const end = match.index + match[0].length;
    chunks.push({ text: text.slice(cursor, end), start: cursor });
    cursor = end;
    match = SENTENCE_BOUNDARY_PATTERN.exec(text);
  }
  if (cursor < text.length) {
    chunks.push({ text: text.slice(cursor), start: cursor });
  }
  return chunks;
}

/** Cleans up blank lines left behind by removed sentences, keeping the prose intact. */
function tidyAfterRemoval(text: string): string {
  return text
    .replace(/[ \t\u3000]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+/, "")
    .trimEnd();
}

export function stripPreviousChapterEcho(
  content: string,
  previousTail: string | null | undefined,
  options: PreviousChapterEchoOptions = {},
): PreviousChapterEchoResult {
  const untouched: PreviousChapterEchoResult = {
    content,
    removedSentences: [],
    removedChars: 0,
    edited: false,
    skippedForSize: false,
  };
  if (!content?.trim() || !previousTail?.trim()) {
    return untouched;
  }

  const minSentenceLength = options.minSentenceLength ?? DEFAULT_MIN_SENTENCE_LENGTH;
  const scanRatio = options.scanRatio ?? DEFAULT_SCAN_RATIO;
  const minScanChars = options.minScanChars ?? DEFAULT_MIN_SCAN_CHARS;
  const maxRemovalRatio = options.maxRemovalRatio ?? DEFAULT_MAX_REMOVAL_RATIO;
  const minRemovalChars = options.minRemovalChars ?? DEFAULT_MIN_REMOVAL_CHARS;

  const similarityThreshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const approximate = similarityThreshold < 1;

  const scanChars = Math.min(content.length, Math.max(minScanChars, Math.ceil(content.length * scanRatio)));
  const scanWindow = normalizeForComparison(content.slice(0, scanChars));

  const echoKeys = new Set(
    splitSentences(previousTail)
      .map((chunk) => normalizeForComparison(chunk.text))
      .filter((key) => key.length >= minSentenceLength && (approximate || scanWindow.includes(key))),
  );
  if (echoKeys.size === 0) {
    return untouched;
  }
  // Approximate matching only compares against the longer echoes; short lines stay exact.
  const echoProfiles: EchoProfile[] = approximate
    ? [...echoKeys]
      .filter((key) => key.length >= APPROXIMATE_MIN_SENTENCE_LENGTH)
      .map((key) => ({ key, grams: buildBigrams(key) }))
    : [];

  const matchesEcho = (key: string): boolean => {
    if (key.length < minSentenceLength) {
      return false;
    }
    if (echoKeys.has(key)) {
      return true;
    }
    if (!approximate || key.length < APPROXIMATE_MIN_SENTENCE_LENGTH) {
      return false;
    }
    const grams = buildBigrams(key);
    return echoProfiles.some((profile) => diceSimilarity(grams, profile) >= similarityThreshold);
  };

  const kept: string[] = [];
  const removed: string[] = [];
  let removedChars = 0;
  for (const chunk of splitSentences(content)) {
    const key = normalizeForComparison(chunk.text);
    const isEchoInsideWindow = chunk.start < scanChars && matchesEcho(key);
    if (isEchoInsideWindow) {
      removed.push(chunk.text.trim());
      removedChars += chunk.text.length;
      continue;
    }
    kept.push(chunk.text);
  }

  if (removedChars < minRemovalChars) {
    return untouched;
  }
  if (removedChars > content.length * maxRemovalRatio) {
    return { ...untouched, removedSentences: removed, removedChars, skippedForSize: true };
  }

  return {
    content: tidyAfterRemoval(kept.join("")),
    removedSentences: removed,
    removedChars,
    edited: true,
    skippedForSize: false,
  };
}
