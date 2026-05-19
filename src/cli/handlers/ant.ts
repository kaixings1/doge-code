// Stub: cli/handlers/ant.ts
export async function logHandler(_logId?: string | number): Promise<void> {}

export async function errorHandler(_number?: number): Promise<void> {}

export async function exportHandler(_source: string, _outputFile: string): Promise<void> {}

export async function taskCreateHandler(_subject: string, _opts: any): Promise<void> {}

export async function taskListHandler(_opts: any): Promise<void> {}

export async function taskGetHandler(_id: string, _opts: any): Promise<void> {}

export async function taskUpdateHandler(_id: string, _opts: any): Promise<void> {}

export async function taskDirHandler(_opts: any): Promise<void> {}

export async function completionHandler(_shell: string, _opts: any, _program: any): Promise<void> {}
