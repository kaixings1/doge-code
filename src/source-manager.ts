import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_BUNDLED = __dirname.includes("~BUN") || __dirname.includes("bundle");

const SKILLS_DIR = path.resolve(process.env.DOGE_SKILLS_DIR || path.join(process.cwd(), ".claude", "skills"));

// 开发模式：__dirname 指向 src/，SOURCES_DIR = src/skills/bundled/high-star-imports/
// 编译后（doge.exe）：__dirname = B:\~BUN\root（虚拟路径），需回退到 exe 同目录或 cwd
const SOURCES_DIR = (() => {
  const candidates: string[] = [];

  if (!IS_BUNDLED) {
    // 开发模式：源码中的路径
    candidates.push(path.join(__dirname, "skills", "bundled", "high-star-imports"));
  } else {
    // 编译后：尝试多个候选路径
    // 1. exe 同目录下的 skills/bundled/high-star-imports/
    candidates.push(path.join(path.dirname(process.execPath), "skills", "bundled", "high-star-imports"));
    // 2. cwd/src/skills/bundled/high-star-imports/（在 doge-code 目录下运行开发版时）
    candidates.push(path.join(process.cwd(), "src", "skills", "bundled", "high-star-imports"));
    // 3. cwd/skills/bundled/high-star-imports/
    candidates.push(path.join(process.cwd(), "skills", "bundled", "high-star-imports"));
  }

  // 返回第一个存在的路径
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // 全都不存在时，返回最后一个候选路径（fallback，能触发 ensureDir 但不报错）
  return candidates[candidates.length - 1];
})();
export interface SkillSource {
 name: string;
 displayName: string;
 url?: string;
 description: string;
 skillCount: number;
}

export interface SkillItem {
 name: string;
 description: string;
 source: string;
 hasConflict: boolean;
}

export function ensureDir(dir: string) {
 if (fs.existsSync(dir)===false) {
 fs.mkdirSync(dir, { recursive: true });
 }
}
export function getAllSources(): SkillSource[] {
 ensureDir(SOURCES_DIR);
 var entries = fs.readdirSync(SOURCES_DIR, { withFileTypes: true });
 var result = [];
 for (var i=0;i<entries.length;i++) {
 var e = entries[i];
 if (e.isDirectory()===false) continue;
 var dirPath = path.join(SOURCES_DIR, e.name);
 var allFiles = fs.readdirSync(dirPath);
 var skills = [];
 for (var j=0;j<allFiles.length;j++) {
 if (allFiles[j].endsWith(String.fromCharCode(46,109,100))) skills.push(allFiles[j]);
 }
 var metaPath = path.join(dirPath, String.fromCharCode(115,111,117,114,99,101,46,106,115,111,110));
 var displayName = e.name;
 var description = String.fromCharCode(34,34);
 var url = String.fromCharCode(34,34);
 if (fs.existsSync(metaPath)) {
 try {
 var meta = JSON.parse(fs.readFileSync(metaPath, String.fromCharCode(117,116,102,45,56)));
 displayName = meta.displayName || e.name;
 description = meta.description || String.fromCharCode(34,34);
 url = meta.url || String.fromCharCode(34,34);
 } catch (ex) {}
 }
 result.push({ name: e.name, displayName: displayName, url: url, description: description, skillCount: skills.length });
 }
 return result;
}
export function getSourceSkills(sourceName: string): SkillItem[] {
 var dirPath = path.join(SOURCES_DIR, sourceName);
 if (fs.existsSync(dirPath)===false) return [];
 var allFiles = fs.readdirSync(dirPath);
 var files = [];
 for (var i=0;i<allFiles.length;i++) {
 if (allFiles[i].endsWith(".md")) files.push(allFiles[i]);
 }
 var skillDirs = fs.readdirSync(SKILLS_DIR);
 var existingNames = [];
 for (var j=0;j<skillDirs.length;j++) {
 if (fs.statSync(path.join(SKILLS_DIR, skillDirs[j])).isDirectory()) existingNames.push(skillDirs[j]);
 }
 var existingSet = {};
 for (var j=0;j<existingNames.length;j++) existingSet[existingNames[j]] = true;
 var result = [];
 var re = new RegExp(String.fromCharCode(100,101,115,99,114,105,112,116,105,111,110,58,92,115,42,34,40,91,94,34,93,43,41,34));
 for (var k=0;k<files.length;k++) {
 var fname = files[k];
 var skillName = fname.slice(0, -3);
 var content = fs.readFileSync(path.join(dirPath, fname), "utf-8");
 var descMatch = content.match(re);
 var description = descMatch ? descMatch[1] : "\"\"";
 result.push({ name: skillName, description: description, source: sourceName, hasConflict: existingSet[skillName]===true });
 }
 return result;
}

export function getConflicts(sourceName: string): SkillItem[] {
 var skills = getSourceSkills(sourceName);
 var result = [];
 for (var i=0;i<skills.length;i++) {
 if (skills[i].hasConflict) result.push(skills[i]);
 }
 return result;
}

export function installSourceSkills(sourceName: string, conflictDir: string) {
 var skills = getSourceSkills(sourceName);
 var installed = [] ;
 var conflicts = [] ;
 var errors = [] ;
 for (var i=0;i<skills.length;i++) {
 var skill = skills[i];
 var from = path.join(SOURCES_DIR, sourceName, skill.name + ".md");
 try {
 if (skill.hasConflict===true && conflictDir.length>0) {
 var targetDir = path.join(SKILLS_DIR, sourceName, skill.name);
 ensureDir(targetDir);
 fs.copyFileSync(from, path.join(targetDir, "SKILL.md"));
 conflicts.push(skill.name);
 } else if (skill.hasConflict===false) {
 var targetDir = path.join(SKILLS_DIR, skill.name);
 ensureDir(targetDir);
 fs.copyFileSync(from, path.join(targetDir, "SKILL.md"));
 installed.push(skill.name);
 }
 } catch (e) {
 errors.push(skill.name);
 }
 }
 return { installed:installed, conflicts:conflicts, errors:errors };
}

export function installAllSources() {
 var sources = getAllSources();
 var bySource = {};
 var totalInstalled = 0;
 var totalConflicts = 0;
 var totalErrors = 0;
 for (var i=0;i<sources.length;i++) {
 var src = sources[i];
 var result = installSourceSkills(src.name, src.name);
 bySource[src.name] = result;
 totalInstalled += result.installed.length;
 totalConflicts += result.conflicts.length;
 totalErrors += result.errors.length;
 }
 return { bySource:bySource, totalInstalled:totalInstalled, totalConflicts:totalConflicts, totalErrors:totalErrors };
}