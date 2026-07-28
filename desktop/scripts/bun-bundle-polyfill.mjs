/**
 * Bun bundle polyfill for Electron desktop
 * Replaces bun:bundle imports when running outside Bun runtime
 */

export function feature(name) {
  // Feature flags - all disabled in desktop build
  const features = {
    PROACTIVE: false,
    KAIROS: false,
    KAIROS_PUSH_NOTIFICATION: false,
    KAIROS_GITHUB_WEBHOOKS: false,
    AGENT_TRIGGERS: false,
    AGENT_TRIGGERS_REMOTE: false,
    COORDINATOR_MODE: false,
    OVERFLOW_TEST_TOOL: false,
    CONTEXT_COLLAPSE: false,
    TERMINAL_PANEL: false,
    WEB_BROWSER_TOOL: false,
    HISTORY_SNIP: false,
    WORKFLOW_SCRIPTS: false,
    UDS_INBOX: false,
  };
  return features[name] ?? false;
}

export default { feature };
