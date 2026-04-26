export type TurnStartTime = number


export const DEFAULT_UPLOAD_CONCURRENCY = 5;
export const FILE_COUNT_LIMIT = 1000;
export const OUTPUTS_SUBDIR = "outputs";




export type TurnStartTime = number;
export interface PersistedFile { filename: string; file_id: string; }
export interface FailedPersistence { filename: string; error: string; }
export interface FilesPersistedEventData { files: PersistedFile[]; failed: FailedPersistence[]; }
