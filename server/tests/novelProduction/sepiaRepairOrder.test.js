const test = require("node:test");
const assert = require("node:assert/strict");
const { createPipelineHarness } = require("./sourceHarness.cjs");

// 修文顺序：结构优先（原 patch/heavy）→ 文笔收尾（sepia 三轮）。
// sepia 只治 AI 味、不治结构性问题；且 heavy 重写会整体覆盖此前的风格成果，
// 因此 style 必须放在最后一道，两者是串联而非二选一。
test("repair runs the structural chain first, then polishes with sepia on its output", async () => {
  const h = createPipelineHarness({ scores: [60, 90], sepiaRewrite: "sepia polished content" });
  const result = await h.run();

  assert.equal(result.pass, true);
  // 原 patch/heavy 链必须跑过：结构优先，不再被 sepia 短路
  assert.equal(h.events.includes("repair"), true);
  // 顺序的直接证据 —— sepia 收到的入参是 patch 产出，而非原始草稿
  assert.deepEqual(h.sepiaCalls, ["repair candidate"]);
  // 最终入库的是 sepia 收尾后的稿子
  assert.deepEqual(h.committedContents, ["sepia polished content"]);
});

// 兜底：sepia 无改动（未发现 AI 味）时保留 patch 产出，不做风格漂移。
test("repair keeps the structural output when sepia makes no change", async () => {
  const h = createPipelineHarness({ scores: [60, 90] });
  const result = await h.run();

  assert.equal(result.pass, true);
  assert.equal(h.events.includes("repair"), true);
  assert.deepEqual(h.sepiaCalls, ["repair candidate"]);
  assert.deepEqual(h.committedContents, ["repair candidate"]);
});

// 开关：sepia 关闭时完全不调用 sepia，只走原链。
test("repair skips sepia entirely when the sepia switch is off", async () => {
  const h = createPipelineHarness({
    scores: [60, 90],
    sepiaEnabled: false,
    sepiaRewrite: "sepia polished content",
  });
  await h.run();

  assert.equal(h.events.includes("repair"), true);
  assert.deepEqual(h.sepiaCalls, []);
  assert.deepEqual(h.committedContents, ["repair candidate"]);
});

// 结构修文失败时不跑 sepia：保留原稿并交由后续重试 / 人工复查。
test("repair does not run sepia when the structural chain fails", async () => {
  const h = createPipelineHarness({
    scores: [60, 90],
    patchRepairFailure: true,
    sepiaRewrite: "sepia polished content",
  });
  const result = await h.run();

  assert.deepEqual(h.sepiaCalls, []);
  assert.equal(h.events.includes("needs_repair"), true);
  assert.deepEqual(result.recoverableRepairFailure?.failureTypes, ["patch_plan_invalid"]);
});
