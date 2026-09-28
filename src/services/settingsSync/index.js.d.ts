// Type declaration for dynamic import
declare module 'src/services/settingsSync/index.js' {
  export function downloadUserSettings(): Promise<boolean>
  export function redownloadUserSettings(): Promise<boolean>
}

declare module '../../services/settingsSync/index.js' {
  export function downloadUserSettings(): Promise<boolean>
  export function redownloadUserSettings(): Promise<boolean>
}
