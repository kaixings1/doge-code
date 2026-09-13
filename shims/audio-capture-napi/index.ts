// Shim for audio-capture-napi — vendor/audio-capture-src is unavailable in this build,
// so provide a minimal no-op implementation to allow compilation.
export const isNativeAudioAvailable = () => false
export const startNativeRecording = async () => { throw new Error('audio-capture-napi unavailable') }
export const stopNativeRecording = async () => {}
export const isNativeRecordingActive = () => false
export const startNativePlayback = async () => {}
export const writeNativePlaybackData = async () => {}
export const stopNativePlayback = async () => {}
export const isNativePlaying = () => false
export const microphoneAuthorizationStatus = async () => 'not-determined' as const
