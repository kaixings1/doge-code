// Test: import settingsSync from print.ts's location
import {
  downloadUserSettings,
  redownloadUserSettings,
} from '../../services/settingsSync/index.js'

console.log('SUCCESS:', typeof downloadUserSettings, typeof redownloadUserSettings);
