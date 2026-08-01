import { type StructuredPatchHunk } from 'diff';
import * as React from 'react';
import { memo } from 'react';
import type { ThemeName } from '../utils/theme.js';
import { stringWidth } from '../ink/stringWidth.js';
import { Box, NoSelect, Text, useTheme } from '../ink.js';

// ─── Types ───────────────────────────────────────────────────────────────

interface DiffRow {
  left: string | null;   // line content for left column (old), null = empty
  right: string | null;  // line content for right column (new), null = empty
  leftType: 'add' | 'remove' | 'nochange';
  rightType: 'add' | 'remove' | 'nochange';
  leftLineNum: number | null;
  rightLineNum: number | null;
}

interface ParsedHunk {
  rows: DiffRow[];
  maxLeftLineNum: number;
  maxRightLineNum: number;
}

// ─── Hunk Parsing ────────────────────────────────────────────────────────

function parseHunkForSideBySide(hunk: StructuredPatchHunk): ParsedHunk {
  const rows: DiffRow[] = [];
  let leftLineNum = hunk.oldStart;
  let rightLineNum = hunk.newStart;

  // First pass: build aligned rows
  const pendingRemovals: string[] = [];
  const pendingAdditions: string[] = [];

  const flushPending = () => {
    while (pendingRemovals.length > 0 || pendingAdditions.length > 0) {
      const left = pendingRemovals.shift() ?? null;
      const right = pendingAdditions.shift() ?? null;
      rows.push({
        left,
        right,
        leftType: left !== null ? 'remove' : 'nochange',
        rightType: right !== null ? 'add' : 'nochange',
        leftLineNum: left !== null ? leftLineNum++ : null,
        rightLineNum: right !== null ? rightLineNum++ : null,
      });
    }
  };

  const addContext = (line: string) => {
    flushPending();
    rows.push({
      left: line,
      right: line,
      leftType: 'nochange',
      rightType: 'nochange',
      leftLineNum: leftLineNum++,
      rightLineNum: rightLineNum++,
    });
  };

  for (const rawLine of hunk.lines) {
    if (rawLine.startsWith(' ')) {
      addContext(rawLine.slice(1));
    } else if (rawLine.startsWith('-')) {
      pendingRemovals.push(rawLine.slice(1));
    } else if (rawLine.startsWith('+')) {
      pendingAdditions.push(rawLine.slice(1));
    }
  }
  flushPending();

  const maxLeftLineNum = Math.max(hunk.oldStart + hunk.oldLines - 1, 1);
  const maxRightLineNum = Math.max(hunk.newStart + hunk.newLines - 1, 1);

  return { rows, maxLeftLineNum, maxRightLineNum };
}

// ─── Column Width Calculation ────────────────────────────────────────────

function computeColumnWidths(
  totalWidth: number,
  maxLeftLineNum: number,
  maxRightLineNum: number,
): { leftWidth: number; rightWidth: number; gutterWidth: number; dividerWidth: number } {
  const gutterWidth = Math.max(
    Math.max(maxLeftLineNum.toString().length, maxRightLineNum.toString().length) + 1,
    3,
  );
  const dividerWidth = 3; // " │ "
  const available = totalWidth - gutterWidth - dividerWidth;
  const leftWidth = Math.floor(available / 2);
  const rightWidth = available - leftWidth;
  return { leftWidth, rightWidth, gutterWidth, dividerWidth };
}

// ─── Word Diff ────────────────────────────────────────────────────────────

import { diffWordsWithSpace } from 'diff';

const CHANGE_THRESHOLD = 0.4;

interface WordDiffResult {
  leftParts: WordPart[];
  rightParts: WordPart[];
}

interface WordPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

function computeWordDiffs(oldText: string, newText: string): WordDiffResult | null {
  const totalLength = oldText.length + newText.length;
  if (totalLength === 0) return null;

  const result = diffWordsWithSpace(oldText, newText, { ignoreCase: false });
  const leftParts: WordPart[] = [];
  const rightParts: WordPart[] = [];

  let changedLength = 0;
  for (const part of result) {
    if (part.added || part.removed) {
      changedLength += part.value.length;
    }
  }

  if (changedLength / totalLength > CHANGE_THRESHOLD) return null;

  for (const part of result) {
    if (part.added) {
      rightParts.push({ value: part.value, added: true });
    } else if (part.removed) {
      leftParts.push({ value: part.value, removed: true });
    } else {
      leftParts.push({ value: part.value });
      rightParts.push({ value: part.value });
    }
  }

  return { leftParts, rightParts };
}

// ─── Single Row Renderer ─────────────────────────────────────────────────

interface RowRendererProps {
  row: DiffRow;
  gutterWidth: number;
  leftContentWidth: number;
  rightContentWidth: number;
  dim: boolean;
  theme: ThemeName;
  keyPrefix: string;
}

const RowRenderer = memo(function RowRenderer({
  row,
  gutterWidth,
  leftContentWidth,
  rightContentWidth,
  dim,
  theme,
  keyPrefix,
}: RowRendererProps) {
  const leftBg = row.leftType === 'remove'
    ? dim ? 'diffRemovedDimmed' : 'diffRemoved'
    : row.leftType === 'add'
      ? dim ? 'diffAddedDimmed' : 'diffAdded'
      : undefined;
  const rightBg = row.rightType === 'add'
    ? dim ? 'diffAddedDimmed' : 'diffAdded'
    : row.rightType === 'remove'
      ? dim ? 'diffRemovedDimmed' : 'diffRemoved'
      : undefined;

  const leftSigil = row.leftType === 'add' ? '+' : row.leftType === 'remove' ? '-' : ' ';
  const rightSigil = row.rightType === 'add' ? '+' : row.rightType === 'remove' ? '-' : ' ';

  const leftLineNumStr = row.leftLineNum !== null
    ? row.leftLineNum.toString().padStart(gutterWidth - 1) + ' '
    : ' '.repeat(gutterWidth);
  const rightLineNumStr = row.rightLineNum !== null
    ? row.rightLineNum.toString().padStart(gutterWidth - 1) + ' '
    : ' '.repeat(gutterWidth);

  const leftCode = row.left ?? '';
  const rightCode = row.right ?? '';

  // Word diff when both sides have content
  let leftContent: React.ReactNode = leftCode;
  let rightContent: React.ReactNode = rightCode;
  let leftWordDiff = false;
  let rightWordDiff = false;

  if (row.left !== null && row.right !== null && !dim) {
    const wordDiff = computeWordDiffs(leftCode, rightCode);
    if (wordDiff) {
      leftContent = wordDiff.leftParts.map((part, i) =>
        part.removed
          ? <Text key={`lw-${i}`} backgroundColor="diffRemovedWord">{part.value}</Text>
          : <Text key={`lw-${i}`}>{part.value}</Text>,
      );
      rightContent = wordDiff.rightParts.map((part, i) =>
        part.added
          ? <Text key={`rw-${i}`} backgroundColor="diffAddedWord">{part.value}</Text>
          : <Text key={`rw-${i}`}>{part.value}</Text>,
      );
      leftWordDiff = true;
      rightWordDiff = true;
    }
  }

  const leftContentPadded = leftContent + ' '.repeat(Math.max(0, leftContentWidth - stringWidth(leftCode) - (leftWordDiff ? 0 : 0)));
  const rightContentPadded = rightContent + ' '.repeat(Math.max(0, rightContentWidth - stringWidth(rightCode) - (rightWordDiff ? 0 : 0)));

  return (
    <Box flexDirection="row" key={`${keyPrefix}-row`}>
      {/* Left gutter + sigil */}
      <NoSelect fromLeftEdge>
        <Text color={theme === 'light' ? undefined : undefined} backgroundColor={leftBg} dimColor={dim || row.leftType === 'nochange'}>
          {leftLineNumStr}{leftSigil}
        </Text>
      </NoSelect>
      {/* Left content */}
      <Text backgroundColor={leftBg} dimColor={dim || row.leftType === 'nochange'}>
        {leftContentPadded}
      </Text>

      {/* Divider */}
      <Text dimColor> │ </Text>

      {/* Right gutter + sigil */}
      <NoSelect fromLeftEdge>
        <Text backgroundColor={rightBg} dimColor={dim || row.rightType === 'nochange'}>
          {rightLineNumStr}{rightSigil}
        </Text>
      </NoSelect>
      {/* Right content */}
      <Text backgroundColor={rightBg} dimColor={dim || row.rightType === 'nochange'}>
        {rightContentPadded}
      </Text>
    </Box>
  );
});

// ─── Main Component ──────────────────────────────────────────────────────

type Props = {
  patch: StructuredPatchHunk;
  dim: boolean;
  width: number;
  filePath: string;
  firstLine: string | null;
  fileContent?: string;
};

export const SideBySideDiff = memo(function SideBySideDiff({
  patch,
  dim,
  width,
  filePath,
  firstLine,
  fileContent,
}: Props) {
  const [theme] = useTheme();
  const safeWidth = Math.max(1, Math.floor(width));

  const parsed = useMemo(() => parseHunkForSideBySide(patch), [patch]);
  const colWidths = useMemo(
    () => computeColumnWidths(safeWidth, parsed.maxLeftLineNum, parsed.maxRightLineNum),
    [safeWidth, parsed.maxLeftLineNum, parsed.maxRightLineNum],
  );
  const { leftWidth, rightWidth, gutterWidth } = colWidths;

  return (
    <Box flexDirection="column">
      {/* File path header */}
      <Box>
        <Text dimColor>{'─'.repeat(gutterWidth + leftWidth)}</Text>
        <Text dimColor>┼</Text>
        <Text dimColor>{'─'.repeat(gutterWidth + rightWidth)}</Text>
      </Box>
      {/* Column headers */}
      <Box>
        <Text dimColor backgroundColor="background">{' '.repeat(gutterWidth)}old</Text>
        <Text dimColor backgroundColor="background">{' '.repeat(leftWidth - 3)}</Text>
        <Text dimColor backgroundColor="background"> │ </Text>
        <Text dimColor backgroundColor="background">{' '.repeat(gutterWidth)}new</Text>
        <Text dimColor backgroundColor="background">{' '.repeat(Math.max(0, rightWidth - 3))}</Text>
      </Box>
      <Box>
        <Text dimColor>{'─'.repeat(gutterWidth + leftWidth)}</Text>
        <Text dimColor>┼</Text>
        <Text dimColor>{'─'.repeat(gutterWidth + rightWidth)}</Text>
      </Box>

      {/* Diff rows */}
      {parsed.rows.map((row, i) => (
        <RowRenderer
          key={`sb-${i}`}
          row={row}
          gutterWidth={gutterWidth}
          leftContentWidth={leftWidth}
          rightContentWidth={rightWidth}
          dim={dim}
          theme={theme}
          keyPrefix={`${patch.newStart}-${i}`}
        />
      ))}
    </Box>
  );
});
