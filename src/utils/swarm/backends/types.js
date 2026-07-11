// =============================================================================
// Type Guards
// =============================================================================
/**
 * Type guard to check if a backend type uses terminal panes.
 */
export function isPaneBackend(type) {
    return type === 'tmux' || type === 'iterm2';
}
