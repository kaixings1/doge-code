import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.join(__filename, "../");
const rgRoot = path.resolve(__dirname, "vendor", "ripgrep");
const command =
  process.platform === "win32"
    ? path.resolve(rgRoot, `${process.arch}-win32`, "rg.exe")
    : path.resolve(rgRoot, `${process.arch}-${process.platform}`, "rg");

console.log("rgRoot:", rgRoot);
console.log("command:", command);
console.log("platform:", process.platform);
console.log("arch:", process.arch);
