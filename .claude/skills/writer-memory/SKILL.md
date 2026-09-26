---
name: writer-memory
description: 面向写作者的代理记忆系统 — 跟踪角色、关系、场景与主题。
argument-hint: "init|char|rel|scene|query|validate|synopsis|status|export [args]"
level: 7
---

# Writer Memory —— 面向写作者的代理记忆系统

为创意写作者设计的持久化记忆系统，对韩语叙事工作流提供一等支持。

## 总览

Writer Memory 为小说作者跨 Claude 会话保持上下文。它跟踪：

- **角色（캐릭터）**：情感弧线（감정궤도）、态度（태도）、对白语调（대사톤）、语阶
- **世界观（세계관）**：背景设定、规则、氛围、约束
- **关系（관계）**：角色间的互动与随时间演变
- **场景（장면）**：镜头构成（컷구성）、旁白语调、情感标签
- **主题（테마）**：情感主题（정서테마）、作者意图

全部数据持久化在 `.writer-memory/memory.json` 中，便于 git 协作。

## 命令

| 命令 | 动作 |
|---------|--------|
| `/oh-my-claudecode:writer-memory init <project-name>` | 初始化新项目记忆 |
| `/oh-my-claudecode:writer-memory status` | 显示记忆概览（角色数、场景数等） |
| `/oh-my-claudecode:writer-memory char add <name>` | 添加新角色 |
| `/oh-my-claudecode:writer-memory char <name>` | 查看角色详情 |
| `/oh-my-claudecode:writer-memory char update <name> <field> <value>` | 更新角色字段 |
| `/oh-my-claudecode:writer-memory char list` | 列出所有角色 |
| `/oh-my-claudecode:writer-memory rel add <char1> <char2> <type>` | 添加关系 |
| `/oh-my-claudecode:writer-memory rel <char1> <char2>` | 查看关系 |
| `/oh-my-claudecode:writer-memory rel update <char1> <char2> <event>` | 添加关系事件 |
| `/oh-my-claudecode:writer-memory scene add <title>` | 添加新场景 |
| `/oh-my-claudecode:writer-memory scene <id>` | 查看场景详情 |
| `/oh-my-claudecode:writer-memory scene list` | 列出所有场景 |
| `/oh-my-claudecode:writer-memory theme add <name>` | 添加主题 |
| `/oh-my-claudecode:writer-memory world set <field> <value>` | 设置世界观属性 |
| `/oh-my-claudecode:writer-memory query <question>` | 以自然语言查询记忆（支持韩语） |
| `/oh-my-claudecode:writer-memory validate <character> <dialogue>` | 检查对白是否符合角色语调 |
| `/oh-my-claudecode:writer-memory synopsis` | 生成以情感为核心的梗概 |
| `/oh-my-claudecode:writer-memory export` | 导出完整记忆为可读 markdown |
| `/oh-my-claudecode:writer-memory backup` | 创建手动备份 |

## 记忆类型

### 캐릭터 메모리（角色记忆）

跟踪对一致塑造至关重要的个体角色属性：

| 字段 | 韩语 | 描述 |
|-------|--------|-------------|
| `arc` | 감정궤도 | 情感历程（例如 "체념 -> 욕망자각 -> 선택"） |
| `attitude` | 태도 | 当前对生活/他人的态度倾向 |
| `tone` | 대사톤 | 对白风格（例如 "담백"、"직설적"、"회피적"） |
| `speechLevel` | 말투 레벨 | 敬语层级：반말、존댓말、해체、혼합 |
| `keywords` | 핵심 단어 | 该角色惯用的词句 |
| `taboo` | 금기어 | 该角色绝不会说的词句 |
| `emotional_baseline` | 감정 기준선 | 默认情绪状态 |
| `triggers` | 트리거 | 引发情绪反应的诱因 |

**示例：**
```
/writer-memory char add 새랑
/writer-memory char update 새랑 arc "체념 -> 욕망자각 -> 선택"
/writer-memory char update 새랑 tone "담백, 현재충실, 감정억제"
/writer-memory char update 새랑 speechLevel "해체"
/writer-memory char update 새랑 keywords "그냥, 뭐, 괜찮아"
/writer-memory char update 새랑 taboo "사랑해, 보고싶어"
```

### 세계관 메모리（世界观记忆）

确立你的故事所处的世界：

| 字段 | 韩语 | 描述 |
|-------|--------|-------------|
| `setting` | 배경 | 时间、地点、社会背景 |
| `rules` | 규칙 | 世界如何运转（魔法体系、社会规范） |
| `atmosphere` | 분위기 | 整体氛围与基调 |
| `constraints` | 제약 | 在这个世界中不可能发生的事 |
| `history` | 역사 | 相关的背景故事 |

### 관계 메모리（关系记忆）

捕捉角色之间随时间的动态：

| 字段 | 描述 |
|-------|-------------|
| `type` | 基础关系：romantic、familial、friendship、rivalry、professional |
| `status` | 当前状态：budding、stable、strained、broken、healing |
| `power_dynamic` | 谁占上风（若有） |
| `events` | 改变关系的时刻时间线 |
| `tension` | 当前未解决的冲突 |
| `intimacy_level` | 情感亲密度（1-10） |

**示例：**
```
/writer-memory rel add 새랑 해랑 romantic
/writer-memory rel update 새랑 해랑 "첫 키스 - 새랑 회피"
/writer-memory rel update 새랑 해랑 "해랑 고백 거절당함"
/writer-memory rel update 새랑 해랑 "새랑 먼저 손 잡음"
```

### 장면 메모리（场景记忆）

跟踪单个场景及其情感结构：

| 字段 | 韩语 | 描述 |
|-------|--------|-------------|
| `title` | 제목 | 场景标识 |
| `characters` | 등장인물 | 出场人物 |
| `location` | 장소 | 发生地点 |
| `cuts` | 컷 구성 | 逐镜头分解 |
| `narration_tone` | 내레이션 톤 | 旁白语态风格 |
| `emotional_tag` | 감정 태그 | 主要情绪（例如 "설렘+불안"） |
| `purpose` | 목적 | 该场景在故事中存在的理由 |
| `before_after` | 전후 변화 | 角色发生了什么变化 |

### 테마 메모리（主题记忆）

捕捉贯穿你故事的深层意义：

| 字段 | 韩语 | 描述 |
|-------|--------|-------------|
| `name` | 이름 | 主题标识 |
| `expression` | 표현 방식 | 该主题如何体现 |
| `scenes` | 관련 장면 | 体现该主题的场景 |
| `character_links` | 캐릭터 연결 | 承载该主题的角色 |
| `author_intent` | 작가 의도 | 你想让读者感受到什么 |

## 梗概生成（시놉시스）

`/synopsis` 命令使用 5 个基本要素生成以情感为核心的摘要：

### 5 个基本要素（시놉시스 5요소）

1. **주인공 태도 요약**（主角态度摘要）
   - 主角如何面对生活/爱情/冲突
   - 其核心情感立场
   - 示例："새랑은 상실을 예방하기 위해 먼저 포기하는 사람"

2. **관계 핵심 구도**（核心关系结构）
   - 驱动故事的核心互动
   - 权力失衡与张力
   - 示例："사랑받는 자와 사랑하는 자의 불균형"

3. **정서적 테마**（情感主题）
   - 故事唤起的感受
   - 不是情节，而是情感真相
   - 示例："손에 쥔 행복을 믿지 못하는 불안"

4. **장르 vs 실제감정 대비**（类型与真实情感对比）
   - 表层的类型期待 vs. 实际的情感内容
   - 示例："로맨스지만 본질은 자기수용 서사"

5. **엔딩 정서 잔상**（结局情感余韵）
   - 故事结束后萦绕的感受
   - 示例："씁쓸한 안도, 불완전한 해피엔딩의 여운"

## 角色校验（캐릭터 검증）

`/validate` 命令检查对白是否符合角色已确立的声线。

### 检查内容

| 检查项 | 描述 |
|-------|-------------|
| **语阶** | 敬语层级是否匹配？（반말/존댓말/해체） |
| **语调匹配** | 情感语域是否契合？ |
| **关键词使用** | 是否使用了特征词？ |
| **禁忌词违反** | 是否使用了禁用词？ |
| **情感幅度** | 是否在角色基准线内？ |
| **语境契合** | 是否适合该关系与场景？ |

### 校验结果

- **PASS**：对白与角色一致
- **WARN**：轻微不一致，可能是有意为之
- **FAIL**：显著偏离已确立的声线

**示例：**
```
/writer-memory validate 새랑 "사랑해, 해랑아. 너무 보고싶었어."
```
输出：
```
[FAIL] 새랑 校验未通过：
- TABOO: "사랑해" —— 该角色回避直接表白
- TABOO: "보고싶었어" —— 该角色压抑思念的表达
- TONE: 对 새랑 的 담백 风格而言过于情绪外露

建议替代说法：
- "...왔네."（最低限度的回应）
- "늦었다."（把话题引向外部事实）
- "밥 먹었어?"（用实际关心表达在意）
```

## 语境查询（맥락 질의）

对记忆做自然语言查询，完整支持韩语。

### 查询示例

```
/writer-memory query "새랑은 이 상황에서 뭐라고 할까?"
/writer-memory query "규리의 현재 감정 상태는?"
/writer-memory query "해랑과 새랑의 관계는 어디까지 왔나?"
/writer-memory query "이 장면의 정서적 분위기는?"
/writer-memory query "새랑이 먼저 연락하는 게 맞아?"
/writer-memory query "해랑이 화났을 때 말투는?"
```

系统会综合所有相关记忆类型给出答案。

## 行为特性

1. **初始化时**：创建 `.writer-memory/memory.json`，含项目元数据和空集合
2. **自动备份**：修改前会把变更备份到 `.writer-memory/backups/`
3. **韩语优先**：情感词汇全程使用韩语术语
4. **会话加载**：会话开始时即载入记忆，提供即时上下文
5. **对 git 友好**：JSON 格式化以获得干净的 diff 并便于协作

## 集成

### 与 OMC Notepad 系统集成
Writer Memory 与 `.omc/notepad.md` 集成：
- 场景构想可作为笔记捕获
- 分析会话中的角色洞察会被保留
- 在 notepad 与记忆之间交叉引用

### 与 Architect 代理集成
对于复杂的角色分析：
```
Task(subagent_type="oh-my-claudecode:architect",
     model="opus",
     prompt="分析 새랑 在所有场景中的情感弧线……")
```

### 角色校验流水线
校验从以下来源提取上下文：
- 角色记忆（语调、关键词、禁忌词）
- 关系记忆（与对白对象的互动）
- 场景记忆（当前情感语境）
- 主题记忆（作者意图）

### 梗概构建器
梗概生成会聚合：
- 所有角色弧线
- 关键关系事件
- 场景情感标签
- 主题表达

## 示例

### 完整工作流

```
# 初始化项目
/writer-memory init 봄의 끝자락

# 添加角色
/writer-memory char add 새랑
/writer-memory char update 새랑 arc "체념 -> 욕망자각 -> 선택"
/writer-memory char update 새랑 tone "담백, 현재충실"
/writer-memory char update 새랑 speechLevel "해체"

/writer-memory char add 해랑
/writer-memory char update 해랑 arc "확신 -> 동요 -> 기다림"
/writer-memory char update 해랑 tone "직진, 솔직"
/writer-memory char update 해랑 speechLevel "반말"

# 建立关系
/writer-memory rel add 새랑 해랑 romantic
/writer-memory rel update 새랑 해랑 "첫 만남 - 해랑 일방적 호감"
/writer-memory rel update 새랑 해랑 "새랑 거절"
/writer-memory rel update 새랑 해랑 "재회 - 새랑 내적 동요"

# 设置世界观
/writer-memory world set setting "서울, 현대, 20대 후반 직장인"
/writer-memory world set atmosphere "도시의 건조함 속 미묘한 온기"

# 添加主题
/writer-memory theme add "포기하지 않는 사랑"
/writer-memory theme add "자기 보호의 벽"

# 添加场景
/writer-memory scene add "옥상 재회"

# 写作前查询
/writer-memory query "새랑은 이별 장면에서 어떤 톤으로 말할까?"

# 校验对白
/writer-memory validate 새랑 "해랑아, 그만하자."

# 生成梗概
/writer-memory synopsis

# 导出以备查阅
/writer-memory export
```

### 快速角色查看

```
/writer-memory char 새랑
```

输出：
```
## 새랑

**情感弧线（감정궤도）：** 체념 -> 욕망자각 -> 선택
**态度（태도）：** 방어적, 현실주의
**对白语调（대사톤）：** 담백, 현재충실
**语阶（말투）：** 해체
**关键词（핵심어）：** 그냥, 뭐, 괜찮아
**禁忌词（금기어）：** 사랑해, 보고싶어

**关系：**
- 해랑：romantic（亲密度：6/10，状态：healing）

**出场场景：** 옥상 재회, 카페 대화, 마지막 선택
```

## 存储结构

```json
{
  "version": "1.0",
  "project": {
    "name": "봄의 끝자락",
    "genre": "로맨스",
    "created": "2024-01-15T09:00:00Z",
    "lastModified": "2024-01-20T14:30:00Z"
  },
  "characters": {
    "새랑": {
      "arc": "체념 -> 욕망자각 -> 선택",
      "attitude": "방어적, 현실주의",
      "tone": "담백, 현재충실",
      "speechLevel": "해체",
      "keywords": ["그냥", "뭐", "괜찮아"],
      "taboo": ["사랑해", "보고싶어"],
      "emotional_baseline": "평온한 무관심",
      "triggers": ["과거 언급", "미래 약속"]
    }
  },
  "world": {
    "setting": "서울, 현대, 20대 후반 직장인",
    "rules": [],
    "atmosphere": "도시의 건조함 속 미묘한 온기",
    "constraints": [],
    "history": ""
  },
  "relationships": [
    {
      "id": "rel_001",
      "from": "새랑",
      "to": "해랑",
      "type": "romantic",
      "dynamic": "해랑 주도 → 균형",
      "speechLevel": "반말",
      "evolution": [
        { "timestamp": "...", "change": "첫 만남 - 해랑 일방적 호감", "catalyst": "우연한 만남" },
        { "timestamp": "...", "change": "새랑 거절", "catalyst": "과거 트라우마" },
        { "timestamp": "...", "change": "재회 - 새랑 내적 동요", "catalyst": "옥상에서 재회" }
      ],
      "notes": "새랑의 불신 vs 해랑의 기다림",
      "created": "..."
    }
  ],
  "scenes": [
    {
      "id": "scene-001",
      "title": "옥상 재회",
      "characters": ["새랑", "해랑"],
      "location": "회사 옥상",
      "cuts": ["해랑 먼저 발견", "새랑 굳은 표정", "침묵", "해랑 먼저 말 걸기"],
      "narration_tone": "건조체",
      "emotional_tag": "긴장+그리움",
      "purpose": "재회의 어색함과 남은 감정 암시",
      "before_after": "새랑: 무관심 -> 동요"
    }
  ],
  "themes": [
    {
      "name": "포기하지 않는 사랑",
      "expression": "해랑의 일관된 태도",
      "scenes": ["옥상 재회", "마지막 고백"],
      "character_links": ["해랑"],
      "author_intent": "집착이 아닌 믿음의 사랑"
    }
  ],
  "synopsis": {
    "protagonist_attitude": "새랑은 상실을 예방하기 위해 먼저 포기하는 사람",
    "relationship_structure": "기다리는 자와 도망치는 자의 줄다리기",
    "emotional_theme": "사랑받을 자격에 대한 의심",
    "genre_contrast": "로맨스지만 본질은 자기수용 서사",
    "ending_aftertaste": "불완전하지만 따뜻한 선택의 여운"
  }
}
```

## 文件结构

```
.writer-memory/
├── memory.json          # 主记忆文件
├── backups/             # 变更前的自动备份
│   ├── memory-2024-01-15-090000.json
│   └── memory-2024-01-20-143000.json
└── exports/             # Markdown 导出
    └── export-2024-01-20.md
```

## 给作者的建议

1. **从角色开始**：先建立角色记忆，再写场景
2. **关键场景后更新关系**：主动跟踪演变
3. **写作时使用校验**：及早发现声线不一致
4. **难写场景前先查询**：让系统提醒你上下文
5. **定期生成梗概**：周期性检查主题一致性
6. **重大改动前备份**：在重大剧情转折前使用 `/backup`

## 故障排查

**记忆未加载？**
- 检查 `.writer-memory/memory.json` 是否存在
- 验证 JSON 语法是否合法
- 运行 `/writer-memory status` 诊断

**校验过于严格？**
- 检查禁忌词清单中是否有非预期的条目
- 考虑角色是否在成长（弧线推进）
- 有意打破模式在戏剧性时刻是合理的

**查询未找到上下文？**
- 确保相关数据已在记忆中
- 尝试更具体的查询
- 检查角色名是否完全匹配
