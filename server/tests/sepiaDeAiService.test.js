const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadTsModule } = require("./novelProduction/sourceHarness.cjs");

/**
 * sepia 三轮去 AI 味运行时（SepiaDeAiService.ts）单元测试。
 *
 * 覆盖：三轮顺序（架构 → 语篇 → 表层）、每轮基于上一轮输出重新诊断、
 * 单层失败跳过不阻断、无改动不改写、输入过短返回 null、diagnoseOnly 分支。
 * 该服务是章节生产链上唯一的 sepia 改写执行点（入口 A 与入口 B 共用
 * sepiaDeAiRuntime 调用它），因此 pass 编排行为必须有测试锁定。
 */

const repoRoot = path.resolve(__dirname, "..");
const SERVICE_PATH = path.join(repoRoot, "src", "services", "styleEngine", "SepiaDeAiService.ts");

const PASS_PROMPTS = {
  architecture: { id: "sepia.pass.architecture" },
  discourse: { id: "sepia.pass.discourse" },
  surface: { id: "sepia.pass.surface" },
};

function loadService(runStructuredPrompt) {
  return loadTsModule(SERVICE_PATH, {
    "../../prompting/core/promptRunner": { runStructuredPrompt },
    "../../prompting/prompts/sepia/sepia.prompts": {
      sepiaArchitecturePassPrompt: PASS_PROMPTS.architecture,
      sepiaDiscoursePassPrompt: PASS_PROMPTS.discourse,
      sepiaSurfacePassPrompt: PASS_PROMPTS.surface,
    },
  });
}

/** 满足 MIN_CONTENT_LENGTH(40) 的正文。 */
const LONG_CONTENT = "他推开门，风从走廊尽头灌进来，把桌上的纸吹得哗哗响。".repeat(3);

/** 构造一条合法 pass 输出；默认产生实质改动。 */
function passOutput(content, { changed = true, layer = "architecture" } = {}) {
  return {
    findings: [],
    appliedFixes: [],
    content,
    summary: `summary:${layer}`,
    changed,
  };
}

test("三轮按 architecture → discourse → surface 顺序执行，并带 sepia 阶段标识", async () => {
  const calls = [];
  const { runSepiaDeAi } = loadService(async ({ asset, promptInput, options }) => {
    calls.push({
      id: asset.id,
      content: promptInput.content,
      register: promptInput.register,
      stage: options.stage,
      triggerReason: options.triggerReason,
      temperature: options.temperature,
    });
    return { output: passOutput(`${promptInput.content} [改写]`) };
  });

  const result = await runSepiaDeAi({ content: LONG_CONTENT, novelId: "n", chapterId: "c" });

  assert.deepEqual(calls.map((call) => call.id), [
    "sepia.pass.architecture",
    "sepia.pass.discourse",
    "sepia.pass.surface",
  ]);
  assert.deepEqual(calls.map((call) => call.stage), [
    "sepia_architecture",
    "sepia_discourse",
    "sepia_surface",
  ]);
  assert.equal(calls[0].triggerReason, "chapter_sepia_deai");
  assert.equal(calls[0].temperature, 0.3);
  assert.equal(calls[0].register, "中文小说");
  assert.deepEqual(result.diagnosis.layers, ["architecture", "discourse", "surface"]);
  assert.equal(result.rewritten, true);
});

test("每轮基于上一轮输出重新诊断（正文逐层传递）", async () => {
  const seenInputs = [];
  const { runSepiaDeAi } = loadService(async ({ promptInput }) => {
    seenInputs.push(promptInput.content);
    return { output: passOutput(`${promptInput.content}»`) };
  });

  await runSepiaDeAi({ content: LONG_CONTENT });

  assert.equal(seenInputs.length, 3);
  assert.equal(seenInputs[0], LONG_CONTENT);
  assert.equal(seenInputs[1], `${LONG_CONTENT}»`);
  assert.equal(seenInputs[2], `${LONG_CONTENT}»»`);
});

test("单层失败跳过，保留该层输入继续下一层（fail-open）", async () => {
  const calls = [];
  const { runSepiaDeAi } = loadService(async ({ asset, promptInput }) => {
    calls.push(asset.id);
    if (asset.id === "sepia.pass.discourse") {
      throw new Error("llm unavailable");
    }
    return { output: passOutput(`${promptInput.content}»`) };
  });

  const result = await runSepiaDeAi({ content: LONG_CONTENT });

  assert.deepEqual(calls, [
    "sepia.pass.architecture",
    "sepia.pass.discourse",
    "sepia.pass.surface",
  ]);
  // 语篇层失败被跳过，不进入 layers；表层基于架构层输出继续
  assert.deepEqual(result.diagnosis.layers, ["architecture", "surface"]);
  assert.equal(result.rewritten, true);
  assert.equal(result.rewrittenContent, `${LONG_CONTENT}»»`);
});

test("三轮全部失败时不改写，返回 rewritten=false", async () => {
  const { runSepiaDeAi } = loadService(async () => {
    throw new Error("all down");
  });

  const result = await runSepiaDeAi({ content: LONG_CONTENT });

  assert.deepEqual(result.diagnosis.layers, []);
  assert.equal(result.rewritten, false);
  assert.equal(result.rewrittenContent, null);
});

test("三轮均无改动时不改写，避免无谓的风格漂移", async () => {
  const { runSepiaDeAi } = loadService(async ({ promptInput }) => ({
    output: passOutput(promptInput.content, { changed: false }),
  }));

  const result = await runSepiaDeAi({ content: LONG_CONTENT });

  assert.deepEqual(result.diagnosis.layers, ["architecture", "discourse", "surface"]);
  assert.equal(result.rewritten, false);
  assert.equal(result.rewrittenContent, null);
});

test("模型返回空正文时视为该层无产出，保留输入且不算改动", async () => {
  const { runSepiaDeAi } = loadService(async () => ({ output: passOutput("   ") }));

  const result = await runSepiaDeAi({ content: LONG_CONTENT });

  assert.equal(result.rewritten, false);
  assert.equal(result.rewrittenContent, null);
});

test("输入短于最小长度时直接返回 null，不发起任何调用", async () => {
  let called = 0;
  const { runSepiaDeAi } = loadService(async () => {
    called += 1;
    return { output: passOutput("x") };
  });

  const result = await runSepiaDeAi({ content: "太短了。" });

  assert.equal(result, null);
  assert.equal(called, 0);
});

test("diagnoseOnly 只跑架构层，且不产出改写", async () => {
  const calls = [];
  const { runSepiaDeAi } = loadService(async ({ asset, promptInput }) => {
    calls.push(asset.id);
    return { output: passOutput(`${promptInput.content}»`) };
  });

  const result = await runSepiaDeAi({ content: LONG_CONTENT, diagnoseOnly: true });

  assert.deepEqual(calls, ["sepia.pass.architecture"]);
  assert.deepEqual(result.diagnosis.layers, ["architecture"]);
  assert.equal(result.rewritten, false);
  assert.equal(result.rewrittenContent, null);
});

test("显式 temperature 覆盖默认 0.3，并透传 novelId/chapterId", async () => {
  const captured = [];
  const { runSepiaDeAi } = loadService(async ({ promptInput, options }) => {
    captured.push(options);
    return { output: passOutput(`${promptInput.content}»`) };
  });

  await runSepiaDeAi({ content: LONG_CONTENT, temperature: 0.7, novelId: "novel-9", chapterId: "chapter-9" });

  assert.equal(captured.length, 3);
  for (const options of captured) {
    assert.equal(options.temperature, 0.7);
    assert.equal(options.novelId, "novel-9");
    assert.equal(options.chapterId, "chapter-9");
  }
});

test("appliedFixes 与 summaries 按层累积", async () => {
  const { runSepiaDeAi } = loadService(async ({ asset, promptInput }) => ({
    output: {
      findings: [],
      appliedFixes: [{ layer: "surface", row: "performance_verb", note: `fix-${asset.id}` }],
      content: `${promptInput.content}»`,
      summary: `summary-${asset.id}`,
      changed: true,
    },
  }));

  const result = await runSepiaDeAi({ content: LONG_CONTENT });

  assert.equal(result.appliedFixes.length, 3);
  assert.deepEqual(result.appliedFixes.map((fix) => fix.note), [
    "fix-sepia.pass.architecture",
    "fix-sepia.pass.discourse",
    "fix-sepia.pass.surface",
  ]);
  assert.deepEqual(result.diagnosis.summaries, [
    "[architecture] summary-sepia.pass.architecture",
    "[discourse] summary-sepia.pass.discourse",
    "[surface] summary-sepia.pass.surface",
  ]);
});
