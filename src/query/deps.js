import { randomUUID } from 'crypto';
import { queryModelWithStreaming } from '../services/api/claude.js';
import { autoCompactIfNeeded } from '../services/compact/autoCompact.js';
import { microcompactMessages } from '../services/compact/microCompact.js';
export function productionDeps() {
    return {
        callModel: queryModelWithStreaming,
        microcompact: microcompactMessages,
        autocompact: autoCompactIfNeeded,
        uuid: randomUUID,
    };
}
