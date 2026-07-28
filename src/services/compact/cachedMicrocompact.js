export const isCachedMicrocompactEnabled = () => false;
export const isModelSupportedForCacheEditing = () => false;
export const getCachedMCConfig = () => ({ triggerThreshold: 0, keepRecent: 0 });
export const createCachedMCState = () => ({
    registeredTools: new Set(),
    toolOrder: [],
    deletedRefs: new Set(),
    pinnedEdits: [],
    toolsSentToAPI: false,
});
export const markToolsSentToAPI = () => { };
export const resetCachedMCState = () => { };
export const registerToolResult = () => { };
export const registerToolMessage = () => { };
export const getToolResultsToDelete = () => [];
export const createCacheEditsBlock = () => null;
//# sourceMappingURL=cachedMicrocompact.js.map