import { join } from 'path';
import React, { useCallback, useState } from 'react';
import type { ExitState } from '../hooks/useExitOnCtrlCDWithKeybindings.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { setClipboard } from '../ink/termio/osc.js';
import { Box, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { getCwd } from '../utils/cwd.js';
import { writeFileSync_DEPRECATED } from '../utils/slowOperations.js';
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';
import { Select } from './CustomSelect/select.js';
import { Byline } from './design-system/Byline.js';
import { Dialog } from './design-system/Dialog.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import TextInput from './TextInput.js';
type ExportDialogProps = {
  content: string;
  defaultFilename: string;
  onDone: (result: {
    success: boolean;
    message: string;
  }) => void;
};
type ExportOption = 'clipboard' | 'file';
export function ExportDialog({
  content,
  defaultFilename,
  onDone
}: ExportDialogProps): React.ReactNode {
  const [, setSelectedOption] = useState<ExportOption | null>(null);
  const [filename, setFilename] = useState<string>(defaultFilename);
  const [cursorOffset, setCursorOffset] = useState<number>(defaultFilename.length);
  const [showFilenameInput, setShowFilenameInput] = useState(false);
  const {
    columns
  } = useTerminalSize();

  // Handle going back from filename input to option selection
  const handleGoBack = useCallback(() => {
    setShowFilenameInput(false);
    setSelectedOption(null);
  }, []);
  const handleSelectOption = async (value: string): Promise<void> => {
    if (value === 'clipboard') {
      // Copy to clipboard immediately
      const raw = await setClipboard(content);
      if (raw) process.stdout.write(raw);
      onDone({
        success: true,
        message: '对话已复制到剪贴板'
      });
    } else if (value === 'file') {
      setSelectedOption('file');
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
        success: true,
        message: `对话已导出到：${filepath}`
      });
    } catch (error) {
      onDone({
        success: false,
        message: `导出对话失败：${error instanceof error ? error.message : '未知error'}`
      });
    }
  };

  // Dialog calls onCancel when Escape is pressed. If we are in the filename
  // input sub-screen, go back to the option list instead of closing entirely.
  const handleCancel = useCallback(() => {
    if (showFilenameInput) {
      handleGoBack();
    } else {
      onDone({
        success: false,
        message: '导出已取消'
      });
    }
  }, [showFilenameInput, handleGoBack, onDone]);
  const options = [{
    label: '复制到剪贴板',
    value: 'clipboard',
    description: '将对话复制到系统剪贴板'
  }, {
    label: '保存到文件',
    value: 'file',
    description: '将对话保存到当前目录的文件'
  }];

  // Custom input guide that changes based on dialog state
  function renderInputGuide(exitState: ExitState): React.ReactNode {
    if (showFilenameInput) {
      return <Byline>
          <KeyboardShortcutHint shortcut="Enter" action="save" />
          <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="返回" />
        </Byline>;
    }
    if (exitState.pending) {
      return <Text>再次按 {exitState.keyName} 退出</Text>;
    }
    return <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="取消" />;
  }

  // Use Settings context so 'n' key doesn't cancel (allows typing 'n' in filename input)
  useKeybinding('confirm:no', handleCancel, {
    context: 'Settings',
    isActive: showFilenameInput
  });
  return <Dialog title="导出对话" subtitle="选择导出方式：" color="permission" onCancel={handleCancel} inputGuide={renderInputGuide} isCancelActive={!showFilenameInput}>
      {!showFilenameInput ? <Select options={options} onChange={handleSelectOption} onCancel={handleCancel} /> : <Box flexDirection="column">
          <Text>输入文件名：</Text>
          <Box flexDirection="row" gap={1} marginTop={1}>
            <Text>&gt;</Text>
            <TextInput value={filename} onChange={setFilename} onSubmit={handleFilenameSubmit} focus={true} showCursor={true} columns={columns} cursorOffset={cursorOffset} onChangeCursorOffset={setCursorOffset} />
          </Box>
        </Box>}
    </Dialog>;
}
