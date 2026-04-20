import { join } from 'path';
import React, { useCallback, useState } from 'react';
import type { 退出State } from '../hooks/use退出OnCtrlCDWithKeybindings.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { setClipboard } from '../ink/termio/osc.js';
import { Box, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { getCwd } from '../utils/cwd.js';
import { writeFileSync_DEPRECATED } from '../utils/slowOperations.js';
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';
import { 选择 } from './自定义选择/select.js';
import { Byline } from './design-system/Byline.js';
import { Dialog } from './design-system/Dialog.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import TextInput from './TextInput.js';
type ExportDialogProps = {
  content: string;
  defaultFilename: string;
  onDone: (result: {
    成功: boolean;
    message: string;
  }) => void;
};
type ExportOption = 'clipboard' | 'file';
export function ExportDialog({
  content,
  defaultFilename,
  onDone
}: ExportDialogProps): React.ReactNode {
  const [, set选择edOption] = useState<ExportOption | null>(null);
  const [filename, setFilename] = useState<string>(defaultFilename);
  const [cursorOffset, setCursorOffset] = useState<number>(defaultFilename.length);
  const [showFilenameInput, setShowFilenameInput] = useState(false);
  const {
    columns
  } = useTerminalSize();

  // Handle going back from filename input to option selection
  const handleGo返回 = useCallback(() => {
    setShowFilenameInput(false);
    set选择edOption(null);
  }, []);
  const handle选择Option = async (value: string): Promise<void> => {
    if (value === 'clipboard') {
      // Copy to clipboard immediately
      const raw = await setClipboard(content);
      if (raw) process.stdout.write(raw);
      onDone({
        成功: true,
        message: '对话已复制到剪贴板'
      });
    } else if (value === 'file') {
      set选择edOption('file');
      setShowFilenameInput(true);
    }
  };
  const handleFilenameSubmit = () => {
    const finalFilename = filename.endsWith('.txt') ? filename : filename.replace(/\.[^.]+$/, '') + '.txt';
    const filepath = join(getCwd(), finalFilename);
    try {
      writeFileSync_DEPRECATED(filepath, content, {
        encoding: 'utf-8',
        flush: true
      });
      onDone({
        成功: true,
        message: `对话已导出到：${filepath}`
      });
    } catch (error) {
      onDone({
        成功: false,
        message: `导出对话失败：${error instanceof error ? error.message : '未知error'}`
      });
    }
  };

  // Dialog calls on取消 when Escape is pressed. If we are in the filename
  // input sub-screen, go back to the option list instead of closing entirely.
  const handle取消 = useCallback(() => {
    if (showFilenameInput) {
      handleGo返回();
    } else {
      onDone({
        成功: false,
        message: '导出已取消'
      });
    }
  }, [showFilenameInput, handleGo返回, onDone]);
  const options = [{
    label: '复制到剪贴板',
    value: 'clipboard',
    description: '将对话复制到系统剪贴板'
  }, {
    label: '保存到文件',
    value: 'file',
    description: '将对话保存到当前目录的文件'
  }];

  // 自定义 input guide that changes based on dialog state
  function renderInputGuide(exitState: 退出State): React.ReactNode {
    if (showFilenameInput) {
      return <Byline>
          <KeyboardShortcutHint shortcut="回车" action="save" />
          <ConfigurableShortcutHint action="confirm:no" context="确认ation" fallback="Esc" description="返回" />
        </Byline>;
    }
    if (exitState.pending) {
      return <Text>再次按 {exitState.keyName} 退出</Text>;
    }
    return <ConfigurableShortcutHint action="confirm:no" context="确认ation" fallback="Esc" description="取消" />;
  }

  // Use s context so 'n' key doesn't cancel (allows typing 'n' in filename input)
  useKeybinding('confirm:no', handle取消, {
    context: 's',
    is活动: showFilenameInput
  });
  return <Dialog title="导出对话" subtitle="选择导出方式：" color="permission" on取消={handle取消} inputGuide={renderInputGuide} is取消活动={!showFilenameInput}>
      {!showFilenameInput ? <选择 options={options} onChange={handle选择Option} on取消={handle取消} /> : <Box flexDirection="column">
          <Text>输入文件名：</Text>
          <Box flexDirection="row" gap={1} marginTop={1}>
            <Text>&gt;</Text>
            <TextInput value={filename} onChange={setFilename} onSubmit={handleFilenameSubmit} focus={true} showCursor={true} columns={columns} cursorOffset={cursorOffset} onChangeCursorOffset={setCursorOffset} />
          </Box>
        </Box>}
    </Dialog>;
}
