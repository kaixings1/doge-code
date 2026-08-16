import { ensureProjectAgents } from "../src/server/agent-templates";

async function main() {
  const r = await ensureProjectAgents("e2e-test-brand");
  console.log(JSON.stringify(r, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
