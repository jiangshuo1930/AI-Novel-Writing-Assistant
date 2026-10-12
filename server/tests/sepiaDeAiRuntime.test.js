const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRuntimeSource } = require("./novelProduction/sourceHarness.cjs");

/**
 * sepia 章节级运行时（sepiaDeAiRuntime.ts）单元测试。
 *
 * 该模块是入口 A（批量流水线）与入口 B（单章 SSE）共用的 sepia 开关解析与执行收敛点，
 * 因此重点覆盖：开关优先级、fail-open 语义、正文替换行为。
 */

function loadSepiaRuntime(runSepiaDeAi) {
  return loadRuntimeSource("sepiaDeAiRuntime.ts", {
    "../../styleEngine/SepiaDeAiService": { runSepiaDeAi },
  });
}

const idleSepia = async () => null;

test("resolveSepiaDeAiEnabled: 调用方显式开关优先于小说级配置", async () => {
  const { resolveSepiaDeAiEnabled } = loadSepiaRuntime(idleSepia);
  const novelConfigOff = async () => ({ sepiaDeAi: false });
  const novelConfigOn = async () => ({ sepiaDeAi: true });

  assert.equal(await resolveSepiaDeAiEnabled({ novelId: "n", sepiaDeAi: true }, novelConfigOff), true);
  assert.equal(await resolveSepiaDeAiEnabled({ novelId: "n", sepiaDeAi: false }, novelConfigOn), false);
});

test("resolveSepiaDeAiEnabled: 未显式传值时读取小说级配置", async () => {
  const { resolveSepiaDeAiEnabled } = loadSepiaRuntime(idleSepia);

  assert.equal(await resolveSepiaDeAiEnabled({ novelId: "n" }, async () => ({ sepiaDeAi: false })), false);
  assert.equal(await resolveSepiaDeAiEnabled({ novelId: "n" }, async () => ({ sepiaDeAi: true })), true);
});

test("resolveSepiaDeAiEnabled: 无配置、无 loader、loader 抛错时一律默认开启", async () => {
  const { resolveSepiaDeAiEnabled } = loadSepiaRuntime(idleSepia);

  assert.equal(await resolveSepiaDeAiEnabled({ novelId: "n" }), true);
  assert.equal(await resolveSepiaDeAiEnabled({ novelId: "n" }, async () => null), true);
  assert.equal(
    await resolveSepiaDeAiEnabled({ novelId: "n" }, async () => {
      throw new Error("db down");
    }),
    true,
  );
});

test("applySepiaDeAiToChapter: 空正文短路且不发起调用", async () => {
  let called = 0;
  const { applySepiaDeAiToChapter } = loadSepiaRuntime(async () => {
    called += 1;
    return null;
  });

  const result = await applySepiaDeAiToChapter({ novelId: "n", chapterId: "c", content: "   \n  " });
  assert.equal(result.rewritten, false);
  assert.equal(result.content, "   \n  ");
  assert.equal(called, 0);
});

test("applySepiaDeAiToChapter: 改写成真时替换正文", async () => {
  const { applySepiaDeAiToChapter } = loadSepiaRuntime(async () => ({
    rewritten: true,
    rewrittenContent: "改写后的正文",
  }));

  const result = await applySepiaDeAiToChapter({ novelId: "n", chapterId: "c", content: "原稿正文内容足够长以通过长度门槛" });
  assert.equal(result.rewritten, true);
  assert.equal(result.content, "改写后的正文");
});

test("applySepiaDeAiToChapter: 三轮无改动时保留原稿", async () => {
  const { applySepiaDeAiToChapter } = loadSepiaRuntime(async () => ({
    rewritten: false,
    rewrittenContent: null,
  }));

  const original = "原稿正文内容足够长以通过长度门槛";
  const result = await applySepiaDeAiToChapter({ novelId: "n", chapterId: "c", content: original });
  assert.equal(result.rewritten, false);
  assert.equal(result.content, original);
});

test("applySepiaDeAiToChapter: rewritten 为真但正文为空时保留原稿", async () => {
  const { applySepiaDeAiToChapter } = loadSepiaRuntime(async () => ({
    rewritten: true,
    rewrittenContent: "",
  }));

  const original = "原稿正文内容足够长以通过长度门槛";
  const result = await applySepiaDeAiToChapter({ novelId: "n", chapterId: "c", content: original });
  assert.equal(result.rewritten, false);
  assert.equal(result.content, original);
});

test("applySepiaDeAiToChapter: 底层抛错时 fail-open 保留原稿", async () => {
  const { applySepiaDeAiToChapter } = loadSepiaRuntime(async () => {
    throw new Error("llm unavailable");
  });

  const original = "原稿正文内容足够长以通过长度门槛";
  const result = await applySepiaDeAiToChapter({ novelId: "n", chapterId: "c", content: original });
  assert.equal(result.rewritten, false);
  assert.equal(result.content, original);
});

test("applySepiaDeAiToChapter: 默认语域为「中文小说」，显式传入时透传", async () => {
  const seen = [];
  const { applySepiaDeAiToChapter } = loadSepiaRuntime(async (options) => {
    seen.push(options.register);
    return { rewritten: false, rewrittenContent: null };
  });

  await applySepiaDeAiToChapter({ novelId: "n", chapterId: "c", content: "原稿正文内容足够长以通过长度门槛" });
  await applySepiaDeAiToChapter({
    novelId: "n",
    chapterId: "c",
    content: "原稿正文内容足够长以通过长度门槛",
    sepiaRegister: "  网文  ",
  });

  assert.deepEqual(seen, ["中文小说", "网文"]);
});

test("applySepiaDeAiToChapter: 透传 novelId/chapterId/provider/model 给底层", async () => {
  const captured = [];
  const { applySepiaDeAiToChapter } = loadSepiaRuntime(async (options) => {
    captured.push(options);
    return { rewritten: false, rewrittenContent: null };
  });

  await applySepiaDeAiToChapter({
    novelId: "novel-1",
    chapterId: "chapter-1",
    content: "原稿正文内容足够长以通过长度门槛",
    provider: "deepseek",
    model: "deepseek-chat",
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0].novelId, "novel-1");
  assert.equal(captured[0].chapterId, "chapter-1");
  assert.equal(captured[0].provider, "deepseek");
  assert.equal(captured[0].model, "deepseek-chat");
});
