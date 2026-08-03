import React from 'react';
import type { StatsStore } from './context/stats.js';
import type { Root } from './ink.js';
import type { Props as REPLProps } from './screens/REPL.js';
import type { AppState } from './state/AppStateStore.js';
import type { FpsMetrics } from './utils/fpsTracker.js';

type AppWrapperProps = {
  getFpsMetrics: () => FpsMetrics | undefined;
  stats?: StatsStore;
  initialState: AppState;
};

export async function launchRepl(root: Root, appProps: AppWrapperProps, replProps: REPLProps, renderAndRun: (root: Root, element: React.ReactNode) => Promise<void>): Promise<void> {

  const {
    App
  } = await import('./components/App.js');
  console.error('[STEP-0] launchRepl: App imported');

  // Small delay to let Bun settle before loading large REPL module
  await new Promise(resolve => setTimeout(resolve, 100));

  // Try multiple times in case of transient Bun module resolution issues
  let REPL: any = null;
  let lastError: Error | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      const mod = await import('./screens/REPL.js');
      REPL = mod.REPL;
      console.error('[STEP-1] launchRepl: REPL module loaded (attempt ' + i + ')');
      break;
    } catch (err) {
      lastError = err as Error;
      console.error('[STEP-ERR] launchRepl: REPL load failed attempt ' + i + ': ' + (err as Error).message);
      if (i < 2) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  if (!REPL) {
    const minimalMod = await import('./screens/REPL-minimal.js');
    REPL = minimalMod.REPL;
    console.error('[STEP-1F] launchRepl: fell back to REPL-minimal');
  }
  console.error('[STEP-2] launchRepl: about to call renderAndRun');
  await renderAndRun(root, <App {...appProps}>
      <REPL {...replProps} />
    </App>);
  console.error('[STEP-3] launchRepl: renderAndRun returned');
}
