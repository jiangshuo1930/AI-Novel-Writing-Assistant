import assert from "node:assert/strict";
import test from "node:test";
import { NovelCoreCrudService } from "../dist/services/novel/novelCoreCrudService.js";
import { prisma } from "../dist/db/prisma.js";

test("chapter save rejects a stale editor version before writing", async () => {
  const originalFindFirst = prisma.chapter.findFirst;
  const originalUpdate = prisma.chapter.update;
  let updateCalls = 0;
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    updatedAt: new Date("2026-10-11T00:00:00.000Z"),
  });
  prisma.chapter.update = async () => {
    updateCalls += 1;
    throw new Error("stale editor was written");
  };

  try {
    await assert.rejects(
      new NovelCoreCrudService().updateChapter("novel-1", "chapter-1", {
        content: "new content",
        expectedUpdatedAt: "2026-10-11T00:01:00.000Z",
      }),
      (error) => error?.statusCode === 409 && /本章保存版本已变化/.test(error.message),
    );
    assert.equal(updateCalls, 0);
  } finally {
    prisma.chapter.findFirst = originalFindFirst;
    prisma.chapter.update = originalUpdate;
  }
});

test("chapter save accepts a stale row version when the stored prose still matches", async () => {
  const originalFindFirst = prisma.chapter.findFirst;
  const originalTransaction = prisma.$transaction;
  let updateCalls = 0;
  // The background artifact sync rewrote Chapter.expectation, so the row version moved on
  // even though the prose the editor read is untouched.
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    updatedAt: new Date("2020-01-01T00:00:00.000Z"),
    content: "alpha\n\nbeta",
  });
  // ManualChapterStore writes inside $transaction, so stubbing $transaction is what intercepts
  // the write; stubbing prisma.chapter.update would miss it and hit the real database.
  prisma.$transaction = async (callback) => {
    updateCalls += 1;
    return callback({
      chapter: {
        update: async () => {
          throw new Error("sentinel: reached the chapter write");
        },
      },
    });
  };

  try {
    await assert.rejects(
      new NovelCoreCrudService().updateChapter("novel-1", "chapter-1", {
        content: "alpha\n\nbeta\n\ngamma",
        expectedUpdatedAt: "2026-10-11T00:01:00.000Z",
        expectedContent: "alpha\n\nbeta",
      }),
      (error) => !/本章保存版本已变化/.test(error.message),
    );
    assert.equal(updateCalls, 1);
  } finally {
    prisma.chapter.findFirst = originalFindFirst;
    prisma.$transaction = originalTransaction;
  }
});

test("chapter save still rejects a real prose divergence", async () => {
  const originalFindFirst = prisma.chapter.findFirst;
  const originalUpdate = prisma.chapter.update;
  let updateCalls = 0;
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    updatedAt: new Date("2026-10-11T00:00:00.000Z"),
    content: "另一个人刚改过的正文",
  });
  prisma.chapter.update = async () => {
    updateCalls += 1;
    throw new Error("divergent prose was written");
  };

  try {
    await assert.rejects(
      new NovelCoreCrudService().updateChapter("novel-1", "chapter-1", {
        content: "alpha\n\nbeta\n\ngamma",
        expectedUpdatedAt: "2026-10-11T00:00:00.000Z",
        expectedContent: "alpha\n\nbeta",
      }),
      (error) => error?.statusCode === 409 && /本章保存版本已变化/.test(error.message),
    );
    assert.equal(updateCalls, 0);
  } finally {
    prisma.chapter.findFirst = originalFindFirst;
    prisma.chapter.update = originalUpdate;
  }
});
