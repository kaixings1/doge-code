import { c as _c } from "react/compiler-runtime";
import React, { useRef } from 'react';
import type { RemoteAgentTaskState } from '../../tasks/RemoteAgentTask/RemoteAgentTask.js';
import type { DeepImmutable } from '../../types/utils.js';
import { DIAMOND_FILLED, DIAMOND_OPEN } from '../../constants/figures.js';
import { useSettings } from '../../hooks/useSettings.js';
import { Text, useAnimationFrame } from '../../ink.js';
import { count } from '../../utils/array.js';
import { getRainbowColor } from '../../utils/thinking.js';
const TICK_MS = 80;
type ReviewStage = NonNullable<NonNullable<RemoteAgentTaskState['reviewProgress']>['stage']>;

/**
 * Stage-appropriate counts line for a running review. Shared between the
 * one-line pill (below) and RemoteSessionDetailDialog's reviewCountsLine so
 * the two can't drift — they have historically disagreed on whether to show
 * 已反驳 counts and what to call the synthesizing stage.
 *
 * Canonical behavior: word labels (not ✓/✗), hide 已反驳 when 0, "去重中"
 * for the synthesizing stage (matches STAGE_LABELS in the detail dialog).
 */
export function formatReviewStageCounts(stage: ReviewStage | undefined, 已找到: number, 已验证: number, 已反驳: number): string {
  // Pre-stage orchestrator images don't write the stage field.
  if (!stage) return `${已找到} 已找到 · ${已验证} 已验证`;
  if (stage === 'synthesizing') {
    const parts = [`${已验证} 已验证`];
    if (已反驳 > 0) parts.push(`${已反驳} 已反驳`);
    parts.push('去重中');
    return parts.join(' · ');
  }
  if (stage === 'verifying') {
    const parts = [`${已找到} 已找到`, `${已验证} 已验证`];
    if (已反驳 > 0) parts.push(`${已反驳} 已反驳`);
    return parts.join(' · ');
  }
  // stage === '查找中'
  return 已找到 > 0 ? `${已找到} 已找到` : '查找中';
}

// Per-character rainbow gradient, same treatment as the ultraplan keyword.
// The phase offset lets the gradient cycle — so the colors sweep along the
// text on each animation frame instead of being static.
function RainbowText(t0) {
  const $ = _c(5);
  const {
    text,
    phase: t1
  } = t0;
  const phase = t1 === undefined ? 0 : t1;
  let t2;
  if ($[0] !== text) {
    t2 = [...text];
    $[0] = text;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== phase || $[3] !== t2) {
    t3 = <>{t2.map((ch, i) => <Text key={i} color={getRainbowColor(i + phase)}>{ch}</Text>)}</>;
    $[2] = phase;
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
}

// Smooth-tick a count toward target, +1 per frame. Same pattern as the
// token counter in SpinnerAnimationRow — the ref survives re-renders and
// the animation clock drives the tick. Target jumps (2→5) display as
// 2→3→4→5 instead of snapping. When `snap` is set (reduced motion, or
// the clock is frozen), bypass the tick and jump straight to target —
// otherwise a frozen `time` would leave the ref stuck at its init value.
function useSmoothCount(target: number, time: number, snap: boolean): number {
  const displayed = useRef(target);
  const lastTick = useRef(time);
  if (snap || target < displayed.current) {
    displayed.current = target;
  } else if (target > displayed.current && time !== lastTick.current) {
    displayed.current += 1;
    lastTick.current = time;
  }
  return displayed.current;
}
function ReviewRainbowLine(t0) {
  const $ = _c(15);
  const {
    session
  } = t0;
  const settings = useSettings();
  const reducedMotion = settings.prefersReducedMotion ?? false;
  const p = session.reviewProgress;
  const running = session.status === "running";
  const [, time] = useAnimationFrame(running && !reducedMotion ? TICK_MS : null);
  const targetFound = p?.bugsFound ?? 0;
  const targetVerified = p?.bugsVerified ?? 0;
  const targetRefuted = p?.bugsRefuted ?? 0;
  const snap = reducedMotion || !running;
  const 已找到 = useSmoothCount(targetFound, time, snap);
  const 已验证 = useSmoothCount(targetVerified, time, snap);
  const 已反驳 = useSmoothCount(targetRefuted, time, snap);
  const phase = Math.floor(time / (TICK_MS * 3)) % 7;
  if (session.status === "completed") {
    let t1;
    if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
      t1 = <><Text color="background">{DIAMOND_FILLED} </Text><RainbowText text="ultrareview" phase={0} /><Text dimColor={true}> 就绪 · 按 shift+↓ 查看</Text></>;
      $[0] = t1;
    } else {
      t1 = $[0];
    }
    return t1;
  }
  if (session.status === "failed") {
    let t1;
    if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
      t1 = <><Text color="background">{DIAMOND_FILLED} </Text><RainbowText text="ultrareview" phase={0} /><Text color="错误" dimColor={true}>{" \xB7 "}错误</Text></>;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    return t1;
  }
  let t1;
  if ($[2] !== 已找到 || $[3] !== p || $[4] !== 已反驳 || $[5] !== 已验证) {
    t1 = !p ? "设置中" : formatReviewStageCounts(p.stage, 已找到, 已验证, 已反驳);
    $[2] = 已找到;
    $[3] = p;
    $[4] = 已反驳;
    $[5] = 已验证;
    $[6] = t1;
  } else {
    t1 = $[6];
  }
  const tail = t1;
  let t2;
  if ($[7] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = <Text color="background">{DIAMOND_OPEN} </Text>;
    $[7] = t2;
  } else {
    t2 = $[7];
  }
  const t3 = running ? phase : 0;
  let t4;
  if ($[8] !== t3) {
    t4 = <RainbowText text="ultrareview" phase={t3} />;
    $[8] = t3;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  let t5;
  if ($[10] !== tail) {
    t5 = <Text dimColor={true}> · {tail}</Text>;
    $[10] = tail;
    $[11] = t5;
  } else {
    t5 = $[11];
  }
  let t6;
  if ($[12] !== t4 || $[13] !== t5) {
    t6 = <>{t2}{t4}{t5}</>;
    $[12] = t4;
    $[13] = t5;
    $[14] = t6;
  } else {
    t6 = $[14];
  }
  return t6;
}
export function RemoteSessionProgress(t0) {
  const $ = _c(11);
  const {
    session
  } = t0;
  if (session.isRemoteReview) {
    let t1;
    if ($[0] !== session) {
      t1 = <ReviewRainbowLine session={session} />;
      $[0] = session;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    return t1;
  }
  if (session.status === "completed") {
    let t1;
    if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
      t1 = <Text bold={true} color="success" dimColor={true}>已完成</Text>;
      $[2] = t1;
    } else {
      t1 = $[2];
    }
    return t1;
  }
  if (session.status === "failed") {
    let t1;
    if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
      t1 = <Text bold={true} color="错误" dimColor={true}>错误</Text>;
      $[3] = t1;
    } else {
      t1 = $[3];
    }
    return t1;
  }
  if (!session.todoList.length) {
    let t1;
    if ($[4] !== session.status) {
      t1 = <Text dimColor={true}>{session.status}…</Text>;
      $[4] = session.status;
      $[5] = t1;
    } else {
      t1 = $[5];
    }
    return t1;
  }
  let t1;
  if ($[6] !== session.todoList) {
    t1 = count(session.todoList, _temp);
    $[6] = session.todoList;
    $[7] = t1;
  } else {
    t1 = $[7];
  }
  const completed = t1;
  const total = session.todoList.length;
  let t2;
  if ($[8] !== completed || $[9] !== total) {
    t2 = <Text dimColor={true}>{completed}/{total}</Text>;
    $[8] = completed;
    $[9] = total;
    $[10] = t2;
  } else {
    t2 = $[10];
  }
  return t2;
}
function _temp(_) {
  return _.status === "completed";
}
