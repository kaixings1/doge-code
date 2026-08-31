import { AGENT_COLORS } from '../../tools/AgentTool/agentColorManager.js';
import { detectAndGetBackend } from './backends/registry.js';
// Track color assignments for teammates (persisted per session)
const teammateColorAssignments = new Map();
let colorIndex = 0;
/**
 * Gets the appropriate backend for the current environment.
 * detectAndGetBackend() caches internally — no need for a second cache here.
 */
async function getBackend() {
    return (await detectAndGetBackend()).backend;
}
/**
 * Assigns a unique color to a teammate from the available palette.
 * Colors are assigned in round-robin order.
 */
export function assignTeammateColor(teammateId) {
    const existing = teammateColorAssignments.get(teammateId);
    if (existing) {
        return existing;
    }
    const color = AGENT_COLORS[colorIndex % AGENT_COLORS.length];
    teammateColorAssignments.set(teammateId, color);
    colorIndex++;
    return color;
}
/**
 * Gets the assigned color for a teammate, if any.
 */
export function getTeammateColor(teammateId) {
    return teammateColorAssignments.get(teammateId);
}
/**
 * Clears all teammate color assignments.
 * Called during team cleanup to reset state for potential new teams.
 */
export function clearTeammateColors() {
    teammateColorAssignments.clear();
    colorIndex = 0;
}
/**
 * Checks if we're currently running inside a tmux session.
 * Uses the detection module directly for this check.
 */
export async function isInsideTmux() {
    const { isInsideTmux: checkTmux } = await import('./backends/detection.js');
    return checkTmux();
}
/**
 * Creates a new teammate pane in the swarm view.
 * Automatically selects the appropriate backend (tmux or iTerm2) based on environment.
 *
 * When running INSIDE tmux:
 * - Uses TmuxBackend to split the current window
 * - Leader stays on left (30%), teammates on right (70%)
 *
 * When running in iTerm2 (not in tmux) with it2 CLI:
 * - Uses ITermBackend for native iTerm2 split panes
 *
 * When running OUTSIDE tmux/iTerm2:
 * - Falls back to TmuxBackend with external claude-swarm session
 */
export async function createTeammatePaneInSwarmView(teammateName, teammateColor) {
    const backend = await getBackend();
    return backend.createTeammatePaneInSwarmView(teammateName, teammateColor);
}
/**
 * Enables pane border status for a window (shows pane titles).
 * Delegates to the detected backend.
 */
export async function enablePaneBorderStatus(windowTarget, useSwarmSocket = false) {
    const backend = await getBackend();
    return backend.enablePaneBorderStatus(windowTarget, useSwarmSocket);
}
/**
 * Sends a command to a specific pane.
 * Delegates to the detected backend.
 */
export async function sendCommandToPane(paneId, command, useSwarmSocket = false) {
    const backend = await getBackend();
    return backend.sendCommandToPane(paneId, command, useSwarmSocket);
}
