with open('D:/doge-code/src/components/TextInput.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Fix audioLevels type
c = c.replace(
    "const audioLevels = feature('VOICE_MODE') ?",
    "const audioLevels = (feature('VOICE_MODE') ?"
)
c = c.replace(
    "  useVoiceState(s_0 => s_0.voiceAudioLevels) : [];",
    "  useVoiceState(s_0 => s_0.voiceAudioLevels) : []) as number[];"
)

with open('D:/doge-code/src/components/TextInput.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
