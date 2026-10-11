# 正文表达安全检查

本模块拥有正文表达的确定性检查，不负责叙事评价、修文决策、正文保存或任务暂停。AI 仍负责判断人物、因果、情节与读者体验。

`detectNewSevereProseFindings` 通过 `index.ts` 向章节运行时提供候选预检：比较原稿与候选的 high/critical 问题 code，仅拦截原稿没有的严重表达问题。它复用接收与最终保存阶段的同一检测器，不另建字符串判断规则，也不扩大普通低严重度问题的阻塞范围。

预检失败时保留原稿，记录可恢复修文失败及章节质量债，不发起候选模型验收。已执行的修文调用仍消耗一次处理额度，不能退还或另开重试。预检通过不代表正文合格，候选继续走 AI 验收和版本选择。原稿已有的同类问题交给该正常流程判断，不由预检代替 AI 评价。

局部修文的 replacement 和完整修文的正文均复用共享 `CHAPTER_PROSE_QUALITY_RULES`；局部定位原文 targetExcerpt 必须逐字保留，表达约束不能改变锚点。

## sepia 表层检查（`sepiaProseScanner.ts`）

来源：Nanako0129/sepia（MIT）——去 AI 味写作技能，依据 StoryScope（arXiv:2604.03136）与 sepia 的 rubric / narrative-pass / discourse-pass / style-pass / languages-zh。

本模块只新增确定性的**表层字符串扫描**，返回与 `ProseQualityDetector` 同构的 finding，由 `detectProseQuality` 统一汇总，**随现有 mode_fit 审计报告进入同一接收闸门**，复用既有 patch repair / heavy repair 链路。它不持有正文事实源、不写库、不决定修文，也不新建平行执行链（对齐 AGENTS.md 的「单一正文执行链」「模块边界」）。

问题码使用 `prose_sepia_` 前缀，共 7 类：抽象名词堆叠、表演动词、通胀形容词、AI 套路短语、滤镜词、句式模板、连词堆叠。分级遵循 sepia 的「单次不算证据、聚集才是痕迹」原则——按段落内命中数量设阈值与升级线，单次命中不报。中文以 languages/zh.md 校准，不逐词照搬英文 ban list。

写前侧（预防）：同一批 sepia 表层约束已并入共享 `CHAPTER_PROSE_QUALITY_RULES` 与 `CHAPTER_PROSE_QUALITY_AUDIT_RULES`，随 chapterWriter / patchRepair / review 提示词下发。与之配套的完整 sepia 技能（architecture / discourse / surface 三层）作为反 AI 规则种子存于 `services/styleEngine/sepiaAntiAiRules.ts`，并通过 `SepiaService` + `routes/sepia.ts` 提供结构化的 LLM 诊断/改写接口。
