/**
 * Sepia 去 AI 味能力的前端共享类型。
 *
 * 来源：Nanako0129/sepia（MIT）。
 * 与 server 端 `prompts/sepia/sepia.promptSchemas.ts` 的结构保持镜像，
 * 但这里只承载调用契约，不承载任何 prompt 或执行逻辑。
 */

export type SepiaLayer = "architecture" | "discourse" | "surface";

export interface SepiaFinding {
  layer: SepiaLayer;
  row: string;
  observation: string;
  evidence: string;
  overCorrection: boolean;
}

export interface SepiaFix {
  layer: SepiaLayer;
  row: string;
  evidence: string;
  action: string;
  operationKind: "replace" | "delete" | "insert";
}

export interface SepiaDiagnosisResult {
  findings: SepiaFinding[];
  advisories: string[];
  plan: SepiaFix[];
  summary: string;
}

export interface SepiaAppliedFix {
  layer: SepiaLayer;
  row: string;
  note: string;
}

export interface SepiaRewriteResult {
  content: string;
  appliedFixes: SepiaAppliedFix[];
  summary: string;
}

export interface SepiaDiagnoseRequest {
  content: string;
  register?: string;
  diagnoseOnly?: boolean;
  provider?: string;
  model?: string;
  temperature?: number;
  novelId?: string;
}

export interface SepiaRewriteRequest {
  content: string;
  planText?: string;
  register?: string;
  provider?: string;
  model?: string;
  temperature?: number;
  novelId?: string;
}

/** sepia 三层的中文标签，供前端展示分组。 */
export const SEPIA_LAYER_LABELS: Record<SepiaLayer, string> = {
  architecture: "叙事架构",
  discourse: "语篇流动",
  surface: "表层风格",
};
