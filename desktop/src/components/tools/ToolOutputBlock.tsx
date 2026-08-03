import { c as _c } from "react/compiler-runtime";
import * as React from 'react';
import { Box, Text } from '../../ink.js';
import { useSettings } from '../../hooks/useSettings.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';

type ToolOutputBlockProps = {
  children: React.ReactNode;
  header: string;
  /** Status indicator: 'success' | 'error' | 'running' | 'info' */
  status?: 'success' | 'error' | 'running' | 'info';
  /** Additional footer info (e.g. execution time) */
  footer?: React.ReactNode;
  /** Whether content is long enough to warrant collapsing */
  isLong?: boolean;
};

const STATUS_ICON: Record<string, string> = {
  success: '\u2713',
  error: '\u2717',
  running: '\u25CB',
  info: '\u2139',
};

const STATUS_COLOR: Record<string, string> = {
  success: 'success',
  error: 'error',
  running: 'warning',
  info: 'info',
};

export function ToolOutputBlock({
  children,
  header,
  status = 'info',
  footer,
  isLong = false,
}: ToolOutputBlockProps): React.ReactNode {
  const $ = _c(14);
  const settings = useSettings();
  const { columns } = useTerminalSize();

  // If block output is disabled, render children directly
  if (!settings.blockOutput) {
    return <>{children}</>;
  }

  // Collapse state: default to collapsed for long output
  const [collapsed, setCollapsed] = React.useState(() => isLong);

  let t0;
  if ($[0] !== collapsed) {
    t0 = () => {
      setCollapsed(prev => !prev);
    };
    $[0] = collapsed;
    $[1] = t0;
  } else {
    t0 = $[1];
  }

  const icon = STATUS_ICON[status] ?? STATUS_ICON.info;
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.info;
  const borderColor = status === 'error' ? 'error' : status === 'success' ? 'success' : 'subtle';

  let t1;
  if ($[2] !== collapsed || $[3] !== borderColor || $[4] !== header || $[5] !== icon || $[6] !== color || $[7] !== columns || $[8] !== footer) {
    t1 = <Box flexDirection="column" borderStyle="single" borderColor={borderColor}>
      {/* Header bar */}
      <Box flexDirection="row">
        <Text color={color} dimColor={collapsed}>
          {collapsed ? ` ${icon} ${header} (已折叠)` : ` ${icon} ${header}`}
        </Text>
        <Text dimColor> </Text>
        <Text dimColor>{collapsed ? `[点击展开]` : `[点击折叠]`}</Text>
      </Box>
      {/* Collapsible content */}
      {!collapsed && (
        <Box flexDirection="column" paddingX={1}>
          {children}
          {footer && <Text dimColor>{footer}</Text>}
        </Box>
      )}
      {collapsed && footer && (
        <Text dimColor>  {footer}</Text>
      )}
    </Box>;
    $[2] = collapsed;
    $[3] = borderColor;
    $[4] = header;
    $[5] = icon;
    $[6] = color;
    $[7] = columns;
    $[8] = footer;
    $[9] = t1;
  } else {
    t1 = $[9];
  }

  let t2;
  if ($[10] !== t1 || $[11] !== t0) {
    t2 = <Box onPress={t0} flexDirection="column">{t1}</Box>;
    $[10] = t1;
    $[11] = t0;
    $[12] = t2;
  } else {
    t2 = $[12];
  }

  let t3;
  if ($[13] !== t2) {
    t3 = <Box flexShrink={0} flexDirection="column">{t2}</Box>;
    $[13] = t2;
    $[14] = t3;
  } else {
    t3 = $[14];
  }

  return t3;
}
