import { CHANGELOG_URL, fetchAndStoreChangelog, getAllReleaseNotes, getStoredChangelog, } from '../../utils/releaseNotes.js';
function formatReleaseNotes(notes) {
    return notes
        .map(([version, notes]) => {
        const header = `版本 ${version}：`;
        const bulletPoints = notes.map(note => `· ${note}`).join('\n');
        return `${header}\n${bulletPoints}`;
    })
        .join('\n\n');
}
export async function call() {
    // Try to fetch the latest changelog with a 500ms timeout
    let freshNotes = [];
    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(rej => rej(new Error('Timeout')), 500, reject);
        });
        await Promise.race([fetchAndStoreChangelog(), timeoutPromise]);
        freshNotes = getAllReleaseNotes(await getStoredChangelog());
    }
    catch {
        // Either fetch failed or timed out - just use cached notes
    }
    // If we have fresh notes from the quick fetch, use those
    if (freshNotes.length > 0) {
        return { type: 'text', value: formatReleaseNotes(freshNotes) };
    }
    // Otherwise check cached notes
    const cachedNotes = getAllReleaseNotes(await getStoredChangelog());
    if (cachedNotes.length > 0) {
        return { type: 'text', value: formatReleaseNotes(cachedNotes) };
    }
    // Nothing available, show link
    return {
        type: 'text',
        value: `查看完整更新日志: ${CHANGELOG_URL}`,
    };
}
//# sourceMappingURL=release-notes.js.map