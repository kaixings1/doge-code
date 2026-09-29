with open('D:/doge-code/src/hooks/useVoiceIntegration.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "const voiceInterimTranscript = feature('VOICE_MODE') ?",
    "const voiceInterimTranscript = (feature('VOICE_MODE') ?"
)
c = c.replace(
    "  useVoiceState(s_0 => s_0.voiceInterimTranscript) : '';",
    "  useVoiceState(s_0 => s_0.voiceInterimTranscript) : '') as string;"
)

with open('D:/doge-code/src/hooks/useVoiceIntegration.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
