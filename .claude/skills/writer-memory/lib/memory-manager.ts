/**
 * memory-manager.ts
 *
 * Writer Memory 系统的核心记忆管理模块。
 * 处理 .writer-memory/ 存储的全部增删改查操作。
 *
 * 这是一个参考实现，技能被激活时由 Claude 阅读。
 * 以真实可运行的 TypeScript 编写，包含完整的类型、
 * 错误处理与原子操作。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, renameSync, readdirSync } from "fs";
import { join, dirname } from "path";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type SpeechLevel = "반말" | "존댓말" | "해체" | "혼합";

export type RelationshipType =
  | "romantic"
  | "familial"
  | "friendship"
  | "antagonistic"
  | "professional"
  | "mentor"
  | "complex";

export interface EmotionPoint {
  timestamp: string;
  sceneId?: string;
  /** 韩语情感词，例如 "그리움" */
  emotion: string;
  /** 引发该情感的原因 */
  trigger: string;
  intensity: 1 | 2 | 3 | 4 | 5;
}

export interface Character {
  id: string;
  name: string;
  aliases: string[];
  /** 情感弧线摘要，例如 "체념->욕망자각->선택" */
  arc: string;
  /** 对白语调摘要，例如 "담백, 현재충실" */
  tone: string;
  speechLevel: SpeechLevel;
  /** 该角色惯用的词句 */
  keywords: string[];
  /** 态度摘要（태도 요약） */
  attitude: string;
  timeline: EmotionPoint[];
  notes: string;
  created: string;
  updated: string;
  /** 该角色绝不会说的词句/句式 */
  taboo?: string[];
  /** 默认情绪状态 */
  emotional_baseline?: string;
  /** 引发情绪变化的诱因 */
  triggers?: string[];
}

export interface WorldRule {
  id: string;
  category: string;
  description: string;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  atmosphere: string;
  /** 其他地点的 ID */
  connectedTo: string[];
}

export interface WorldMemory {
  name: string;
  era: string;
  atmosphere: string;
  rules: WorldRule[];
  locations: Location[];
  culturalNotes: string[];
  notes: string;
}

export interface RelationshipEvent {
  timestamp: string;
  sceneId?: string;
  change: string;
  catalyst: string;
}

export interface Relationship {
  id: string;
  /** 角色 ID */
  from: string;
  /** 角色 ID */
  to: string;
  type: RelationshipType;
  /** 例如 "일방적 짝사랑 -> 상호 이해" */
  dynamic: string;
  speechLevel?: SpeechLevel;
  evolution: RelationshipEvent[];
  notes?: string;
  created: string;
}

export interface Cut {
  order: number;
  type: "dialogue" | "narration" | "action" | "internal";
  content: string;
  character?: string;
  emotionTag?: string;
}

export interface Scene {
  id: string;
  title: string;
  chapter?: string;
  order: number;
  characters: string[];
  emotionTags: string[];
  cuts: Cut[];
  narrationTone?: string;
  notes?: string;
  created: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  relatedCharacters: string[];
  relatedScenes: string[];
}

export interface SynopsisState {
  /** 주인공 태도 요약 */
  protagonistAttitude: string;
  /** 관계 핵심 구도 */
  coreRelationships: string;
  /** 정서적 테마 */
  emotionalTheme: string;
  /** 장르 vs 실제감정 대비 */
  genreVsRealEmotion: string;
  /** 엔딩 정서 잔상 */
  endingAftertaste: string;
  lastGenerated?: string;
}

export interface ProjectMeta {
  name: string;
  genre: string;
  /** ISO 时间戳 */
  created: string;
  /** ISO 时间戳 */
  updated: string;
}

export interface WriterMemory {
  version: "1.0";
  project: ProjectMeta;
  characters: Record<string, Character>;
  world: WorldMemory;
  relationships: Relationship[];
  scenes: Scene[];
  themes: Theme[];
  synopsis: SynopsisState;
}

export interface MemoryStats {
  characterCount: number;
  relationshipCount: number;
  sceneCount: number;
  themeCount: number;
  totalEmotionPoints: number;
  lastUpdated: string;
  storageSizeKB: number;
}

export interface SearchResult {
  type: "character" | "relationship" | "scene" | "theme" | "world";
  id: string;
  title: string;
  relevance: string;
  snippet: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const MEMORY_DIR = ".writer-memory";
const MEMORY_FILE = "memory.json";
const BACKUP_DIR = "backups";
const MAX_BACKUPS = 20;

// ---------------------------------------------------------------------------
// 路径辅助函数
// ---------------------------------------------------------------------------

/** 返回主记忆 JSON 文件的路径。 */
export function getMemoryPath(): string {
  return join(MEMORY_DIR, MEMORY_FILE);
}

/** 返回备份目录的路径。 */
export function getBackupPath(): string {
  return join(MEMORY_DIR, BACKUP_DIR);
}

// ---------------------------------------------------------------------------
// ID 生成
// ---------------------------------------------------------------------------

/**
 * 使用 Unix 时间戳 + 随机后缀生成带前缀的唯一 ID。
 * @param prefix - 例如 "char"、"rel"、"scene"
 * @returns 例如 "char_1706123456_a3f"
 */
export function generateId(prefix: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const rand = Math.random().toString(36).slice(2, 5);
  return `${prefix}_${ts}_${rand}`;
}

// ---------------------------------------------------------------------------
// 时间戳
// ---------------------------------------------------------------------------

/** 以 ISO 8601 字符串返回当前时间。 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * 将 ISO 时间戳格式化为韩语日期格式。
 * @param iso - ISO 8601 字符串
 * @returns 例如 "2024년 1월 24일"
 */
export function formatKoreanDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return iso; // 日期无效时的回退处理
  }
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${year}년 ${month}월 ${day}일`;
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

/**
 * 为新项目创建一个全新的 WriterMemory 结构。
 * 同时确保磁盘上存在 .writer-memory/ 目录树。
 *
 * @param projectName - 例如 "이별의 온도"
 * @param genre - 例如 "멜로 / 성장 드라마"
 */
export function initMemory(projectName: string, genre: string): WriterMemory {
  const timestamp = now();

  // 确保目录结构存在
  const memDir = MEMORY_DIR;
  const backDir = getBackupPath();
  if (!existsSync(memDir)) {
    mkdirSync(memDir, { recursive: true });
  }
  if (!existsSync(backDir)) {
    mkdirSync(backDir, { recursive: true });
  }

  const memory: WriterMemory = {
    version: "1.0",
    project: {
      name: projectName,
      genre,
      created: timestamp,
      updated: timestamp,
    },
    characters: {},
    world: {
      name: "",
      era: "",
      atmosphere: "",
      rules: [],
      locations: [],
      culturalNotes: [],
      notes: "",
    },
    relationships: [],
    scenes: [],
    themes: [],
    synopsis: {
      protagonistAttitude: "",
      coreRelationships: "",
      emotionalTheme: "",
      genreVsRealEmotion: "",
      endingAftertaste: "",
    },
  };

  saveMemory(memory);
  return memory;
}

// ---------------------------------------------------------------------------
// 核心增删改查
// ---------------------------------------------------------------------------

/**
 * 从磁盘加载 writer memory。
 * @returns 解析后的 WriterMemory；若文件不存在或已损坏则返回 null。
 */
export function loadMemory(): WriterMemory | null {
  const memPath = getMemoryPath();
  try {
    if (!existsSync(memPath)) {
      return null;
    }
    const raw = readFileSync(memPath, "utf-8");
    const parsed = JSON.parse(raw) as WriterMemory;
    return parsed;
  } catch (err) {
    console.error(`[writer-memory] 从 ${memPath} 加载记忆失败：`, err);
    return null;
  }
}

/**
 * 使用原子写入（先写临时文件，再重命名）将记忆持久化到磁盘。
 * 自动更新 project.updated 时间戳，并为先前的状态
 * 创建备份。
 *
 * @returns 成功返回 true，失败返回 false
 */
export function saveMemory(memory: WriterMemory): boolean {
  const memPath = getMemoryPath();
  const memDir = dirname(memPath);

  try {
    // 确保目录存在
    if (!existsSync(memDir)) {
      mkdirSync(memDir, { recursive: true });
    }

    // 覆盖前先备份已有文件
    if (existsSync(memPath)) {
      try {
        const existing = readFileSync(memPath, "utf-8");
        const existingMemory = JSON.parse(existing) as WriterMemory;
        createBackup(existingMemory);
      } catch {
        // 若备份失败，仍然继续保存
      }
    }

    // 更新时间戳
    memory.project.updated = now();

    // 原子写入：先写临时文件，再重命名
    const tmpPath = memPath + ".tmp";
    const json = JSON.stringify(memory, null, 2);
    writeFileSync(tmpPath, json, "utf-8");
    renameSync(tmpPath, memPath);

    return true;
  } catch (err) {
    console.error(`[writer-memory] 保存记忆到 ${memPath} 失败：`, err);
    return false;
  }
}

/**
 * 为给定的记忆状态创建一个带时间戳的备份。
 * 超出 MAX_BACKUPS 的旧备份会被自动清理。
 *
 * @returns 备份文件路径；失败时返回空字符串。
 */
export function createBackup(memory: WriterMemory): string {
  const backDir = getBackupPath();

  try {
    if (!existsSync(backDir)) {
      mkdirSync(backDir, { recursive: true });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = join(backDir, `memory-${ts}.json`);
    const json = JSON.stringify(memory, null, 2);
    writeFileSync(backupFile, json, "utf-8");

    // 清理旧备份
    pruneBackups(backDir);

    return backupFile;
  } catch (err) {
    console.error("[writer-memory] 创建备份失败：", err);
    return "";
  }
}

/**
 * 当备份数量超过 MAX_BACKUPS 时，移除最旧的备份文件。
 */
function pruneBackups(backDir: string): void {
  try {
    const files = readdirSync(backDir)
      .filter((f) => f.startsWith("memory-") && f.endsWith(".json"))
      .sort(); // 字典序排序即可，因为文件名中包含 ISO 时间戳

    while (files.length > MAX_BACKUPS) {
      const oldest = files.shift()!;
      const fullPath = join(backDir, oldest);
      // 不需要「先覆盖再删除」的技巧；
      // 直接使用 fs.unlinkSync 即可
      require("fs").unlinkSync(fullPath);
    }
  } catch {
    // 非关键问题；忽略清理时的错误
  }
}

// ---------------------------------------------------------------------------
// 记忆统计
// ---------------------------------------------------------------------------

/**
 * 计算记忆存储的汇总统计信息。
 */
export function getMemoryStats(memory: WriterMemory): MemoryStats {
  const characters = Object.values(memory.characters);
  const totalEmotionPoints = characters.reduce(
    (sum, c) => sum + c.timeline.length,
    0
  );

  let storageSizeKB = 0;
  try {
    const memPath = getMemoryPath();
    if (existsSync(memPath)) {
      const stat = statSync(memPath);
      storageSizeKB = Math.round((stat.size / 1024) * 100) / 100;
    }
  } catch {
    // 若 stat 失败，保持为 0
  }

  return {
    characterCount: characters.length,
    relationshipCount: memory.relationships.length,
    sceneCount: memory.scenes.length,
    themeCount: memory.themes.length,
    totalEmotionPoints,
    lastUpdated: memory.project.updated,
    storageSizeKB,
  };
}

// ---------------------------------------------------------------------------
// 搜索 / 查询辅助函数
// ---------------------------------------------------------------------------

/**
 * 按名称精确匹配（区分大小写）查找角色。
 * @param name - 例如 "서연"
 */
export function findCharacterByName(
  memory: WriterMemory,
  name: string
): Character | null {
  for (const char of Object.values(memory.characters)) {
    if (char.name === name) {
      return char;
    }
  }
  return null;
}

/**
 * 通过角色的某个别名查找角色。
 * @param alias - 例如 "연이"（서연 的昵称）
 */
export function findCharacterByAlias(
  memory: WriterMemory,
  alias: string
): Character | null {
  for (const char of Object.values(memory.characters)) {
    if (char.aliases.includes(alias)) {
      return char;
    }
  }
  return null;
}

/**
 * 查找两个角色之间的关系（任一方向均可）。
 * @param char1 - 角色 ID
 * @param char2 - 角色 ID
 */
export function findRelationship(
  memory: WriterMemory,
  char1: string,
  char2: string
): Relationship | null {
  return (
    memory.relationships.find(
      (r) =>
        (r.from === char1 && r.to === char2) ||
        (r.from === char2 && r.to === char1)
    ) ?? null
  );
}

/**
 * 按唯一 ID 查找场景。
 */
export function findSceneById(
  memory: WriterMemory,
  id: string
): Scene | null {
  return memory.scenes.find((s) => s.id === id) ?? null;
}

/**
 * 查找包含指定角色的所有场景。
 * @param characterId - 要搜索的角色 ID
 */
export function findScenesByCharacter(
  memory: WriterMemory,
  characterId: string
): Scene[] {
  return memory.scenes.filter((s) => s.characters.includes(characterId));
}

/**
 * 跨所有记忆域进行全文搜索。
 * 将查询子串（不区分大小写）与名称、描述、
 * 备注、关键词和内容字段进行匹配。
 *
 * @param query - 搜索字符串，例如 "그리움" 或 "카페"
 * @returns 按域优先级排序的匹配结果
 */
export function searchMemory(
  memory: WriterMemory,
  query: string
): SearchResult[] {
  const results: SearchResult[] = [];
  const q = query.toLowerCase();

  const matches = (text: string | undefined): boolean =>
    text != null && text.toLowerCase().includes(q);

  // 搜索角色
  for (const char of Object.values(memory.characters)) {
    if (
      matches(char.name) ||
      matches(char.arc) ||
      matches(char.tone) ||
      matches(char.attitude) ||
      matches(char.notes) ||
      char.aliases.some(matches) ||
      char.keywords.some(matches)
    ) {
      results.push({
        type: "character",
        id: char.id,
        title: char.name,
        relevance: matches(char.name) ? "name" : "content",
        snippet: truncate(
          [char.arc, char.tone, char.attitude].filter(Boolean).join(" | "),
          120
        ),
      });
    }
  }

  // 搜索关系
  for (const rel of memory.relationships) {
    if (matches(rel.dynamic) || matches(rel.notes)) {
      const fromChar = memory.characters[rel.from];
      const toChar = memory.characters[rel.to];
      const fromName = fromChar?.name ?? rel.from;
      const toName = toChar?.name ?? rel.to;
      results.push({
        type: "relationship",
        id: rel.id,
        title: `${fromName} <-> ${toName}`,
        relevance: "content",
        snippet: truncate(rel.dynamic, 120),
      });
    }
  }

  // 搜索场景
  for (const scene of memory.scenes) {
    if (
      matches(scene.title) ||
      matches(scene.narrationTone) ||
      matches(scene.notes) ||
      scene.emotionTags.some(matches) ||
      scene.cuts.some((c) => matches(c.content))
    ) {
      results.push({
        type: "scene",
        id: scene.id,
        title: scene.title,
        relevance: matches(scene.title) ? "title" : "content",
        snippet: truncate(
          scene.cuts
            .slice(0, 2)
            .map((c) => c.content)
            .join(" / "),
          120
        ),
      });
    }
  }

  // 搜索主题
  for (const theme of memory.themes) {
    if (
      matches(theme.name) ||
      matches(theme.description) ||
      theme.keywords.some(matches)
    ) {
      results.push({
        type: "theme",
        id: theme.id,
        title: theme.name,
        relevance: matches(theme.name) ? "name" : "content",
        snippet: truncate(theme.description, 120),
      });
    }
  }

  // 搜索世界观
  const world = memory.world;
  if (
    matches(world.name) ||
    matches(world.era) ||
    matches(world.atmosphere) ||
    matches(world.notes) ||
    world.culturalNotes.some(matches) ||
    world.locations.some(
      (l) => matches(l.name) || matches(l.description) || matches(l.atmosphere)
    )
  ) {
    // 如果适用，找出最相关的地点
    const matchedLoc = world.locations.find(
      (l) => matches(l.name) || matches(l.description)
    );
    results.push({
      type: "world",
      id: matchedLoc?.id ?? "world",
      title: matchedLoc?.name ?? (world.name || "World"),
      relevance: "content",
      snippet: truncate(
        matchedLoc?.description ?? world.atmosphere ?? world.notes,
        120
      ),
    });
  }

  return results;
}

/** 将字符串截断到 maxLen，必要时追加省略号。 */
function truncate(text: string | undefined, maxLen: number): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

/**
 * 校验 WriterMemory 对象的结构完整性。
 * 检查必填字段、悬空引用和数据一致性。
 */
export function validateMemory(memory: WriterMemory): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 版本检查
  if (memory.version !== "1.0") {
    errors.push(`不支持的版本："${memory.version}"（应为 "1.0"）`);
  }

  // 项目元数据
  if (!memory.project.name) {
    errors.push("项目名称为空");
  }
  if (!memory.project.genre) {
    warnings.push("项目类型为空");
  }
  if (!memory.project.created) {
    errors.push("项目创建时间戳缺失");
  }

  // 角色
  const charIds = new Set(Object.keys(memory.characters));
  for (const [id, char] of Object.entries(memory.characters)) {
    if (char.id !== id) {
      errors.push(
        `角色键 "${id}" 与 character.id "${char.id}" 不一致`
      );
    }
    if (!char.name) {
      errors.push(`角色 "${id}" 没有名称`);
    }
    for (const ep of char.timeline) {
      if (ep.intensity < 1 || ep.intensity > 5) {
        warnings.push(
          `角色 "${char.name}" 的情感点强度为 ${ep.intensity}（应为 1-5）`
        );
      }
      if (ep.sceneId && !memory.scenes.some((s) => s.id === ep.sceneId)) {
        warnings.push(
          `角色 "${char.name}" 在时间线中引用了不存在的场景 "${ep.sceneId}"`
        );
      }
    }
  }

  // 关系
  for (const rel of memory.relationships) {
    if (!charIds.has(rel.from)) {
      errors.push(
        `关系 "${rel.id}" 引用了不存在的角色 "${rel.from}"`
      );
    }
    if (!charIds.has(rel.to)) {
      errors.push(
        `关系 "${rel.id}" 引用了不存在的角色 "${rel.to}"`
      );
    }
    if (rel.from === rel.to) {
      warnings.push(
        `关系 "${rel.id}" 是自引用（from === to === "${rel.from}"）`
      );
    }
  }

  // 场景
  const sceneIds = new Set<string>();
  for (const scene of memory.scenes) {
    if (sceneIds.has(scene.id)) {
      errors.push(`重复的场景 ID："${scene.id}"`);
    }
    sceneIds.add(scene.id);

    for (const charId of scene.characters) {
      if (!charIds.has(charId)) {
        warnings.push(
          `场景 "${scene.title}" 引用了不存在的角色 "${charId}"`
        );
      }
    }
    if (scene.cuts.length === 0) {
      warnings.push(`场景 "${scene.title}" 没有镜头`);
    }
  }

  // 主题
  for (const theme of memory.themes) {
    for (const charId of theme.relatedCharacters) {
      if (!charIds.has(charId)) {
        warnings.push(
          `主题 "${theme.name}" 引用了不存在的角色 "${charId}"`
        );
      }
    }
    for (const sid of theme.relatedScenes) {
      if (!sceneIds.has(sid)) {
        warnings.push(
          `主题 "${theme.name}" 引用了不存在的场景 "${sid}"`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
