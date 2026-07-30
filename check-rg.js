const { execFileSync } = require("child_process");
try {
  const result = execFileSync("rg", ["--version"], { encoding: "utf8" });
  console.log("rg found:", result.trim());
} catch (e) {
  console.log("rg not found:", e.message);
}
