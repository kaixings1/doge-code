import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Plugin to prevent esbuild cascade from loading real command modules.
// Strategy: return stub content from onLoad so esbuild never follows
// the heavy import chain (React/Ink/etc) inside those files.
const cascadeBreakPlugin = {
  name: 'cascade-break',
  async resolveId(source, importer) {
    // Intercept .js → .ts/.tsx conversion, .tsx → .ts conversion, and .ts → stub redirection
    if (!source.endsWith('.js') && !source.endsWith('.tsx') && !source.endsWith('.ts')) return null
    const isJs = source.endsWith('.js')
    const isTsx = source.endsWith('.tsx')
    const isTs = source.endsWith('.ts') && !isTsx
    if (!isJs && !isTsx && !isTs) return null
    const base = isJs ? source.slice(0, -3) : source.slice(0, -4)
    const tsSource = `${base}.ts`
    const tsxSource = `${base}.tsx`
    const jsSource = `${base}.js`
    try {
      const { existsSync } = await import('node:fs')
      const path = (await import('node:path')).default
      // Resolve relative to importer's directory (not cwd)
      const baseDir = importer ? path.dirname(importer) : process.cwd()
      const absJs = path.isAbsolute(jsSource) ? jsSource : path.join(baseDir, jsSource)
      if (isJs) {
        // .js → .ts conversion: if .js doesn't exist, redirect to .ts/.tsx
        if (!existsSync(absJs)) {
          const absTs = path.join(baseDir, tsSource)
          const absTsx = path.join(baseDir, tsxSource)
          if (existsSync(absTs)) return { id: tsSource }
          if (existsSync(absTsx)) return { id: tsxSource }
        }
      }
      if (isTsx) {
        // .tsx → .ts: if .ts exists, redirect to it (load hook will stub it)
        // tsSource is like 'src/commands/issue/index.ts' (relative to cwd)
        // baseDir is like 'D:/doge-code/src/commands/' (importer's directory)
        // Strip 'src/' prefix to avoid duplicating path segments
        const tsRelative = tsSource.startsWith('src/') ? tsSource.slice(4) : tsSource
        const absTs = path.join(baseDir, tsRelative)
        if (existsSync(absTs)) return { id: tsSource }
      }
    } catch {}
    return null
  },
  async load(id) {
    // Only stub known problematic files that trigger React/Ink cascade
    // Match both forward-slash and backslash paths (Windows compatibility)
    // Also match Vite's absolute path format: D:/doge-code/src/commands/issue/index.ts(x)
    if (!/src[/\\]commands[/\\]issue[/\\]index\.(ts|tsx)$/.test(id)) return null
    return {
      contents: 'export default {};\n',
      resolveDir: path.dirname(id),
      watchFiles: [id],
    }
  },
}

export default defineConfig({
  plugins: [cascadeBreakPlugin],
  test: {
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx', 'src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/e2e', 'src/__tests__/e2e', 'desktop/e2e/**/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/entrypoints/**',
        'src/bootstrap*.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: 'forks',
    reporter: ['verbose', 'json'],
    outputFile: {
      json: './coverage/test-results.json',
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      'bun:bundle': '/src/utils/bun-bundle-polyfill.ts',
      // Core mocks — prevent loading real modules that cascade to React, commands, etc.
      'src/commands.ts': '/src/bridge/__tests__/__mocks__/commands.mock.js',
      'src/commands.js': '/src/bridge/__tests__/__mocks__/commands.mock.js',
      'src/commands/issue/index.js': '/src/bridge/__tests__/__mocks__/commandsIssue.mock.js',
      'src/commands/issue/index.ts': '/src/bridge/__tests__/__mocks__/commandsIssue.mock.js',
      'src/commands/issue/index.tsx': '/src/bridge/__tests__/__mocks__/commandsIssue.mock.js',
      'src/commands/loop/engine.js': '/src/bridge/__tests__/__mocks__/commandsLoopEngine.mock.js',
      'src/commands/loop/types.js': '/src/bridge/__tests__/__mocks__/commandsLoopTypes.mock.js',
      'src/commands/backfill-sessions/index.js': '/src/bridge/__tests__/__mocks__/commandsBackfillSessions.mock.js',
      'src/utils/sessionStorage.js': '/src/bridge/__tests__/__mocks__/sessionStorage.mock.js',
      'src/services/oauth/client.js': '/src/bridge/__tests__/__mocks__/oauthClient.mock.js',
      'src/services/policyLimits/index.js': '/src/bridge/__tests__/__mocks__/policyLimits.mock.js',
      'src/services/analytics/growthbook.js': '/src/bridge/__tests__/__mocks__/growthbook.mock.js',
      'src/utils/config.js': '/src/bridge/__tests__/__mocks__/config.mock.js',
      'src/utils/auth.js': '/src/bridge/__tests__/__mocks__/auth.mock.js',
      'src/utils/sessionTitle.js': '/src/bridge/__tests__/__mocks__/sessionTitle.mock.js',
      'src/utils/words.js': '/src/bridge/__tests__/__mocks__/words.mock.js',
      'src/utils/git.js': '/src/bridge/__tests__/__mocks__/git.mock.js',
      'src/utils/lazySchema.js': '/src/bridge/__tests__/__mocks__/lazySchema.mock.js',
      'src/utils/semver.js': '/src/bridge/__tests__/__mocks__/semver.mock.js',
      'src/bootstrap/state.js': '/src/bridge/__tests__/__mocks__/bootstrapState.mock.js',
      'src/utils/debug.js': '/src/bridge/__tests__/__mocks__/debug.mock.js',
      'src/utils/displayTags.js': '/src/bridge/__tests__/__mocks__/displayTags.mock.js',
      'src/utils/errors.js': '/src/bridge/__tests__/__mocks__/errors.mock.js',
      'src/utils/messages/mappers.js': '/src/bridge/__tests__/__mocks__/messageMappers.mock.js',
      'src/utils/messages.js': '/src/bridge/__tests__/__mocks__/messages.mock.js',
      'src/components/DiagnosticsDisplay.tsx': '/src/bridge/__tests__/__mocks__/diagnosticsDisplay.mock.js',
      'src/services/diagnosticTracking.ts': '/src/bridge/__tests__/__mocks__/diagnosticTracking.mock.js',
      'src/vendor/stripAnsi.ts': '/src/bridge/__tests__/__mocks__/stripAnsi.mock.js',
      // Bridge modules
      'src/bridge/bridgeConfig.js': '/src/bridge/__tests__/__mocks__/bridgeConfig.mock.js',
      'src/bridge/bridgeEnabled.js': '/src/bridge/__tests__/__mocks__/bridgeEnabled.mock.js',
      'src/bridge/createSession.js': '/src/bridge/__tests__/__mocks__/createSession.mock.js',
      'src/bridge/debugUtils.js': '/src/bridge/__tests__/__mocks__/debugUtils.mock.js',
      'src/bridge/envLessBridgeConfig.js': '/src/bridge/__tests__/__mocks__/envLessBridgeConfig.mock.js',
      'src/bridge/pollConfig.js': '/src/bridge/__tests__/__mocks__/pollConfig.mock.js',
      'src/bridge/sessionIdCompat.js': '/src/bridge/__tests__/__mocks__/sessionIdCompat.mock.js',
      'src/bridge/feishuBridge.js': '/src/bridge/__tests__/__mocks__/feishuBridge.mock.js',
      'src/keybindings': '/src/bridge/__tests__/__mocks__/keybindings.mock.js',
      'src/keybindings.js': '/src/bridge/__tests__/__mocks__/keybindings.mock.js',
      'src/bridge/replBridge.js': '/src/bridge/__tests__/__mocks__/replBridge.mock.js',
      'src/bridge/bridgeApi.js': '/src/bridge/__tests__/__mocks__/bridgeApi.mock.js',
      'src/bridge/trustedDevice.js': '/src/bridge/__tests__/__mocks__/trustedDevice.mock.js',
      // npm packages
      'emoji-regex': '/src/bridge/__tests__/__mocks__/emoji-regex.mock.js',
      'get-east-asian-width': '/src/bridge/__tests__/__mocks__/get-east-asian-width.mock.js',
    },
  },
})
