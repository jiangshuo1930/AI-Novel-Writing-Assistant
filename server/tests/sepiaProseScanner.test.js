const test = require("node:test");
const assert = require("node:assert/strict");

const {
  scanSepiaSurface,
  SEPIA_SURFACE_RULES,
  SEPIA_SURFACE_PATTERN_SOURCES,
} = require("../dist/services/novel/runtime/proseQuality/sepiaProseScanner.js");
const { detectNewSevereProseFindings } = require("../dist/services/novel/runtime/proseQuality/ProseQualityDetector.js");

/**
 * sepia 表层确定性扫描器（sepiaProseScanner.ts）单元测试。
 *
 * 覆盖：规则集完整性、阈值门槛、聚集升级、引号处理、按段落计数。
 * 该扫描器的产出随 ProseQualityDetector 进入接收闸门，并会并入 blockingIssues
 * 触发修文，因此阈值与分级行为必须有测试锁定。
 */

function seg(text, line = 1) {
  return { text, line };
}

function codes(findings) {
  return findings.map((finding) => finding.code);
}

const RULE_BY_CODE = new Map(SEPIA_SURFACE_RULES.map((rule) => [rule.code, rule]));

test("规则集完整：7 条规则，全部使用 prose_sepia_ 命名空间", () => {
  assert.equal(SEPIA_SURFACE_RULES.length, 7);
  assert.deepEqual(
    SEPIA_SURFACE_RULES.map((rule) => rule.code).sort(),
    [
      "prose_sepia_abstract_noun_stacking",
      "prose_sepia_connective_pile",
      "prose_sepia_filter_word",
      "prose_sepia_inflation_adjective",
      "prose_sepia_performance_verb",
      "prose_sepia_slop_phrase",
      "prose_sepia_syntax_template",
    ],
  );
  for (const rule of SEPIA_SURFACE_RULES) {
    assert.match(rule.code, /^prose_sepia_/);
    assert.ok(rule.patterns.length > 0, `${rule.code} 必须至少有一个模式`);
    assert.ok(rule.threshold >= 1);
    assert.ok(rule.escalateThreshold >= rule.threshold);
  }
});

test("分级配置：只有 syntax_template 是 high，其余为 medium", () => {
  const highRules = SEPIA_SURFACE_RULES.filter((rule) => rule.severity === "high").map((rule) => rule.code);
  assert.deepEqual(highRules, ["prose_sepia_syntax_template"]);
  for (const rule of SEPIA_SURFACE_RULES) {
    if (rule.code !== "prose_sepia_syntax_template") {
      assert.equal(rule.severity, "medium", `${rule.code} 应为 medium`);
    }
  }
});

test("阈值门槛：同段命中未达 threshold 时不产生 finding", () => {
  // filter_word threshold=3：同段仅 2 次命中
  assert.deepEqual(codes(scanSepiaSurface([seg("他似乎觉得，她仿佛在笑。")])), []);
  // abstract_noun_stacking threshold=2：同段仅 1 次命中
  assert.deepEqual(codes(scanSepiaSurface([seg("那是一种奇怪的感觉。")])), []);
});

test("阈值达成：同段命中达到 threshold 时报 medium", () => {
  const findings = scanSepiaSurface([seg("他似乎觉得，她仿佛在看着什么。")]);
  assert.deepEqual(codes(findings), ["prose_sepia_filter_word"]);
  assert.equal(findings[0].severity, "medium");

  const abstract = scanSepiaSurface([seg("那是一种奇怪的感觉，也是心底的重量感。")]);
  assert.deepEqual(codes(abstract), ["prose_sepia_abstract_noun_stacking"]);
  assert.equal(abstract[0].severity, "medium");
});

test("聚集升级：同段命中达到 escalateThreshold 时升级为 high", () => {
  // slop_phrase：threshold=1、escalateThreshold=2
  const findings = scanSepiaSurface([seg("那一刻，时间仿佛静止。")]);
  assert.deepEqual(codes(findings), ["prose_sepia_slop_phrase"]);
  assert.equal(findings[0].severity, "high");
});

test("syntax_template：threshold=1 且 severity=high，单次命中即阻塞级", () => {
  const rule = RULE_BY_CODE.get("prose_sepia_syntax_template");
  assert.equal(rule.threshold, 1);
  assert.equal(rule.severity, "high");

  const findings = scanSepiaSurface([seg("她既没有说话，也没有离开。")]);
  assert.deepEqual(codes(findings), ["prose_sepia_syntax_template"]);
  assert.equal(findings[0].severity, "high");
});

test("按段落独立计数：跨段落的零散命中不会相互累加", () => {
  // 两段各 1 次 abstract 命中，均低于 threshold=2
  const findings = scanSepiaSurface([
    seg("那是一种奇怪的感觉。", 1),
    seg("他回忆起心底的重量。", 2),
  ]);
  assert.deepEqual(codes(findings), []);
});

test("段落行号与列号回填自命中文本", () => {
  const findings = scanSepiaSurface([seg("那一刻，他愣住了。", 7)]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 7);
  assert.equal(findings[0].column, 1);
  assert.equal(findings[0].excerpt, "那一刻");
});

test("空段落数组返回空结果", () => {
  assert.deepEqual(scanSepiaSurface([]), []);
});

test("引号内命中仍被上报：isInsideQuote 守卫对阈值判定无效（已知缺陷）", () => {
  // sepia 原技能的设计是「引号内的对白不算叙述痕迹」，firstHit 也实现了 isInsideQuote，
  // 但 countMatches 统计命中时未剔除引号内容，阈值判定发生在 firstHit 之前，
  // 导致仅存在于引号内的命中依然满足 threshold 并产出 finding（excerpt 回退为整段）。
  // 该用例锁定当前行为；修复后应改为断言 findings 为空。
  const findings = scanSepiaSurface([seg("她说：「那不是冷漠，而是克制。」")]);
  assert.deepEqual(codes(findings), ["prose_sepia_syntax_template"]);
  assert.equal(findings[0].severity, "high");
  assert.equal(findings[0].excerpt, "她说：「那不是冷漠，而是克制。」");
});

test("diagnostics 模式导出：七类规则的模式源均可读取", () => {
  assert.deepEqual(
    Object.keys(SEPIA_SURFACE_PATTERN_SOURCES).sort(),
    [
      "abstractNoun",
      "connectivePile",
      "filterWord",
      "inflationAdjective",
      "performanceVerb",
      "slopPhrase",
      "syntaxTemplate",
    ],
  );
  for (const [key, sources] of Object.entries(SEPIA_SURFACE_PATTERN_SOURCES)) {
    assert.ok(sources.length > 0, `${key} 必须有模式`);
  }
});

test("detectNewSevereProseFindings：修文新引入 syntax_template 时判定为新增严重问题", () => {
  const original = "他走进屋子，坐了下来。";
  const candidate = "他走进屋子，坐了下来。她既没有说话，也没有离开。";
  const findings = detectNewSevereProseFindings(original, candidate);
  assert.deepEqual(findings.map((finding) => finding.code), ["prose_sepia_syntax_template"]);
});

test("detectNewSevereProseFindings：原稿已有同类问题时不算新增", () => {
  const original = "她既没有说话，也没有离开。";
  const candidate = "她既没有说话，也没有离开。他也没动。";
  assert.deepEqual(detectNewSevereProseFindings(original, candidate), []);
});
