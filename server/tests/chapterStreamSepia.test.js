const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRuntimeSource } = require("./novelProduction/sourceHarness.cjs");

/**
 * 入口 B（单章 SSE 流式）sepia 接线集成测试。
 *
 * 该入口此前不经过 chapterRuntimePipeline，因此不执行 sepia 三轮去 AI 味。
 * 现已在 ChapterStreamGenerationOrchestrator 的 onDone 中、接收闸门之前接入。
 * 本测试用真实的 sepiaDeAiRuntime 配合替身 SepiaDeAiService，验证：
 * 开关优先级、改写稿进入接收闸门、fail-open、空正文短路、状态帧播报。
 */

const SAMPLE = "他推开门，风从走廊尽头灌进来，把桌上的纸吹得哗哗响。";

/**
 * 构造编排器。
 * @param {object} input
 * @param {object} input.sepiaRunSepiaDeAi 替身 runSepiaDeAi
 * @param {object} [input.request] 请求入参（含 sepiaDeAi / sepiaRegister）
 * @param {function} [input.loadNovelSepiaConfig]
 */
function createOrchestrator({ runSepiaDeAi, request = {}, loadNovelSepiaConfig }) {
  const sepiaRuntime = loadRuntimeSource("sepiaDeAiRuntime.ts", {
    "../../styleEngine/SepiaDeAiService": { runSepiaDeAi },
  });
  const { ChapterStreamGenerationOrchestrator } = loadRuntimeSource(
    "ChapterStreamGenerationOrchestrator.ts",
    {
      "../chapterWritingGraph": {},
      "../novelP0Utils": { toText: (content) => (content == null ? "" : String(content)) },
      "./GenerationContextAssembler": {},
      "./ChapterRuntimeReadinessService": {},
      "../production/preparation": {},
      "./chapterEmptyContentError": {
        assertChapterContentNotEmpty: (value) => value,
        isChapterEmptyContentError: () => false,
      },
      "./ChapterContentFinalizationService": {},
      "./sepiaDeAiRuntime": sepiaRuntime,
    },
  );

  const finalized = [];
  const frames = [];
  const orchestrator = new ChapterStreamGenerationOrchestrator({
    assembler: {
      assemble: async () => ({
        novel: { title: "Novel" },
        chapter: { order: 1, title: "Chapter" },
        contextPackage: {},
      }),
    },
    preparationService: { prepare: async () => {} },
    chapterWritingGraph: {
      createChapterStream: async () => ({
        stream: (async function* empty() {})(),
        onDone: async (fullContent) => ({ finalContent: fullContent }),
      }),
    },
    readinessService: { assertReady: () => {} },
    contentFinalizationService: {
      markChapterStatus: async () => {},
      finalizeChapterContent: async (input) => {
        finalized.push(input.content);
        return {
          finalContent: input.content,
          runtimePackage: { audit: { hasBlockingIssues: false } },
        };
      },
    },
    agentRuntime: { createChapterGenRun: async () => "run-1" },
    validateRequest: (input) => input,
    ensureNovelCharacters: async () => {},
    loadNovelSepiaConfig,
  });

  return {
    finalized,
    frames,
    run: async () => {
      const { onDone } = await orchestrator.createChapterStream("novel-1", "chapter-1", request);
      await onDone(SAMPLE, { writeFrame: (frame) => frames.push(frame) });
    },
  };
}

test("入口 B：sepia 改写成真时，改写稿进入接收闸门", async () => {
  const harness = createOrchestrator({
    runSepiaDeAi: async () => ({ rewritten: true, rewrittenContent: "改写后的正文" }),
    request: { sepiaDeAi: true },
  });

  await harness.run();

  assert.deepEqual(harness.finalized, ["改写后的正文"]);
});

test("入口 B：显式关闭时不做 sepia，原稿进入接收闸门", async () => {
  let called = 0;
  const harness = createOrchestrator({
    runSepiaDeAi: async () => {
      called += 1;
      return { rewritten: true, rewrittenContent: "改写后的正文" };
    },
    request: { sepiaDeAi: false },
    loadNovelSepiaConfig: async () => ({ sepiaDeAi: true }),
  });

  await harness.run();

  assert.deepEqual(harness.finalized, [SAMPLE]);
  assert.equal(called, 0);
});

test("入口 B：未显式传值时读取小说级配置（关闭则不跑 sepia）", async () => {
  let called = 0;
  const harness = createOrchestrator({
    runSepiaDeAi: async () => {
      called += 1;
      return { rewritten: true, rewrittenContent: "改写后的正文" };
    },
    loadNovelSepiaConfig: async () => ({ sepiaDeAi: false }),
  });

  await harness.run();

  assert.deepEqual(harness.finalized, [SAMPLE]);
  assert.equal(called, 0);
});

test("入口 B：小说级配置开启时执行 sepia", async () => {
  const harness = createOrchestrator({
    runSepiaDeAi: async () => ({ rewritten: true, rewrittenContent: "改写后的正文" }),
    loadNovelSepiaConfig: async () => ({ sepiaDeAi: true }),
  });

  await harness.run();

  assert.deepEqual(harness.finalized, ["改写后的正文"]);
});

test("入口 B：sepia 抛错时 fail-open，原稿进入接收闸门", async () => {
  const harness = createOrchestrator({
    runSepiaDeAi: async () => {
      throw new Error("llm unavailable");
    },
    request: { sepiaDeAi: true },
  });

  await harness.run();

  assert.deepEqual(harness.finalized, [SAMPLE]);
});

test("入口 B：sepia 无改动时原稿进入接收闸门", async () => {
  const harness = createOrchestrator({
    runSepiaDeAi: async () => ({ rewritten: false, rewrittenContent: null }),
    request: { sepiaDeAi: true },
  });

  await harness.run();

  assert.deepEqual(harness.finalized, [SAMPLE]);
});

test("入口 B：执行 sepia 时通过 run_status 帧播报", async () => {
  const harness = createOrchestrator({
    runSepiaDeAi: async () => ({ rewritten: true, rewrittenContent: "改写后的正文" }),
    request: { sepiaDeAi: true },
  });

  await harness.run();

  const messages = harness.frames
    .filter((frame) => frame.type === "run_status")
    .map((frame) => frame.message);
  assert.ok(
    messages.some((message) => /sepia/.test(message)),
    `应播报 sepia 状态，实际：${JSON.stringify(messages)}`,
  );
});

test("入口 B：关闭 sepia 时不播报 sepia 状态帧", async () => {
  const harness = createOrchestrator({
    runSepiaDeAi: async () => ({ rewritten: true, rewrittenContent: "改写后的正文" }),
    request: { sepiaDeAi: false },
  });

  await harness.run();

  const messages = harness.frames
    .filter((frame) => frame.type === "run_status")
    .map((frame) => frame.message);
  assert.equal(messages.some((message) => /sepia/.test(message)), false);
});
