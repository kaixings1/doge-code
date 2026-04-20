import autoBind from 'auto-bind';
import { closeSync, constants as fsConstants, openSync, readSync, writeSync } from 'fs';
import noop from 'lodash-es/noop.js';
import throttle from 'lodash-es/throttle.js';
import React, { type ReactNode } from 'react';
import type { FiberRoot } from 'react-reconciler';
import { ConcurrentRoot } from 'react-reconciler/constants.js';
import { onExit } from 'signal-exit';
import { flushInteractionTime } from 'src/bootstrap/state.js';
import { getYogaCounters } from 'src/native-ts/yoga-layout/index.js';
import { logForDebugging } from 'src/utils/debug.js';
import { logError } from 'src/utils/log.js';
import { format } from 'util';
import { colorize } from './colorize.js';
import App from './components/App.js';
import type { CursorDeclaration, CursorDeclarationSetter } from './components/CursorDeclarationContext.js';
import { FRAME_INTERVAL_MS } from './constants.js';
import * as dom from './dom.js';
import { KeyboardEvent } from './events/keyboard-event.js';
import { FocusManager } from './focus.js';
import { emptyFrame, type Frame, type FrameEvent } from './frame.js';
import { dispatchClick, dispatchHover } from './hit-test.js';
import instances from './instances.js';
import { LogUpdate } from './log-update.js';
import { nodeCache } from './node-cache.js';
import { optimize } from './optimizer.js';
import Output from './output.js';
import type { ParsedKey } from './parse-keypress.js';
import reconciler, { dispatcher, getLastCommitMs, getLastYogaMs, isDebugRepaintsEnabled, recordYogaMs, resetProfileCounters } from './reconciler.js';
import renderNodeToOutput, { consumeFollowScroll, didLayoutShift } from './render-node-to-output.js';
import { applyPositionedHighlight, type MatchPosition, scanPositions } from './render-to-screen.js';
import createRenderer, { type Renderer } from './renderer.js';
import { CellWidth, CharPool, cellAt, createScreen, HyperlinkPool, isEmptyCellAt, migrateScreenPools, StylePool } from './screen.js';
import { applySearchHighlight } from './searchHighlight.js';
import { applySelectionOverlay, captureScrolledRows, clearSelection, createSelectionState, extendSelection, type FocusMove, findPlainTextUrlAt, getSelectedText, hasSelection, moveFocus, type SelectionState, selectLineAt, selectWordAt, shiftAnchor, shiftSelection, shiftSelectionForFollow, startSelection, updateSelection } from './selection.js';
import { SYNC_OUTPUT_SUPPORTED, supportsExtendedKeys, type Terminal, writeDiffToTerminal } from './terminal.js';
import { CURSOR_HOME, cursorMove, cursorPosition, DISABLE_KITTY_KEYBOARD, DISABLE_MODIFY_OTHER_KEYS, ENABLE_KITTY_KEYBOARD, ENABLE_MODIFY_OTHER_KEYS, ERASE_SCREEN } from './termio/csi.js';
import { DBP, DFE, DISABLE_MOUSE_TRACKING, ENABLE_MOUSE_TRACKING, ENTER_ALT_SCREEN, EXIT_ALT_SCREEN, SHOW_CURSOR } from './termio/dec.js';
import { CLEAR_ITERM2_PROGRESS, CLEAR_TAB_STATUS, setClipboard, supportsTabStatus, wrapForMultiplexer } from './termio/osc.js';
import { TerminalWriteProvider } from './useTerminalNotification.js';

// 替代屏幕模式：renderer.ts 中设置 cursor.visible = !isTTY || screen.height===0，
// 在替代屏幕模式下该值始终为 false（TTY 存在且内容填满屏幕）。
// 复用冻结对象可每帧节省一次内存分配。
const ALT_SCREEN_ANCHOR_CURSOR = Object.freeze({
  x: 0,
  y: 0,
  visible: false
});
const CURSOR_HOME_PATCH = Object.freeze({
  type: 'stdout' as const,
  content: CURSOR_HOME
});
const ERASE_THEN_HOME_PATCH = Object.freeze({
  type: 'stdout' as const,
  content: ERASE_SCREEN + CURSOR_HOME
});

// 针对每个 Ink 实例缓存，在尺寸变化时失效。替代屏幕下 frame.cursor.y 始终为 terminalRows - 1（参见 renderer.ts）。
function makeAltScreenParkPatch(terminalRows: number) {
  return Object.freeze({
    type: 'stdout' as const,
    content: cursorPosition(terminalRows, 1)
  });
}
export type Options = {
  stdout: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  stderr: NodeJS.WriteStream;
  exitOnCtrlC: boolean;
  patchConsole: boolean;
  waitUntilExit?: () => Promise<void>;
  onFrame?: (event: FrameEvent) => void;
};
export default class Ink {
  private readonly log: LogUpdate;
  private readonly terminal: Terminal;
  private scheduleRender: (() => void) & {
    cancel?: () => void;
  };
  // 卸载树后忽略最后一次渲染，防止退出前产生空输出
  private isUnmounted = false;
  private isPaused = false;
  private readonly container: FiberRoot;
  private rootNode: dom.DOMElement;
  readonly focusManager: FocusManager;
  private renderer: Renderer;
  private readonly stylePool: StylePool;
  private charPool: CharPool;
  private hyperlinkPool: HyperlinkPool;
  private exitPromise?: Promise<void>;
  private restoreConsole?: () => void;
  private restoreStderr?: () => void;
  private readonly unsubscribeTTYHandlers?: () => void;
  private terminalColumns: number;
  private terminalRows: number;
  private currentNode: ReactNode = null;
  private frontFrame: Frame;
  private backFrame: Frame;
  private lastPoolResetTime = performance.now();
  private drainTimer: ReturnType<typeof setTimeout> | null = null;
  private lastYogaCounters: {
    ms: number;
    visited: number;
    measured: number;
    cacheHits: number;
    live: number;
  } = {
    ms: 0,
    visited: 0,
    measured: 0,
    cacheHits: 0,
    live: 0
  };
  private altScreenParkPatch: Readonly<{
    type: 'stdout';
    content: string;
  }>;
  // 文本选择状态（仅限替代屏幕）。在此处管理，以便 onRender 中的叠加层可读取，且 App.tsx 可通过鼠标事件更新。公开以供 instances.get() 调用方访问。
  readonly selection: SelectionState = createSelectionState();
  // 搜索高亮查询（仅限替代屏幕）。下方 setter 会触发 scheduleRender；onRender 中的 applySearchHighlight 将匹配单元格反色。
  private searchHighlightQuery = '';
  // 基于位置的高亮。VML 在目标消息挂载时扫描一次位置（通过 scanElementSubtree），存储相对于消息的位置，并为每一帧设置此值。rowOffset = 消息当前的屏幕顶部。currentIdx = 当前“当前”项的索引（黄色）。设为 null 则清除。位置是提前确定的——导航只是索引运算，无扫描反馈循环。
  private searchPositions: {
    positions: MatchPosition[];
    rowOffset: number;
    currentIdx: number;
  } | null = null;
  // 选择状态变化的 React 订阅者（useHasSelection）。在选择变更时与终端重绘一起触发，以便 UI（如底部提示）可对选择出现/清除做出响应。
  private readonly selectionListeners = new Set<() => void>();
  // 当前指针下的 DOM 节点（模式 1003 移动）。保存在此处以便 App.tsx 的 handleMouseEvent 保持无状态——dispatchHover 会与此集合进行差异对比并原地修改。
  private readonly hoveredNodes = new Set<dom.DOMElement>();
  // 由 <AlternateScreen> 通过 setAltScreenActive() 设置。控制渲染器中 cursor.y 的钳位（使光标保持在视口内，避免当 screen.height === terminalRows 时因换行引发滚动），并决定替代屏幕感知的 SIGCONT/尺寸变化/卸载处理。
  private altScreenActive = false;
  // 与 altScreenActive 一起设置，以便 SIGCONT 恢复时知道是否重新启用鼠标跟踪（并非所有 <AlternateScreen> 都需要它）。
  private altScreenMouseTracking = false;
  // 为 true 时表示前一帧的屏幕缓冲区不可信（选择叠加层修改过、resetFramesForAltScreen() 将其替换为空白，或 forceRedraw() 将其重置为 0×0）。强制进行一次全量渲染；稳定状态的帧之后会清除该标志并重新启用 blit + 窄损伤快速路径。
  private prevFrameContaminated = false;
  // 由 handleResize 设置：在下一次 onRender 的 BSU/ESU 代码块内前置 ERASE_SCREEN，使清除与绘制保持原子性。若在 handleResize 中同步写入 ERASE_SCREEN，则在渲染所需的约 80ms 内屏幕会保持空白；延迟到原子块内则可在新帧完全就绪前保持旧内容可见。
  private needsEraseBeforePaint = false;
  // 原生光标定位：组件（通过 useDeclaredCursor）声明每帧后终端光标应停放在何处。终端模拟器会在物理光标位置渲染 IME 预编辑文本，屏幕阅读器/放大器也会跟踪它——因此将光标停在文本输入符处可使 CJK 输入内联显示，并让辅助工具跟随。
  private cursorDeclaration: CursorDeclaration | null = null;
  // 主屏幕：声明光标移动后的物理光标位置，与 frame.cursor 分开跟踪（后者必须保持在内容底部以满足 log-update 的相对移动不变性）。替代屏幕不需要此字段——每帧都以 CSI H 开始。null 表示上一帧未发送移动指令。
  private displayCursor: {
    x: number;
    y: number;
  } | null = null;
  constructor(private readonly options: Options) {
    autoBind(this);
    if (this.options.patchConsole) {
      this.restoreConsole = this.patchConsole();
      // 由于 Promise 解析 bug，在 Windows/Bun 上跳过 patchStderr
      // https://github.com/oven-sh/bun/issues/...
      const isWindows = process.platform === 'win32';
      const isBun = typeof process.versions.bun === 'string';
      if (isWindows || isBun) {
        // 在 Windows/Bun 上跳过 patchStderr
      } else {
        this.restoreStderr = this.patchStderr();
      }
    }
    this.terminal = {
      stdout: options.stdout,
      stderr: options.stderr
    };
    this.terminalColumns = options.stdout.columns || 80;
    this.terminalRows = options.stdout.rows || 24;
    this.altScreenParkPatch = makeAltScreenParkPatch(this.terminalRows);
    this.stylePool = new StylePool();
    this.charPool = new CharPool();
    this.hyperlinkPool = new HyperlinkPool();
    this.frontFrame = emptyFrame(this.terminalRows, this.terminalColumns, this.stylePool, this.charPool, this.hyperlinkPool);
    this.backFrame = emptyFrame(this.terminalRows, this.terminalColumns, this.stylePool, this.charPool, this.hyperlinkPool);
    this.log = new LogUpdate({
      isTTY: options.stdout.isTTY as boolean | undefined || false,
      stylePool: this.stylePool
    });

    // scheduleRender 由协调器的 resetAfterCommit 调用，此处使用节流（throttle）确保帧率稳定。
    const deferredRender = (): void => queueMicrotask(this.onRender);
    this.scheduleRender = throttle(deferredRender, FRAME_INTERVAL_MS, {
      leading: true,
      trailing: true
    });

    // 卸载树后忽略最后一次渲染，防止退出前产生空输出
    this.isUnmounted = false;

    // 进程退出时卸载
    this.unsubscribeExit = onExit(this.unmount, {
      alwaysLast: false
    });
    if (options.stdout.isTTY) {
      options.stdout.on('resize', this.handleResize);
      process.on('SIGCONT', this.handleResume);
      this.unsubscribeTTYHandlers = () => {
        options.stdout.off('resize', this.handleResize);
        process.off('SIGCONT', this.handleResume);
      };
    }
    this.rootNode = dom.createNode('ink-root');
    this.focusManager = new FocusManager((target, event) => dispatcher.dispatchDiscrete(target, event));
    this.rootNode.focusManager = this.focusManager;
    this.renderer = createRenderer(this.rootNode, this.stylePool);
    this.rootNode.onRender = this.scheduleRender;
    this.rootNode.onImmediateRender = this.onRender;
    this.rootNode.onComputeLayout = () => {
      // 在 React 的提交阶段计算布局，使 useLayoutEffect 钩子能获取到最新的布局数据
      // 防止在卸载后访问已释放的 Yoga 节点
      if (this.isUnmounted) {
        return;
      }
      if (this.rootNode.yogaNode) {
        const t0 = performance.now();
        this.rootNode.yogaNode.setWidth(this.terminalColumns);
        this.rootNode.yogaNode.calculateLayout(this.terminalColumns);
        const ms = performance.now() - t0;
        recordYogaMs(ms);
        const c = getYogaCounters();
        this.lastYogaCounters = {
          ms,
          ...c
        };
      }
    };
    // @ts-expect-error @types/react-reconciler 声明了 11 个参数包含 transitionCallbacks，但 react-reconciler 0.33.0 源码只接受 10 个参数（无 transitionCallbacks）
    this.container = reconciler.createContainer(this.rootNode, ConcurrentRoot, null, false, null, 'id', noop,
    // onUncaughtError
    noop,
    // onCaughtError
    noop,
    // onRecoverableError
    noop // onDefaultTransitionIndicator
    );
    if ("production" === 'development') {
      reconciler.injectIntoDevTools({
        bundleType: 0,
        // 报告的是 React DOM 的版本，而非 Ink 的版本
        // 参见 https://github.com/facebook/react/issues/16666#issuecomment-532639905
        version: '16.13.1',
        rendererPackageName: 'ink'
      });
    }
  }
  private handleResume = () => {
    if (!this.options.stdout.isTTY) {
      return;
    }

    // 替代屏幕：SIGCONT 后内容已陈旧（shell 可能已向主屏幕写入内容并切换了焦点），且鼠标跟踪在 handleSuspend 中被禁用。
    if (this.altScreenActive) {
      this.reenterAltScreen();
      return;
    }

    // 主屏幕：全新开始，防止覆盖终端内容
    this.frontFrame = emptyFrame(this.frontFrame.viewport.height, this.frontFrame.viewport.width, this.stylePool, this.charPool, this.hyperlinkPool);
    this.backFrame = emptyFrame(this.backFrame.viewport.height, this.backFrame.viewport.width, this.stylePool, this.charPool, this.hyperlinkPool);
    this.log.reset();
    // 在挂起期间 shell 接管了终端，物理光标位置未知。清除 displayCursor 以便下一帧的光标序言不会基于过时的停放位置发出相对移动。
    this.displayCursor = null;
  };

  // 非防抖。防抖会导致一个时间窗口内 stdout.columns 已更新但 this.terminalColumns/Yoga 仍为旧值——在此期间触发的任何 scheduleRender（spinner、clock）都会使 log-update 检测到宽度变化并清屏，随后防抖触发再次清屏（双重闪烁）。useVirtualScroll 的高度缩放已经限制了每次尺寸变化的成本；同步处理可保持尺寸一致性。
  private handleResize = () => {
    const cols = this.options.stdout.columns || 80;
    const rows = this.options.stdout.rows || 24;
    // 终端常为一次用户操作（窗口稳定）发出 2 次以上尺寸变化事件。相同尺寸的事件为无操作；跳过以避免多余的帧重置和渲染。
    if (cols === this.terminalColumns && rows === this.terminalRows) return;
    this.terminalColumns = cols;
    this.terminalRows = rows;
    this.altScreenParkPatch = makeAltScreenParkPatch(this.terminalRows);

    // 替代屏幕：重置帧缓冲区，使下一次渲染从头开始绘制（prevFrameContaminated → 写入每个单元格，包裹在 BSU/ESU 中——旧内容会一直显示，直到新帧原子性地交换）。重新断言鼠标跟踪（某些模拟器在尺寸变化时会重置）。不要写入 ENTER_ALT_SCREEN：即使在替代屏幕中，iTerm2 也会将 ?1049h 视为缓冲区清除——这会导致空白闪烁。自我修复（如果某些操作将我们踢出替代屏幕）由 handleResume（SIGCONT）和睡眠-唤醒检测器处理；尺寸变化本身不会退出替代屏幕。不要写入 ERASE_SCREEN：下方的 render() 可能需要约 80ms；先擦除会使屏幕在此期间保持空白。
    if (this.altScreenActive && !this.isPaused && this.options.stdout.isTTY) {
      if (this.altScreenMouseTracking) {
        this.options.stdout.write(ENABLE_MOUSE_TRACKING);
      }
      this.resetFramesForAltScreen();
      this.needsEraseBeforePaint = true;
    }

    // 使用更新后的属性重新渲染 React 树，使上下文值变化。
    // React 的提交阶段将调用 onComputeLayout() 以新尺寸重新计算 yoga 布局，然后调用 onRender() 渲染更新后的帧。
    // 此处不调用 scheduleRender()，因为那会在布局更新之前渲染，导致视口与内容尺寸不匹配。
    if (this.currentNode !== null) {
      this.render(this.currentNode);
    }
  };
  resolveExitPromise: () => void = () => {};
  rejectExitPromise: (reason?: Error) => void = () => {};
  unsubscribeExit: () => void = () => {};

  /**
   * 暂停 Ink 并将终端控制权移交给外部 TUI（例如 git commit 编辑器）。
   * 在非全屏模式下会进入替代屏幕；在全屏模式下我们已处于替代屏幕，因此仅清屏。
   * 完成后调用 `exitAlternateScreen()` 以恢复 Ink。
   */
  enterAlternateScreen(): void {
    this.pause();
    this.suspendStdin();
    this.options.stdout.write(
    // 首先禁用扩展键报告——不识别 CSI-u 的编辑器（如 nano）在 kitty/modifyOtherKeys 保持活动时会对每个 Ctrl-<key> 显示“未知序列”。exitAlternateScreen 会重新启用。
    DISABLE_KITTY_KEYBOARD + DISABLE_MODIFY_OTHER_KEYS + (this.altScreenMouseTracking ? DISABLE_MOUSE_TRACKING : '') + (
    // 禁用鼠标（若已关闭则为无操作）
    this.altScreenActive ? '' : '\x1b[?1049h') +
    // 进入替代屏幕（全屏模式下已处于替代屏幕）
    '\x1b[?1004l' +
    // 禁用焦点报告
    '\x1b[0m' +
    // 重置属性
    '\x1b[?25h' +
    // 显示光标
    '\x1b[2J' +
    // 清屏
    '\x1b[H' // 光标归位
    );
  }

  /**
   * 在外部 TUI 移交后恢复 Ink 并进行完整重绘。
   * 非全屏模式下会退出替代屏幕回到主屏幕；全屏模式下会重新进入替代屏幕并清屏 + 重绘。
   *
   * 重新进入很重要：终端编辑器（vim、nano、less）会写入 smcup/rmcup (?1049h/?1049l)，因此即使我们以替代屏幕启动，编辑器的 rmcup 在退出时也会将我们丢回主屏幕。若不重新进入，下方的 2J 会擦除用户主屏幕的滚动历史，后续渲染也会落在主屏幕——原生终端滚动恢复，全屏滚动失效。
   */
  exitAlternateScreen(): void {
    this.options.stdout.write((this.altScreenActive ? ENTER_ALT_SCREEN : '') +
    // 重新进入替代屏幕——vim 的 rmcup 将我们丢回了主屏幕
    '\x1b[2J' +
    // 清屏（全屏模式下现在处于替代屏幕）
    '\x1b[H' + (
    // 光标归位
    this.altScreenMouseTracking ? ENABLE_MOUSE_TRACKING : '') + (
    // 重新启用鼠标（若 CLAUDE_CODE_DISABLE_MOUSE 则跳过）
    this.altScreenActive ? '' : '\x1b[?1049l') +
    // 退出替代屏幕（仅限非全屏）
    '\x1b[?25l' // 隐藏光标（由 Ink 管理）
    );
    this.resumeStdin();
    if (this.altScreenActive) {
      this.resetFramesForAltScreen();
    } else {
      this.repaint();
    }
    this.resume();
    // 重新启用焦点报告和扩展键报告——终端编辑器（vim、nano 等）在进入时会写入自己的 modifyOtherKeys 级别，并在退出时重置，导致我们无法区分 ctrl+shift+<字母> 和 ctrl+<字母>。先弹出后推入可保持 Kitty 栈平衡（设计良好的编辑器会恢复我们的进入状态，因此若不弹出，每次编辑器往返都会累积深度）。
    this.options.stdout.write('\x1b[?1004h' + (supportsExtendedKeys() ? DISABLE_KITTY_KEYBOARD + ENABLE_KITTY_KEYBOARD + ENABLE_MODIFY_OTHER_KEYS : ''));
  }
  onRender() {
    if (this.isUnmounted || this.isPaused) {
      return;
    }
    // 进入渲染时取消任何待处理的 drain tick——本次渲染将处理 drain（并在需要时重新调度）。防止滚轮事件触发的渲染和 drain 定时器渲染同时触发。
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }

    // 在渲染前刷新延迟的交互时间，这样每帧最多调用一次 Date.now()，而非每次按键都调用。
    // 在渲染前完成，避免因状态变更触发额外的 React 重渲染周期。
    flushInteractionTime();
    const renderStart = performance.now();
    const terminalWidth = this.options.stdout.columns || 80;
    const terminalRows = this.options.stdout.rows || 24;
    const frame = this.renderer({
      frontFrame: this.frontFrame,
      backFrame: this.backFrame,
      isTTY: this.options.stdout.isTTY,
      terminalWidth,
      terminalRows,
      altScreen: this.altScreenActive,
      prevFrameContaminated: this.prevFrameContaminated
    });
    const rendererMs = performance.now() - renderStart;

    // 粘性/自动跟随在本帧滚动了 ScrollBox。将选择内容平移相同增量，使高亮保持锚定到文本（原生终端行为——选择内容随内容滚动向上移动，最终在顶部裁剪）。frontFrame 仍持有前一帧的屏幕（缓冲区交换在约 500 行后进行），因此 captureScrolledRows 读取即将滚动出的行是在它们被覆盖之前——文本在选择完全滚出之前仍可复制。拖动期间，焦点跟踪鼠标（屏幕局部），因此仅锚点移动——随着锚点向上移动，选择范围向鼠标方向扩展。释放后，两端均锚定到文本，并作为一个整体移动。
    const follow = consumeFollowScroll();
    if (follow && this.selection.anchor &&
    // 仅当选择内容位于 ScrollBox 内容上时才平移。页脚/提示/StickyPromptHeader 中的选择位于静态文本上——滚动不会移动它们下方的内容。没有此守卫，页脚选择会被偏移 -delta 然后钳位到 viewportBottom，从而被传送进 ScrollBox。与 ScrollKeybindingHandler 中已删除的 check() 中的边界检查一致。
    this.selection.anchor.row >= follow.viewportTop && this.selection.anchor.row <= follow.viewportBottom) {
      const {
        delta,
        viewportTop,
        viewportBottom
      } = follow;
      // captureScrolledRows 和 shift* 成对出现：capture 抓取即将滚出的行，shift 移动选择端点，使得相同行在下一帧不会再次相交。只抓取不移位会导致端点留在原地，导致同一视口行每帧都相交，scrolledOffAbove 无限制增长——每次重新复制时 getSelectedText 都会返回越来越多的文本。将 capture 放在每个 shift 分支内部，确保成对关系不会被新的守卫破坏。
      if (this.selection.isDragging) {
        if (hasSelection(this.selection)) {
          captureScrolledRows(this.selection, this.frontFrame.screen, viewportTop, viewportTop + delta - 1, 'above');
        }
        shiftAnchor(this.selection, -delta, viewportTop, viewportBottom);
      } else if (
      // Flag-3 守卫：上方的 anchor 检查仅证明一端位于 ScrollBox 内容上。从第 3 行（ScrollBox）拖动到第 6 行的页脚然后释放，会使焦点位于视口外——shiftSelectionForFollow 会将其钳位到 viewportBottom，从而将高亮从静态页脚传送到 ScrollBox 中。
      // 对称检查：要求两端均在内部才平移。跨边界选择落入既不平移也不捕获的分支：页脚端点固定选择，文本在高亮下方滚动，getSelectedText 读取当前屏幕内容——无累积。拖动分支不需要此检查：shiftAnchor 忽略焦点，而锚点确实会移动（因此即使焦点在页脚中，capture 也是正确的）。
      !this.selection.focus || this.selection.focus.row >= viewportTop && this.selection.focus.row <= viewportBottom) {
        if (hasSelection(this.selection)) {
          captureScrolledRows(this.selection, this.frontFrame.screen, viewportTop, viewportTop + delta - 1, 'above');
        }
        const cleared = shiftSelectionForFollow(this.selection, -delta, viewportTop, viewportBottom);
        // 自动清除（两端均超出 minRow）必须通知 React 领域，以便 useHasSelection 重新渲染，并使页脚的复制/退出提示消失。notifySelectionChange() 会递归进入 onRender；直接触发监听器——它们稍后调度 React 更新，不会重入本帧。
        if (cleared) for (const cb of this.selectionListeners) cb();
      }
    }

    // 选择覆盖层：在屏幕缓冲区自身内反转单元格样式，以便 diff 将选择视为普通单元格更改，且 LogUpdate 保持为纯粹的 diff 引擎。
    //
    // 全屏损伤（PR #20120）是兄弟元素尺寸变化时边界漏损的正确性保障：当 flexbox 兄弟元素在帧之间尺寸变化时（spinner 出现 → 底部增长 → ScrollBox 缩小），基于缓存清除 + 裁剪剔除 + setCellAt 的损伤合并可能会遗漏边界上的过渡单元格。但这仅发生在布局实际移动时——didLayoutShift() 精确跟踪了这一点（任何节点的缓存 yoga 位置/尺寸与当前不同，或子节点被移除）。稳定状态的帧（spinner 旋转、时钟滴答、文本流入固定高度框）不会移动布局，因此正常的损伤边界是正确的，diffEach 仅比较受损区域。
    //
    // 选择也需要全量损伤：覆盖层通过 setCellStyleId 写入，该方法不跟踪损伤，且当选择移动/清除时需要比较前一帧的覆盖层单元格。prevFrameContaminated 覆盖了选择清除后的那一帧。
    let selActive = false;
    let hlActive = false;
    if (this.altScreenActive) {
      selActive = hasSelection(this.selection);
      if (selActive) {
        applySelectionOverlay(frame.screen, this.selection, this.stylePool);
      }
      // 扫描高亮：对所有可见匹配项反色（less/vim 风格）。
      // 位置高亮（下方）将 CURRENT（黄色）覆盖在最上层。
      hlActive = applySearchHighlight(frame.screen, this.searchHighlightQuery, this.stylePool);
      // 基于位置的 CURRENT：在 positions[currentIdx] + rowOffset 处写入黄色。无需扫描——位置来自消息首次挂载时的预先扫描。消息相对坐标 + rowOffset = 屏幕坐标。
      if (this.searchPositions) {
        const sp = this.searchPositions;
        const posApplied = applyPositionedHighlight(frame.screen, this.stylePool, sp.positions, sp.rowOffset, sp.currentIdx);
        hlActive = hlActive || posApplied;
      }
    }

    // 全量损伤回退：对替代屏幕和主屏幕均生效。布局移动（spinner 出现、状态行尺寸变化）可能导致兄弟元素边界留下过时单元格，而按节点损伤跟踪会遗漏。选择/高亮覆盖层通过 setCellStyleId 写入，不跟踪损伤。prevFrameContaminated 覆盖清理帧。
    if (didLayoutShift() || selActive || hlActive || this.prevFrameContaminated) {
      frame.screen.damage = {
        x: 0,
        y: 0,
        width: frame.screen.width,
        height: frame.screen.height
      };
    }

    // 替代屏幕：在每次 diff 之前将物理光标锚定到 (0,0)。log-update 中的所有光标移动都是相对于 prev.cursor 的；如果 tmux（或任何模拟器）带外扰动了物理光标（状态栏刷新、窗格重绘、Cmd+K 擦除），相对移动会发生漂移，内容每帧向上爬 1 行。CSI H 重置物理光标；传递 prev.cursor=(0,0) 使 diff 从相同起点计算。对任何外部光标操纵具有自愈能力。主屏幕不能这样做——cursor.y 跟踪 CSI H 无法到达的回滚行。CSI H 的写入延迟到 diff 计算之后，以便空 diff 可跳过（无写入 → 不使用物理光标）。
    let prevFrame = this.frontFrame;
    if (this.altScreenActive) {
      prevFrame = {
        ...this.frontFrame,
        cursor: ALT_SCREEN_ANCHOR_CURSOR
      };
    }
    const tDiff = performance.now();
    const diff = this.log.render(prevFrame, frame, this.altScreenActive,
    // DECSTBM 需要 BSU/ESU 原子性——没有它，外部终端会渲染滚动但尚未重绘的中间状态。tmux 是主要场景（它以自己的时序重新发送 DECSTBM，且未实现 DEC 2026，因此 SYNC_OUTPUT_SUPPORTED 为 false）。
    SYNC_OUTPUT_SUPPORTED);
    const diffMs = performance.now() - tDiff;
    // 交换缓冲区
    this.backFrame = this.frontFrame;
    this.frontFrame = frame;

    // 定期重置字符/超链接池，防止长时间会话中无限制增长。5 分钟的间隔足够长，使得 O(cells) 的迁移成本可忽略。复用 renderStart 以避免额外时钟调用。
    if (renderStart - this.lastPoolResetTime > 5 * 60 * 1000) {
      this.resetPools();
      this.lastPoolResetTime = renderStart;
    }
    const flickers: FrameEvent['flickers'] = [];
    for (const patch of diff) {
      if (patch.type === 'clearTerminal') {
        flickers.push({
          desiredHeight: frame.screen.height,
          availableHeight: frame.viewport.height,
          reason: patch.reason
        });
        if (isDebugRepaintsEnabled() && patch.debug) {
          const chain = dom.findOwnerChainAtRow(this.rootNode, patch.debug.triggerY);
          logForDebugging(`[REPAINT] 全量重置 · ${patch.reason} · 行 ${patch.debug.triggerY}\n` + `  前: "${patch.debug.prevLine}"\n` + `  后: "${patch.debug.nextLine}"\n` + `  元凶: ${chain.length ? chain.join(' < ') : '(未捕获到所有者链)'}`, {
            level: 'warn'
          });
        }
      }
    }
    const tOptimize = performance.now();
    const optimized = optimize(diff);
    const optimizeMs = performance.now() - tOptimize;
    const hasDiff = optimized.length > 0;
    if (this.altScreenActive && hasDiff) {
      // 前置 CSI H 将物理光标锚定到 (0,0)，使 log-update 的相对移动从已知位置计算（针对带外光标漂移的自愈能力，见上方 ALT_SCREEN_ANCHOR_CURSOR 注释）。追加 CSI row;1 H 将光标停放在底行（提示输入所在位置）——否则光标会停在最后一次 diff 写入的位置（每帧不同），导致 iTerm2 的光标引导在追逐光标时闪烁。BSU/ESU 保护内容原子性，但 iTerm2 的引导独立跟踪光标位置。停在底部（而非 0,0）可使引导保持在用户注意力所在处。
      //
      // 尺寸变化后，同时前置 ERASE_SCREEN。diff 只写入变化的单元格；新=空白且 prev-buffer=空白 的单元格会被跳过——但物理终端上仍有陈旧内容（较短行在新的宽度下会留下旧宽度的文本尾部）。在 BSU/ESU 内的 ERASE 是原子性的：旧内容会一直显示，直到整个擦除+绘制完成，然后一次性交换。若在 handleResize 中同步写入 ERASE_SCREEN，则会在渲染所需的约 80ms 内保持屏幕空白。
      if (this.needsEraseBeforePaint) {
        this.needsEraseBeforePaint = false;
        optimized.unshift(ERASE_THEN_HOME_PATCH);
      } else {
        optimized.unshift(CURSOR_HOME_PATCH);
      }
      optimized.push(this.altScreenParkPatch);
    }

    // 原生光标定位：将终端光标停放在声明的位置，以便 IME 预编辑文本内联渲染，屏幕阅读器/放大器可跟随输入。nodeCache 持有本帧 renderNodeToOutput 填充的绝对屏幕矩形（含 scrollTop 平移）——如果声明的节点未渲染（重新挂载后声明过时，或滚出视图），则不会出现在缓存中，且不发送移动指令。
    const decl = this.cursorDeclaration;
    const rect = decl !== null ? nodeCache.get(decl.node) : undefined;
    const target = decl !== null && rect !== undefined ? {
      x: rect.x + decl.relativeX,
      y: rect.y + decl.relativeY
    } : null;
    const parked = this.displayCursor;

    // 保持空 diff 的零写入快速路径：当无渲染且停放目标未变时跳过所有光标写入。
    const targetMoved = target !== null && (parked === null || parked.x !== target.x || parked.y !== target.y);
    if (hasDiff || targetMoved || target === null && parked !== null) {
      // 主屏幕序言：log-update 的相对移动假设物理光标位于 prevFrame.cursor。若上一帧将其停放到了别处，在 diff 运行之前移回。替代屏幕的 CSI H 已重置到 (0,0)，因此无需序言。
      if (parked !== null && !this.altScreenActive && hasDiff) {
        const pdx = prevFrame.cursor.x - parked.x;
        const pdy = prevFrame.cursor.y - parked.y;
        if (pdx !== 0 || pdy !== 0) {
          optimized.unshift({
            type: 'stdout',
            content: cursorMove(pdx, pdy)
          });
        }
      }
      if (target !== null) {
        if (this.altScreenActive) {
          // 绝对 CUP（1 索引）；无论怎样，下一帧的 CSI H 都会重置。在 altScreenParkPatch 之后发送，使声明位置优先。
          const row = Math.min(Math.max(target.y + 1, 1), terminalRows);
          const col = Math.min(Math.max(target.x + 1, 1), terminalWidth);
          optimized.push({
            type: 'stdout',
            content: cursorPosition(row, col)
          });
        } else {
          // diff（或序言）之后，光标位于 frame.cursor。若无 diff 且之前已停放，则仍位于旧停放位置（log-update 未写入任何内容）。否则位于 frame.cursor。
          const from = !hasDiff && parked !== null ? parked : {
            x: frame.cursor.x,
            y: frame.cursor.y
          };
          const dx = target.x - from.x;
          const dy = target.y - from.y;
          if (dx !== 0 || dy !== 0) {
            optimized.push({
              type: 'stdout',
              content: cursorMove(dx, dy)
            });
          }
        }
        this.displayCursor = target;
      } else {
        // 声明已清除（输入失焦、卸载）。在忘记停放位置之前将物理光标恢复到 frame.cursor——否则 displayCursor=null 会错误地报告光标位置，导致下一帧的序言（或 log-update 的相对移动）从错误位置计算。上方的序言处理了 hasDiff 情况；此处处理 !hasDiff 情况（例如辅助功能模式下，由于反色是恒等变换，失焦不改变 renderedValue）。
        if (parked !== null && !this.altScreenActive && !hasDiff) {
          const rdx = frame.cursor.x - parked.x;
          const rdy = frame.cursor.y - parked.y;
          if (rdx !== 0 || rdy !== 0) {
            optimized.push({
              type: 'stdout',
              content: cursorMove(rdx, rdy)
            });
          }
        }
        this.displayCursor = null;
      }
    }
    const tWrite = performance.now();
    writeDiffToTerminal(this.terminal, optimized, this.altScreenActive && !SYNC_OUTPUT_SUPPORTED);
    const writeMs = performance.now() - tWrite;

    // 为下一帧更新 blit 安全性。刚渲染的帧成为 frontFrame（= 下一帧的 prevScreen）。如果我们应用了选择覆盖层，该缓冲区包含反色单元格。selActive/hlActive 仅在替代屏幕中为 true；主屏幕中始终为 false→false。
    this.prevFrameContaminated = selActive || hlActive;

    // ScrollBox 有待处理的 scrollDelta 需要排空——调度下一帧。此处绝不能调用 this.scheduleRender()：我们正处于尾随节流调用内部，timerId 未定义，lodash 的 debounce 看到 timeSinceLastCall >= wait（上次调用在此窗口开始时）→ 立即触发 leadingEdge → 约 0.1ms 内双重渲染 → 卡顿。使用普通 timeout。若滚轮事件先到达，其 scheduleRender 路径会触发渲染，并在 onRender 顶部清除此定时器——不会双重渲染。
    //
    // 排空帧成本低廉（DECSTBM + ~10 个补丁，约 200 字节），因此以四分之一间隔运行（约 250fps，setTimeout 实际下限）以获得最大滚动速度。常规渲染通过节流保持在 FRAME_INTERVAL_MS。
    if (frame.scrollDrainPending) {
      this.drainTimer = setTimeout(() => this.onRender(), FRAME_INTERVAL_MS >> 2);
    }
    const yogaMs = getLastYogaMs();
    const commitMs = getLastCommitMs();
    const yc = this.lastYogaCounters;
    // 重置，以便仅排空的帧（无 React 提交）不会重复上报过时值。
    resetProfileCounters();
    this.lastYogaCounters = {
      ms: 0,
      visited: 0,
      measured: 0,
      cacheHits: 0,
      live: 0
    };
    this.options.onFrame?.({
      durationMs: performance.now() - renderStart,
      phases: {
        renderer: rendererMs,
        diff: diffMs,
        optimize: optimizeMs,
        write: writeMs,
        patches: diff.length,
        yoga: yogaMs,
        commit: commitMs,
        yogaVisited: yc.visited,
        yogaMeasured: yc.measured,
        yogaCacheHits: yc.cacheHits,
        yogaLive: yc.live
      },
      flickers
    });
  }
  pause(): void {
    // 在暂停前刷新待处理的 React 更新并渲染。
    // @ts-expect-error flushSyncFromReconciler 存在于 react-reconciler 0.31 但不在 @types/react-reconciler 中
    reconciler.flushSyncFromReconciler();
    this.onRender();
    this.isPaused = true;
  }
  resume(): void {
    this.isPaused = false;
    this.onRender();
  }

  /**
   * 重置帧缓冲区，使下一次渲染从头写入完整屏幕。
   * 当终端内容被外部进程（如 tmux、shell、全屏 TUI）破坏后，在 resume() 之前调用此方法。
   */
  repaint(): void {
    this.frontFrame = emptyFrame(this.frontFrame.viewport.height, this.frontFrame.viewport.width, this.stylePool, this.charPool, this.hyperlinkPool);
    this.backFrame = emptyFrame(this.backFrame.viewport.height, this.backFrame.viewport.width, this.stylePool, this.charPool, this.hyperlinkPool);
    this.log.reset();
    // 外部终端破坏后物理光标位置未知。清除 displayCursor，使光标序言不会基于我们上次停放的位置发出过时的相对移动。
    this.displayCursor = null;
  }

  /**
   * 清除物理终端并强制全量重绘。
   *
   * 传统的 readline ctrl+l —— 清除可见屏幕并重绘当前内容。也是当终端被外部清除（macOS Cmd+K）且 Ink 的 diff 引擎认为未变化单元格无需重绘时的恢复路径。滚动历史得以保留。
   */
  forceRedraw(): void {
    if (!this.options.stdout.isTTY || this.isUnmounted || this.isPaused) return;
    this.options.stdout.write(ERASE_SCREEN + CURSOR_HOME);
    if (this.altScreenActive) {
      this.resetFramesForAltScreen();
    } else {
      this.repaint();
      // repaint() 将 frontFrame 重置为 0×0。若无此标志，下一帧的 blit 优化会从空屏幕复制，diff 将看不到内容。onRender 在帧结束时重置该标志。
      this.prevFrameContaminated = true;
    }
    this.onRender();
  }

  /**
   * 将前一帧标记为对 blit 不可信，强制下一次渲染采用全量损伤 diff，而非按节点快速路径。
   *
   * 比 forceRedraw() 更轻——不清屏，无额外写入。在卸载高覆盖层时从 useLayoutEffect 清理函数中调用：blit 快速路径可能会从覆盖层帧中复制过时单元格到缩小后布局无法触及的行，留下幽灵标题/分隔线。onRender 在帧结束时重置该标志，因此是一次性的。
   */
  invalidatePrevFrame(): void {
    this.prevFrameContaminated = true;
  }

  /**
   * 由 <AlternateScreen> 组件在挂载/卸载时调用。
   * 控制渲染器中 cursor.y 的钳位，并决定 SIGCONT/尺寸变化/卸载处理器中的替代屏幕感知行为。状态变化时会重绘，使第一个替代屏幕帧（以及退出后的第一个主屏幕帧）成为全量重绘，无过时 diff 状态。
   */
  setAltScreenActive(active: boolean, mouseTracking = false): void {
    if (this.altScreenActive === active) return;
    this.altScreenActive = active;
    this.altScreenMouseTracking = active && mouseTracking;
    if (active) {
      this.resetFramesForAltScreen();
    } else {
      this.repaint();
    }
  }
  get isAltScreenActive(): boolean {
    return this.altScreenActive;
  }

  /**
   * 在间隔（>5s 无 stdin 输入或事件循环停顿）后重新断言终端模式。捕获 tmux 分离→附着、ssh 重连以及笔记本睡眠/唤醒——这些都不会发送 SIGCONT。终端在重连时可能会重置 DEC 私有模式；此方法将恢复它们。
   *
   * 始终重新断言扩展键报告和鼠标跟踪。鼠标跟踪是幂等的（设置已设置的模式是无操作）。Kitty 键盘协议则不是——CSI >1u 是栈压入，因此我们先弹出以保持深度平衡（按规范，在空栈上弹出是无操作，因此终端重置后仍能从深度 0 恢复到 1）。若不弹出，每个 >5s 空闲间隔都会增加一个栈项，退出或挂起时的单次弹出无法清空它们——shell 将留在 CSI u 模式中，导致 Ctrl+C/Ctrl+D 泄漏为转义序列。替代屏幕重新进入（ERASE_SCREEN + 帧重置）不是幂等的——它会清屏——因此通过 includeAltScreen 选择加入。stdin 间隔调用者会在普通 >5s 空闲 + 按键时触发，不能擦屏；事件循环停顿检测器在真正的睡眠/唤醒时触发并选择加入。tmux 附着 / ssh 重连通常会发送尺寸变化信号，已通过 handleResize 覆盖替代屏幕。
   */
  reassertTerminalModes = (includeAltScreen = false): void => {
    if (!this.options.stdout.isTTY) return;
    // 编辑器移交期间不要触碰终端——在此处重新启用 kitty 键盘会撤销 enterAlternateScreen 的禁用，nano 会再次看到 CSI-u 序列。
    if (this.isPaused) return;
    // 扩展键——若已启用则重新断言（App.tsx 在 raw 模式进入时对允许列表内的终端启用；终端重置会清除它们）。弹出后压入使 Kitty 栈深度保持为 1，而非每次调用累积。
    if (supportsExtendedKeys()) {
      this.options.stdout.write(DISABLE_KITTY_KEYBOARD + ENABLE_KITTY_KEYBOARD + ENABLE_MODIFY_OTHER_KEYS);
    }
    if (!this.altScreenActive) return;
    // 鼠标跟踪——幂等，每次 stdin 间隔都可安全重新断言。
    if (this.altScreenMouseTracking) {
      this.options.stdout.write(ENABLE_MOUSE_TRACKING);
    }
    // 替代屏幕重新进入——破坏性（ERASE_SCREEN）。仅对确信终端确实丢失了 1049 模式的调用者开放。
    if (includeAltScreen) {
      this.reenterAltScreen();
    }
  };

  /**
   * 将此实例标记为已卸载，以便后续 unmount() 调用提前返回。
   * 由 gracefulShutdown 的 cleanupTerminalModes() 在发送 EXIT_ALT_SCREEN 之后、其余终端重置序列之前调用。
   * 若无此操作，signal-exit 延迟的 ink.unmount()（由 process.exit() 触发）会运行完整卸载路径：onRender() + writeSync 清理块 + updateContainerSync → AlternateScreen 卸载清理。
   * 结果是 2-3 次冗余的 EXIT_ALT_SCREEN 序列落在主屏幕上，位于 printResumeHint() 之后，tmux（至少）会将其解释为恢复保存的光标位置——从而覆盖恢复提示。
   */
  detachForShutdown(): void {
    this.isUnmounted = true;
    // 取消任何待处理的节流渲染，以防它在 cleanupTerminalModes() 和 process.exit() 之间触发并写入主屏幕。
    this.scheduleRender.cancel?.();
    // 从 raw 模式恢复 stdin。unmount() 曾通过 React 卸载（App.componentWillUnmount → handleSetRawMode(false)）执行此操作，但我们短路了该路径。必须使用 this.options.stdin——而非 process.stdin——因为当 stdin 被管道化时 getStdinOverride() 可能已打开 /dev/tty。
    const stdin = this.options.stdin as NodeJS.ReadStream & {
      isRaw?: boolean;
      setRawMode?: (m: boolean) => void;
    };
    this.drainStdin();
    if (stdin.isTTY && stdin.isRaw && stdin.setRawMode) {
      stdin.setRawMode(false);
    }
  }

  /** @see drainStdin */
  drainStdin(): void {
    drainStdin(this.options.stdin);
  }

  /**
   * 重新进入替代屏幕，清屏，归位，重新启用鼠标跟踪，并重置帧缓冲区以便下一次渲染从头开始绘制。自愈 SIGCONT、尺寸变化以及 stdin 间隔/事件循环停顿（睡眠/唤醒）——任何一种都可能使终端留在主屏幕模式而 altScreenActive 仍为 true。如果已在替代屏幕中，ENTER_ALT_SCREEN 对终端而言是无操作。
   */
  private reenterAltScreen(): void {
    this.options.stdout.write(ENTER_ALT_SCREEN + ERASE_SCREEN + CURSOR_HOME + (this.altScreenMouseTracking ? ENABLE_MOUSE_TRACKING : ''));
    this.resetFramesForAltScreen();
  }

  /**
   * 用全尺寸的空白屏幕（rows×cols 的空单元格，而非 0×0）填充 prev/back 帧。在替代屏幕模式下，next.screen.height 始终为 terminalRows；如果 prev.screen.height 为 0（emptyFrame 的默认值），log-update 会看到 heightDelta > 0（“增长”）并调用 renderFrameSlice，其尾部的每行 CR+LF 在最后一行会滚动替代屏幕，导致虚拟光标与物理光标永久错位 1 行。
   *
   * 有了 rows×cols 的空白 prev，heightDelta === 0 → 标准 diffEach → moveCursorTo（CSI cursorMove，无 LF，无滚动）。
   *
   * viewport.height = rows + 1 匹配渲染器替代屏幕输出，防止第一帧触发虚假的尺寸变化。cursor.y = 0 匹配 ENTER_ALT_SCREEN + CSI H（归位）之后的物理光标。
   */
  private resetFramesForAltScreen(): void {
    const rows = this.terminalRows;
    const cols = this.terminalColumns;
    const blank = (): Frame => ({
      screen: createScreen(cols, rows, this.stylePool, this.charPool, this.hyperlinkPool),
      viewport: {
        width: cols,
        height: rows + 1
      },
      cursor: {
        x: 0,
        y: 0,
        visible: true
      }
    });
    this.frontFrame = blank();
    this.backFrame = blank();
    this.log.reset();
    // 纵深防御：替代屏幕无论如何都会跳过光标序言（CSI H 重置），但若之后未经过渲染就退出到主屏幕，过时的 displayCursor 会产生误导。
    this.displayCursor = null;
    // 全新的 frontFrame 是 rows×cols 的空白——基于它 blit 会将空白复制到内容上。下一个替代屏幕帧必须全量渲染。
    this.prevFrameContaminated = true;
  }

  /**
   * 将当前选择内容复制到剪贴板而不清除高亮。匹配 iTerm2 的“选择时复制”行为，自动复制后选定区域保持可见。
   */
  copySelectionNoClear(): string {
    if (!hasSelection(this.selection)) return '';
    const text = getSelectedText(this.selection, this.frontFrame.screen);
    if (text) {
      // 原始 OSC 52，或在 tmux 内包裹 DCS 直通 OSC 52（tmux 会静默丢弃，除非 allow-passthrough 开启——无回归）。
      void setClipboard(text).then(raw => {
        if (raw) this.options.stdout.write(raw);
      });
    }
    return text;
  }

  /**
   * 通过 OSC 52 将当前文本选择复制到系统剪贴板并清除选择。返回复制的文本（无选择时为空）。
   */
  copySelection(): string {
    if (!hasSelection(this.selection)) return '';
    const text = this.copySelectionNoClear();
    clearSelection(this.selection);
    this.notifySelectionChange();
    return text;
  }

  /** 清除当前文本选择而不复制。 */
  clearTextSelection(): void {
    if (!hasSelection(this.selection)) return;
    clearSelection(this.selection);
    this.notifySelectionChange();
  }

  /**
   * 设置搜索高亮查询。非空时下一帧所有可见匹配项将被反色（SGR 7）；第一个匹配项还会添加下划线。空字符串则清除（prevFrameContaminated 处理清除后的帧）。与选择相同的损伤跟踪机制——setCellStyleId 不跟踪损伤，因此覆盖层在活动期间强制全帧损伤。
   */
  setSearchHighlight(query: string): void {
    if (this.searchHighlightQuery === query) return;
    this.searchHighlightQuery = query;
    this.scheduleRender();
  }

  /** 将现有 DOM 子树绘制到一个自然高度的全新 Screen 上，并扫描查询。返回相对于元素边界框的位置（第 0 行 = 元素顶部）。
   *
   *  元素来自主树——使用所有真实提供者构建，yoga 已计算。我们将其绘制到一个带偏移量的新缓冲区中，使其落在 (0,0)。与主渲染相同的绘制路径。零漂移。无第二个 React 根，无上下文桥接。
   *
   *  ~1-2ms（仅绘制，无协调——DOM 已构建）。 */
  scanElementSubtree(el: dom.DOMElement): MatchPosition[] {
    if (!this.searchHighlightQuery || !el.yogaNode) return [];
    const width = Math.ceil(el.yogaNode.getComputedWidth());
    const height = Math.ceil(el.yogaNode.getComputedHeight());
    if (width <= 0 || height <= 0) return [];
    // renderNodeToOutput 将 el 自身的 computedLeft/Top 加到 offsetX/Y 上。
    // 传递 -elLeft/-elTop 可抵消为 0 → 在我们的缓冲区中绘制于 (0,0)。
    const elLeft = el.yogaNode.getComputedLeft();
    const elTop = el.yogaNode.getComputedTop();
    const screen = createScreen(width, height, this.stylePool, this.charPool, this.hyperlinkPool);
    const output = new Output({
      width,
      height,
      stylePool: this.stylePool,
      screen
    });
    renderNodeToOutput(el, output, {
      offsetX: -elLeft,
      offsetY: -elTop,
      prevScreen: undefined
    });
    const rendered = output.get();
    // renderNodeToOutput 将我们的偏移位置写入了 nodeCache——这会破坏主渲染（会基于错误坐标进行 blit）。将子树标记为脏，以便下一次主渲染正确重绘并重新缓存。该消息会多一次绘制，但正确性优先于速度。
    dom.markDirty(el);
    const positions = scanPositions(rendered, this.searchHighlightQuery);
    logForDebugging(`scanElementSubtree: q='${this.searchHighlightQuery}' ` + `el=${width}x${height}@(${elLeft},${elTop}) n=${positions.length} ` + `[${positions.slice(0, 10).map(p => `${p.row}:${p.col}`).join(',')}` + `${positions.length > 10 ? ',…' : ''}]`);
    return positions;
  }

  /** 设置基于位置的高亮状态。每帧将 CURRENT 样式写入 positions[currentIdx] + rowOffset。null 则清除。扫描高亮（所有匹配项反色）仍会运行——此方法将黄色覆盖在最上层。rowOffset 随用户滚动变化（= 消息当前的屏幕顶部）；位置保持稳定（相对于消息）。 */
  setSearchPositions(state: {
    positions: MatchPosition[];
    rowOffset: number;
    currentIdx: number;
  } | null): void {
    this.searchPositions = state;
    this.scheduleRender();
  }

  /**
   * 设置选择高亮背景色。用固定的主题感知背景色替换每个单元格的 SGR-7 反色（匹配原生终端选择）。接受与 Text backgroundColor 相同的颜色格式（rgb()、ansi:name、#hex、ansi256()）——colorize() 通过 chalk 路由，因此 colorize.ts 中的 tmux/xterm.js 级别钳位适用，发出的 SGR 对当前终端正确。
   *
   * 由 React 领域在主题已知后调用（ScrollKeybindingHandler 的 useEffect 监听 useTheme）。在该调用之前，withSelectionBg 回退到 withInverse，因此选择在第一帧仍能渲染；该 effect 在任何鼠标输入之前触发，因此实际中观察不到回退。
   */
  setSelectionBgColor(color: string): void {
    // 包裹 NUL 标记，然后在 NUL 处分割以提取打开/关闭 SGR。
    // 如果颜色字符串无效，colorize 返回原样输入——无 NUL 分割，回退到 null（反色回退）。
    const wrapped = colorize('\0', color, 'background');
    const nul = wrapped.indexOf('\0');
    if (nul <= 0 || nul === wrapped.length - 1) {
      this.stylePool.setSelectionBg(null);
      return;
    }
    this.stylePool.setSelectionBg({
      type: 'ansi',
      code: wrapped.slice(0, nul),
      endCode: wrapped.slice(nul + 1) // 背景色总是 \x1b[49m
    });
    // 无 scheduleRender：此方法由 React effect 调用，已处于渲染周期内，且背景色仅在选择存在时才重要（选择本身会触发全量损伤帧）。
  }

  /**
   * 在拖动滚动期间捕获即将滚出视口的行中的文本。必须在 ScrollBox 滚动之前调用，以便屏幕缓冲区仍持有要移出的内容。累积到选择状态中，并由 getSelectedText 重新拼接。
   */
  captureScrolledRows(firstRow: number, lastRow: number, side: 'above' | 'below'): void {
    captureScrolledRows(this.selection, this.frontFrame.screen, firstRow, lastRow, side);
  }

  /**
   * 将锚点和焦点均移动 dRow，并钳位到 [minRow, maxRow]。由键盘滚动处理器（PgUp/PgDn 等）使用，使高亮跟随内容而非消失。与 shiftAnchor（拖动滚动）不同，此方法移动两端——用户未在边缘按住鼠标。提供 screen.width 用于在钳位边界时重置列。
   */
  shiftSelectionForScroll(dRow: number, minRow: number, maxRow: number): void {
    const hadSel = hasSelection(this.selection);
    shiftSelection(this.selection, dRow, minRow, maxRow, this.frontFrame.screen.width);
    // shiftSelection 会在两端均超出同一边界时清除选择（Home/g/End/G 页面跳转越过选择）。通知订阅者以便 useHasSelection 更新。此处可安全调用 notifySelectionChange——此方法由键盘处理器调用，不在 onRender() 内部。
    if (hadSel && !hasSelection(this.selection)) {
      this.notifySelectionChange();
    }
  }

  /**
   * 键盘选择扩展（shift+方向键/home/end）。移动焦点；锚点固定，使高亮相对于锚点增长或收缩。左右方向键跨行边界换行——原生 macOS 文本编辑行为：在列 0 按 shift+左方向键会换行到上一行末尾。上下方向键在视口边缘钳位（暂不支持滚动扩展）。降级到字符模式。在替代屏幕外或无活动选择时为空操作。
   */
  moveSelectionFocus(move: FocusMove): void {
    if (!this.altScreenActive) return;
    const {
      focus
    } = this.selection;
    if (!focus) return;
    const {
      width,
      height
    } = this.frontFrame.screen;
    const maxCol = width - 1;
    const maxRow = height - 1;
    let {
      col,
      row
    } = focus;
    switch (move) {
      case 'left':
        if (col > 0) col--;else if (row > 0) {
          col = maxCol;
          row--;
        }
        break;
      case 'right':
        if (col < maxCol) col++;else if (row < maxRow) {
          col = 0;
          row++;
        }
        break;
      case 'up':
        if (row > 0) row--;
        break;
      case 'down':
        if (row < maxRow) row++;
        break;
      case 'lineStart':
        col = 0;
        break;
      case 'lineEnd':
        col = maxCol;
        break;
    }
    if (col === focus.col && row === focus.row) return;
    moveFocus(this.selection, col, row);
    this.notifySelectionChange();
  }

  /** 是否存在活动文本选择。 */
  hasTextSelection(): boolean {
    return hasSelection(this.selection);
  }

  /**
   * 订阅选择状态变化。当选择开始、更新、清除或复制时触发。返回取消订阅函数。
   */
  subscribeToSelectionChange(cb: () => void): () => void {
    this.selectionListeners.add(cb);
    return () => this.selectionListeners.delete(cb);
  }
  private notifySelectionChange(): void {
    this.onRender();
    for (const cb of this.selectionListeners) cb();
  }

  /**
   * 在 (col, row) 处命中测试已渲染的 DOM 树，并从最深命中节点向上冒泡 ClickEvent，穿过具有 onClick 处理器的祖先节点。若 DOM 处理器消费了点击，则返回 true。受 altScreenActive 限制——点击仅在固定视口中才有意义，因为 nodeCache 矩形与终端单元格一一对应（无回滚偏移）。
   */
  dispatchClick(col: number, row: number): boolean {
    if (!this.altScreenActive) return false;
    const blank = isEmptyCellAt(this.frontFrame.screen, col, row);
    return dispatchClick(this.rootNode, col, row, blank);
  }
  dispatchHover(col: number, row: number): void {
    if (!this.altScreenActive) return;
    dispatchHover(this.rootNode, col, row, this.hoveredNodes);
  }
  dispatchKeyboardEvent(parsedKey: ParsedKey): void {
    const target = this.focusManager.activeElement ?? this.rootNode;
    const event = new KeyboardEvent(parsedKey);
    dispatcher.dispatchDiscrete(target, event);

    // Tab 循环是默认动作——仅当没有处理器调用 preventDefault() 时才触发。模拟浏览器行为。
    if (!event.defaultPrevented && parsedKey.name === 'tab' && !parsedKey.ctrl && !parsedKey.meta) {
      if (parsedKey.shift) {
        this.focusManager.focusPrevious(this.rootNode);
      } else {
        this.focusManager.focusNext(this.rootNode);
      }
    }
  }
  /**
   * 在当前 front 帧中查找 (col, row) 处的 URL。首先检查 OSC 8 超链接，然后回退到扫描该行中的纯文本 URL（鼠标跟踪拦截了终端的原生 Cmd+Click URL 检测，因此我们复制它）。这是纯粹的查找，无副作用——在点击时同步调用，使结果反映用户实际点击的屏幕，然后通过定时器延迟打开浏览器动作。
   */
  getHyperlinkAt(col: number, row: number): string | undefined {
    if (!this.altScreenActive) return undefined;
    const screen = this.frontFrame.screen;
    const cell = cellAt(screen, col, row);
    let url = cell?.hyperlink;
    // SpacerTail 单元格（宽字符/CJK/emoji 的右半部分）将其超链接存储在 col-1 处的头单元格中。
    if (!url && cell?.width === CellWidth.SpacerTail && col > 0) {
      url = cellAt(screen, col - 1, row)?.hyperlink;
    }
    return url ?? findPlainTextUrlAt(screen, col, row);
  }

  /**
   * 全屏模式下点击 OSC 8 超链接时的可选回调。由 FullscreenLayout 通过 useLayoutEffect 设置。
   */
  onHyperlinkClick: ((url: string) => void) | undefined;

  /**
   * onHyperlinkClick 的稳定原型包装器。作为 onOpenHyperlink 传递给 <App>，使 prop 成为绑定的方法（已 autoBind），在调用时读取可变字段——而非渲染时的 undefined 值。
   */
  openHyperlink(url: string): void {
    this.onHyperlinkClick?.(url);
  }

  /**
   * 处理在 (col, row) 处的双击或三击：通过读取当前屏幕缓冲区选择光标下的单词或行。在按下时调用（而非释放），使高亮立即出现，且拖动可逐词/逐行扩展选择。若点击落在 noSelect 单元格上，则回退到字符模式的 startSelection。
   */
  handleMultiClick(col: number, row: number, count: 2 | 3): void {
    if (!this.altScreenActive) return;
    const screen = this.frontFrame.screen;
    // selectWordAt/selectLineAt 在 noSelect/越界时为空操作。先以字符模式开始选择，即使单词/行扫描未找到可选内容，按下操作仍能启动拖动。
    startSelection(this.selection, col, row);
    if (count === 2) selectWordAt(this.selection, screen, col, row);else selectLineAt(this.selection, screen, row);
    // 确保 hasSelection 为 true，以便释放时不重新派发 onClickAt。selectWordAt 在 noSelect 上为空操作；selectLineAt 在越界时为空操作。
    if (!this.selection.focus) this.selection.focus = this.selection.anchor;
    this.notifySelectionChange();
  }

  /**
   * 处理在 (col, row) 处的拖动移动。在字符模式下将焦点更新到确切单元格。在单词/行模式下吸附到单词/行边界，使选择像原生 macOS 一样逐词/逐行扩展。与 dispatchClick 相同原因，受 altScreenActive 限制。
   */
  handleSelectionDrag(col: number, row: number): void {
    if (!this.altScreenActive) return;
    const sel = this.selection;
    if (sel.anchorSpan) {
      extendSelection(sel, this.frontFrame.screen, col, row);
    } else {
      updateSelection(sel, col, row);
    }
    this.notifySelectionChange();
  }

  // 为外部编辑器使用而正确挂起 stdin 的方法。当外部编辑器活动时，这可以防止 Ink 吞掉按键。
  private stdinListeners: Array<{
    event: string;
    listener: (...args: unknown[]) => void;
  }> = [];
  private wasRawMode = false;
  suspendStdin(): void {
    const stdin = this.options.stdin;
    if (!stdin.isTTY) {
      return;
    }

    // 存储并临时移除所有 'readable' 事件监听器。这可以防止编辑器活动时 Ink 消费 stdin。
    const readableListeners = stdin.listeners('readable');
    logForDebugging(`[stdin] suspendStdin: 移除 ${readableListeners.length} 个 readable 监听器，wasRawMode=${(stdin as NodeJS.ReadStream & {
      isRaw?: boolean;
    }).isRaw ?? false}`);
    readableListeners.forEach(listener => {
      this.stdinListeners.push({
        event: 'readable',
        listener: listener as (...args: unknown[]) => void
      });
      stdin.removeListener('readable', listener as (...args: unknown[]) => void);
    });

    // 如果 raw 模式已启用，则临时禁用它
    const stdinWithRaw = stdin as NodeJS.ReadStream & {
      isRaw?: boolean;
      setRawMode?: (mode: boolean) => void;
    };
    if (stdinWithRaw.isRaw && stdinWithRaw.setRawMode) {
      stdinWithRaw.setRawMode(false);
      this.wasRawMode = true;
    }
  }
  resumeStdin(): void {
    const stdin = this.options.stdin;
    if (!stdin.isTTY) {
      return;
    }

    // 重新附加所有存储的监听器
    if (this.stdinListeners.length === 0 && !this.wasRawMode) {
      logForDebugging('[stdin] resumeStdin: 调用时无存储监听器且 wasRawMode=false（可能不同步）', {
        level: 'warn'
      });
    }
    logForDebugging(`[stdin] resumeStdin: 重新附加 ${this.stdinListeners.length} 个监听器，wasRawMode=${this.wasRawMode}`);
    this.stdinListeners.forEach(({
      event,
      listener
    }) => {
      stdin.addListener(event, listener);
    });
    this.stdinListeners = [];

    // 重新启用 raw 模式（如果之前已启用）
    if (this.wasRawMode) {
      const stdinWithRaw = stdin as NodeJS.ReadStream & {
        setRawMode?: (mode: boolean) => void;
      };
      if (stdinWithRaw.setRawMode) {
        stdinWithRaw.setRawMode(true);
      }
      this.wasRawMode = false;
    }
  }

  // TerminalWriteContext 的稳定标识。若在此处使用内联箭头，每次 render() 调用（初始挂载 + 每次尺寸变化）都会改变标识，进而通过 useContext 传播 → <AlternateScreen> 的 useLayoutEffect 依赖数组 → 每次 SIGWINCH 都会虚假退出并重新进入替代屏幕。
  private writeRaw(data: string): void {
    this.options.stdout.write(data);
  }
  private setCursorDeclaration: CursorDeclarationSetter = (decl, clearIfNode) => {
    if (decl === null && clearIfNode !== undefined && this.cursorDeclaration?.node !== clearIfNode) {
      return;
    }
    this.cursorDeclaration = decl;
  };
  render(node: ReactNode): void {
    this.currentNode = node;
    const tree = <App stdin={this.options.stdin} stdout={this.options.stdout} stderr={this.options.stderr} exitOnCtrlC={this.options.exitOnCtrlC} onExit={this.unmount} terminalColumns={this.terminalColumns} terminalRows={this.terminalRows} selection={this.selection} onSelectionChange={this.notifySelectionChange} onClickAt={this.dispatchClick} onHoverAt={this.dispatchHover} getHyperlinkAt={this.getHyperlinkAt} onOpenHyperlink={this.openHyperlink} onMultiClick={this.handleMultiClick} onSelectionDrag={this.handleSelectionDrag} onStdinResume={this.reassertTerminalModes} onCursorDeclaration={this.setCursorDeclaration} dispatchKeyboardEvent={this.dispatchKeyboardEvent}>
        <TerminalWriteProvider value={this.writeRaw}>
          {node}
        </TerminalWriteProvider>
      </App>;

    // @ts-expect-error updateContainerSync 存在于 react-reconciler 但不在 @types/react-reconciler 中
    reconciler.updateContainerSync(tree, this.container, null, noop);
    // @ts-expect-error flushSyncWork 存在于 react-reconciler 但不在 @types/react-reconciler 中
    reconciler.flushSyncWork();
  }
  unmount(error?: Error | number | null): void {
    if (this.isUnmounted) {
      return;
    }
    this.onRender();
    this.unsubscribeExit();
    if (typeof this.restoreConsole === 'function') {
      this.restoreConsole();
    }
    this.restoreStderr?.();
    this.unsubscribeTTYHandlers?.();

    // 非 TTY 环境对擦除 ANSI 转义序列处理不佳，因此最好只渲染最后一帧的非静态输出
    const diff = this.log.renderPreviousOutput_DEPRECATED(this.frontFrame);
    writeDiffToTerminal(this.terminal, optimize(diff));

    // 在进程退出前同步清理终端模式。
    // 当调用 process.exit() 时，React 的 componentWillUnmount 不会及时运行，因此我们必须在此处重置终端模式，以防止转义序列泄漏。
    // 使用 writeSync 写入 stdout（文件描述符 1），确保在退出前写入完成。
    // 我们无条件发送所有禁用序列，因为终端检测可能不正确（例如在 tmux、screen 中），且在不支持它们的终端上这些序列为无操作。
    /* eslint-disable custom-rules/no-sync-fs -- 进程正在退出；异步写入会被丢弃 */
    if (this.options.stdout.isTTY) {
      if (this.altScreenActive) {
        // <AlternateScreen> 的卸载 effect 在 signal-exit 期间不会运行。首先退出替代屏幕，以便其他清理序列进入主屏幕。
        writeSync(1, EXIT_ALT_SCREEN);
      }
      // 禁用鼠标跟踪——无条件执行，因为若 AlternateScreen 的卸载（会翻转标志）与阻塞的事件循环 + SIGINT 竞态，altScreenActive 可能已过时。若从未启用跟踪，则为无操作。
      writeSync(1, DISABLE_MOUSE_TRACKING);
      // 排空 stdin，防止进行中的鼠标事件泄漏到 shell
      this.drainStdin();
      // 禁用扩展键报告（kitty 和 modifyOtherKeys）
      writeSync(1, DISABLE_MODIFY_OTHER_KEYS);
      writeSync(1, DISABLE_KITTY_KEYBOARD);
      // 禁用焦点事件（DECSET 1004）
      writeSync(1, DFE);
      // 禁用括号粘贴模式
      writeSync(1, DBP);
      // 显示光标
      writeSync(1, SHOW_CURSOR);
      // 清除 iTerm2 进度条
      writeSync(1, CLEAR_ITERM2_PROGRESS);
      // 清除标签页状态（OSC 21337），防止过时的小点残留
      if (supportsTabStatus()) writeSync(1, wrapForMultiplexer(CLEAR_TAB_STATUS));
    }
    /* eslint-enable custom-rules/no-sync-fs */

    this.isUnmounted = true;

    // 取消任何待处理的节流渲染，防止访问已释放的 Yoga 节点
    this.scheduleRender.cancel?.();
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }

    // @ts-expect-error updateContainerSync 存在于 react-reconciler 但不在 @types/react-reconciler 中
    reconciler.updateContainerSync(null, this.container, null, noop);
    // @ts-expect-error flushSyncWork 存在于 react-reconciler 但不在 @types/react-reconciler 中
    reconciler.flushSyncWork();
    instances.delete(this.options.stdout);

    // 释放根 yoga 节点，然后清除其引用。子节点已由协调器的 removeChildFromContainer 释放；使用 .free()（而非 .freeRecursive()）可避免重复释放它们。
    this.rootNode.yogaNode?.free();
    this.rootNode.yogaNode = undefined;
    if (error instanceof Error) {
      this.rejectExitPromise(error);
    } else {
      this.resolveExitPromise();
    }
  }
  async waitUntilExit(): Promise<void> {
    this.exitPromise ||= new Promise((resolve, reject) => {
      this.resolveExitPromise = resolve;
      this.rejectExitPromise = reject;
    });
    return this.exitPromise;
  }
  resetLineCount(): void {
    if (this.options.stdout.isTTY) {
      // 交换以便旧的前帧成为后帧（用于屏幕复用），然后重置前帧
      this.backFrame = this.frontFrame;
      this.frontFrame = emptyFrame(this.frontFrame.viewport.height, this.frontFrame.viewport.width, this.stylePool, this.charPool, this.hyperlinkPool);
      this.log.reset();
      // frontFrame 已重置，因此下一帧渲染时的 frame.cursor 为 (0,0)。清除 displayCursor，使序言不会计算过时的增量。
      this.displayCursor = null;
    }
  }

  /**
   * 用全新的实例替换字符/超链接池，防止长时间会话中无限制增长。将 front 帧的屏幕 ID 迁移到新池中，使 diff 保持正确。back 帧无需迁移——resetScreen 会在任何读取前将其归零。
   *
   * 在对话轮次之间或定期调用。
   */
  resetPools(): void {
    this.charPool = new CharPool();
    this.hyperlinkPool = new HyperlinkPool();
    migrateScreenPools(this.frontFrame.screen, this.charPool, this.hyperlinkPool);
    // back 帧的数据在读取前会被 resetScreen 归零，但其池引用被渲染器用于内部化新字符。将它们指向新池，以便下一帧的 ID 可比较。
    this.backFrame.screen.charPool = this.charPool;
    this.backFrame.screen.hyperlinkPool = this.hyperlinkPool;
  }
  patchConsole(): () => void {
    // biome-ignore lint/suspicious/noConsole: 有意修补全局 console
    const con = console;
    const originals: Partial<Record<keyof Console, Console[keyof Console]>> = {};
    const toDebug = (...args: unknown[]) => logForDebugging(`console.log: ${format(...args)}`);
    const toError = (...args: unknown[]) => logError(new Error(`console.error: ${format(...args)}`));
    for (const m of CONSOLE_STDOUT_METHODS) {
      originals[m] = con[m];
      con[m] = toDebug;
    }
    for (const m of CONSOLE_STDERR_METHODS) {
      originals[m] = con[m];
      con[m] = toError;
    }
    originals.assert = con.assert;
    con.assert = (condition: unknown, ...args: unknown[]) => {
      if (!condition) toError(...args);
    };
    return () => Object.assign(con, originals);
  }

  /**
   * 拦截 process.stderr.write，防止杂散写入（config.ts、hooks.ts、第三方依赖）破坏替代屏幕缓冲区。patchConsole 仅挂钩 console.* 方法——直接 stderr 写入会绕过它，落到停放的光标处，滚动替代屏幕，并使 frontFrame 与物理终端失步。下一次 diff 仅写入 React 中变化的单元格的绝对坐标 → 交错产生垃圾。
   *
   * 吞掉写入（将文本路由到调试日志），并在替代屏幕中强制进行全量损伤重绘作为防御性恢复。不修补 process.stdout——Ink 自身会写入那里。
   */
  private patchStderr(): () => void {
    const stderr = process.stderr;
    const originalWrite = stderr.write;
    let reentered = false;
    const intercept = (chunk: Uint8Array | string, encodingOrCb?: BufferEncoding | ((err?: Error) => void), cb?: (err?: Error) => void): boolean => {
      const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
      // 重入守卫：logForDebugging → writeToStderr → 此处。透传到原始函数，使 --debug-to-stderr 仍能工作，且不会栈溢出。
      if (reentered) {
        const encoding = typeof encodingOrCb === 'string' ? encodingOrCb : undefined;
        return originalWrite.call(stderr, chunk, encoding, callback);
      }
      reentered = true;
      try {
        const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        logForDebugging(`[stderr] ${text}`, {
          level: 'warn'
        });
        if (this.altScreenActive && !this.isUnmounted && !this.isPaused) {
          this.prevFrameContaminated = true;
          this.scheduleRender();
        }
      } finally {
        reentered = false;
        callback?.();
      }
      return true;
    };
    stderr.write = intercept;
    return () => {
      if (stderr.write === intercept) {
        stderr.write = originalWrite;
      }
    };
  }
}

/**
 * 丢弃待处理的 stdin 字节，防止进行中的转义序列（鼠标跟踪报告、括号粘贴标记）在退出后泄漏到 shell。
 *
 * 两层棘手之处：
 *
 * 1. setRawMode 是 termios 而非 fcntl——stdin 文件描述符保持阻塞，因此在其上执行 readSync 会永久挂起。Node 未暴露 fcntl，因此我们以 O_NONBLOCK 全新打开 /dev/tty（所有指向控制终端的文件描述符共享同一个线路规程输入队列）。
 *
 * 2. 当 forceExit 调用此方法时，detachForShutdown 已将 TTY 恢复为熟模式（canonical）。熟模式会将输入按行缓冲直到换行，因此即使鼠标字节已位于缓冲区中，O_NONBLOCK 读取也会返回 EAGAIN。我们短暂地重新进入 raw 模式，使读取能返回任何可用字节，然后恢复熟模式。
 *
 * 可安全多次调用。在退出路径中尽可能晚地调用：DISABLE_MOUSE_TRACKING 有终端往返延迟，因此在其写入后的几毫秒内仍可能到达事件。
 */
/* eslint-disable custom-rules/no-sync-fs -- 必须同步；由信号处理器/卸载调用 */
export function drainStdin(stdin: NodeJS.ReadStream = process.stdin): void {
  if (!stdin.isTTY) return;
  // 排空 Node 的流缓冲区（libuv 已拉入的字节）。read() 在为空时返回 null——永不阻塞。
  try {
    while (stdin.read() !== null) {
      /* 丢弃 */
    }
  } catch {
    /* 流可能已销毁 */
  }
  // Windows 上无 /dev/tty；CONIN$ 不支持 O_NONBLOCK 语义。Windows Terminal 也不会以相同方式缓冲鼠标报告。
  if (process.platform === 'win32') return;
  // termios 是每设备的：将 stdin 翻转为 raw，使熟模式的行缓冲不会隐藏来自非阻塞读取的部分输入。在 finally 块中恢复。
  const tty = stdin as NodeJS.ReadStream & {
    isRaw?: boolean;
    setRawMode?: (raw: boolean) => void;
  };
  const wasRaw = tty.isRaw === true;
  // 通过全新的 O_NONBLOCK fd 排空内核 TTY 缓冲区。限制为 64 次读取（64KB）——真实鼠标爆发为几百字节；上限可防止终端忽略 O_NONBLOCK 的情况。
  let fd = -1;
  try {
    // setRawMode 在 try 内部：在已撤销的 TTY（SIGHUP/SSH 断开）上 ioctl 会抛出 EBADF——与下方的 openSync/readSync 走相同恢复路径。
    if (!wasRaw) tty.setRawMode?.(true);
    fd = openSync('/dev/tty', fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
    const buf = Buffer.alloc(1024);
    for (let i = 0; i < 64; i++) {
      if (readSync(fd, buf, 0, buf.length, null) <= 0) break;
    }
  } catch {
    // EAGAIN（缓冲区空——预期）、ENXIO/ENOENT（无控制终端）、EBADF/EIO（TTY 已撤销——SIGHUP、SSH 断开）
  } finally {
    if (fd >= 0) {
      try {
        closeSync(fd);
      } catch {
        /* 忽略 */
      }
    }
    if (!wasRaw) {
      try {
        tty.setRawMode?.(false);
      } catch {
        /* TTY 可能已消失 */
      }
    }
  }
}
/* eslint-enable custom-rules/no-sync-fs */

const CONSOLE_STDOUT_METHODS = ['log', 'info', 'debug', 'dir', 'dirxml', 'count', 'countReset', 'group', 'groupCollapsed', 'groupEnd', 'table', 'time', 'timeEnd', 'timeLog'] as const;
const CONSOLE_STDERR_METHODS = ['warn', 'error', 'trace'] as const;