import * as React from "react";
import { Text, Box } from "ink";
import type { LocalJSXCommandContext } from "../../commands.js";
import type { LocalJSXCommandOnDone } from "../../types/command.js";
import {
 getAllSources,
 getSourceSkills,
 getConflicts,
 installSourceSkills,
 installAllSources,
 type SkillSource,
 type SkillItem,
} from "../../source-manager.js";

function SourceList({
 sources,
 onDone,
}: {
 sources: SkillSource[];
 onDone: () => void;
}) {
 return (
 <Box flexDirection="column">
 <Text bold color="cyan">
 📦 可用技能素材来源
 </Text>
 <Text> </Text>
 <Text dimColor>
 用法: /updateskills all — 全部安装
 </Text>
 <Text dimColor>
 用法: /updateskills source:{String.fromCharCode(60)}名称{String.fromCharCode(62)} — 安装指定来源
 </Text>
 <Text dimColor>
 用法: /updateskills conflict — 查看冲突列表
 </Text>
 <Text> </Text>
 {sources.map((src) => (
 <Box key={src.name}>
 <Text>
 <Text bold>{src.displayName}</Text>
 <Text dimColor> ({src.skillCount} skills)</Text>
 {src.url ? (
 <Text dimColor> — {src.url}</Text>
 ) : null}
 </Text>
 </Box>
 ))}
 <Text> </Text>
 <Text dimColor>按 Ctrl+C 或输入 / 继续对话</Text>
 </Box>
 );
}

function InstallResult({
 results,
 onDone,
}: {
 results: {
 bySource: Record<
 string,
 { installed: string[]; conflicts: string[]; errors: string[] }
 >;
 totalInstalled: number;
 totalConflicts: number;
 totalErrors: number;
 };
 onDone: () => void;
}) {
 return (
 <Box flexDirection="column">
 <Text bold color="green">
 \u2705 安装完成
 </Text>
 <Text> </Text>
 <Text>
 成功: <Text color="green">{results.totalInstalled}</Text>
 {" | "}
 冲突(已放入子目录): <Text color="yellow">{results.totalConflicts}</Text>
 {" | "}
 失败: <Text color="red">{results.totalErrors}</Text>
 </Text>
 <Text> </Text>
 {Object.entries(results.bySource).map(([source, result]) => {
 if (
 result.installed.length === 0 &&
 result.conflicts.length === 0 &&
 result.errors.length === 0
 )
 return null;
 return (
 <Box key={source} flexDirection="column">
 <Text bold color="cyan">
 {source}
 </Text>
 {result.installed.length > 0 && (
 <Text color="green">
 \u2713 安装: {result.installed.join(", ")}
 </Text>
 )}
 {result.conflicts.length > 0 && (
 <Text color="yellow">
 \u26A0 冲突→子目录: {result.conflicts.join(", ")}
 </Text>
 )}
 {result.errors.length > 0 && (
 <Text color="red">
 \u2717 失败: {result.errors.join(", ")}
 </Text>
 )}
 <Text> </Text>
 </Box>
 );
 })}
 <Text dimColor>提示: 重启后新技能即可使用</Text>
 </Box>
 );
}

function ConflictList({
 sources,
 onDone,
}: {
 sources: SkillSource[];
 onDone: () => void;
}) {
 const allConflicts: { source: string; skills: SkillItem[] }[] = [];
 for (const src of sources) {
 const c = getConflicts(src.name);
 if (c.length > 0) allConflicts.push({ source: src.name, skills: c });
 }

 if (allConflicts.length === 0) {
 return (
 <Box flexDirection="column">
 <Text bold color="green">
 \u2705 无冲突技能，可直接安装
 </Text>
 </Box>
 );
 }

 return (
 <Box flexDirection="column">
 <Text bold color="yellow">
 \u26A0\uFE0F 存在冲突的技能（同名已存在，将被放入子目录）
 </Text>
 <Text> </Text>
 {allConflicts.map((c) => (
 <Box key={c.source} flexDirection="column">
 <Text bold color="cyan">
 来源: {c.source}
 </Text>
 {c.skills.map((s) => (
 <Text key={s.name} dimColor>
 {" "}\u2022 {s.name}
 {s.description ? " \u2014 " + s.description : ""}
 </Text>
 ))}
 <Text> </Text>
 </Box>
 ))}
 </Box>
 );
}

// ====== 命令入口 ======

export async function call(
 onDone: LocalJSXCommandOnDone,
 context: LocalJSXCommandContext,
 args?: string
): Promise<React.ReactNode> {
 // 优先使用第三个参数（processSlashCommand 传入），回退到 context 中的 args
 const input = args || (context.options as any).args?.[0] || "";
 const sources = getAllSources();

 if (input === "all") {
 const results = installAllSources();
 return <InstallResult results={results} onDone={() => onDone()} />;
 }

 if (input === "conflict" || input === "冲突") {
 return <ConflictList sources={sources} onDone={() => onDone()} />;
 }

 if (input.startsWith("source:") || input.startsWith("来源:")) {
 const sourceName = input.replace(/^(source:|来源:)/, "");
 const src = sources.find((s) => s.name === sourceName);
 if (!src) {
 return (
 <Box flexDirection="column">
 <Text color="red">未找到来源: {sourceName}</Text>
 <Text dimColor>
 可用来源: {sources.map((s) => s.name).join(", ")}
 </Text>
 </Box>
 );
 }
 const result = installSourceSkills(sourceName, sourceName);
 const bySource: Record<string, any> = {};
 bySource[sourceName] = result;
 return (
 <InstallResult
 results={{
 bySource,
 totalInstalled: result.installed.length,
 totalConflicts: result.conflicts.length,
 totalErrors: result.errors.length,
 }}
 onDone={() => onDone()}
 />
 );
 }

 // 默认: 显示来源列表
 return <SourceList sources={sources} onDone={() => onDone()} />;
}