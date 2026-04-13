import { c as _c } from "react/compiler-runtime";
import React from 'react';
import { Box, Text } from '../ink.js';
import { FpsMetricsProvider } from '../context/fpsMetrics.js';
import { StatsProvider, type StatsStore } from '../context/stats.js';
import { type AppState, AppStateProvider } from '../state/AppState.js';
import { onChangeAppState } from '../state/onChangeAppState.js';
import type { FpsMetrics } from '../utils/fpsTracker.js';
type Props = {
  getFpsMetrics: () => FpsMetrics | undefined;
  stats?: StatsStore;
  initialState: AppState;
  children: React.ReactNode;
};

type BootstrapBoundaryState = {
  error: Error | null;
};

class BootstrapBoundary extends React.Component<{
  children: React.ReactNode;
}, BootstrapBoundaryState> {
  override state: BootstrapBoundaryState = {
    error: null
  };
  static override getDerivedStateFromError(error: Error): BootstrapBoundaryState {
    return {
      error
    };
  }
  override componentDidCatch(error: Error): void {
    const message = error?.stack ?? error?.message ?? String(error);
    console.error(`[restored-app-bootstrap] ${message}`);
  }
  override render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }
    return <Box flexDirection="column" paddingX={1}>
      <Text color="red">Failed to initialize restored app bootstrap.</Text>
      <Text dimColor>{this.state.error.message || String(this.state.error)}</Text>
    </Box>;
  }
}

/**
 * Top-level wrapper for interactive sessions.
 * Provides FPS metrics, stats context, and app state to the component tree.
 */
export function App(t0) {
  const $ = _c(12);
  const {
    getFpsMetrics,
    stats,
    initialState,
    children
  } = t0;
  let t1;
  if ($[0] !== children || $[1] !== initialState) {
    t1 = <AppStateProvider initialState={initialState} onChangeAppState={onChangeAppState}>{children}</AppStateProvider>;
    $[0] = children;
    $[1] = initialState;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== stats || $[4] !== t1) {
    t2 = <StatsProvider store={stats}>{t1}</StatsProvider>;
    $[3] = stats;
    $[4] = t1;
    $[5] = t2;
  } else {
    t2 = $[5];
  }
  let t3;
  if ($[6] !== getFpsMetrics || $[7] !== t2) {
    t3 = <FpsMetricsProvider getFpsMetrics={getFpsMetrics}>{t2}</FpsMetricsProvider>;
    $[6] = getFpsMetrics;
    $[7] = t2;
    $[8] = t3;
  } else {
    t3 = $[8];
  }
  let t4;
  if ($[9] !== t3) {
    t4 = <BootstrapBoundary>{t3}</BootstrapBoundary>;
    $[9] = t3;
    $[10] = t4;
  } else {
    t4 = $[10];
  }
  $[11] = t4;
  return t4;
}
