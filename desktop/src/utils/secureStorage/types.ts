export type SecureStorageData = Record<string, unknown> & object

export interface SecureStorage {
  get(key: string): Promise<SecureStorageData | null>
  set(key: string, value: SecureStorageData): Promise<void>
  delete(key: string): Promise<void>
  read(): SecureStorageData | null
  readAsync?(): Promise<SecureStorageData | null>
  update(data: SecureStorageData): { success: boolean; warning?: string }
}
