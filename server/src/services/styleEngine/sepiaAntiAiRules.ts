import type { DefaultAntiAiRuleDefinition } from "./defaults";
/**
 * Sepia 反 AI 规则种子（架构层 + 表层）
 *
 * 来源：Nanako0129/sepia（MIT）—— 去 AI 味写作技能。
 * 依据：StoryScope（arXiv:2604.03136）叙事特征分类研究，以及 sepia 的
 * narrative-pass / discourse-pass / style-pass / rubric 与中文适配 languages/zh.md。
 *
 * 集成原则（对齐 AGENTS.md）：
 * - 只承载「稳定的写作质量规则」，不承载运行时编排或执行链。
 * - key 统一使用 `sepia-` 前缀，便于识别与后续升级。
 * - promptInstruction 直接进入正文生成 / 审阅 / 修复上下文，遵循项目
 *   「AI 优先、结构化输出」的约定：这里给的是结构化约束文本，不做关键字路由。
 * - 中文规则以 languages/zh.md 的形态校准为准（句长离散度、语气词、连词、
 *   双音节词、形名堆叠等），英文 ban list 不逐词照搬。
 *
 * 分层：
 *   1. 架构层（architecture）：主题显性化、叙事者评论、单线因果、结尾内化、
 *      时序线性、内省主导、场景镜像心境、外向描述引入主角。
 *   2. 语篇层（discourse）：段落模板化、中段塌陷、段尾升华。
 *   3. 表层（surface）：抽象名词堆砌、表演动词、通胀形容词、AI 套路短语、
 *      句式模板、filter 词、句长均匀、语气词/连词缺失、双音节膨胀。
 */
export const SEPIA_ANTI_AI_RULES: DefaultAntiAiRuleDefinition[] = [
  // ------------------------------------------------------------------
  // 架构层 — 叙事架构（sepia rubric Group A/B/C/E，narrative-pass §1-§7）
  // ------------------------------------------------------------------
  {
    key: "sepia-forbid-thematization",
    name: "[sepia] 禁止主题显性化与叙事者评论",
    type: "forbidden",
    severity: "high",
    description:
      "sepia 架构层：AI 小说把主题讲出来（叙事者概括事件意义、角色领悟道理，人类约 52%、AI 约 77%）。主题必须由事件与角色弧线承载，不由叙事者总结。",
    detectPatterns: [],
    rewriteSuggestion:
      "删除叙事者概括主题、总结中心思想的句子；把「她终于明白」「这就是人」一类表述改成具体动作、对话或未解释的意象；保留意象本身，删掉对意象的解释。",
    promptInstruction:
      "主题必须隐含而非讲明：叙事者不得概括事件意义或替读者提炼道理，角色弧线不以「领悟」收束；象征不要自我解释。允许某个场景或意象纯粹为质感存在、不服务主题（人类主题统一度约 4.4/5 而非满分，过度统一本身是 AI 特征）。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-risk-single-track-causality",
    name: "[sepia] 单线因果链过于整齐",
    type: "risk",
    severity: "medium",
    description:
      "sepia 架构层：AI 情节因果链过紧（人类约 3.9/5、AI 约 4.2/5），且几乎不留副线（无副线人类 57% vs AI 79%）。完全闭环的因果与全部兑现的伏笔像机器记账。",
    detectPatterns: [],
    rewriteSuggestion:
      "让因果链断一次：插入一个不由起因事件引发的事件，或把某个后果移到幕后发生；埋一个永不引爆的细节；若篇幅允许，编入一条与主线主题隐约呼应的副线。",
    promptInstruction:
      "情节不要单线到底、事件不要一环扣一环直通高潮。允许因果链断裂一次（幕后起因或外来的后果），允许留下未兑现的线索。人类常留松散线头，完整兑现的伏笔清单是机器痕迹。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-forbid-default-growth-ending",
    name: "[sepia] 禁止默认「成长+接受」式收尾",
    type: "forbidden",
    severity: "high",
    description:
      "sepia 架构层：主角自主选择（人类 46% vs AI 69%）、内化接受（人类 27% vs AI 47%）叠加成长，是数据中最强的结尾指纹。",
    detectPatterns: [],
    rewriteSuggestion:
      "三条腿（主角决定 + 接受 + 领悟）至少改动一条：让偶然、他人或制度决定结局；允许结局部分、开放或灾难性；主角的道德立场可保持混合（事件上被证明、行为上是错的）。",
    promptInstruction:
      "避免收尾三件套（主角自主决定 + 内心接受 + 完成成长）。约一半篇幅让偶然、他人或外部力量决定结局；结局可以是部分的、开放的或灾难性的；不要在结尾把每个账都算清，通常比完整少一个节拍更好。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-risk-linear-timeline",
    name: "[sepia] 时序过度线性、悬念前置",
    type: "risk",
    severity: "medium",
    description:
      "sepia 架构层：人类时序不连续度约 2.4/5、AI 约 2.1/5；人类偏好后置揭示，AI 偏均匀或前置。",
    detectPatterns: [],
    rewriteSuggestion:
      "找到「若延后揭露会更有力」的场景并前移或后置；删掉开场前的背景简报，让上下文在行进中渗出；把最大的揭露放到靠后位置。",
    promptInstruction:
      "时间结构以适度非线性为佳：可先给结果再回溯原因，用时间跳跃来安排信息；最大揭露靠后（后置揭示是实测的人类特征）；避免开场先把全部背景交代清楚再开始。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-risk-embodied-emotion-dominance",
    name: "[sepia] 情绪过度依赖体感呈现",
    type: "risk",
    severity: "high",
    description:
      "sepia 架构层：AI 把「show don't tell」当教条，情绪几乎全靠体感（人类 38% vs AI 81%）；而直白命名情绪反而是人类句子（人类 29% vs AI 8%）。",
    detectPatterns: [],
    rewriteSuggestion:
      "盘点每个情绪节拍并分类其模式；若体感主导，多数改为行为（她做了什么）或直白命名（她害怕）；只保留最强的一两处体感呈现。",
    promptInstruction:
      "不要把所有情绪都写成体感（胸口一紧、冷汗、灯光变暗）。人类混用四种模式并偏向最朴素的两种：行为第一、直白命名第二（「她害怕」是人类句子，模型几乎不写）。每篇只在一两处高峰使用体感渲染。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-risk-setting-psychological-mirror",
    name: "[sepia] 环境一味映照心境（移情谬误）",
    type: "risk",
    severity: "medium",
    description:
      "sepia 架构层：AI 让天气/风景/建筑持续外化内心（人类约 3.6/5、AI 约 4.1/5），开篇也偏爱「被感知的氛围空间」而非「角色行动的空间」。",
    detectPatterns: [],
    rewriteSuggestion:
      "删去环境反复呼应情绪的场景（不是每场雨都承载婚姻）；把「为氛围而感知」的句子改为「角色在其中移动或使用」的行动空间句。",
    promptInstruction:
      "天气就是天气、物件就是物件，环境不要持续映照内心。场景描写以角色行动/使用的空间为主，而非单纯为氛围而感知的空间；每处风景只在一两处高峰可与心境呼应。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-risk-external-description-intro",
    name: "[sepia] 主角以外部描述引入",
    type: "risk",
    severity: "medium",
    description:
      "sepia 架构层：人类常用「对话中」或「行动中」引入主角（对话引入是最强人类标记，罕见），AI 偏爱外部描写（人类 30% vs AI 52%）。",
    detectPatterns: [],
    rewriteSuggestion:
      "把主角登场从「外貌+背景介绍」改为让其开口说话或直接做事；对话引入优先级最高。",
    promptInstruction:
      "主角登场应通过对话或行动，而非一段外貌与背景描述（「狗是周二来的」胜过大段外貌+身世）。优先让角色在对话中首次实质性出现。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-encourage-sparse-social-network",
    name: "[sepia] 人物网络过密、关系一律正向",
    type: "risk",
    severity: "medium",
    description:
      "sepia 架构层：AI 人物网络更密（互动对占比人类 0.18 vs AI 0.34-0.47），关系情感一律正向（人类均值 -0.06 中性，AI +0.24~+0.66），反派的敌对聚类过低（人类 0.395 vs AI 0.07-0.21）。",
    detectPatterns: [],
    rewriteSuggestion:
      "画出带符号的人物关系图：若人人都互相连接，删边；若每条边都温暖，冷却几条；若反派孤立，给其一个与主角无关的关系。",
    promptInstruction:
      "人物关系网保持稀疏：允许有些角色从不照面、有些只通过第三人相识；关系情感总和接近中性，真实的班底包含与情节无关的厌恶；反派要有盟友与内部分歧，而非孤立指向主角；可以给读者几乎不了解的角色制造危险。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-encourage-real-world-anchor",
    name: "[sepia] 缺少真实世界锚点与读者意识",
    type: "encourage",
    severity: "medium",
    description:
      "sepia 架构层：人类点出真实文本/作者（47% vs AI 24%）、有第四面墙松动（67% vs 39%）、直接称呼读者（28% vs 7%），且会多走一两个地点（人类 1.34 vs AI 1.08）。",
    detectPatterns: [],
    rewriteSuggestion:
      "把「一位著名诗人」「一首老歌」具体化为真实且正确的作品；若一个房间写了 5000 字而前提不要求封闭，挪一场戏到别处；偶尔加一句承认读者存在的旁白（一两处，不是元小说框架）。",
    promptInstruction:
      "可以点出真实、正确的作品名/乐队/地点（准确优先，不确定要问）；混用有名与无名的互文；允许极少量承认读者的旁白（一两处即可）；场景可比前提需要多一到两个地点；让对话比叙述略多一点篇幅。禁止编造具体事实。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },

  // ------------------------------------------------------------------
  // 语篇层 — 语篇流动（discourse-pass）
  // ------------------------------------------------------------------
  {
    key: "sepia-risk-templated-paragraph",
    name: "[sepia] 段落模板化、中段塌陷",
    type: "risk",
    severity: "medium",
    description:
      "sepia 语篇层：AI 段落遵循固定「问题-回答」模板，中段节奏塌陷（段落数人类 1.4 vs AI 3.7，段落长度人类更长）。模板化段落结构是机器痕迹。",
    detectPatterns: [],
    rewriteSuggestion:
      "打散固定段落套路，避免每段以问题-回答或同一收束落点结尾；让段落长度、句子位置自然变化；中段不要连续同质节奏。",
    promptInstruction:
      "段落不要套用固定模板（如每段都是「提问-解释-收束」）。段落长度与句子位置要有自然变化，避免中段节奏塌陷和同一句式反复出现在段尾。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },

  // ------------------------------------------------------------------
  // 表层 — 表层风格（style-pass §1-§4 + languages/zh.md）
  // ------------------------------------------------------------------
  {
    key: "sepia-forbid-abstract-noun-stacking",
    name: "[sepia] 禁止抽象名词堆叠",
    type: "forbidden",
    severity: "high",
    description:
      "sepia 表层 §2：AI 偏爱「a/the [抽象名词] of [名词]」「[形容词]的[名词]」「X and Y 配对抽象」，中文对应「一种…的感觉」「…的重量」「…与…的交织」等形名堆叠与成对抽象。",
    detectPatterns: [
      "一种",
      "的感觉",
      "的重量",
      "的滋味",
      "交织",
      "交织在一起",
      "图腾",
      "织锦",
      "画布",
      "交响",
      "万花筒",
      "旅程",
      "光芒",
    ],
    rewriteSuggestion:
      "点出具体的物或直接删掉包装名词；成对抽象只保留一个；把名词化（领悟、决心、转变）还原为动词。",
    promptInstruction:
      "禁止抽象名词堆叠：不用「一种…」「…的重量/滋味」「…与…的交织」式包装；不写「X and Y」成对抽象（只留一个）；不把动词名词化（「她做了决定」而非「她的决定」）。点名具体的东西，或直接删掉。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-forbid-performance-verbs",
    name: "[sepia] 禁止表演动词",
    type: "forbidden",
    severity: "medium",
    description:
      "sepia 表层 §3：表演动词（delve/underscore/harness/elevate）在 AI 文本中过度出现。中文对应「勾勒、彰显、诠释、升华、解构、致敬、赋能、加持」一类包装动词。",
    detectPatterns: [
      "勾勒出",
      "彰显",
      "诠释",
      "升华",
      "解构",
      "赋能",
      "加持",
      "书写着",
      "诉说着",
      "见证着",
      "演绛",
      "刻画出",
    ],
    rewriteSuggestion:
      "换成具体、朴素的动词：写就是写、说就是说、做就是做；vigorous 指准确的实义动词，不是膨胀的动词。",
    promptInstruction:
      "禁止表演动词与包装动词（勾勒、彰显、诠释、升华、解构、赋能、诉说、见证）。用准确的实义动词，vigorous 是动词具体，不是动词膨胀。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-forbid-inflation-adjectives",
    name: "[sepia] 禁止通胀形容词",
    type: "forbidden",
    severity: "medium",
    description:
      "sepia 表层 §3：AI 过度使用抒情/通胀形容词（intricate/vibrant/palpable/profound/pivotal/seamless）。中文对应「错综复杂、鲜活的、深刻的、至关重要的、无缝的、淋漓尽致的」等。",
    detectPatterns: [
      "错综复杂",
      "栩栩如生",
      "淋漓尽致",
      "扑面而来",
      "油然而生",
      "无与伦比",
      "妙不可言",
      "令人窒息",
      "意味深长",
      "晦涩难懂",
      "细腻而",
      "深邃的",
    ],
    rewriteSuggestion:
      "换成具体、场景化的语言；如果找不到更新鲜的表达，直接删掉该句（而非换成更平淡的复述，那是机器式修法的失败模式）。",
    promptInstruction:
      "避免通胀/抒情形容词持续堆叠。换成具体的、场景独有的表达；没有更好的表达就删掉整句，不要把华丽词换成更平淡的复述。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-forbid-slop-phrases",
    name: "[sepia] 禁止 AI 套路短语",
    type: "forbidden",
    severity: "medium",
    description:
      "sepia 表层 §3（合并 ban list）：AI 特征短语，单次不算证据、聚集则明显。中文对应「空气中弥漫着、那一刻、不禁、仿佛时间静止、心头一紧」等。",
    detectPatterns: [
      "空气中弥漫",
      "空气中仿佛",
      "那一刻",
      "一瞬间",
      "不禁",
      "仿佛静止",
      "时间仿佛",
      "心头一紧",
      "心里五味杂陈",
      "五味杂陈",
      "说不出的",
      "难以言喻",
      "思绪万千",
      "久久不能平静",
      "挥之不去",
    ],
    rewriteSuggestion:
      "逐个替换或删除；slop 是累积的——命中聚集时重写整段，而不要只做同义替换。",
    promptInstruction:
      "避免 AI 套路短语（空气中弥漫着、那一刻、不禁、时间仿佛静止、心头一紧、五味杂陈、难以言喻、挥之不去）。这类短语是累积性痕迹，聚集出现时须重写，不要只做同义替换。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-forbid-syntax-templates",
    name: "[sepia] 禁止句式模板",
    type: "forbidden",
    severity: "high",
    description:
      "sepia 表层 §2：AI 高发句式模板——「不仅…而且…」「不是…而是…」「三连排比」「现在分词从句收尾」。这些词性形状在 LLM 文本中过表达 2-5 倍。",
    detectPatterns: [
      "不仅",
      "而且",
      "不是",
      "而是",
      "既是",
      "又是",
      "既有",
      "又有",
    ],
    rewriteSuggestion:
      "「not only X but also Y」「不是 X 而是 Y」→ 直接说你想说的那一件事；三连排比换成两个或四个，打破节奏；分词从句收尾拆成带限定动词的短句。",
    promptInstruction:
      "避免高发句式模板：「不仅…而且…」「不是…而是…」只说你要说的那一件事；避免三连排比（改为两个或四个）；避免现在/过去分词从句收尾（拆成独立短句）；避免名词化主语。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-forbid-filter-words",
    name: "[sepia] 禁止滤镜词",
    type: "forbidden",
    severity: "medium",
    description:
      "sepia 表层 §3 filter words：felt/seemed/realized/noticed/knew/watched as —— 中文对应「感到、似乎、意识到、注意到、知道、看着…」。删除滤镜，直接呈现事物。",
    detectPatterns: [
      "似乎",
      "仿佛",
      "好像",
      "意识到",
      "注意到",
      "察觉到",
      "感受到",
      "感觉到",
      "看着",
      "听着",
      "想着",
    ],
    rewriteSuggestion:
      "删掉滤镜词，直接呈现被感知的事物或动作本身（「她似乎很伤心」→「她哭了」）。",
    promptInstruction:
      "删除滤镜词（似乎、仿佛、好像、意识到、注意到、感受到、看着、听着）。直接呈现被感知的事物或动作，不要让叙事者站在角色与读者之间转述。",
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-risk-uniform-sentence-length",
    name: "[sepia] 句长过于均匀",
    type: "risk",
    severity: "medium",
    description:
      "sepia 表层 §5 + languages/zh.md §1：AI 句长离散度更小（中文句长 SD 人类 9.25 vs ChatGPT 6.73 词），短句尾与长句尾都更少。句长均匀是机器节奏。",
    detectPatterns: [],
    rewriteSuggestion:
      "拉开句长分布：插入短句，允许偶尔的长句；让相邻句长度差异更大；不要每句都中等长度。",
    promptInstruction:
      "句子长度要有明显离散度：允许很短的句子，也允许偶尔的长句，拉大相邻句的长度差。避免每句都是中等长度、节奏均匀。切忌全篇统一短句（那是另一种节拍器）。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
  {
    key: "sepia-encourage-zh-human-register",
    name: "[sepia] 恢复中文口语化人类语域",
    type: "encourage",
    severity: "medium",
    description:
      "sepia languages/zh.md §1 + style-pass §4：AI 中文语气词密度低（人类 5 倍于 ChatGPT）、连词过多（「和」人类 4.13 vs AI 11.76/篇）、双音节词占比高（人类单音节 0.483 vs AI 0.379）。需恢复口语语域。",
    detectPatterns: [],
    rewriteSuggestion:
      "适度点缀语气词（吧、呢、啊、嘛）、朴素因果连词（因为、所以）、直接问句；减少「和/与/以及」的连词链；避免双音节膨胀（「进行查看」→「看」）。恢复是点缀而非灌水。",
    promptInstruction:
      "中文写作适度恢复人类口语语域：少量使用语气词（吧、呢、啊、嘛）与朴素连词（因为、所以）；避免连词堆叠（「和/与/以及」链），单句连词不宜过多；避免双音节膨胀（「进行查看」写作「看」）。恢复要克制——机器编辑的痕迹恰恰是它灌入的填充词，改动后须执行删除测试：加的词删掉后句子仍通、意思不变，即为填充，应删。",
    autoRewrite: false,
    enabled: true,
    globalBaselineEnabled: true,
  },
];
