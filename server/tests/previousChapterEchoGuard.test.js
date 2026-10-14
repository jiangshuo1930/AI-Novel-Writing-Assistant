import assert from "node:assert/strict";
import test from "node:test";
import { stripPreviousChapterEcho } from "../dist/services/novel/runtime/context/previousChapterEchoGuard.js";
import { extractChapterTailAnchor } from "../dist/services/novel/runtime/context/chapterSourceText.js";

// 真实样本：小说 director-opening-book-cmv6pa342000blwrqpmidub7a
// ch1「法庭旁听席上的老婆」结尾 与 ch2「无赖值到账之后」正文。
// ch2 的开头曾逐字复述 ch1 结尾（含整段唐果出场）。
const PREVIOUS_TAIL = [
  "窗照进来，晃得他眯起眼。身后大门合上的瞬间，他听见里面传来沈清辞继续开庭的声音，语调没有任何起伏，像什么都没发生过。",
  "【叮。新手任务完成。无赖值到账：10点。宿主当前无赖值：10。】",
  "陈不二靠在走廊墙壁上，腿还在抖。他抹了一把脸，掌心全是汗。",
  "【系统评价：喊得不够真诚，音量尚可，情绪饱满度偏低。建议下次加入肢体动作，比如单膝跪地，效果更佳。当然，以宿主目前的胆量，系统不抱期待。】",
  "“你闭嘴。”陈不二从牙缝里挤出三个字。",
  "【另外，系统检测到法庭外有执法人员在等候。唐果，城中村派出所民警，女，二十四岁。她手里有一份关于你的报案记录。建议宿主调整呼吸，你现在的脸色像刚从停尸房跑出来的。】",
  "陈不二猛地抬头。走廊尽头，玻璃门外，一个穿浅蓝制服的身影正靠在警车旁，低头看手机。马尾扎得很高，肩线笔直。她像是感应到什么，抬起头，目光穿过玻璃门，准确地对上了他的眼睛。",
  "唐果把手机揣进口袋，朝他抬了抬下巴。那表情他太熟了，网吧里抓未成年人上网的时候，她就是这个表情。",
  "陈不二后脑勺撞在墙上，发出一声闷响。法警在后面推了他一把：“走，别磨蹭。”",
  "他迈开步子，往走廊尽头那扇玻璃门走去。门外阳光很烈，唐果的影子被拉得很长，横在台阶上，像一道拦路的栏杆。",
].join(" ");

const ECHOED_CHAPTER = [
  "陈不二后脑勺撞在墙上，闷响还没散开，系统声音先到了。",
  "【无赖值+10。宿主，你刚才那一嗓子，丢人丢出了水平。】",
  "“你能不能闭嘴。”",
  "【不能。另外提醒你，赖账会强制扣款，你目前余额不够扣。】",
  "陈不二咬了咬牙。法警从后面推他：“走，别磨蹭。”",
  "他迈开步子，脑子里却停不下来。这破系统，不做任务就惩罚，做了任务就社死，怎么选都是坑。",
  "【检测到宿主情绪低落。沈清辞好感度+3，当前-7。她记住你了。】",
  "陈不二愣了一下。记住……他也不知道自己在在意什么。明明是被记住了名字，还是以最丢人的方式。",
  "走廊尽头，玻璃门外，一个穿浅蓝制服的身影正靠在警车旁，低头看手机。马尾扎得很高，肩线笔直。她像是感应到什么，抬起头，目光穿过玻璃门，准确地对上了他的眼睛。",
  "唐果把手机揣进口袋，朝他抬了抬下巴。那表情他太熟了，网吧里抓未成年人上网的时候，她就是这个表情。",
  "【唐果，城中村派出所民警。她手里有关于你的报案记录。建议宿主调整呼吸，你脸色很难看。】",
  "陈不二推开玻璃门。阳光劈头盖脸砸下来，唐果的影子横在台阶上，像一道拦路的栏杆。",
].join("\n");

test("retelling the previous chapter ending is stripped from the new chapter", () => {
  const result = stripPreviousChapterEcho(ECHOED_CHAPTER, PREVIOUS_TAIL);

  assert.equal(result.edited, true, "guard should have edited the chapter");
  assert.equal(result.skippedForSize, false);
  // 唐果出场那几句是逐字复述，必须消失
  assert.equal(result.content.includes("穿浅蓝制服的身影"), false);
  assert.equal(result.content.includes("网吧里抓未成年人上网的时候"), false);
  assert.equal(result.content.includes("马尾扎得很高"), false);
  // 本章自己新写的内容必须保留
  assert.ok(result.content.includes("闷响还没散开"));
  assert.ok(result.content.includes("赖账会强制扣款"));
  assert.ok(result.content.includes("沈清辞好感度+3"));
  assert.ok(result.content.includes("陈不二推开玻璃门"));
  // 只裁掉开头窗口内的重复，比例远低于上限
  assert.ok(result.removedChars > 0 && result.removedChars < ECHOED_CHAPTER.length * 0.35);
  assert.ok(result.removedSentences.length >= 4, JSON.stringify(result.removedSentences));
});

test("a chapter that continues instead of retelling is left untouched", () => {
  const fresh = [
    "玻璃门被推开的瞬间，日头正毒。",
    "唐果没回头，只把文件袋夹在腋下，朝台阶下走了两步。",
    "“三天前，城东建材市场。”她说，“监控拍到的脸，是你。”",
    "陈不二盯着那张打印件，脑子里一片空白。",
  ].join("\n");
  const result = stripPreviousChapterEcho(fresh, PREVIOUS_TAIL);
  assert.equal(result.edited, false);
  assert.equal(result.content, fresh);
});

test("short generic lines are never treated as echoes", () => {
  const tail = "他站住了。她没有抬头。风很大。走廊的灯灭了一盏。";
  const chapter = "他站住了。她没有抬头。风很大。走廊的灯灭了一盏。后面的事情，谁也没再提。";
  const result = stripPreviousChapterEcho(chapter, tail);
  assert.equal(result.edited, false, JSON.stringify(result));
  assert.equal(result.content, chapter);
});

test("an oversized duplicate is reported but not auto-trimmed", () => {
  const tail = "第一句重复的正文内容在这里。第二句重复的正文内容在这里。第三句重复的正文内容在这里。";
  const chapter = `${tail}${tail}全新的收尾。`;
  const result = stripPreviousChapterEcho(chapter, tail);
  assert.equal(result.edited, false);
  assert.equal(result.skippedForSize, true);
  assert.equal(result.content, chapter);
});

test("the previous chapter anchor keeps whole sentences within budget", () => {
  const anchor = extractChapterTailAnchor(PREVIOUS_TAIL, 120);
  const normalizedTail = PREVIOUS_TAIL.replace(/\s+/g, " ").trim();
  assert.ok(anchor.length > 0 && anchor.length <= 120, `anchor length ${anchor.length}`);
  // 必须是原尾段的连续结尾片段，且以完整句收尾（不从句子中间切起）
  assert.equal(normalizedTail.endsWith(anchor), true, anchor);
  assert.equal(anchor.endsWith("。"), true, anchor);
  const before = normalizedTail.slice(0, normalizedTail.length - anchor.length);
  assert.equal(/[。！？…]\s*$/.test(before) || before === "", true, `anchor 起点未对齐整句：${anchor}`);
  assert.equal(extractChapterTailAnchor("", 120), "");
});

// —— 章节编辑器「整章模式」：改写是 paraphrase，不是照抄 ——

test("approximate matching removes sentences that were rewritten rather than copied", () => {
  // 编辑器整章改写会把「正靠在警车旁」改成「靠在警车旁」这类近逐字复述。
  const content = [
    "走廊尽头，玻璃门外，一个穿浅蓝制服的身影靠在警车旁，低头看手机。",
    "他把手插进裤兜，慢慢往回走。",
  ].join("\n");
  const result = stripPreviousChapterEcho(content, PREVIOUS_TAIL, {
    similarityThreshold: 0.7,
    scanRatio: 1,
    minScanChars: 0,
    maxRemovalRatio: 0.9,
  });
  assert.equal(result.edited, true, JSON.stringify(result));
  assert.equal(result.content.includes("穿浅蓝制服的身影"), false);
  assert.ok(result.content.includes("把手插进裤兜"), result.content);
});

test("approximate matching leaves unrelated prose alone", () => {
  const content = [
    "奶茶店的玻璃门推开，风铃叮当响了一声。",
    "柜台后面的女孩抬起头，问他要喝点什么。",
    "他盯着菜单看了半天，最后还是要了最便宜的那杯。",
  ].join("\n");
  const result = stripPreviousChapterEcho(content, PREVIOUS_TAIL, {
    similarityThreshold: 0.7,
    scanRatio: 1,
    minScanChars: 0,
    maxRemovalRatio: 0.9,
  });
  assert.equal(result.edited, false, JSON.stringify(result));
  assert.equal(result.content, content);
});

test("approximate matching never applies to short lines", () => {
  // 相似度其实很高，但两句都短于 16 字，仍必须精确命中才算复述。
  const tail = "他盯着那张监控截图愣住了。";
  const chapter = "他盯着那张监控截图愣住。他又翻了一页。";
  const result = stripPreviousChapterEcho(chapter, tail, {
    similarityThreshold: 0.7,
    scanRatio: 1,
    minScanChars: 0,
    maxRemovalRatio: 0.9,
  });
  assert.equal(result.edited, false, JSON.stringify(result));
  assert.equal(result.content, chapter);
});

test("exact matching remains the default", () => {
  const tail = "走廊尽头，玻璃门外，一个穿浅蓝制服的身影正靠在警车旁，低头看手机。";
  const chapter = "走廊尽头，玻璃门外，一个穿浅蓝制服的身影靠在警车旁，低头看手机。";
  const result = stripPreviousChapterEcho(chapter, tail, { maxRemovalRatio: 0.9 });
  assert.equal(result.edited, false, "默认阈值下不应做近似匹配");
  assert.equal(result.content, chapter);
});

test("a whole-chapter scan reaches echoes behind the leading window", () => {
  const echo = "走廊尽头，玻璃门外，一个穿浅蓝制服的身影靠在警车旁，低头看手机。";
  const filler = "他在街上漫无目的地走了很久。".repeat(60);
  const chapter = `${filler}${echo}`;
  const wholeChapter = stripPreviousChapterEcho(chapter, PREVIOUS_TAIL, {
    similarityThreshold: 0.7,
    scanRatio: 1,
    minScanChars: 0,
    maxRemovalRatio: 0.9,
  });
  assert.equal(wholeChapter.edited, true, "整章扫描应覆盖开头窗口之外的复述");
  assert.equal(wholeChapter.content.includes("穿浅蓝制服的身影"), false);
  const leadingOnly = stripPreviousChapterEcho(chapter, PREVIOUS_TAIL, {
    similarityThreshold: 0.7,
    maxRemovalRatio: 0.9,
  });
  assert.equal(leadingOnly.edited, false, "默认只扫描开头窗口，因此抓不到");
});

test("a one-character difference in a rewritten echo is still caught", () => {
  // 真实回归：ch2 曾把 ch1 的「…身影正靠在警车旁…」写成「…身影靠在警车旁…」。
  // 逐字守卫漏掉这一字之差，编辑器整章模式便把它一直保留了下来。
  const content = [
    "走廊尽头，玻璃门外，一个穿浅蓝制服的身影靠在警车旁，低头看手机。",
    "他把手插进裤兜，站了一会儿。",
  ].join("\n");
  const exact = stripPreviousChapterEcho(content, PREVIOUS_TAIL, { maxRemovalRatio: 0.9 });
  assert.equal(exact.edited, false, "逐字守卫抓不住一字之差");
  const approximate = stripPreviousChapterEcho(content, PREVIOUS_TAIL, {
    similarityThreshold: 0.7,
    scanRatio: 1,
    minScanChars: 0,
    maxRemovalRatio: 0.9,
  });
  assert.equal(approximate.edited, true, "近似守卫必须抓住这一字之差");
  assert.equal(approximate.content.includes("穿浅蓝制服的身影"), false);
  assert.ok(approximate.content.includes("把手插进裤兜"), approximate.content);
});
