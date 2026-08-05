var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/main/pluginRuntime.ts
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";
var PluginEventBus = class {
  listeners = /* @__PURE__ */ new Map();
  on(plugin, event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push({ plugin, fn });
  }
  off(plugin, event) {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(event, list.filter((l) => l.plugin !== plugin));
  }
  emit(event, data) {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const l of [...list]) {
      try {
        l.fn(data);
      } catch (e) {
      }
    }
  }
};
var PluginRuntime = class {
  plugins = /* @__PURE__ */ new Map();
  watchers = /* @__PURE__ */ new Map();
  bus = new PluginEventBus();
  reloadTimers = /* @__PURE__ */ new Map();
  pluginDirs = [];
  timeoutMs = 5e3;
  constructor(projectRoot, opts) {
    this.pluginDirs = [
      path.join(projectRoot, ".doge", "plugins"),
      path.join(projectRoot, "plugins"),
      path.join(projectRoot, ".claude", "plugins")
    ].filter((d) => fs.existsSync(d));
    if (opts?.timeoutMs) this.timeoutMs = opts.timeoutMs;
  }
  // ─── 查询 ───
  list() {
    return Array.from(this.plugins.values()).map((p) => ({
      name: p.name,
      dir: p.dir,
      entry: p.entry,
      enabled: p.enabled,
      commandCount: p.commands.size,
      hookCount: Object.keys(p.hooks).length,
      loadedAt: p.loadedAt,
      errors: p.errors
    }));
  }
  get(name) {
    return this.plugins.get(name);
  }
  getCommandNames() {
    const names = [];
    for (const p of this.plugins.values()) {
      for (const cmd of p.commands.keys()) names.push(`${p.name}:${cmd}`);
    }
    return names;
  }
  hasPlugin(name) {
    return this.plugins.has(name);
  }
  // ─── 加载 ───
  loadAll() {
    const loaded = [];
    for (const dir of this.pluginDirs) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const pluginDir = path.join(dir, entry.name);
          try {
            const p = this.loadPlugin(pluginDir);
            if (p) loaded.push(p);
          } catch (e) {
            console.warn(`[PLUGIN-RUNTIME] \u52A0\u8F7D\u63D2\u4EF6 ${entry.name} \u5931\u8D25:`, e);
          }
        }
      } catch {
      }
    }
    return loaded;
  }
  loadPlugin(pluginDir) {
    const entry = this.resolveEntry(pluginDir);
    if (!entry) return null;
    const manifest = this.readManifest(pluginDir);
    const name = manifest.name || path.basename(pluginDir);
    this.unloadPlugin(name);
    const loaded = {
      name,
      dir: pluginDir,
      entry,
      enabled: true,
      commands: /* @__PURE__ */ new Map(),
      hooks: {},
      log: (level, ...args) => {
        const prefix = `[PLUGIN:${name}]`;
        if (level === "error") console.error(prefix, ...args);
        else if (level === "warn") console.warn(prefix, ...args);
        else console.log(prefix, ...args);
      },
      loadedAt: Date.now(),
      errors: []
    };
    const sdk = this.createSdk(loaded);
    try {
      const code = fs.readFileSync(entry, "utf-8");
      const sandbox = {
        console: {
          log: (...a) => loaded.log("info", ...a),
          warn: (...a) => loaded.log("warn", ...a),
          error: (...a) => loaded.log("error", ...a)
        },
        process: { env: {}, platform: process.platform, versions: { node: process.versions.node } },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Buffer,
        URL,
        TextDecoder,
        TextEncoder,
        require: this.createSafeRequire(pluginDir, loaded),
        exports: {},
        module: { exports: {} },
        global: void 0
      };
      sandbox.global = sandbox;
      const context = vm.createContext(sandbox);
      const wrapped = `${code}
;if (typeof module.exports === 'function') module.exports; else if (typeof exports.activate === 'function') exports.activate;`;
      let activate = null;
      const moduleExports = sandbox.module.exports;
      const directExports = sandbox.exports;
      const runResult = vm.runInContext(wrapped, context, { filename: entry, timeout: this.timeoutMs });
      if (typeof runResult === "function") {
        activate = runResult;
      } else if (typeof moduleExports.activate === "function") {
        activate = moduleExports.activate;
      } else if (typeof directExports.activate === "function") {
        activate = directExports.activate;
      }
      if (activate) {
        const result = activate(sdk);
        if (result instanceof Promise) {
          void result.catch((err) => loaded.errors.push(`init: ${err instanceof Error ? err.message : String(err)}`));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      loaded.errors.push(`load: ${msg}`);
      loaded.enabled = false;
      console.error(`[PLUGIN-RUNTIME] \u63D2\u4EF6 ${name} \u52A0\u8F7D\u5931\u8D25:`, msg);
    }
    this.plugins.set(name, loaded);
    console.log(`[PLUGIN-RUNTIME] \u5DF2\u52A0\u8F7D\u63D2\u4EF6: ${name} (${entry})`);
    return loaded;
  }
  // ─── 卸载 ───
  unloadPlugin(name) {
    const p = this.plugins.get(name);
    if (!p) return false;
    this.bus.off(name, "*");
    this.stopWatch(name);
    this.plugins.delete(name);
    console.log(`[PLUGIN-RUNTIME] \u5DF2\u5378\u8F7D\u63D2\u4EF6: ${name}`);
    return true;
  }
  unloadAll() {
    for (const name of [...this.plugins.keys()]) this.unloadPlugin(name);
  }
  // ─── 命令调用 ───
  invokeCommand(fullName, ...args) {
    const sep2 = fullName.indexOf(":");
    if (sep2 === -1) return { success: false, error: `\u547D\u4EE4\u540D\u683C\u5F0F\u9519\u8BEF: ${fullName}\uFF08\u5E94\u4E3A pluginName:commandName\uFF09` };
    const pluginName = fullName.slice(0, sep2);
    const cmdName = fullName.slice(sep2 + 1);
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return { success: false, error: `\u63D2\u4EF6 ${pluginName} \u672A\u52A0\u8F7D` };
    const fn = plugin.commands.get(cmdName);
    if (!fn) return { success: false, error: `\u63D2\u4EF6 ${pluginName} \u6CA1\u6709\u547D\u4EE4 ${cmdName}` };
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return { success: true, result: void 0, async: true };
      }
      return { success: true, result };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  // ─── hooks 触发 ───
  emitHook(hookName, ...args) {
    for (const p of this.plugins.values()) {
      const fn = p.hooks[hookName];
      if (!fn) continue;
      try {
        fn(...args);
      } catch (e) {
        p.errors.push(`hook ${hookName}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  emitEvent(event, data) {
    this.bus.emit(event, data);
  }
  // ─── 热加载 ───
  watch(pluginName) {
    const p = this.plugins.get(pluginName);
    if (!p) return false;
    this.stopWatch(pluginName);
    try {
      const watcher = fs.watch(p.dir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        const rel = filename.toString();
        if (rel.includes("node_modules")) return;
        const existing = this.reloadTimers.get(pluginName);
        if (existing) clearTimeout(existing);
        this.reloadTimers.set(pluginName, setTimeout(() => {
          console.log(`[PLUGIN-RUNTIME] \u70ED\u91CD\u8F7D: ${pluginName} (${rel} ${event})`);
          this.loadPlugin(p.dir);
          this.watch(pluginName);
        }, 300));
      });
      this.watchers.set(pluginName, watcher);
      return true;
    } catch (e) {
      console.warn(`[PLUGIN-RUNTIME] \u76D1\u542C\u63D2\u4EF6 ${pluginName} \u5931\u8D25:`, e);
      return false;
    }
  }
  stopWatch(pluginName) {
    const timer = this.reloadTimers.get(pluginName);
    if (timer) {
      clearTimeout(timer);
      this.reloadTimers.delete(pluginName);
    }
    const w = this.watchers.get(pluginName);
    if (w) {
      try {
        w.close();
      } catch {
      }
      this.watchers.delete(pluginName);
    }
  }
  watchAll() {
    for (const name of this.plugins.keys()) this.watch(name);
  }
  // ─── 内部 ───
  resolveEntry(pluginDir) {
    for (const f of ["index.js", "main.js", "index.mjs", "index.cjs"]) {
      const p = path.join(pluginDir, f);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
  readManifest(pluginDir) {
    try {
      const p = path.join(pluginDir, "plugin.json");
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
    }
    return {};
  }
  createSdk(plugin) {
    return {
      name: plugin.name,
      log: plugin.log,
      registerCommand: (name, fn) => {
        plugin.commands.set(name, fn);
      },
      registerHook: (hook) => {
        plugin.hooks = { ...plugin.hooks, ...hook };
      },
      on: (event, fn) => this.bus.on(plugin.name, event, fn),
      emit: (event, data) => this.bus.emit(event, data),
      api: {
        now: () => Date.now(),
        platform: process.platform
      }
    };
  }
  /**
   * 受限 require：允许插件 require 其自身目录下的相对模块，
   * 以及白名单内置模块（path/fs 的子集由系统侧保护，仅提供只读辅助函数）。
   * 绝对路径/上级目录/黑名单模块一律拒绝。
   */
  createSafeRequire(pluginDir, plugin) {
    const ALLOWED = /* @__PURE__ */ new Set(["path", "path/posix", "path/win32", "url"]);
    const req = (specifier) => {
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const resolved = path.resolve(pluginDir, specifier);
        if (!resolved.startsWith(pluginDir + path.sep)) {
          throw new Error(`[\u5B89\u5168] require \u8D8A\u754C: ${specifier}`);
        }
        if (!fs.existsSync(resolved)) throw new Error(`\u6A21\u5757\u4E0D\u5B58\u5728: ${specifier}`);
        const code = fs.readFileSync(resolved, "utf-8");
        const m = { exports: {} };
        const localRequire = this.createSafeRequire(path.dirname(resolved), plugin);
        const fn = new Function("module", "exports", "require", code);
        fn(m, m.exports, localRequire);
        return m.exports;
      }
      if (ALLOWED.has(specifier)) {
        return __require(specifier);
      }
      throw new Error(`[\u5B89\u5168] \u4E0D\u5141\u8BB8 require: ${specifier}`);
    };
    return req;
  }
};
function createPluginRuntime(projectRoot, opts) {
  return new PluginRuntime(projectRoot, opts);
}
export {
  PluginRuntime,
  createPluginRuntime
};
