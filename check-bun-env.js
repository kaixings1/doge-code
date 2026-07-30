console.log("BUN_INSTALL:", process.env.BUN_INSTALL);
console.log("BUN_RUNTIME:", process.env.BUN_RUNTIME);
for (const key of Object.keys(process.env).filter(k => k.includes("BUN"))) {
  console.log(`${key}=${process.env[key]}`);
}
