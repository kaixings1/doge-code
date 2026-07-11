export function createStore(initialState, onChange) {
    let state = initialState;
    const listeners = new Set();
    return {
        getState: () => state,
        setState: (updater) => {
            const prev = state;
            const next = updater(prev);
            if (Object.is(next, prev))
                return;
            state = next;
            onChange?.({ newState: next, oldState: prev });
            for (const listener of listeners)
                listener();
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
