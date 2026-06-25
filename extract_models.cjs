const fs2 = require("fs");
const path = require("path");
const extDir = "D:/OpenSourceGit/openclaw-zero-token/extensions";
const outputDir = "D:/doge-code/provider-configs/models";
fs2.mkdirSync(outputDir, { recursive: true });
const coreProviders = ["deepseek","ollama","openai","google","groq","mistral","openrouter","vllm","xai","nvidia","together","perplexity"];
let allModels = [];
coreProviders.forEach(name => {
 const modelsPath = path.join(extDir, name, "models.ts");
 const pjPath = path.join(extDir, name, "openclaw.plugin.json");
 if (!fs2.existsSync(pjPath)) return;
 const pj = JSON.parse(fs2.readFileSync(pjPath, "utf-8"));
 const id = pj.id || name;
 const envVars = [];
 Object.values(pj.providerAuthEnvVars || {}).forEach(v => envVars.push(...v));
 let baseUrl = "";
 let modelCount = 0;
 if (fs2.existsSync(modelsPath)) {
 const tsContent = fs2.readFileSync(modelsPath, "utf-8");
 const idx = tsContent.indexOf("BASE_URL");
 if (idx >= 0) {
 const line = tsContent.substring(idx, idx + 100);
 const m = line.match(/["']([^"']+)["']/);
 if (m) baseUrl = m[1];
 }
 modelCount = (tsContent.match(/contextWindow:/g) || []).length;
 }
 allModels.push({provider: name, id: id, baseUrl: baseUrl, envVars: envVars, modelCount: modelCount});
});
allModels.sort((a,b) => b.modelCount - a.modelCount).forEach(m => {
 console.log(m.provider + ": " + m.modelCount + " models, URL=" + m.baseUrl + ", ENV=" + m.envVars.join(","));
});
fs2.writeFileSync(path.join(outputDir, "core-providers.json"), JSON.stringify(allModels, null, 2), "utf-8");
console.log("Done: " + allModels.length + " providers saved");
