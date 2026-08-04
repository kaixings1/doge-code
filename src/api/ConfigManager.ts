/**
 * 配置管理器类
 * 提供配置读写、点号路径、环境变量回退、schema 验证、变更监听、深合并
 */
export class ConfigManager {
  private config: Record<string, any> = {};
  private defaults: Record<string, any> = {};
  private schema: Record<string, { type?: string; enum?: any[]; required?: boolean; default?: any; validate?: (v: any) => boolean }> = {};
  private watchers = new Map<string, Array<(newValue: any, oldValue: any) => void>>();
  private envPrefix = 'CLAUDE_CODE_';
  private filePath: string | null = null;

  private resolveKey(obj: any, key: string): { parent: any; keyName: string; value: any } | null {
    const parts = key.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (current[parts[i]] === undefined || current[parts[i]] === null) return null;
      current = current[parts[i]];
    }
    return { parent: current, keyName: parts[parts.length - 1], value: current[parts[parts.length - 1]] };
  }

  get<T = any>(key: string, defaultValue?: T): T {
    // 1. 内存配置
    const resolved = this.resolveKey(this.config, key);
    if (resolved !== null && resolved.value !== undefined) return resolved.value as T;

    // 2. 环境变量回退
    const envKey = this.envPrefix + key.toUpperCase().replace(/\./g, '_');
    if (process.env[envKey] !== undefined) {
      const raw = process.env[envKey]!;
      if (raw === 'true') return true as unknown as T;
      if (raw === 'false') return false as unknown as T;
      if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw) as unknown as T;
      return raw as unknown as T;
    }

    // 3. 默认值
    return defaultValue as T;
  }

  set(key: string, value: any): void {
    const parts = key.split('.');
    let current = this.config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    const oldValue = current[parts[parts.length - 1]];
    current[parts[parts.length - 1]] = value;

    // 触发 watchers（父路径也触发）
    this.notifyWatchers(key, value, oldValue);
    for (let i = 1; i < parts.length; i++) {
      this.notifyWatchers(parts.slice(0, parts.length - i).join('.'), value, oldValue);
    }

    // 自动保存
    if (this.filePath) {
      this.save(this.filePath).catch(() => { /* ignore */ });
    }
  }

  private notifyWatchers(key: string, newValue: any, oldValue: any): void {
    const watchers = this.watchers.get(key);
    if (watchers) {
      for (const cb of watchers) {
        try { cb(newValue, oldValue); } catch { /* ignore */ }
      }
    }
  }

  has(key: string): boolean {
    const resolved = this.resolveKey(this.config, key);
    if (resolved !== null && resolved.value !== undefined) return true;
    const envKey = this.envPrefix + key.toUpperCase().replace(/\./g, '_');
    return process.env[envKey] !== undefined;
  }

  delete(key: string): void {
    const resolved = this.resolveKey(this.config, key);
    if (resolved) {
      delete resolved.parent[resolved.keyName];
      if (this.filePath) {
        this.save(this.filePath).catch(() => { /* ignore */ });
      }
    }
  }

  getAll(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * 深合并配置
   */
  private deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) &&
          result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = this.deepMerge(result[key], value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  async load(filePath: string): Promise<void> {
    this.filePath = filePath;
    try {
      const fs = await import('fs');
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      // 合并默认值 + 文件配置
      this.config = this.deepMerge(this.defaults, parsed);
    } catch {
      this.config = { ...this.defaults };
    }
  }

  async save(filePath: string): Promise<void> {
    const fs = await import('fs');
    const dir = filePath.substring(0, filePath.lastIndexOf('\\'));
    if (dir) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    }
    fs.writeFileSync(filePath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  watch(key: string, callback: (newValue: any, oldValue: any) => void): () => void {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, []);
    }
    this.watchers.get(key)!.push(callback);
    return () => {
      const list = this.watchers.get(key);
      if (list) {
        const idx = list.indexOf(callback);
        if (idx >= 0) list.splice(idx, 1);
      }
    };
  }

  /**
   * 设置默认值
   */
  setDefaults(defaults: Record<string, any>): void {
    this.defaults = defaults;
    this.config = this.deepMerge(defaults, this.config);
  }

  /**
   * 注册 schema 验证规则
   */
  defineSchema(schema: Record<string, { type?: string; enum?: any[]; required?: boolean; default?: any; validate?: (v: any) => boolean }>): void {
    this.schema = { ...this.schema, ...schema };
  }

  /**
   * 验证配置
   * @returns { valid, errors }
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const [key, rule] of Object.entries(this.schema)) {
      const value = this.get(key);
      if (rule.required && (value === undefined || value === null)) {
        errors.push(`Missing required config: ${key}`);
        continue;
      }
      if (value === undefined || value === null) continue;
      if (rule.type && typeof value !== rule.type) {
        errors.push(`Config '${key}' must be ${rule.type}, got ${typeof value}`);
      }
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`Config '${key}' must be one of: ${rule.enum.join(', ')}`);
      }
      if (rule.validate && !rule.validate(value)) {
        errors.push(`Config '${key}' failed validation`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * 合并外部配置
   */
  merge(external: Record<string, any>): void {
    this.config = this.deepMerge(this.config, external);
    if (this.filePath) {
      this.save(this.filePath).catch(() => { /* ignore */ });
    }
  }

  /** 重置为默认值 */
  reset(): void {
    this.config = { ...this.defaults };
    if (this.filePath) {
      this.save(this.filePath).catch(() => { /* ignore */ });
    }
  }

  /**
   * 配置迁移：将旧版本配置迁移到新版本
   * @param version 当前配置版本
   * @param migrations 迁移映射 { 从版本: (config) => 新config }
   */
  migrate(version: number, migrations: Record<number, (config: Record<string, any>) => Record<string, any>>): void {
    let current = { ...this.config };
    let currentVersion = version;
    // 按版本号升序执行迁移
    const versions = Object.keys(migrations).map(Number).sort((a, b) => a - b);
    for (const fromVersion of versions) {
      if (currentVersion === fromVersion) {
        current = migrations[fromVersion](current);
        currentVersion++;
      }
    }
    this.config = current;
    this.set('_configVersion', currentVersion);
  }

  /** 获取配置版本 */
  getVersion(): number {
    const v = this.get('_configVersion');
    return typeof v === 'number' ? v : 1;
  }

  /**
   * 获取变更历史
   */
  getChangeLog(limit = 20): Array<{ key: string; timestamp: string }> {
    const log = this.get('_changeLog', []);
    return Array.isArray(log) ? log.slice(-limit) : [];
  }

  /** 快照当前配置 */
  snapshot(): string {
    return JSON.stringify(this.config);
  }

  /** 从快照恢复 */
  restore(snapshot: string): void {
    try {
      this.config = JSON.parse(snapshot);
      if (this.filePath) {
        this.save(this.filePath).catch(() => { /* ignore */ });
      }
    } catch { /* ignore */ }
  }
}