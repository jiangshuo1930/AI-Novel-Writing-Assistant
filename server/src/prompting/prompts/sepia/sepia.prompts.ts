import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";
import {
  sepiaDiagnosisSchema,
  sepiaRewriteSchema,
  sepiaPassOutputSchema,
  type SepiaDiagnosisOutput,
  type SepiaRewriteOutput,
  type SepiaPassOutput,
} from "./sepia.promptSchemas";

/**
 * Sepia 去 AI 味 prompt 资产。
 *
 * 来源：Nanako0129/sepia（MIT），依据 StoryScope（arXiv:2604.03136）叙事特征研究。
 * 这里把 sepia 的 rubric（30 特征，A–E 组）、narrative-pass、discourse-pass、
 * style-pass 与中文适配 languages/zh.md 收敛为可在项目内直接执行的诊断 / 改写指令。
 *
 * 集成约束（对齐 AGENTS.md）：
 * - 结构化输出优先，不做关键字路由；AI 负责识别，代码只做 schema 校验。
 * - 「校准到人类分布，而非反向极端」与「选择而非堆砌」是总纲。
 * - 绝不编造具体事实；证据必须引用原文。
 */

const SEPIA_RUBRIC_TEXT = [
  "你正在执行 sepia 去 AI 味诊断。sepia 的核心结论是：AI 味的根因在叙事架构层，擦表层文风几乎无效——因此按「架构 → 语篇 → 表层」顺序诊断，最深一层优先修复。",
  "",
  "总纲（三条校准原则）：",
  "1. 瞄准人类区间，而不是反向极端：人类值居中（如时间不连续度约 2.4/5，而非 5/5）。把每个 AI 特征反向拉满会制造新的指纹。",
  "2. 选择而非堆砌：人类写作是多样的，只修复实际命中的问题，不要全量套用。",
  "3. 留松弛度：保留普通句子、未充分展开的想法、平淡段落。不要把表面全部磨平。",
  "",
  "【架构层 architecture】sepia rubric A/B/C/E 组：",
  "A 主题过度确定性：主题显性化（叙事者概括意义）、叙事者主题评论、道德/哲学加权过高、把对话写成理念辩论、主题统一度过满（人类约 4.4/5，满格是 AI 特征）、隐晦无名的互文为主。",
  "B 感官/体感表演性：情绪几乎全靠体感呈现（应为行为+直白命名混合）、场景持续镜像心境（移情谬误）、嗅觉意象过度（“鉴赏家感官”）、感官密度过高、内省深度拉满。",
  "C 结构过度整洁：因果链一环扣一环直通高潮、没有副线、转折由主角自主选择、结局以「内化接受」收束、主角以外部描述引入（应以对话/行动引入）、开篇空间锚定过满。",
  "E 时序与多样性：时间过度线性、缺少倒叙/闪回结构、缺少用时间装置安排揭露、揭示节奏过于均匀或前置（人类偏后置）、单一地点、对话比例偏低、对主角的道德立场过于明确。",
  "人类正向标记（D 组，出现即人类倾向）：点名真实的文本/作者/作品、第四面墙松动、直接称呼读者。",
  "",
  "【语篇层 discourse】：段落套用固定模板（提问-解释-收束）、中段节奏塌陷、段尾固定落点、句子位置机械重复、信息一次性前置交代。",
  "",
  "【表层 surface】style-pass + 中文适配 languages/zh.md：",
  "1. 抽象名词堆叠：「一种…」「…的重量/滋味」「X 与 Y 的交织」；名词化主语；成对抽象。",
  "2. 表演动词：勾勒、彰显、诠释、升华、解构、赋能、诉说、见证。",
  "3. 通胀形容词：错综复杂、淋漓尽致、扑肤而来、无与伦比、意味深长。",
  "4. AI 套路短语：空气中弥漫、那一刻、不禁、时间仿佛静止、心头一紧、五味杂陈、难以言喻、挥之不去。",
  "5. 句式模板：「不仅…而且…」「不是…而是…」、三连排比、分词从句收尾。",
  "6. 滤镜词：似乎、仿佛、好像、意识到、注意到、感受到、看着、听着（删除滤镜，直接呈现）。",
  "7. 句长过于均匀：中文句长离散度小是机器节奏，需拉开长短句分布（但避免全篇统一短句，那是另一种节拍器）。",
  "8. 中文人类语域缺失：语气词密度过低（人类约 5 倍于 AI）、连词堆叠（和/与/以及）、双音节膨胀（「进行查看」应为「看」）。",
  "",
  "中文校准重点：句长离散度、语气词、连词密度、双音节词占比、形名堆叠、标点规范（如不混用「百分之」与「%」）。",
].join("\n");

export interface SepiaDiagnosisPromptInput {
  content: string;
  /** 目标文体/语域，如「文学小说」「网文」「散文」。 */
  register?: string;
  /** 是否只诊断（不产出修复计划）。 */
  diagnoseOnly?: boolean;
}

export interface SepiaRewritePromptInput {
  content: string;
  /** 已给出的诊断修复计划文本（来自 diagnose 的 plan）。留空则由模型自行诊断并修复。 */
  planText?: string;
  register?: string;
}

const DIAGNOSIS_EXAMPLE: SepiaDiagnosisOutput = {
  findings: [
    {
      layer: "architecture",
      row: "主题显性化",
      observation: "段尾用总结句点明主题，叙事者替读者提炼道理。",
      evidence: "她终于明白，信任一旦破碎便无法修复。",
      overCorrection: false,
    },
    {
      layer: "surface",
      row: "句长过于均匀",
      observation: "连续多句长度接近，缺少短句与长句的对比。",
      evidence: "……",
      overCorrection: false,
    },
  ],
  advisories: ["内省深度处于低位，属该文风的已知代价，若用户未被告知需提示。"],
  plan: [
    {
      layer: "architecture",
      row: "主题显性化",
      evidence: "她终于明白，信任一旦破碎便无法修复。",
      action: "删除该总结句，回到具体动作或未解释的意象。",
      operationKind: "delete",
    },
  ],
  summary: "架构层主题显性化 + 表层句长均匀为主要问题；建议先修架构再收表层。",
};

const REWRITE_EXAMPLE: SepiaRewriteOutput = {
  content: "改写后的正文……",
  appliedFixes: [
    { layer: "architecture", row: "主题显性化", note: "删除段尾总结句。" },
  ],
  summary: "按最深一层优先修复，删除优于新增。",
};

export const sepiaDiagnosisPrompt: PromptAsset<
  SepiaDiagnosisPromptInput,
  SepiaDiagnosisOutput
> = {
  id: "sepia.text.diagnose",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 40000,
  },
  structuredOutputHint: {
    example: DIAGNOSIS_EXAMPLE,
    note: "layer 只能是 architecture/discourse/surface；evidence 必须是正文原文片段，不得编造；不给作者身份概率或聚合判定分；overCorrection 仅用于「把某轴推向远离 AI 方向的极端」。",
  },
  outputSchema: sepiaDiagnosisSchema,
  render: (input) => {
    const register = input.register?.trim() || "中文小说";
    const diagnoseOnly = input.diagnoseOnly === true;
    return [
      new SystemMessage([
        SEPIA_RUBRIC_TEXT,
        "",
        "你的任务：对给定文本做 sepia 诊断，只诊断不修改。",
        "逐层（架构 → 语篇 → 表层）阅读，不要一次性评估全部维度：模型自评时会坍缩到一两个显著维度。",
        "每个观察到的信号都必须引用原文短句作为证据；没有引文就不算信号。",
        "把「过度矫正」（把某轴推向远离 AI 方向的极端）单列到 advisories，不要当作 AI 倾向信号。",
        "不要给出作者身份概率、检测结论或聚合判定分——这是编辑性分诊，不是 AI 检测器。",
        diagnoseOnly
          ? "本次只输出 findings 与 advisories；plan 输出为空数组。"
          : "修复计划按「最深一层优先」排序，每项绑定原文片段，倾向删除而非新增。",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释或额外文本。",
      ].join("\n")),
      new HumanMessage([
        `目标语域：${register}`,
        "",
        "待诊断文本：",
        input.content,
      ].join("\n")),
    ];
  },
};

export const sepiaRewritePrompt: PromptAsset<
  SepiaRewritePromptInput,
  SepiaRewriteOutput
> = {
  id: "sepia.text.rewrite",
  version: "v1",
  taskType: "repair",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 40000,
  },
  structuredOutputHint: {
    example: REWRITE_EXAMPLE,
    note: "content 是改写后的完整正文；layer 只能是 architecture/discourse/surface；不给作者身份概率。",
  },
  outputSchema: sepiaRewriteSchema,
  render: (input) => {
    const register = input.register?.trim() || "中文小说";
    const planText = input.planText?.trim();
    return [
      new SystemMessage([
        SEPIA_RUBRIC_TEXT,
        "",
        "你的任务：对给定文本做 sepia 最小化就地改写，保留结构、声音与意图。",
        "两阶段协议不可省略：先在心里形成完整缺陷清单，再逐项修复，最深一层优先；不做无缺陷处的改动。",
        "编辑操作倾向「替换 74% / 删除 18% / 插入 8%」——存疑时倾向删除。",
        "改写结束前执行两个测试：删除测试（新增的词删掉后句子仍通、意思不变即填充，应删）、还原测试（替换的旧表达若更简洁且意思相同则保留旧）。",
        "绝不编造具体事实（真实作品名、品牌、地点、数字必须真实且正确；缺失就保持模糊或留空，不得填充）。",
        "不得让改写比原文更宣传、更煽情；不得移除作者本人真实使用的个人化习惯。",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释或额外文本。",
      ].join("\n")),
      new HumanMessage([
        `目标语域：${register}`,
        planText ? `已给出的修复计划（按此执行）：\n${planText}` : "未给出修复计划：请先自行诊断再修复，并在 appliedFixes 中列出所用修复项。",
        "",
        "原文：",
        input.content,
      ].join("\n")),
    ];
  },
};

// ---------------------------------------------------------------------------
// 三轮协议：Pass 1 架构 / Pass 2 语篇 / Pass 3 表层
// ---------------------------------------------------------------------------
//
// 对齐 sepia 原技能 SKILL.md 的 Routing（fiction 行）：
//   narrative-pass.md → discourse-pass.md → style-pass.md，且 style-pass 明确
//   "Run last, after structure is fixed"。
//
// 与两轮版（diagnose + rewrite）的差异：三轮版每轮只处理一层，且**每轮都基于
// 上一轮输出重新诊断**——上层修好后下层面对的是新文本，避免一次诊断三层时
// 模型自评坍缩到显著维度的问题（sepia 原技能明确警告过这一点）。

const SEPIA_PASS_COMMON_RULES = [
  "通用约束（三轮共有）：",
  "1. 只处理本层缺陷，不得越界改其他层——其他层由相邻的轮次负责。",
  "2. 校准到人类区间，而非反向极端：每条轴都有合理区间，拉满是新指纹。",
  "3. 只修复实际命中的问题，不全面套用清单；留松弛度，保留普通句子与平淡段落。",
  "4. 编辑操作倾向「替换 74% / 删除 18% / 插入 8%」——存疑时倾向删除。",
  "5. 绝不编造具体事实（真实作品名、品牌、地点、数字必须真实且正确；缺失就用原文的模糊表述）。",
  "6. 不改动作者本人真实使用的个人化习惯；不使文本更宣传、更煽情。",
  "7. 结尾执行两个测试：删除测试（新增内容删掉后句子仍通、意思不变即填充，应删）、还原测试（替换的旧表达若更简洁且意思相同则保留旧）。",
  "8. 若本层无缺陷，content 原样返回，changed=false，不要为了「有产出」而强行改动。",
  "9. 只输出一个合法 JSON 对象，不要输出 Markdown、解释或额外文本。",
].join("\n");

/** Pass 1 —— 叙事架构（narrative-pass.md）。最深一层，先修。 */
const SEPIA_ARCHITECTURE_TEXT = [
  "【本轮职责：叙事架构层 architecture】对应 narrative-pass.md 的七个决策组与 rubric A/B/C/E 组。",
  "",
  "逐项检查（只报实际命中的）：",
  "A 主题（stop explaining it）：主题被显性化（叙事者替读者提炼意义/道德）、叙事者主题评论、把对话写成理念辩论、主题统一度过满（人类约 4.4/5）；隐晦的、无名的互文为主更人类。",
  "B 情节（loosen the single track）：因果链一环扣一环直通高潮、没有副线（人类约 40% 故事有一条副线）、缺少「不被开篇预测」的事件、中段按时刻表推进。",
  "C 结局与解决：结局以「主角内化接受」收束（应偏混合或外部驱动）、转折一律由主角自主选择。",
  "D 时间结构：时间过度线性（应为中度不连续，约 2–3/5，不是 1 也不是 5）、缺少闪回/时间装置安排揭露、揭示节奏过均匀或前置（人类偏后置）。",
  "E 情感与感官：情绪几乎全由体感/身体反应呈现（应为「行为 + 直白命名」混合，体感只在情绪峰值用）、场景持续镜像心境（移情谬误）、嗅觉/感官意象过密、内省深度拉满。",
  "F 人物与社会网络：主角以外部描述引入（应以对话或行动引入）、道德立场过于明确、人物缺乏社会关系网。",
  "G 外部世界与读者：缺少点名真实的文本/作者/作品、缺少第四面墙松动或直接称呼读者（这些是人类正向标记，出现即保留）。",
  "",
  "修复取向：架构层的问题往往需要**删**而非加——删掉替读者总结的句子、删掉解释性的内省、让副线自然出现而不是硬塞。",
  "不得为了「制造不连续」而硬加闪回，或为了「制造副线」而编造新事件——若无素材，仅在诊断中记录，不改写。",
].join("\n");

/** Pass 2 —— 语篇流动（discourse-pass.md）。中间层。 */
const SEPIA_DISCOURSE_TEXT = [
  "【本轮职责：语篇流动层 discourse】对应 discourse-pass.md 的 QUD 检查、中段塌陷、结构位置、开篇、命名。",
  "",
  "1. QUD 检查（每段在回答什么问题）：列出每段的隐含问题，若形成「线性面试」序列（发生了什么 → 为什么 → 结果 → 意味着什么）即为机器形；段尾固定落点（「这意味着 / 她此刻感到」）是机器的收束动作。修复：让至少一个问题在它的铺垫之前出现；用一个比较段或矛盾段替换一个后果段（LLM 用后果/程序类动作约 19%，用比较/验证类仅 0.2–0.3%）。",
  "   大纲测试：把每段首句连起来读——若形成一篇干净的摘要，结构就是机器形的；人类大纲有跳跃、缺口、脱离上下文就读不通的句子。",
  "2. 中段是卡点（the middle is the choke point）：检测器与人类评审在**正文中段**最易识别 AI（开篇与结尾反而模仿得像）。修复针对中段三分之一：放入至少一个开篇无法预测的事件；相邻场景之间变换质地（密场景接快场景、对话密集段接概述叙述）；让某条线变慢而不是按时刻表解决。",
  "3. 结构位置（比用词更能扛住改写）：段落长度过于均匀（人类参差不齐，包括单句成段）；引语/关键句总是落在段尾（人类可出现在段中）；列举总是恰好三项（人类是二、四、一项）；场景切换总是同一个连接词（人类有硬切、时间跳、对话接续）；强调分布过于均匀（人类聚在要紧处、别处不强调）。",
  "4. 开篇：机器式开篇是「时间 + 地点 + 天气 → 以描述引入人物 → 才开始故事」。修复：从情境内部开始（冲突中、对话中、出错中）；用一个有效的细节锚定空间，不要全景式铺陈。",
  "5. 命名：避免收敛到通用名（中文里如「林晚」「苏念」「顾言」这类高频道具名）；名字应来自故事特定的世界（地域、代际、阶层），让姓氏与昵称承担社会信息。",
  "",
  "修复取向：段落位置类问题靠**重排**解决（移动、切分、合并），不是靠改词；质地变化靠删减冗余叙述、而非添加。",
].join("\n");

/** Pass 3 —— 表层风格（style-pass.md）。最浅一层，最后跑。 */
const SEPIA_SURFACE_TEXT = [
  "【本轮职责：表层风格层 surface】对应 style-pass.md 的七类 artifact、语法模板、词汇、句律、朗读测试、白名单。",
  "",
  "1. 七类 artifact（按专业编辑实际修得最多的优先级排序）：",
  "   ① 用词不当/脱离语域（28%）：误用词、off-register 词；「似乎 + 动词」还原为动词本身（除非不确定性是真实的）；修正指代不清的代词与过多被动。",
  "   ② 句子结构糟糕（20%）：把长难句拆成两个平实句；一个缠绕的想法 = 两个清楚的句子。",
  "   ③ 冗余交代（18%）：删掉场景已暗示的内容；「[主句]，[重申它的分词短语]」→ 删掉逗号之后的（「投下长长的影子照在荒凉的大地上」→「投下一道长影」）。",
  "   ④ 陈词滥调（17%）：换成新鲜的、场景特有的语言——**绝不换成更平淡的改述**（这是有记录的机器失误）；若没有新鲜素材，删掉该句。",
  "   ⑤ 缺乏具体性（加法型修复）：用真实的名字、物件、数字、动作。若缺素材，**不要**用更泛化的描写填充——那会更糟。",
  "   ⑥ 紫散文：简化。长抽象名词句只传达一种情绪 → 短句具体句。",
  "   ⑦ 时态不一致：钉住时态，逐段猎捕漂移。",
  "",
  "2. 语法模板狩猎（在 LLM 散文中被过度呈 2–5 倍、且被专业编辑大量删掉）：",
  "   「一种/一丝/一抹 + 抽象名词 + 的 + 名词」：一种说不出的压抑感、一丝不易察觉的犹豫、心底的某种空洞——指名具体之物，或删掉包装名词。",
  "   三连排比、分词从句收尾、「不仅…而且…」「不是…而是…」的成对结构。",
  "",
  "3. 词汇（累积才构成信号，单次命中不是判决——slop is cumulative，聚集时改写）：",
  "   抽象宏大名物：图景、见证、交响、万花筒、银河、疆域、旅程、灯塔、韧性、底蕴、肌理、万千。",
  "   表演动词：勾勒、彰显、诠释、升华、解构、赋能、诉说、见证、交织、贯穿、击碎、点燃、挣扎于。",
  "   通胀形容词：错综复杂、鲜活、触手可及、深刻、关键、无缝、稳健、变革性、多面的、转瞬即逝、喧嚣。",
  "   小说 slop：臭氧、雨后泥土味、闪烁、低鸣、薄如蝉翼、「几乎听不见的低语」、「眼里闪过光」、「不由自主」、「呼吸一滞」、「心跳漏一拍」、「脊背发凉」、「嗓音像[某材质]」。",
  "   签名短语：难以言说、心头一紧、挥之不去、五味的、在心底、空气仿佛凝固、那一刻、不禁、时间仿佛静止。",
  "   公式短语：奠定了基础、值得注意的是、在这个…的世界里、一个…的见证、警示故事。",
  "   滤镜词：感到、似乎、仿佛、意识到、注意到、知道、看着（删掉滤镜，直接呈现）。",
  "",
  "4. 该补回的人类语域（指令微调模型系统性压制，按语域与作者声音的允许程度**撒入**而非倾倒）：",
  "   语气词与填充词（嘛、吧、呢、反正、其实、就是）；平实的因果连词（因为、所以）；模糊与强调（几乎、差不多、就是、当然）；否定式（「没有答案是对的」）；简短的说话标记（「说」重复出现是人类，轮换「指出、观察、评论、忖度」是机器式优雅）；在 POV 允许时用第一/第二人称与直接提问。",
  "   **补回不等于填充**：每次补回都必须伴随同一段落中删掉等量填充，且该段不得比原文更长。",
  "",
  "5. 句律：寻找连续三句及以上长度相近的串（这是候选信号，须与其他命中同时出现才计）。修复**靠移动词，不靠加词**：拆一句长的、合两句短的、或删一个从句。一串长句要插一个短的，一串短句要插一个长的。**不要把所有句子都改短**——清一色短句是同一缺陷的另一面，读起来像模仿。",
  "",
  "6. 朗读测试：语法正确但说不出口是独立的 slop 维度。把对话与任何重写过的句子在心里读一遍——若没有母语者会这样说或这样写信，就用口语化句法重做。",
  "",
  "7. 误报白名单（命中前先核对）：干净的语法、正式场合的正式语气、约定俗成的模板，都不是 AI 的证据。",
  "",
  "中文适配（languages/zh.md）：句长离散度、语气词密度（人类约 5 倍于 AI）、连词密度（和/与/以及）、双音节膨胀（「进行查看」应为「看」）、形名堆叠、标点规范（不混用「百分之」与「%」）。",
].join("\n");

const PASS_EXAMPLE: SepiaPassOutput = {
  findings: [
    {
      layer: "architecture",
      row: "主题显性化",
      observation: "段尾用总结句点明主题，叙事者替读者提炼道理。",
      evidence: "她终于明白，信任一旦破碎便无法修复。",
      overCorrection: false,
    },
  ],
  appliedFixes: [
    { layer: "architecture", row: "主题显性化", note: "删除段尾总结句，回到具体动作。" },
  ],
  content: "修改后的正文……",
  summary: "删除 1 处主题总结句；其余本层无缺陷。",
  changed: true,
};

export interface SepiaPassPromptInput {
  content: string;
  /** 目标文体/语域，如「文学小说」「网文」「散文」。 */
  register?: string;
}

type SepiaPassPromptAsset = PromptAsset<SepiaPassPromptInput, SepiaPassOutput>;

function buildSepiaPassPrompt(config: {
  id: string;
  version: string;
  layerName: string;
  layerText: string;
  orderingNote: string;
}): SepiaPassPromptAsset {
  return {
    id: config.id,
    version: config.version,
    taskType: "repair",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: 40000,
    },
    structuredOutputHint: {
      example: PASS_EXAMPLE,
      note: `findings/appliedFixes 的 layer 只能填 architecture/discourse/surface；evidence 必须是正文原文片段，不得编造；不给作者身份概率或聚合判定分；无缺陷时 content 原样返回且 changed=false。`,
    },
    outputSchema: sepiaPassOutputSchema,
    render: (input) => {
      const register = input.register?.trim() || "中文小说";
      return [
        new SystemMessage([
          config.layerText,
          "",
          config.orderingNote,
          "",
          SEPIA_PASS_COMMON_RULES,
        ].join("\n")),
        new HumanMessage([
          `目标语域：${register}`,
          `当前处理层：${config.layerName}`,
          "",
          "待处理文本：",
          input.content,
        ].join("\n")),
      ];
    },
  };
}

/** Pass 1 —— 叙事架构。三轮中最先执行，修复最深一层。 */
export const sepiaArchitecturePassPrompt: SepiaPassPromptAsset = buildSepiaPassPrompt({
  id: "sepia.pass.architecture",
  version: "v1",
  layerName: "architecture（叙事架构）",
  layerText: SEPIA_ARCHITECTURE_TEXT,
  orderingNote: "这是 sepia 三轮中的第一轮，处理最深一层。后续还有语篇层与表层两轮，本轮不要碰它们。",
});

/** Pass 2 —— 语篇流动。在架构修好之后执行。 */
export const sepiaDiscoursePassPrompt: SepiaPassPromptAsset = buildSepiaPassPrompt({
  id: "sepia.pass.discourse",
  version: "v1",
  layerName: "discourse（语篇流动）",
  layerText: SEPIA_DISCOURSE_TEXT,
  orderingNote: "这是 sepia 三轮中的第二轮。叙事架构已在上一轮修好，不要回头改架构层；表层由下一轮负责，本轮也不要碰。",
});

/** Pass 3 —— 表层风格。三轮中最后执行（style-pass 明确要求 Run last）。 */
export const sepiaSurfacePassPrompt: SepiaPassPromptAsset = buildSepiaPassPrompt({
  id: "sepia.pass.surface",
  version: "v1",
  layerName: "surface（表层风格）",
  layerText: SEPIA_SURFACE_TEXT,
  orderingNote: "这是 sepia 三轮中的最后一轮（style-pass 要求 Run last, after structure is fixed）。结构已在前两轮定好，本轮只做表层：用词、句式、词汇、句律。",
});
