const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadTsModule } = require("./novelProduction/sourceHarness.cjs");

/**
 * sepia prompt 资产与结构化 schema 单元测试。
 *
 * 覆盖：5 个资产注册完整性、三轮 pass 的层职责与顺序语义、
 * render 产出的 system/human 消息、以及 schema 对合法/非法输出的判别。
 * 这些资产是 sepia 改写质量的唯一来源，且无运行时兜底，因此必须有测试。
 */

const repoRoot = path.resolve(__dirname, "..");
const SEPIA_DIR = path.join(repoRoot, "src", "prompting", "prompts", "sepia");

/** 用最小替身捕获消息角色，避免测试依赖真实 langchain 运行时。 */
class SystemMessage {
  constructor(content) {
    this.role = "system";
    this.content = content;
  }
}
class HumanMessage {
  constructor(content) {
    this.role = "human";
    this.content = content;
  }
}

function loadSepiaPrompts() {
  const schemas = loadTsModule(path.join(SEPIA_DIR, "sepia.promptSchemas.ts"), {
    zod: require("zod"),
  });
  const prompts = loadTsModule(path.join(SEPIA_DIR, "sepia.prompts.ts"), {
    "@langchain/core/messages": { SystemMessage, HumanMessage },
    "./sepia.promptSchemas": schemas,
  });
  return { schemas, prompts };
}

test("注册 5 个 sepia prompt 资产，id 与版本唯一", () => {
  const { prompts } = loadSepiaPrompts();
  const assets = [
    prompts.sepiaDiagnosisPrompt,
    prompts.sepiaRewritePrompt,
    prompts.sepiaArchitecturePassPrompt,
    prompts.sepiaDiscoursePassPrompt,
    prompts.sepiaSurfacePassPrompt,
  ];

  assert.deepEqual(assets.map((asset) => asset.id), [
    "sepia.text.diagnose",
    "sepia.text.rewrite",
    "sepia.pass.architecture",
    "sepia.pass.discourse",
    "sepia.pass.surface",
  ]);
  for (const asset of assets) {
    assert.equal(asset.version, "v1");
    assert.equal(asset.mode, "structured");
    assert.equal(asset.language, "zh");
    assert.ok(asset.outputSchema, `${asset.id} 必须有 outputSchema`);
    assert.equal(typeof asset.render, "function");
  }
});

test("三轮 pass 资产均为 repair 任务且各自绑定独立层职责文本", () => {
  const { prompts } = loadSepiaPrompts();
  const passes = [
    prompts.sepiaArchitecturePassPrompt,
    prompts.sepiaDiscoursePassPrompt,
    prompts.sepiaSurfacePassPrompt,
  ];

  for (const asset of passes) {
    assert.equal(asset.taskType, "repair");
  }

  const rendered = passes.map((asset) =>
    asset.render({ content: "待处理正文", register: "中文小说" })[0].content,
  );
  assert.match(rendered[0], /叙事架构层 architecture/);
  assert.match(rendered[1], /语篇流动层 discourse/);
  assert.match(rendered[2], /表层风格层 surface/);
  assert.notEqual(rendered[0], rendered[1]);
  assert.notEqual(rendered[1], rendered[2]);
});

test("三轮 pass 的 orderNote 表达先后约束（表层最后执行）", () => {
  const { prompts } = loadSepiaPrompts();
  const systemOf = (asset) => asset.render({ content: "x", register: "中文小说" })[0].content;

  const architecture = systemOf(prompts.sepiaArchitecturePassPrompt);
  const discourse = systemOf(prompts.sepiaDiscoursePassPrompt);
  const surface = systemOf(prompts.sepiaSurfacePassPrompt);

  assert.match(architecture, /第一轮/);
  assert.match(discourse, /第二轮/);
  assert.match(surface, /最后一轮/);
  assert.match(surface, /Run last/);
});

test("pass render 产出 system + human 两条消息，human 携带语域与待处理文本", () => {
  const { prompts } = loadSepiaPrompts();
  const messages = prompts.sepiaArchitecturePassPrompt.render({
    content: "他推开门。",
    register: "网文",
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "human");
  assert.match(messages[1].content, /网文/);
  assert.match(messages[1].content, /他推开门。/);
  assert.match(messages[0].content, /只输出一个合法 JSON 对象/);
});

test("诊断 prompt 在 diagnoseOnly 下要求空修复计划", () => {
  const { prompts } = loadSepiaPrompts();
  const withPlan = prompts.sepiaDiagnosisPrompt.render({ content: "x", diagnoseOnly: false })[0].content;
  const onlyDiagnosis = prompts.sepiaDiagnosisPrompt.render({ content: "x", diagnoseOnly: true })[0].content;

  assert.match(withPlan, /修复计划按「最深一层优先」排序/);
  assert.match(onlyDiagnosis, /plan 输出为空数组/);
});

test("sepiaPassOutputSchema：接受合法输出，拒绝缺少 content 的输出", () => {
  const { schemas } = loadSepiaPrompts();

  const ok = schemas.sepiaPassOutputSchema.safeParse({
    findings: [],
    appliedFixes: [],
    content: "改写后的正文",
    summary: "无缺陷",
    changed: false,
  });
  assert.equal(ok.success, true);

  const missingContent = schemas.sepiaPassOutputSchema.safeParse({
    findings: [],
    appliedFixes: [],
    summary: "无缺陷",
  });
  assert.equal(missingContent.success, false);
});

test("sepiaPassOutputSchema：默认值回填（findings/appliedFixes/summary/changed）", () => {
  const { schemas } = loadSepiaPrompts();
  const parsed = schemas.sepiaPassOutputSchema.parse({ content: "正文" });

  assert.deepEqual(parsed.findings, []);
  assert.deepEqual(parsed.appliedFixes, []);
  assert.equal(parsed.summary, "");
  assert.equal(parsed.changed, false);
});

test("sepiaFindingSchema：overCorrection 默认 false，layer 限定三层枚举", () => {
  const { schemas } = loadSepiaPrompts();

  const parsed = schemas.sepiaFindingSchema.parse({
    layer: "surface",
    row: "句式模板",
    observation: "出现配对结构。",
    evidence: "不仅…而且…",
  });
  assert.equal(parsed.overCorrection, false);

  const bad = schemas.sepiaFindingSchema.safeParse({
    layer: "unknown-layer",
    row: "x",
    observation: "y",
    evidence: "z",
  });
  assert.equal(bad.success, false);
});
