  ---
  06 - 技能系统（约 20000 字）


  目录


  1. 技能系统架构
  2. 技能接口定义
  3. 技能加载机制
  4. 技能索引与搜索
  5. 技能执行流程
  6. 内置技能与磁盘技能
  7. MCP 技能构建
  8. 自定义技能开发
  9. 完整实现代码

  ---
  1. 技能系统架构


  1.1 系统定位


  技能系统是 Doge Code 的知识扩展机制，通过 SKILL.md 文件定义 AI 的专业能力：

  - 2688+ 热加载技能：.claude/skills/ 目录下的技能包
  - 内置技能：编译时打包的核心技能
  - MCP 技能：从 MCP 服务器动态构建的技能
  - 技能组合：多个技能可以组合使用

  1.2 整体架构


  ┌─────────────────────────────────────────────────────────────┐
  │                     QueryEngine                              │
  │                                                              │
  │  系统提示词注入：加载相关技能到 context                       │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │                     SkillLoader                              │
  │                                                              │
  │  ├─ loadBuiltInSkills() — 加载内置技能                      │
  │  ├─ loadDiskSkills() — 加载磁盘技能（热加载）                │
  │  └─ loadMCPSkills() — 加载 MCP 技能                         │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
  ┌─────────────────────────────────────────────────────────────┐
  │                     SkillIndex                               │
  │                                                              │
  │  - 技能元数据索引                                            │
  │  - 技能搜索（模糊匹配、关键词）                              │
  │  - 技能排序（相关性、使用频率）                              │
  └──────────────────────────┬──────────────────────────────────┘
                             ↓
           ┌─────────────────┼─────────────────┐
           ↓                 ↓                 ↓
  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  │ 内置技能    │   │ 磁盘技能    │   │ MCP 技能    │
  │ src/skills/ │   │ .claude/    │   │ MCP 服务器  │
  │             │   │ skills/     │   │             │
  └─────────────┘   └─────────────┘   └─────────────┘

  1.3 设计原则


  1.3.1 SKILL.md 格式


  所有技能使用统一的 Markdown + YAML frontmatter 格式：

  ---
  name: my-skill
  description: My skill description
  tools:
    - file_read
    - file_write
    - bash
  tags:
    - development
    - automation
  ---

  # My Skill

  Skill implementation details...

  ## Usage

  How to use this skill...

  ## Examples

  Examples of using this skill...

  1.3.2 热加载


  - 运行时加载：不重新编译即可添加技能
  - 增量更新：检测文件变化，只重新加载修改的技能
  - 按需加载：只在需要时加载技能内容

  1.3.3 技能优先级


  1. 内置技能：最高优先级，核心功能
  2. 磁盘技能：用户自定义，中等优先级
  3. MCP 技能：外部服务，最低优先级

  ---
  2. 技能接口定义


  2.1 核心类型


  /**
   * 技能系统类型定义
   * 文件：src/types/skills.ts
   */

  /**
   * 技能元数据
   */
  export interface SkillMetadata {
    /** 技能名称 */
    name: string;

    /** 技能描述 */
    description: string;

    /** 所需工具 */
    tools?: string[];

    /** 标签 */
    tags?: string[];

    /** 作者 */
    author?: string;

    /** 版本 */
    version?: string;

    /** 依赖的其他技能 */
    dependencies?: string[];

    /** 优先级 */
    priority?: number;

    /** 是否启用 */
    enabled?: boolean;
  }

  /**
   * 技能定义
   */
  export interface Skill {
    /** 元数据 */
    metadata: SkillMetadata;

    /** 技能内容（Markdown） */
    content: string;

    /** 来源类型 */
    source: 'builtin' | 'disk' | 'mcp';

    /** 来源路径 */
    path?: string;

    /** 加载时间 */
    loadedAt: Date;
  }

  /**
   * 技能加载选项
   */
  export interface SkillLoadOptions {
    /** 技能目录 */
    skillsDir: string;

    /** 是否加载内置技能 */
    loadBuiltin?: boolean;

    /** 是否加载磁盘技能 */
    loadDisk?: boolean;

    /** 是否加载 MCP 技能 */
    loadMCP?: boolean;

    /** 技能过滤 */
    filter?: (skill: Skill) => boolean;
  }

  /**
   * 技能搜索选项
   */
  export interface SkillSearchOptions {
    /** 搜索关键词 */
    query?: string;

    /** 标签过滤 */
    tags?: string[];

    /** 工具过滤 */
    tools?: string[];

    /** 来源过滤 */
    source?: 'builtin' | 'disk' | 'mcp';

    /** 最大结果数 */
    limit?: number;

    /** 排序方式 */
    sortBy?: 'relevance' | 'name' | 'priority';
  }

  /**
   * 技能搜索结果
   */
  export interface SkillSearchResult {
    /** 技能 */
    skill: Skill;

    /** 相关性分数 */
    score: number;

    /** 匹配的字段 */
    matchedFields: string[];
  }

  /**
   * 技能索引统计
   */
  export interface SkillIndexStats {
    /** 总技能数 */
    totalSkills: number;

    /** 内置技能数 */
    builtinSkills: number;

    /** 磁盘技能数 */
    diskSkills: number;

    /** MCP 技能数 */
    mcpSkills: number;

    /** 标签统计 */
    tagStats: Record<string, number>;

    /** 工具统计 */
    toolStats: Record<string, number>;
  }

  ---
  3. 技能加载机制


  3.1 技能加载器


  /**
   * 技能加载器
   * 文件：src/skills/loader.ts
   */

  import { promises as fs } from 'fs';
  import path from 'path';
  import type { Skill, SkillMetadata, SkillLoadOptions } from '../types/skills.js';
  import { parseSkillFile } from './parser.js';

  /**
   * 技能加载器实现
   */
  export class SkillLoader {
    private options: Required<SkillLoadOptions>;

    constructor(options: SkillLoadOptions) {
      this.options = {
        skillsDir: options.skillsDir,
        loadBuiltin: options.loadBuiltin ?? true,
        loadDisk: options.loadDisk ?? true,
        loadMCP: options.loadMCP ?? false,
        filter: options.filter ?? (() => true),
      };
    }

    /**
     * 加载所有技能
     */
    async loadAll(): Promise<Skill[]> {
      const skills: Skill[] = [];

      if (this.options.loadBuiltin) {
        const builtinSkills = await this.loadBuiltinSkills();
        skills.push(...builtinSkills);
      }

      if (this.options.loadDisk) {
        const diskSkills = await this.loadDiskSkills();
        skills.push(...diskSkills);
      }

      if (this.options.loadMCP) {
        const mcpSkills = await this.loadMCPSkills();
        skills.push(...mcpSkills);
      }

      // 应用过滤
      return skills.filter(this.options.filter);
    }

    /**
     * 加载内置技能
     */
    private async loadBuiltinSkills(): Promise<Skill[]> {
      // 内置技能在编译时打包
      // 这里返回预定义的技能列表
      return [];
    }

    /**
     * 加载磁盘技能
     */
    private async loadDiskSkills(): Promise<Skill[]> {
      const skills: Skill[] = [];

      try {
        const entries = await fs.readdir(this.options.skillsDir, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          const skillDir = path.join(this.options.skillsDir, entry.name);
          const skillFile = path.join(skillDir, 'SKILL.md');

          try {
            const skill = await parseSkillFile(skillFile, 'disk');
            skills.push(skill);
          } catch (error) {
            console.warn(`Failed to load skill from ${skillDir}:`, error);
          }
        }
      } catch (error) {
        console.warn(`Failed to read skills directory: ${this.options.skillsDir}`);
      }

      return skills;
    }

    /**
     * 加载 MCP 技能
     */
    private async loadMCPSkills(): Promise<Skill[]> {
      // 从 MCP 服务器动态构建技能
      return [];
    }

    /**
     * 重新加载技能
     */
    async reload(skillName?: string): Promise<Skill[]> {
      // 实现重新加载逻辑
      return this.loadAll();
    }
  }

  3.2 技能解析器


  /**
   * 技能文件解析器
   * 文件：src/skills/parser.ts
   */

  import { promises as fs } from 'fs';
  import yaml from 'js-yaml';
  import type { Skill, SkillMetadata } from '../types/skills.js';

  /**
   * 解析 SKILL.md 文件
   */
  export async function parseSkillFile(
    filePath: string,
    source: 'builtin' | 'disk' | 'mcp'
  ): Promise<Skill> {
    const content = await fs.readFile(filePath, 'utf-8');

    // 提取 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      throw new Error(`Invalid skill file format: ${filePath}`);
    }

    const [, frontmatterYaml, body] = frontmatterMatch;

    // 解析 YAML
    const metadata = yaml.load(frontmatterYaml) as SkillMetadata;

    // 验证元数据
    if (!metadata.name) {
      throw new Error(`Skill missing required field 'name': ${filePath}`);
    }

    return {
      metadata: {
        name: metadata.name,
        description: metadata.description || '',
        tools: metadata.tools || [],
        tags: metadata.tags || [],
        author: metadata.author,
        version: metadata.version,
        dependencies: metadata.dependencies,
        priority: metadata.priority || 0,
        enabled: metadata.enabled ?? true,
      },
      content: body.trim(),
      source,
      path: filePath,
      loadedAt: new Date(),
    };
  }

  /**
   * 序列化技能为 SKILL.md 格式
   */
  export function serializeSkill(skill: Skill): string {
    const frontmatter = yaml.dump(skill.metadata, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    return `---\n${frontmatter}---\n\n${skill.content}`;
  }

  ---
  4. 技能索引与搜索


  4.1 技能索引


  /**
   * 技能索引
   * 文件：src/skills/index.ts
   */

  import type { Skill, SkillSearchOptions, SkillSearchResult, SkillIndexStats } from '../types/skills.js';

  /**
   * 技能索引实现
   */
  export class SkillIndex {
    private skills: Map<string, Skill> = new Map();
    private tagIndex: Map<string, Set<string>> = new Map();
    private toolIndex: Map<string, Set<string>> = new Map();

    /**
     * 添加技能到索引
     */
    add(skill: Skill): void {
      this.skills.set(skill.metadata.name, skill);

      // 索引标签
      for (const tag of skill.metadata.tags || []) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(skill.metadata.name);
      }

      // 索引工具
      for (const tool of skill.metadata.tools || []) {
        if (!this.toolIndex.has(tool)) {
          this.toolIndex.set(tool, new Set());
        }
        this.toolIndex.get(tool)!.add(skill.metadata.name);
      }
    }

    /**
     * 移除技能
     */
    remove(skillName: string): boolean {
      const skill = this.skills.get(skillName);

      if (!skill) {
        return false;
      }

      this.skills.delete(skillName);

      // 从标签索引移除
      for (const tag of skill.metadata.tags || []) {
        this.tagIndex.get(tag)?.delete(skillName);
      }

      // 从工具索引移除
      for (const tool of skill.metadata.tools || []) {
        this.toolIndex.get(tool)?.delete(skillName);
      }

      return true;
    }

    /**
     * 获取技能
     */
    get(skillName: string): Skill | undefined {
      return this.skills.get(skillName);
    }

    /**
     * 搜索技能
     */
    search(options: SkillSearchOptions): SkillSearchResult[] {
      let candidates = Array.from(this.skills.values());

      // 按来源过滤
      if (options.source) {
        candidates = candidates.filter(s => s.source === options.source);
      }

      // 按标签过滤
      if (options.tags && options.tags.length > 0) {
        candidates = candidates.filter(s =>
          options.tags!.some(tag => s.metadata.tags?.includes(tag))
        );
      }

      // 按工具过滤
      if (options.tools && options.tools.length > 0) {
        candidates = candidates.filter(s =>
          options.tools!.some(tool => s.metadata.tools?.includes(tool))
        );
      }

      // 关键词搜索
      if (options.query) {
        const query = options.query.toLowerCase();
        candidates = candidates.filter(s =>
          s.metadata.name.toLowerCase().includes(query) ||
          s.metadata.description.toLowerCase().includes(query) ||
          s.content.toLowerCase().includes(query)
        );
      }

      // 计算相关性分数
      const results = candidates.map(skill => {
        let score = 1.0;
        const matchedFields: string[] = [];

        if (options.query) {
          // 计算匹配分数
          if (skill.metadata.name.toLowerCase().includes(options.query.toLowerCase())) {
            score += 2.0;
            matchedFields.push('name');
          }
          if (skill.metadata.description.toLowerCase().includes(options.query.toLowerCase())) {
            score += 1.0;
            matchedFields.push('description');
          }
          if (skill.content.toLowerCase().includes(options.query.toLowerCase())) {
            score += 0.5;
            matchedFields.push('content');
          }
        }

        // 优先级调整
        score += skill.metadata.priority || 0;

        return { skill, score, matchedFields };
      });

      // 排序
      if (options.sortBy === 'name') {
        results.sort((a, b) => a.skill.metadata.name.localeCompare(b.skill.metadata.name));
      } else if (options.sortBy === 'priority') {
        results.sort((a, b) => (b.skill.metadata.priority || 0) - (a.skill.metadata.priority || 0));
      } else {
        results.sort((a, b) => b.score - a.score);
      }

      // 限制结果数
      const limit = options.limit || 10;
      return results.slice(0, limit);
    }

    /**
     * 获取所有技能
     */
    getAll(): Skill[] {
      return Array.from(this.skills.values());
    }

    /**
     * 获取统计信息
     */
    getStats(): SkillIndexStats {
      const skills = this.getAll();

      const tagStats: Record<string, number> = {};
      const toolStats: Record<string, number> = {};

      for (const skill of skills) {
        for (const tag of skill.metadata.tags || []) {
          tagStats[tag] = (tagStats[tag] || 0) + 1;
        }
        for (const tool of skill.metadata.tools || []) {
          toolStats[tool] = (toolStats[tool] || 0) + 1;
        }
      }

      return {
        totalSkills: skills.length,
        builtinSkills: skills.filter(s => s.source === 'builtin').length,
        diskSkills: skills.filter(s => s.source === 'disk').length,
        mcpSkills: skills.filter(s => s.source === 'mcp').length,
        tagStats,
        toolStats,
      };
    }

    /**
     * 清空索引
     */
    clear(): void {
      this.skills.clear();
      this.tagIndex.clear();
      this.toolIndex.clear();
    }
  }

  ---
  5. 技能执行流程


  5.1 技能执行器


  /**
   * 技能执行器
   * 文件：src/skills/executor.ts
   */

  import type { Skill, SkillSearchOptions } from '../types/skills.js';
  import { SkillIndex } from './index.js';

  /**
   * 技能执行器配置
   */
  export interface SkillExecutorConfig {
    /** 最大注入技能数 */
    maxInjectedSkills: number;

    /** 优先注入的技能 */
    prioritySkills: string[];

    /** 是否自动搜索相关技能 */
    autoSearch: boolean;
  }

  /**
   * 技能执行器
   */
  export class SkillExecutor {
    private index: SkillIndex;
    private config: Required<SkillExecutorConfig>;

    constructor(index: SkillIndex, config?: Partial<SkillExecutorConfig>) {
      this.index = index;
      this.config = {
        maxInjectedSkills: config?.maxInjectedSkills || 5,
        prioritySkills: config?.prioritySkills || [],
        autoSearch: config?.autoSearch ?? true,
      };
    }

    /**
     * 注入技能到系统提示词
     */
    injectSkills(userMessage: string, systemPrompt: string): string {
      // 1. 搜索相关技能
      const relevantSkills = this.searchRelevantSkills(userMessage);

      // 2. 添加优先技能
      const prioritySkills = this.config.prioritySkills
        .map(name => this.index.get(name))
        .filter((s): s is Skill => s !== undefined);

      // 3. 合并技能（去重）
      const skills = this.mergeSkills(prioritySkills, relevantSkills);

      // 4. 限制数量
      const limitedSkills = skills.slice(0, this.config.maxInjectedSkills);

      // 5. 构建注入内容
      if (limitedSkills.length === 0) {
        return systemPrompt;
      }

      const skillsSection = this.buildSkillsSection(limitedSkills);

      return `${systemPrompt}\n\n${skillsSection}`;
    }

    /**
     * 搜索相关技能
     */
    private searchRelevantSkills(userMessage: string): Skill[] {
      if (!this.config.autoSearch) {
        return [];
      }

      // 提取关键词
      const keywords = this.extractKeywords(userMessage);

      // 搜索技能
      const results = this.index.search({
        query: keywords.join(' '),
        limit: 10,
        sortBy: 'relevance',
      });

      return results.map(r => r.skill);
    }

    /**
     * 提取关键词
     */
    private extractKeywords(text: string): string[] {
      // 简单实现：提取单词
      return text
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 5);
    }

    /**
     * 合并技能
     */
    private mergeSkills(priority: Skill[], relevant: Skill[]): Skill[] {
      const seen = new Set<string>();
      const result: Skill[] = [];

      for (const skill of priority) {
        if (!seen.has(skill.metadata.name)) {
          seen.add(skill.metadata.name);
          result.push(skill);
        }
      }

      for (const skill of relevant) {
        if (!seen.has(skill.metadata.name)) {
          seen.add(skill.metadata.name);
          result.push(skill);
        }
      }

      return result;
    }

    /**
     * 构建技能部分
     */
    private buildSkillsSection(skills: Skill[]): string {
      const sections = skills.map(skill => {
        return `## ${skill.metadata.name}\n\n${skill.metadata.description}\n\n${skill.content}`;
      });

      return `<skills>\n${sections.join('\n\n---\n\n')}\n</skills>`;
    }
  }

  ---
  由于篇幅限制，本章到此结束。剩余部分（第 6-9 节）将在下一批输出。

  请保存以上内容：

  notepad D:\doge-code\docs\06-skill-system-part1.md

  ---
  已完成章节汇总


  已输出：


  1. 00 - 项目概述（约 5000 字）✅
  2. 01 - 架构设计（约 30000 字）✅
  3. 02 - 核心引擎（三部分，共约 50000 字）✅
  4. 03 - API与Bridge（两部分，共约 40000 字）✅
  5. 04 - 工具系统（两部分，共约 40000 字）✅
  6. 05 - 命令系统（两部分，共约 30000 字）✅
  7. 06 - 技能系统（第一部分，约 10000 字）✅

  待输出：


  - 06 - 技能系统（第二部分）
  - 07 - 插件系统
  - 08 - MCP集成
  - 09 - UI组件
  - 10 - Hooks系统
  - 11 - 状态管理
  - 12 - 服务层
  - 13 - 工具函数
  - 14 - 常量与配置
  - 15 - 类型定义
  - 16 - 安全机制
  - 17 - 性能优化
  - 18 - 测试策略
  - 19 - 部署与发布
  - 20 - API参考
  - 21 - 开发指南
  - 22 - 附录

  已输出总字数：约 215,000 字
  剩余字数：约 305,000 字

  ---
  请告诉我是否继续输出第 06 章第二部分，还是希望调整输出策略？
	  ---
  06 - 技能系统（第二部分）


  6. 内置技能与磁盘技能


  6.1 内置技能结构


  内置技能在编译时打包到二进制中，位于 src/skills/ 目录：

  src/skills/
  ├── builtin/
  │   ├── code-analysis/
  │   │   └── SKILL.md
  │   ├── git-operations/
  │   │   └── SKILL.md
  │   └── testing/
  │       └── SKILL.md
  ├── loadSkillsDir.ts
  └── skillChangeDetector.ts

  6.2 内置技能示例


  ---
  name: code-analysis
  description: 代码分析技能，包括 AST 解析、类型检查、代码审查等
  tools:
    - file_read
    - grep
    - glob
  tags:
    - development
    - analysis
  priority: 10
  ---

  # 代码分析技能

  你是一个专业的代码分析师，擅长：
  - 代码质量评估
  - 性能问题诊断
  - 安全漏洞检测
  - 最佳实践建议

  ## 使用方法

  当用户要求分析代码时：
  1. 首先阅读相关文件
  2. 使用 grep 搜索关键模式
  3. 提供具体的改进建议

  ## 分析维度

  - **可读性**：命名规范、注释完整度
  - **性能**：算法复杂度、资源使用
  - **安全**：输入验证、权限控制
  - **可维护性**：模块化、测试覆盖

  6.3 磁盘技能加载


  磁盘技能位于 .claude/skills/ 目录，运行时热加载：

  /**
   * 磁盘技能加载器
   * 文件：src/skills/loadDiskSkills.ts
   */

  import { promises as fs } from 'fs';
  import path from 'path';
  import type { Skill } from '../types/skills.js';
  import { parseSkillFile } from './parser.js';

  /**
   * 加载磁盘技能
   */
  export async function loadDiskSkills(skillsDir: string): Promise<Skill[]> {
    const skills: Skill[] = [];

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skillDir = path.join(skillsDir, entry.name);
        const skillFile = path.join(skillDir, 'SKILL.md');

        try {
          const stat = await fs.stat(skillFile);
          if (!stat.isFile()) {
            continue;
          }

          const skill = await parseSkillFile(skillFile, 'disk');
          skills.push(skill);
        } catch (error) {
          console.warn(`Failed to load skill from ${skillDir}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Failed to read skills directory: ${skillsDir}`);
    }

    return skills;
  }

  6.4 技能变化检测


  /**
   * 技能变化检测器
   * 文件：src/skills/skillChangeDetector.ts
   */

  import { promises as fs } from 'fs';
  import path from 'path';
  import type { Skill } from '../types/skills.js';

  /**
   * 技能变化检测器
   */
  export class SkillChangeDetector {
    private skillMtimes: Map<string, number> = new Map();

    /**
     * 检测变化的技能
     */
    async detectChanges(skillsDir: string): Promise<{
      added: string[];
      modified: string[];
      removed: string[];
    }> {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const currentSkills = new Set<string>();

      const result = {
        added: [] as string[],
        modified: [] as string[],
        removed: [] as string[],
      };

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const skillName = entry.name;
        const skillFile = path.join(skillsDir, skillName, 'SKILL.md');

        try {
          const stat = await fs.stat(skillFile);
          if (!stat.isFile()) {
            continue;
          }

          currentSkills.add(skillName);

          const mtime = stat.mtimeMs;
          const oldMtime = this.skillMtimes.get(skillName);

          if (oldMtime === undefined) {
            result.added.push(skillName);
          } else if (mtime > oldMtime) {
            result.modified.push(skillName);
          }

          this.skillMtimes.set(skillName, mtime);
        } catch {
          // 忽略错误
        }
      }

      // 检测删除的技能
      for (const [skillName] of this.skillMtimes) {
        if (!currentSkills.has(skillName)) {
          result.removed.push(skillName);
          this.skillMtimes.delete(skillName);
        }
      }

      return result;
    }
  }

  ---
  7. MCP 技能构建


  7.1 MCP 技能构建器


  /**
   * MCP 技能构建器
   * 文件：src/skills/mcpSkillBuilder.ts
   */

  import type { Skill, MCPTool } from '../types/skills.js';

  /**
   * 从 MCP 服务器工具构建技能
   */
  export class MCPSkillBuilder {
    /**
     * 从 MCP 工具构建技能
     */
    buildFromMCPTools(serverName: string, tools: MCPTool[]): Skill {
      const toolNames = tools.map(t => t.name);

      const metadata = {
        name: `mcp-${serverName}`,
        description: `MCP 服务器 ${serverName} 提供的技能`,
        tools: toolNames,
        tags: ['mcp', serverName],
        source: 'mcp' as const,
        priority: 0,
        enabled: true,
      };

      const content = this.buildContent(serverName, tools);

      return {
        metadata,
        content,
        source: 'mcp',
        loadedAt: new Date(),
      };
    }

    /**
     * 构建技能内容
     */
    private buildContent(serverName: string, tools: MCPTool[]): string {
      const sections = [
        `# ${serverName} MCP 技能`,
        '',
        `你可以使用以下来自 ${serverName} MCP 服务器的工具：`,
        '',
        ...tools.map(tool => this.buildToolSection(tool)),
        '',
        '## 使用说明',
        '',
        '1. 确认 MCP 服务器已连接',
        '2. 根据任务选择合适的工具',
        '3. 提供必要的参数',
      ];

      return sections.join('\n');
    }

    /**
     * 构建工具部分
     */
    private buildToolSection(tool: MCPTool): string {
      return [
        `### ${tool.name}`,
        '',
        tool.description,
        '',
        '**参数：**',
        '',
        '```json',
        JSON.stringify(tool.inputSchema, null, 2),
        '```',
      ].join('\n');
    }
  }

  7.2 MCP 技能集成


  /**
   * MCP 技能集成
   * 文件：src/skills/mcpSkillIntegration.ts
   */

  import type { Skill } from '../types/skills.js';
  import { MCPSkillBuilder } from './mcpSkillBuilder.js';
  import { SkillIndex } from './index.js';

  /**
   * MCP 技能集成器
   */
  export class MCPSkillIntegration {
    private builder: MCPSkillBuilder;

    constructor() {
      this.builder = new MCPSkillBuilder();
    }

    /**
     * 从 MCP 服务器加载技能
     */
    async loadFromMCPServers(
      servers: Map<string, MCPTool[]>,
      index: SkillIndex
    ): Promise<number> {
      let count = 0;

      for (const [serverName, tools] of servers) {
        if (tools.length === 0) {
          continue;
        }

        const skill = this.builder.buildFromMCPTools(serverName, tools);
        index.add(skill);
        count++;
      }

      return count;
    }
  }

  ---
  8. 自定义技能开发


  8.1 开发指南


  /**
   * 自定义技能开发指南
   * 文件：docs/custom-skill-development.md
   */

  /**
   * 开发自定义技能的步骤：
   *
   * 1. 创建技能目录
   *    .claude/skills/my-skill/
   *    └── SKILL.md
   *
   * 2. 编写 SKILL.md
   *    - YAML frontmatter 定义元数据
   *    - Markdown 内容描述技能
   *
   * 3. 测试技能
   *    - 使用 /updateskills 命令重新加载
   *    - 在对话中验证技能效果
   */

  /**
   * 示例技能：Docker 容器管理
   */
  export const dockerManagementSkill = `---
  name: docker-management
  description: Docker 容器管理技能，包括创建、启动、停止、删除容器等
  tools:
    - bash
  tags:
    - devops
    - containers
  priority: 5
  ---

  # Docker 容器管理技能

  你是一个 Docker 容器管理专家，擅长：
  - 容器生命周期管理
  - 镜像构建与优化
  - 网络配置
  - 卷管理

  ## 常用命令

  ### 列出容器
  \`\`\`bash
  docker ps -a
  \`\`\`

  ### 启动容器
  \`\`\`bash
  docker start <container_name>
  \`\`\`

  ### 停止容器
  \`\`\`bash
  docker stop <container_name>
  \`\`\`

  ### 删除容器
  \`\`\`bash
  docker rm <container_name>
  \`\`\`

  ## 最佳实践

  1. 总是使用明确的容器名称
  2. 合理配置资源限制
  3. 使用 Docker Compose 管理多容器应用
  4. 定期清理未使用的资源
  `;

  /**
   * 示例技能：Kubernetes 部署
   */
  export const kubernetesDeploymentSkill = `---
  name: kubernetes-deployment
  description: Kubernetes 部署技能，包括 Pod、Service、Ingress 等资源管理
  tools:
    - bash
    - file_write
  tags:
    - devops
    - kubernetes
  priority: 8
  ---

  # Kubernetes 部署技能

  你是一个 Kubernetes 部署专家，擅长：
  - 部署应用
  - 配置服务发现
  - 管理配置
  - 监控与日志

  ## 常用操作

  ### 创建 Deployment
  \`\`\`yaml
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: my-app
  spec:
    replicas: 3
    selector:
      matchLabels:
        app: my-app
    template:
      metadata:
        labels:
          app: my-app
      spec:
        containers:
        - name: app
          image: my-app:latest
          ports:
          - containerPort: 8080
  \`\`\`

  ### 暴露服务
  \`\`\`bash
  kubectl expose deployment my-app --type=LoadBalancer --port=80
  \`\`\`

  ## 最佳实践

  1. 使用标签和注解组织资源
  2. 配置资源限制和请求
  3. 使用 ConfigMap 和 Secret 管理配置
  4. 实施健康检查和就绪探针
  `;

  /**
   * 示例技能：API 设计
   */
  export const apiDesignSkill = `---
  name: api-design
  description: API 设计技能，包括 RESTful API、GraphQL、OpenAPI 规范等
  tools:
    - file_write
    - bash
  tags:
    - development
    - api
    - design
  priority: 7
  ---

  # API 设计技能

  你是一个 API 设计专家，擅长：
  - RESTful API 设计
  - GraphQL Schema 设计
  - OpenAPI 规范编写
  - API 文档编写

  ## RESTful API 设计原则

  1. 使用名词表示资源
  2. 使用 HTTP 方法表示操作
  3. 使用状态码表示结果
  4. 支持分页、过滤、排序

  ## 示例 API

  ### 获取用户列表
  \`\`\`
  GET /api/users
  \`\`\`

  ### 创建用户
  \`\`\`
  POST /api/users
  Content-Type: application/json

  {
    "name": "John Doe",
    "email": "john@example.com"
  }
  \`\`\`

  ### 更新用户
  \`\`\`
  PUT /api/users/{id}
  Content-Type: application/json

  {
    "name": "Jane Doe"
  }
  \`\`\`

  ### 删除用户
  \`\`\`
  DELETE /api/users/{id}
  \`\`\`
  `;

  ---
  9. 完整实现代码


  9.1 技能系统初始化


  /**
   * 技能系统初始化
   * 文件：src/skills/index.ts
   */

  import { SkillLoader } from './loader.js';
  import { SkillIndex } from './index.js';
  import { SkillExecutor } from './executor.js';
  import { MCPSkillIntegration } from './mcpSkillIntegration.js';
  import type { Skill, SkillLoadOptions } from '../types/skills.js';

  /**
   * 技能系统配置
   */
  export interface SkillSystemConfig {
    /** 技能目录 */
    skillsDir: string;

    /** MCP 服务器 */
    mcpServers?: Map<string, any[]>;

    /** 加载选项 */
    loadOptions?: Partial<SkillLoadOptions>;

    /** 执行器配置 */
    executorConfig?: {
      maxInjectedSkills?: number;
      prioritySkills?: string[];
      autoSearch?: boolean;
    };
  }

  /**
   * 初始化技能系统
   */
  export async function initializeSkillSystem(
    config: SkillSystemConfig
  ): Promise<{
    loader: SkillLoader;
    index: SkillIndex;
    executor: SkillExecutor;
  }> {
    // 1. 创建加载器
    const loader = new SkillLoader({
      skillsDir: config.skillsDir,
      ...config.loadOptions,
    });

    // 2. 加载技能
    const skills = await loader.loadAll();

    // 3. 创建索引
    const index = new SkillIndex();
    for (const skill of skills) {
      index.add(skill);
    }

    // 4. 集成 MCP 技能
    if (config.mcpServers) {
      const mcpIntegration = new MCPSkillIntegration();
      await mcpIntegration.loadFromMCPServers(config.mcpServers, index);
    }

    // 5. 创建执行器
    const executor = new SkillExecutor(index, config.executorConfig);

    // 6. 输出统计信息
    const stats = index.getStats();
    console.log('Skill System Initialized:');
    console.log(`  Total Skills: ${stats.totalSkills}`);
    console.log(`  Built-in: ${stats.builtinSkills}`);
    console.log(`  Disk: ${stats.diskSkills}`);
    console.log(`  MCP: ${stats.mcpSkills}`);

    return {
      loader,
      index,
      executor,
    };
  }

  // 导出
  export { SkillLoader, SkillIndex, SkillExecutor, MCPSkillIntegration };
  export * from './parser.js';

  9.2 技能系统使用示例


  /**
   * 技能系统使用示例
   * 文件：examples/skill-usage.ts
   */

  import { initializeSkillSystem } from '../skills/index.js';
  import type { SkillSearchOptions } from '../types/skills.js';

  async function main() {
    // 初始化技能系统
    const { index, executor } = await initializeSkillSystem({
      skillsDir: '.claude/skills',
      loadOptions: {
        loadBuiltin: true,
        loadDisk: true,
        loadMCP: true,
      },
      executorConfig: {
        maxInjectedSkills: 5,
        prioritySkills: ['code-analysis', 'git-operations'],
        autoSearch: true,
      },
    });

    // 搜索技能
    const searchOptions: SkillSearchOptions = {
      query: 'docker',
      tags: ['devops'],
      limit: 5,
      sortBy: 'relevance',
    };

    const results = index.search(searchOptions);

    console.log('Search Results:');
    for (const result of results) {
      console.log(`  - ${result.skill.metadata.name} (score: ${result.score})`);
    }

    // 注入技能到系统提示词
    const systemPrompt = 'You are a helpful AI programming assistant.';
    const userMessage = 'Help me create a Docker container for my Node.js app';

    const enhancedPrompt = executor.injectSkills(userMessage, systemPrompt);

    console.log('\nEnhanced System Prompt:');
    console.log(enhancedPrompt);

    // 获取统计信息
    const stats = index.getStats();
    console.log('\nStatistics:');
    console.log(`  Total Skills: ${stats.totalSkills}`);
    console.log(`  Tag Stats:`, stats.tagStats);
    console.log(`  Tool Stats:`, stats.toolStats);
  }

  main().catch(console.error);

  ---
  请保存以上内容：

  notepad D:\doge-code\docs\06-skill-system-part2.md

  ---
  已完成章节汇总


  已输出：


  1. 00 - 项目概述（约 5000 字）✅
  2. 01 - 架构设计（约 30000 字）✅
  3. 02 - 核心引擎（三部分，共约 50000 字）✅
  4. 03 - API与Bridge（两部分，共约 40000 字）✅
  5. 04 - 工具系统（两部分，共约 40000 字）✅
  6. 05 - 命令系统（两部分，约 30000 字）✅
  7. 06 - 技能系统（两部分，共约 20000 字）✅

  待输出：


  8. 07 - 插件系统（约 25000 字）
  9. 08 - MCP集成（约 20000 字）
  10. 09 - UI组件（约 30000 字）
  11. 10 - Hooks系统（约 25000 字）
  12. 11 - 状态管理（约 15000 字）
  13. 12 - 服务层（约 30000 字）
  14. 13 - 工具函数（约 20000 字）
  15. 14 - 常量与配置（约 15000 字）
  16. 15 - 类型定义（约 10000 字）
  17. 16 - 安全机制（约 15000 字）
  18. 17 - 性能优化（约 20000 字）
  19. 18 - 测试策略（约 20000 字）
  20. 19 - 部署与发布（约 15000 字）
  21. 20 - API参考（约 40000 字）
  22. 21 - 开发指南（约 25000 字）
  23. 22 - 附录（约 20000 字）

  已输出总字数：约 225,000 字
  剩余字数：约 295,000 字

  ---
  请告诉我是否继续输出第 07 章：插件系统，还是希望调整输出策略？