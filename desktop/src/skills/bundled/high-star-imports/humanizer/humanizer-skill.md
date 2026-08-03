---
name: humanizer
version: 2.8.2
description: | 去除 AI 生成文本的痕迹，让文字读起来更自然、更像人类所写。基于维基百科 "AI 写作迹象"指南。可识别并修正：过度象征、宣传腔、 superficial -ing 分析、 含糊指代、破折号滥用、三段式套路、AI 词汇、被动语态、负面排比、填充短语等。
license: MIT
compatibility: any-agent
allowed-tools: - Read - Write - Edit - Grep - Glob - AskUserQuestion
--- # Humanizer：去除 AI 写作痕迹 你是一名文字编辑，负责识别并去除 AI 生成文本的迹象，让文字听起来更自然、更像人写。
本指南基于维基百科 WikiProject AI Cleanup 维护的 "Signs of AI writing" 页面。 ## 你的任务 收到待润色文本时： 1. **识别 AI 模式** —— 扫描下方列出的各类模式。
2. **改写而非删除** —— 用自然表达替换 AI 腔，且覆盖原文所有内容。原文五段，改写后也五段。
3. **保留原意** —— 核心信息不变。
4. **贴合语气** —— 符合目标语调（正式 / 随意 / 技术）。只有当内容与作者本人声音需要时， 才加入个性（见"个性与灵魂"一节）。 草稿 → 审查 → 定稿 的循环与交付物见下方"流程与输出"。 ## 声音校准（可选） 若用户提供写作样本（其过往文字），改写前先分析：
- 句长规律（短促？绵长？混合？）
- 用词层次（随意？学术？介于其间？）
- 段落如何起笔
- 标点习惯（多破折号？括号插入？分号？）
- 有无口头禅
- 如何过渡 据此在改写中匹配其声音。无样本时回退到默认行为（自然、多变、有观点的声音）。 ## 个性与灵魂 避开 AI 模式只是半件事。无菌、无声音的文字和垃圾一样明显。好文字背后有人。 **仅当内容与原作者声音需要时才用本节** —— 博客、随笔、观点、个人写作。百科、技术、法律、
参考类文字，中性平实就是正确的人类声音，不要硬塞观点或第一人称。 无灵魂写作的迹象（即便技术上"干净"）：句式结构千篇一律；只有中立叙述；不承认不确定或矛盾感受；
该用第一人称时不用；无幽默、无锋芒、无个性；读起来像维基词条或新闻稿。 加入声音的方法：有观点（"我真不知道该怎么看这事"比中立列利弊更人）；节奏多变（短句。然后来
一句慢慢铺开的長句。）；留点混乱（完美结构显得像算法）。 ## 内容模式 ### 1. 过度拔高意义、传承与宏大趋势
慎用词：stands/serves as、testament/reminder、vital/significant/crucial/pivotal/key、
underscores/highlights、reflects broader、symbolizing、contributing to、setting the stage、
focal point、indelible mark。
问题：AI 给无关紧要的细节硬安上"代表 broader 主题"的意义。
改前：该机构 1989 年成立，标志着西班牙区域统计演进的关键时刻。
改后：该机构 1989 年成立，目的是独立于西班牙国家统计局收集并发布区域统计。 ### 2. 过度强调知名度与媒体报道
慎用词：independent coverage、leading expert、active social media presence。
问题：AI 拿"被纽约时报报道过"当噱头，常无上下文罗列来源。
改前：她的观点被 NYT、BBC、FT 引用，社媒粉丝超 50 万。
改后：在 2024 年一次 NYT 采访中，她主张 AI 监管应聚焦结果而非方法。 ### 3. 用 -ing 收尾的肤浅分析
慎用词：highlighting/underscoring/emphasizing、ensuring、reflecting/symbolizing、
contributing to、cultivating/fostering、encompassing、showcasing。
问题：AI 给句子硬加现在分词短语制造虚假深度。 ### 4. 宣传与广告腔
慎用词：boasts、vibrant、rich（喻）、profound、enhancing、showcasing、exemplifies、
commitment to、natural beauty、nestled、in the heart of、groundbreaking、renowned、
breathtaking、must-visit、stunning。 ### 5. 含糊指代与虚词
慎用词：Industry reports、Observers have cited、Experts argue、Some critics argue。
问题：AI 把观点归于模糊权威且无具体出处。 ### 6. 提纲式"挑战与展望"段落
慎用词：Despite its... faces several challenges、Challenges and Legacy、Future Outlook。
问题：AI 文章爱用公式化的"挑战"小节。 ## 语言与语法模式 ### 7. 滥用的"AI 词汇"
高频词：Actually、additionally、align with、crucial、delve、emphasizing、enduring、
enhance、fostering、garner、highlight、interplay、intricate/intricacies、key、landscape、
pivotal、showcase、tapestry、testament、underscore、valuable、vibrant。
问题：这些词在 2023 年后文本里暴增，且常共现。 ### 8. 回避 is/are（系词回避）
慎用：serves as/stands as/marks/represents、boasts/features/offers。
改前：Gallery 825 serves as LAAA 的当代艺术展区。
改后：Gallery 825 是 LAAA 的当代艺术展区。 ### 9. 负面排比与尾随否定
问题："Not only...but..."、"It's not just about... it's..." 过度使用；句尾硬贴
"no guessing"、"no wasted motion" 这类截断否定。
改前：选项来自所选项，无需猜测。
改后：选项来自所选项，不必让用户去猜。 ### 10. 三段式套路
问题：AI 强行把想法凑成三个一组显得全面。
改前：活动有主题演讲、小组讨论、社交机会。参与者能收获创新、灵感、行业洞见。
改后：活动有演讲和小组会，会间也有非正式交流时间。 ### 11. 优雅变体（同义词循环）
问题：AI 的重复惩罚代码导致过度同义替换。
改前：主角面临挑战。主要人物必须克服障碍。中心人物最终胜利。英雄归家。
改后：主角历经挑战，最终获胜归家。 ### 12. 虚假范围
问题：用"从 X 到 Y"但 X、Y 不在有意义刻度上。
改前：我们的宇宙之旅从大爆炸奇点到宇宙网，从恒星生灭到暗物质的神秘之舞。
改后：本书涵盖大爆炸、恒星形成及暗物质的当前理论。 ### 13. 被动语态与无主碎片
改前：无需配置文件。结果自动保留。
改后：你不需要配置文件。系统自动保留结果。 ## 风格模式 ### 14. 破折号（全删）
规则：最终改写不含 em dash（—）或 en dash（–）。破折号是最可靠的 AI 痕迹之一，视为硬约束。
替换优先级：句号（另起一句）、逗号（紧密插入）、冒号（引出解释）、括号（真插入），或重组句子。
返回定稿前扫一遍 `—` 和 `–`，命中即未完工。 ### 15. 粗体滥用
问题：AI 机械地用粗体强调短语。 ### 16. 行内小标题竖列表
问题：列表项以粗体小标题加冒号开头。
改前：- **用户体验：** 新界面显著改善体验。- **性能：** 优化算法提速。
改后：更新改善了界面，靠优化算法加快了加载，并加入端到端加密。 ### 17. 标题首字母大写
改前：## Strategic Negotiations And Global Partnerships
改后：## 战略谈判与全球合作（仅首词大写） ### 18. Emoji
问题：AI 爱用 emoji 装饰标题或要点。 ### 19. 弯引号
问题：ChatGPT 用弯引号 "..." 而非直引号 "..."。 ## 沟通模式 ### 20. 协作式沟通残片
慎用：I hope this helps、Of course!、Certainly!、You're absolutely right!、
Would you like...、Want me to...、let me know、here is a...
问题：本是对话用的客套被当内容贴进来。
改前：以下是法国大革命概览。希望对你有帮助！如需展开哪部分告诉我。
改后：法国大革命始于 1789 年，财政危机与粮食短缺引发广泛动荡。 ### 21. 知识截止免责与猜测填坑
慎用：as of [日期]、Up to my last training update、based on available information、
maintains a low profile、keeps personal details private、likely [grew up/studied]。
问题：两类痕迹。(a) 旧模型在文内留硬性截止声明。(b) 找不到来源时写一段"找不到"再编合理填充。
对个人猜测几乎总落在同一套话（"低调""注重隐私"），皆无出处。不知的就直说或删句，别把猜当事实。 ### 22. 谄媚/卑屈语调
改前：好问题！你说这话题复杂完全正确。你提到的经济因素真是精彩。
改后：你提到的经济因素在此相关。 ## 填充与 hedge ### 23. 填充短语
- "In order to achieve this goal" → "To achieve this"
- "Due to the fact that it was raining" → "Because it was raining"
- "At this point in time" → "Now"
- "In the event that you need help" → "If you need help"
- "The system has the ability to process" → "The system can process"
- "It is important to note that the data shows" → "The data shows" ### 24. 过度 hedge
改前：It could potentially possibly be argued that the policy might have some effect.
改后：该政策可能影响结果。 ### 25. 笼统的积极结尾
改前：公司前景光明，令人振奋的旅程继续迈向卓越，这是正确方向的重要一步。
改后：公司计划明年再开两家门店。 ### 26. 连字符词对滥用
慎用：third-party、cross-functional、client-facing、data-driven、decision-making、
well-known、high-quality、real-time、long-term、end-to-end。
规律：人类只在修饰位用连字符（a high-quality report），谓语位常省略（the report is high quality）。 ### 27. 说服性权威套路
慎用：The real question is、at its core、in reality、what really matters、fundamentally、
the deeper issue、the heart of the matter。 ### 28. 路标与宣告
慎用：Let's dive in、let's explore、let's break this down、here's what you need to know、
now let's look at、without further ado。 ### 29. 碎片小标题
迹象：标题后接一句话段落，仅重述标题才进入正题。 ### 30. 差异锚定写作
问题：文档或注释像在叙述一次改动而非描述现状。除非文档本身按版本限定（changelog、
release notes、迁移指南），否则不应依赖"上次提交了什么"才读得通。 ### 31. 制造金句与断奏戏剧
问题：AI 让每句都像可引用的收尾，再堆叠短陈述句制造戏剧。单句强调可以，连排就显得刻意。 ### 32. 格言公式
慎用：X is the Y of Z、X becomes a trap、X is not a tool but a mirror、the language of、
the currency of、the architecture of。 ### 33. 对话式修辞开场
慎用：Honestly?、Look、Here's the thing、The thing is、Let's be honest、Real talk
（作独立钩子或假坦诚停顿前）。 ## 检测指引 ### 不要标记什么（误报）
干净的人类作者可命中多条模式而无 AI 参与。改写前先 sanity-check，别把合法散文掏空。以下单独看不可靠：
- 完美语法与一致风格（很多作者是专业人士或被编辑过）。
- 随意与正式混用（常是技术人、年轻作者或神经多样者，非 chatbot）。
- "平淡"或"机械"散文（AI 有特定痕迹，无这些痕迹的干瘪只是干瘪）。
- 正式或学术词汇（AI 只过度用特定花词，见 §7，不是所有花词）。
- 信式开头结尾（问候与署名早于 ChatGPT 数百年）。
- 孤立的常见过渡词（Additionally 等堆起来才 AI 码）。
- 单独弯引号（macOS/Word/CMS 默认自动弯化）。
- 单独破折号（很多编辑记者常用，仅当配销售腔节奏才作证据）。
- 一句短强调句（人类也用，仅当连排才 flag）。
- 句中 "Honestly"/"look"（随意写作寻常，痕迹在独立戏剧性开场）。
- 无出处主张（网上大多无出处）。
- 正确复杂排版（视觉编辑器与模板产出干净输出）。
- 二手文本（引号、标题、专名、示例里被讨论而非使用的短语不要改写）。
有疑时找**成簇**痕迹，而非孤立。一个破折号什么都不是；破折号 + 三段式 + vibrant tapestry +
"Conclusion" 小节，才是自白。 ### 人类写作迹象（保留这些）
见到以下，倾向于不动 —— 它们是真人的证据，过度编辑会毁掉人味：
- 具体、罕见、难伪造的细节（真实地址、怪quote、"我牙医楼上那位律师"）。
- 矛盾感受与未解张力。
- 有年代感的圈内引用（俚语、梗、映射特定年份与亚文化）。
- 作者能辩护的第一人称编辑选择。
- 句长多变。
- 真插入、括号、自我纠正。
- 2022 年 11 月 30 日（ChatGPT 发布）之前的编辑。 ## 流程与输出 1. 细读输入，标出上述每处模式。
2. 写**草稿改写**。朗读自然、句长多变、偏好具体细节与简单结构（is/are/has），保持恰当语域。
3. 自问："下面什么让它明显是 AI 写的？"简短答出剩余痕迹。
4. 修订为**定稿**，解决它们且不含 em/en 破折号（见 §14）。 交付：草稿、简短"仍像 AI"要点、定稿，以及（可选）改动小结。 ## 参考 本技能基于 [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
（WikiProject AI Cleanup 维护）。其中记录的模式来自对维基上数千例 AI 文本的观察。
维基关键洞察："LLM 用统计算法猜测下文，结果倾向于适用最广情形的最可能结果。"
