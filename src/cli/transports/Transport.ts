export interface Transport {
  connect?(): Promise<void>
  close?(): void | Promise<void>
  send?(data: string): Promise<void>
  setOnData?(handler: (data: string) => void): void
  onClose?(handler: (closeCode?: number) => void): void
}
