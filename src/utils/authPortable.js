import { execa } from 'execa';
import { getMacOsKeychainStorageServiceName } from '../utils/secureStorage/macOsKeychainHelpers.js';
export async function maybeRemoveApiKeyFromMacOSKeychainThrows() {
    if (process.platform === 'darwin') {
        const storageServiceName = getMacOsKeychainStorageServiceName();
        const result = await execa(`security delete-generic-password -a $USER -s "${storageServiceName}"`, { shell: true, reject: false });
        if (result.exitCode !== 0) {
            throw new Error('Failed to delete keychain entry');
        }
    }
}
export function normalizeApiKeyForConfig(apiKey) {
    return apiKey.slice(-20);
}
//# sourceMappingURL=authPortable.js.map