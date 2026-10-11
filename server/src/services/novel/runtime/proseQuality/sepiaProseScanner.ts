import type { ProseQualityFinding, ProseQualityIssueCode } from "./ProseQualityDetector";

/**
 * Sepia 表层确定性检查（来源：Nanako0129/sepia, MIT）。
 *
 * 边界（对齐 AGENTS.md「单一正文执行链」「模块边界」）：
 * - 本模块只提供确定性的表层字符串扫描，返回与 ProseQualityDetector 同构的 finding；
 * - 不持有正文事实源、不写库、不决定修文，不新建平行执行链；
 * - 由 ProseQualityDetector 统一汇总，随现有 mode_fit 审计报告进入接收闸门，
 *   复用现有 patch repair / heavy repair 链路。
 *
 * 分级原则（对齐 sepia「单次不算证据、聚集才是痕迹」）：
 * - 只对「同段落内聚集」触发 medium；命中密集时升 high；
 * - 单次命中不报，避免把正常表达误判为 AI 痕迹；
 * - 中文以 languages/zh.md 校准，不做英文 ban list 逐词照搬。
 */

export interface SepiaTextSegment {
  text: string;
  line: number;
}

export type SepiaSurfaceRuleId =
  | "sepia_abstract_noun_stacking"
  | "sepia_performance_verb"
  | "sepia_inflation_adjective"
  | "sepia_slop_phrase"
  | "sepia_filter_word"
  | "sepia_syntax_template"
  | "sepia_connective_pile";

interface SepiaSurfaceRule {
  code: SegmentedProseQualityCode;
  label: string;
  severity: "medium" | "high";
  escalateSeverity: "high" | "critical";
  /** 触发阈值：同段落命中数量达到该值才报。 */
  threshold: number;
  /** 升到 escalateSeverity 的命中数量阈值。 */
  escalateThreshold: number;
  patterns: RegExp[];
  message: string;
  fixSuggestion: string;
}

/**
 * sepia 表层规则映射到 prose_* 问题码命名空间。
 * 使用 `prose_sepia_` 前缀，便于与既有 prose_* 检测区分与聚合。
 */
export type SegmentedProseQualityCode =
  | "prose_sepia_abstract_noun_stacking"
  | "prose_sepia_performance_verb"
  | "prose_sepia_inflation_adjective"
  | "prose_sepia_slop_phrase"
  | "prose_sepia_filter_word"
  | "prose_sepia_syntax_template"
  | "prose_sepia_connective_pile";

const ABSTRACT_NOUN_PATTERNS: RegExp[] = [
  /一种[^。！？；\n]{0,12}的[^。！？；\n]{0,10}(?:感觉|滋味|重量|气息|情绪|力量|温度)/gu,
  /[^。！？；\n]{1,10}与[^。！？；\n]{1,10}的交[织汇]|交织(?:在一起|其中)?/gu,
  /(?:图腾|织锦|画布|交响|万花筒|指北针|坐标)/gu,
  /[^，。！？；\n]{2,8}的(?:重量|滋味|气息|光影|底色|轮廓|回响|余温|刻度)/gu,
  /(?:的)?(?:领悟|觉醒|蜕变|救赎|宿命|意义)(?:感|本身)?/gu,
];

const PERFORMANCE_VERB_PATTERNS: RegExp[] = [
  /(?:勾勒|刻画|诠释|彰显|升华|解构|赋能|加持|诉说着|见证着|书写着|聆听|镌刻|承载着)/gu,
];

const INFLATION_ADJECTIVE_PATTERNS: RegExp[] = [
  /(?:错综复杂|栩栩如生|淋漓尽致|扑面而来|油然而生|无与伦比|妙不可言|令人窒息|意味深长|晦涩难懂|细腻而|深邃的|澄澈|斑驳而|温柔而坚定)/gu,
];

const SLOP_PHRASE_PATTERNS: RegExp[] = [
  /空气中(?:仿佛)?弥漫/gu,
  /(?:那|这)(?:一)?(?:刻|瞬)/gu,
  /不禁(?=[^得住])/gu,
  /(?:时间|仿佛)(?:仿佛)?(?:静止|凝固|停滞)/gu,
  /心头(?:一紧|一震|一暖)|心里(?:五味杂陈|一紧)|五味杂陈/gu,
  /(?:说不出的|难以言喻|无法言说|久久不能平静|挥之不去|思绪万千)/gu,
];

const FILTER_WORD_PATTERNS: RegExp[] = [
  /(?:似乎|仿佛|好像|像是)(?=[^，。！？；\n]{2,})/gu,
  /(?:意识到|注意到|察觉到|感受到|感觉到|想起了|发现)(?=[^，。！？；\n]{2,})/gu,
  /(?:看着|听着|想着|望着)(?=[^，。！？；\n]{2,})/gu,
];

const SYNTAX_TEMPLATE_PATTERNS: RegExp[] = [
  /不仅[^。！？；\n]{1,24}?(?:而且|还|更|而是|而)/gu,
  /(?:既|不仅)[^。！？；\n]{1,20}?(?:又|也)[^。！？；\n]{1,20}/gu,
  /(?:并不是|不是|并非)[^。！？；\n]{1,24}?(?:而是|却是|反而是|而是)/gu,
];

/** 连词/连接成分堆叠（中文 AI 高频「和/与/以及」链）。 */
const CONNECTIVE_PILE_PATTERNS: RegExp[] = [
  /(?:[^，。！？；\n]{1,8}(?:和|与|以及)){2,}[^，。！？；\n]{1,8}/gu,
];

export const SEPIA_SURFACE_RULES: readonly SepiaSurfaceRule[] = [
  {
    code: "prose_sepia_abstract_noun_stacking",
    label: "抽象名词堆叠",
    severity: "medium",
    escalateSeverity: "high",
    threshold: 2,
    escalateThreshold: 3,
    patterns: ABSTRACT_NOUN_PATTERNS,
    message: "段落出现 sepia 式抽象名词堆叠（「一种…的感觉」「…的重量/滋味」「…与…的交织」），偏向概念包装而非具体呈现。",
    fixSuggestion: "点出具体的人、物、动作，或直接删掉包装名词；成对抽象只保留一个；把名词化还原为动词。",
  },
  {
    code: "prose_sepia_performance_verb",
    label: "表演动词",
    severity: "medium",
    escalateSeverity: "high",
    threshold: 2,
    escalateThreshold: 3,
    patterns: PERFORMANCE_VERB_PATTERNS,
    message: "段落密集使用 sepia 式表演/包装动词（勾勒、诠释、升华、诉说、见证），动词膨胀而信息变薄。",
    fixSuggestion: "换成准确的实义动词：写就是说、说就是说、做就是做；删掉没有实际动作的包装动词。",
  },
  {
    code: "prose_sepia_inflation_adjective",
    label: "通胀形容词",
    severity: "medium",
    escalateSeverity: "high",
    threshold: 2,
    escalateThreshold: 3,
    patterns: INFLATION_ADJECTIVE_PATTERNS,
    message: "段落堆叠 sepia 式通胀/抒情形容词（淋漓尽致、意味深长、面相而来等），抒情密度过高。",
    fixSuggestion: "换成场景独有的具体描写；没有更新鲜的表达就删掉整句，不要改用更平淡的复述。",
  },
  {
    code: "prose_sepia_slop_phrase",
    label: "AI 套路短语",
    severity: "medium",
    escalateSeverity: "high",
    threshold: 1,
    escalateThreshold: 2,
    patterns: SLOP_PHRASE_PATTERNS,
    message: "出现 sepia 清单中的 AI 套路短语（空气中弥漫、那一刻、时间仿佛静止、心头一紧、五味杂陈等）。",
    fixSuggestion: "逐个替换为具体描写或删除；套路短语是累积性痕迹，聚集时须重写整句，而非只做同义替换。",
  },
  {
    code: "prose_sepia_filter_word",
    label: "滤镜词",
    severity: "medium",
    escalateSeverity: "high",
    threshold: 3,
    escalateThreshold: 5,
    patterns: FILTER_WORD_PATTERNS,
    message: "段落反复使用 sepia 式滤镜词（似乎、仿佛、意识到、感受到、看着），叙事者站在角色与读者之间转述。",
    fixSuggestion: "删掉滤镜词，直接呈现被感知的事物或动作本身（「她似乎很伤心」→「她哭了」）。",
  },
  {
    code: "prose_sepia_syntax_template",
    label: "句式模板",
    severity: "high",
    escalateSeverity: "high",
    threshold: 1,
    escalateThreshold: 2,
    patterns: SYNTAX_TEMPLATE_PATTERNS,
    message: "出现 sepia 高发句式模板（「不仅…而且…」「既…又…」「不是…而是…」），是 LLM 文本过表达的句形。",
    fixSuggestion: "只说你要说的那一件事，拆掉配对结构；把分词从句收尾改成带限定动词的独立短句。",
  },
  {
    code: "prose_sepia_connective_pile",
    label: "连词堆叠",
    severity: "medium",
    escalateSeverity: "high",
    threshold: 2,
    escalateThreshold: 4,
    patterns: CONNECTIVE_PILE_PATTERNS,
    message: "段落出现中文 AI 高频「和/与/以及」连词链，句式偏书面化、缺乏人类口语节奏。",
    fixSuggestion: "拆掉连词链，改用短句并列或换用更自然的连接方式；减少「和/与/以及」的连续使用。",
  },
] as const;

/** 统计一行内某规则的命中总数（含同一段落内多次命中）。 */
function countMatches(text: string, patterns: RegExp[]): number {
  const normalized = text.replace(/\r\n/g, "\n");
  let total = 0;
  for (const pattern of patterns) {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    total += Array.from(normalized.matchAll(global)).length;
  }
  return total;
}

function isInsideQuote(text: string, index: number): boolean {
  const pairs: Array<[string, string]> = [
    ["「", "」"],
    ["『", "』"],
    ["“", "”"],
    ["\"", "\""],
  ];
  return pairs.some(([open, close]) => {
    const before = text.slice(0, index);
    const openIndex = before.lastIndexOf(open);
    if (openIndex < 0) {
      return false;
    }
    const closeIndex = text.indexOf(close, openIndex + open.length);
    return closeIndex >= index;
  });
}

function formatExcerpt(text: string): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function firstHit(text: string, patterns: RegExp[]): { index: number; excerpt: string } | null {
  for (const pattern of patterns) {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    for (const match of text.matchAll(global)) {
      const index = match.index ?? 0;
      if (isInsideQuote(text, index)) {
        continue;
      }
      return { index, excerpt: match[0] };
    }
  }
  return null;
}

/**
 * sepia 表层确定性扫描。
 *
 * @param segments 已剥离代码块、引用块与空行的正文段落
 * @returns 与 ProseQualityDetector 同构的 finding
 */
export function scanSepiaSurface(segments: SepiaTextSegment[]): ProseQualityFinding[] {
  const findings: ProseQualityFinding[] = [];
  for (const segment of segments) {
    for (const rule of SEPIA_SURFACE_RULES) {
      const hits = countMatches(segment.text, rule.patterns);
      if (hits < rule.threshold) {
        continue;
      }
      const hit = firstHit(segment.text, rule.patterns);
      const severity = hits >= rule.escalateThreshold ? rule.escalateSeverity : rule.severity;
      findings.push({
        code: rule.code as ProseQualityIssueCode,
        severity,
        line: segment.line,
        column: (hit?.index ?? 0) + 1,
        message: `${rule.message}（本段命中 ${hits} 处${rule.label}）`,
        excerpt: formatExcerpt(hit?.excerpt ?? segment.text),
        fixSuggestion: rule.fixSuggestion,
      });
    }
  }
  return findings;
}

/** 供内部测试/诊断使用的模式导出。 */
export const SEPIA_SURFACE_PATTERN_SOURCES = {
  abstractNoun: ABSTRACT_NOUN_PATTERNS.map((p) => p.source),
  performanceVerb: PERFORMANCE_VERB_PATTERNS.map((p) => p.source),
  inflationAdjective: INFLATION_ADJECTIVE_PATTERNS.map((p) => p.source),
  slopPhrase: SLOP_PHRASE_PATTERNS.map((p) => p.source),
  filterWord: FILTER_WORD_PATTERNS.map((p) => p.source),
  syntaxTemplate: SYNTAX_TEMPLATE_PATTERNS.map((p) => p.source),
  connectivePile: CONNECTIVE_PILE_PATTERNS.map((p) => p.source),
} as const;
