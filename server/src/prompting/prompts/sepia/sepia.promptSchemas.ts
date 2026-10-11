import { z } from "zod";

/**
 * Sepia 结构化输出 schema。
 *
 * 对齐项目「AI 优先、结构化输出」约定：所有 sepia 诊断/改写结果都必须通过
 * 结构化 schema 校验，不做关键字路由，不把模型输出当自由文本消费。
 *
 * 来源：Nanako0129/sepia（MIT）。维度命名沿用 sepia 的三层结构：
 *   architecture（叙事架构）/ discourse（语篇流动）/ surface（表层风格）。
 */

export const sepiaLayerSchema = z.enum(["architecture", "discourse", "surface"]);

export const sepiaFindingSchema = z.object({
  layer: sepiaLayerSchema,
  /** sepia rubric 的行名或规则名，如「主题显性化」「句长过于均匀」。 */
  row: z.string().trim().min(1),
  /** 观察到的信号描述（不含判断为作者身份概率的措辞）。 */
  observation: z.string().trim().min(1),
  /** 支撑该信号的原文短句，必须来自正文，不得编造。 */
  evidence: z.string().trim().min(1),
  /** 是否为过度矫正提示（把某个轴推到远离 AI 方向的极端）。 */
  overCorrection: z.boolean().default(false),
});

export const sepiaFixSchema = z.object({
  layer: sepiaLayerSchema,
  row: z.string().trim().min(1),
  /** 该修复对应的原文片段。 */
  evidence: z.string().trim().min(1),
  /** 具体、可执行的修复动作，遵循「删除优于新增」倾向。 */
  action: z.string().trim().min(1),
  /** 修复类型，用于统计 replace/delete/insert 比例。 */
  operationKind: z.enum(["replace", "delete", "insert"]).default("replace"),
});

export const sepiaDiagnosisSchema = z.object({
  /** 逐层观察到的信号。 */
  findings: z.array(sepiaFindingSchema).default([]),
  /** 过度矫正告警（单列，不并入 AI 倾向信号）。 */
  advisories: z.array(z.string().trim().min(1)).default([]),
  /** 建议修复计划，按「最深一层优先」排序。 */
  plan: z.array(sepiaFixSchema).default([]),
  /** 综合说明（描述性，不给作者身份概率或聚合判定分）。 */
  summary: z.string().trim().default(""),
});

export const sepiaRewriteSchema = z.object({
  /** 改写后的正文。 */
  content: z.string().trim().min(1),
  /** 本次改写应用的修复项摘要。 */
  appliedFixes: z.array(z.object({
    layer: sepiaLayerSchema,
    row: z.string().trim().min(1),
    note: z.string().trim().min(1),
  })).default([]),
  /** 改写说明（描述性，不含作者身份概率）。 */
  summary: z.string().trim().default(""),
});

export type SepiaDiagnosisOutput = z.infer<typeof sepiaDiagnosisSchema>;
export type SepiaRewriteOutput = z.infer<typeof sepiaRewriteSchema>;

/**
 * 单层 pass 输出（三轮协议中每一轮的产物）。
 *
 * 每一轮只负责一层：先诊断该层的缺陷，再在该层内最小化修复，输出改后正文。
 * 与两轮版的关键差异：每轮都基于上一轮的输出重新诊断（而非一次诊断三层），
 * 使下一层面对的是已被上层修好的文本。
 */
export const sepiaPassOutputSchema = z.object({
  /** 本轮（仅该层）诊断出的缺陷清单。 */
  findings: z.array(sepiaFindingSchema).default([]),
  /** 本轮实际执行的修复项。 */
  appliedFixes: z.array(z.object({
    layer: sepiaLayerSchema,
    row: z.string().trim().min(1),
    note: z.string().trim().min(1),
  })).default([]),
  /** 本轮修复后的完整正文（未改动时原样返回）。 */
  content: z.string().trim().min(1),
  /** 本轮说明（描述性，不含作者身份概率）。 */
  summary: z.string().trim().default(""),
  /** 是否本轮发生了实质改动。 */
  changed: z.boolean().default(false),
});

export type SepiaPassOutput = z.infer<typeof sepiaPassOutputSchema>;

