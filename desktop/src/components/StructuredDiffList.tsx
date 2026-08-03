import type { StructuredPatchHunk } from 'diff';
import * as React from 'react';
import { Box, NoSelect, Text } from '../ink.js';
import { intersperse } from '../utils/array.js';
import { StructuredDiff } from './StructuredDiff.js';
import { SideBySideDiff } from './SideBySideDiff.js';
type Props = {
  hunks: StructuredPatchHunk[];
  dim: boolean;
  width: number;
  filePath: string;
  firstLine: string | null;
  fileContent?: string;
  sideBySide?: boolean;
};

/** Renders a list of diff hunks with ellipsis separators between them. */
export function StructuredDiffList({
  hunks,
  dim,
  width,
  filePath,
  firstLine,
  fileContent,
  sideBySide = false,
}: Props): React.ReactNode {
  if (sideBySide && hunks.length > 0) {
    return <Box flexDirection="column">
      {hunks.map(hunk => <SideBySideDiff key={hunk.newStart} patch={hunk} dim={dim} width={width} filePath={filePath} firstLine={firstLine} fileContent={fileContent} />)}
    </Box>;
  }
  return intersperse(hunks.map(hunk => <Box flexDirection="column" key={hunk.newStart}>
        <StructuredDiff patch={hunk} dim={dim} width={width} filePath={filePath} firstLine={firstLine} fileContent={fileContent} />
      </Box>), i => <NoSelect fromLeftEdge key={`ellipsis-${i}`}>
        <Text dimColor>...</Text>
      </NoSelect>);
}
