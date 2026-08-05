// src/main/debuggerManager.ts
import { spawn } from "node:child_process";
import * as path from "node:path";
var DebuggerManager = class {
  sessions = /* @__PURE__ */ new Map();
  list() {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      pid: s.pid,
      isRunning: !s.isPaused,
      isPaused: s.isPaused,
      breakpointCount: s.breakpoints.length,
      script: s.script
    }));
  }
  get(sessionId) {
    return this.sessions.get(sessionId);
  }
  /**
   * 启动调试会话：spawn --inspect-brk 子进程并连接 CDP
   */
  async start(cwd, script, args = []) {
    const sessionId = `dbg-${Date.now()}`;
    const child = spawn(process.execPath, ["--inspect-brk=0", script, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" }
    });
    const session = {
      id: sessionId,
      pid: child.pid || 0,
      script,
      child,
      ws: null,
      nextId: 1,
      pending: /* @__PURE__ */ new Map(),
      isPaused: true,
      breakpoints: [],
      callStack: [],
      variables: {},
      scriptIdToUrl: /* @__PURE__ */ new Map(),
      urlToScriptId: /* @__PURE__ */ new Map(),
      lastEvalResult: null
    };
    this.sessions.set(sessionId, session);
    const wsUrl = await new Promise((resolve2, reject) => {
      const timeout = setTimeout(() => reject(new Error("\u7B49\u5F85\u8C03\u8BD5\u7AEF\u53E3\u8D85\u65F6")), 1e4);
      const onData = (buf) => {
        const text = buf.toString();
        const m = text.match(/ws:\/\/[^\s]+/);
        if (m) {
          clearTimeout(timeout);
          child.stderr?.off("data", onData);
          resolve2(m[0]);
        }
      };
      child.stderr?.on("data", onData);
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`\u8C03\u8BD5\u8FDB\u7A0B\u63D0\u524D\u9000\u51FA (code ${code})`));
      });
    });
    try {
      const ws = new WebSocket(wsUrl);
      await new Promise((resolve2, reject) => {
        const timer = setTimeout(() => reject(new Error("WebSocket \u8FDE\u63A5\u8D85\u65F6")), 1e4);
        ws.onopen = () => {
          clearTimeout(timer);
          resolve2();
        };
        ws.onerror = (e) => {
          clearTimeout(timer);
          reject(new Error(`WebSocket \u9519\u8BEF: ${e instanceof Error ? e.message : String(e)}`));
        };
      });
      session.ws = ws;
      ws.onmessage = (event) => this.handleMessage(session, event);
      ws.onclose = () => {
        session.isPaused = false;
        try {
          session.child.kill();
        } catch {
        }
      };
      await this.send(session, "Debugger.enable");
      await this.send(session, "Runtime.enable");
      await this.waitPaused(session);
      await this.send(session, "Debugger.getScriptSource", {});
      return { sessionId, pid: child.pid || 0 };
    } catch (e) {
      try {
        child.kill();
      } catch {
      }
      this.sessions.delete(sessionId);
      return { sessionId: "", pid: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }
  async stop(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    try {
      s.ws?.close();
    } catch {
    }
    try {
      s.child.kill();
    } catch {
    }
    this.sessions.delete(sessionId);
    return true;
  }
  async setBreakpoint(sessionId, file, line, condition) {
    const s = this.sessions.get(sessionId);
    if (!s) return { success: false, error: "\u4F1A\u8BDD\u4E0D\u5B58\u5728" };
    const existing = s.breakpoints.find((b) => b.file === file && b.line === line);
    if (existing) {
      if (condition !== void 0) existing.condition = condition;
      return { success: true, message: "\u5DF2\u66F4\u65B0" };
    }
    const scriptId = this.findScriptId(s, file);
    if (!scriptId) return { success: false, error: `\u65E0\u6CD5\u5B9A\u4F4D\u811A\u672C: ${file}\uFF08\u53EF\u80FD\u672A\u52A0\u8F7D\uFF09` };
    try {
      const res = await this.send(s, "Debugger.setBreakpointByUrl", {
        lineNumber: line - 1,
        // CDP 是 0-based
        url: void 0,
        urlRegex: void 0,
        scriptId,
        condition: condition || void 0
      });
      const bp = res?.breakpointId ? { file, line, condition, breakpointId: res.breakpointId } : { file, line, condition };
      s.breakpoints.push(bp);
      return { success: true, message: "\u65AD\u70B9\u5DF2\u8BBE\u7F6E", breakpointId: bp.breakpointId };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  removeBreakpoint(sessionId, file, line) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    const idx = s.breakpoints.findIndex((b) => b.file === file && b.line === line);
    if (idx === -1) return false;
    const [bp] = s.breakpoints.splice(idx, 1);
    if (bp.breakpointId) {
      void this.send(s, "Debugger.removeBreakpoint", { breakpointId: bp.breakpointId }).catch(() => {
      });
    }
    return true;
  }
  listBreakpoints(sessionId) {
    return this.sessions.get(sessionId)?.breakpoints || [];
  }
  async resume(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s || !s.isPaused) return false;
    s.isPaused = false;
    s.callStack = [];
    s.variables = {};
    await this.send(s, "Debugger.resume");
    return true;
  }
  async pause(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s || s.isPaused) return false;
    await this.send(s, "Debugger.pause");
    return true;
  }
  async step(sessionId, kind) {
    const s = this.sessions.get(sessionId);
    if (!s || !s.isPaused) return false;
    const method = kind === "over" ? "Debugger.stepOver" : kind === "into" ? "Debugger.stepInto" : "Debugger.stepOut";
    s.isPaused = false;
    await this.send(s, method);
    return true;
  }
  async evaluate(sessionId, expression) {
    const s = this.sessions.get(sessionId);
    if (!s) return { success: false, error: "\u4F1A\u8BDD\u4E0D\u5B58\u5728" };
    try {
      const res = await this.send(s, "Runtime.evaluate", { expression, returnByValue: true });
      const r = res?.result;
      if (r?.exceptionDetails) {
        const desc = r.exceptionDetails.exception?.description || r.exceptionDetails.text || "\u5F02\u5E38";
        return { success: false, error: desc };
      }
      const v = r?.result;
      const val = v?.value !== void 0 ? String(v.value) : v?.description ?? "undefined";
      return { success: true, result: val, type: v?.type || "unknown" };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  // ─── 内部：CDP 消息 ───
  handleMessage(s, event) {
    let msg;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (msg.id !== void 0) {
      const pending = s.pending.get(msg.id);
      if (pending) {
        s.pending.delete(msg.id);
        pending(msg);
      }
      return;
    }
    switch (msg.method) {
      case "Debugger.paused":
        this.onPaused(s, msg.params);
        break;
      case "Debugger.scriptParsed": {
        const p = msg.params;
        const scriptId = String(p.scriptId || "");
        const url = String(p.url || "");
        if (scriptId && url) {
          s.scriptIdToUrl.set(scriptId, url);
          s.urlToScriptId.set(url, scriptId);
        }
        break;
      }
      case "Debugger.resumed":
        s.isPaused = false;
        break;
      default:
        break;
    }
  }
  onPaused(s, params) {
    s.isPaused = true;
    s.callStack = [];
    s.variables = {};
    for (const frame of params.callFrames || []) {
      const loc = frame.location;
      const scriptId = loc?.scriptId || "";
      const url = s.scriptIdToUrl.get(scriptId) || "";
      s.callStack.push({
        name: frame.functionName || "(anonymous)",
        file: url,
        line: (loc?.lineNumber ?? 0) + 1,
        // 转 1-based
        column: (loc?.columnNumber ?? 0) + 1
      });
      const scope = frame.scopeChain?.[0];
      if (scope?.object?.objectId) {
        this.send(s, "Runtime.getProperties", { objectId: scope.object.objectId, ownProperties: true }).then((res) => {
          const props = res?.result || [];
          for (const p of props) {
            if (!p.name) continue;
            const v = p.value;
            const val = v?.value !== void 0 ? String(v.value) : v?.description ?? "";
            s.variables[p.name] = val;
          }
        }).catch(() => {
        });
      }
    }
  }
  findScriptId(s, filePath) {
    const normalized = path.resolve(filePath);
    for (const [scriptId, url] of s.scriptIdToUrl) {
      try {
        if (path.resolve(url) === normalized) return scriptId;
      } catch {
      }
      if (url === filePath) return scriptId;
      if (url.includes(filePath) || filePath.includes(url)) return scriptId;
    }
    return null;
  }
  send(s, method, params) {
    return new Promise((resolve2, reject) => {
      if (!s.ws) {
        reject(new Error("WebSocket \u672A\u8FDE\u63A5"));
        return;
      }
      const id = s.nextId++;
      const timer = setTimeout(() => {
        s.pending.delete(id);
        reject(new Error(`CDP \u8C03\u7528\u8D85\u65F6: ${method}`));
      }, 5e3);
      s.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve2(msg.result);
      });
      try {
        s.ws.send(JSON.stringify({ id, method, params: params || {} }));
      } catch (e) {
        clearTimeout(timer);
        s.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }
  waitPaused(s) {
    return new Promise((resolve2, reject) => {
      const timer = setTimeout(() => reject(new Error("\u7B49\u5F85\u65AD\u70B9\u6682\u505C\u8D85\u65F6")), 1e4);
      const check = () => {
        if (s.isPaused) {
          clearTimeout(timer);
          resolve2();
          return true;
        }
        return false;
      };
      if (check()) return;
      const iv = setInterval(() => {
        if (check()) clearInterval(iv);
      }, 100);
      setTimeout(() => clearInterval(iv), 11e3).unref?.();
    });
  }
};
function createDebuggerManager() {
  return new DebuggerManager();
}
export {
  DebuggerManager,
  createDebuggerManager
};
