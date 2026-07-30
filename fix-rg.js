import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const targetDir = "D:/doge-code/src/utils/vendor/ripgrep/x64-win32";
if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
}
const sourcePath = "D:/doge-code/.tools/rg.exe";
const targetPath = targetDir + "/rg.exe";

const data = readFileSync(sourcePath);
writeFileSync(targetPath, data);
console.log("Written", data.length, "bytes to", targetPath);
