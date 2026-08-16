import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

import { TEMPLATES } from "@/server/agent-templates";

/**
 * Goldens for D15: CMO first-turn greeting MUST honor FIRST_TURN.md when
 * present and MUST NOT fabricate audit findings when absent.
 *
 * Each case JSON specifies whether FIRST_TURN.md exists + its content. The
 * production system prompt (from agent-templates.ts) is used unchanged. The
 * eval injects file content via a system-prompt suffix that simulates the
 * agent reading its workspace at session start. The LLM is called with the
 * minimal user "Hi" to elicit the first assistant turn.
 *
 * Skips entirely when OPENAI_API_KEY is absent — the user explicitly
 * declined live evals during the design review (D24). Run with `pnpm eval`
 * to opt in.
 */

type EvalCase = {
  name: string;
  description: string;
  first_turn_md: string | null;
  user_first_message: string;
  expected_assistant_first_reply: {
    must_contain_any_of: string[];
    must_not_contain: string[];
  };
};

const HAS_KEY = Boolean(process.env.OPENAI_API_KEY);
const CASES_DIR = join(__dirname, "cases");
const cases: EvalCase[] = readdirSync(CASES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(CASES_DIR, f), "utf8")) as EvalCase);

function cmoSystemPrompt(): string {
  const cmo = TEMPLATES.find((t) => t.key === "cmo");
  if (!cmo) throw new Error("CMO template not found in agent-templates.ts");
  return cmo.system_prompt;
}

function buildSystemMessage(c: EvalCase): string {
  const base = cmoSystemPrompt();
  if (!c.first_turn_md) {
    return `${base}

[Workspace check]
FIRST_TURN.md does not exist in your workspace.`;
  }
  return `${base}

[Workspace check]
FIRST_TURN.md IS present in your workspace. Its contents:

=== FIRST_TURN.md ===
${c.first_turn_md}
=== END FIRST_TURN.md ===

Per your instructions, weave the file's content into your opening greeting
now. Treat this as your FIRST chat turn.`;
}

describe.skipIf(!HAS_KEY)("CMO first-turn (eval, D15)", () => {
  for (const c of cases) {
    it(
      `${c.name} — ${c.description}`,
      async () => {
        const { text } = await generateText({
          model: openai("gpt-4o-mini"),
          system: buildSystemMessage(c),
          prompt: c.user_first_message,
          maxRetries: 1,
        });

        const lower = text.toLowerCase();

        if (c.expected_assistant_first_reply.must_contain_any_of.length > 0) {
          const matched = c.expected_assistant_first_reply.must_contain_any_of.some(
            (pattern) => new RegExp(pattern, "i").test(text),
          );
          expect(
            matched,
            `\nCMO reply did not reference any of the expected anchors.\nExpected one of: ${c.expected_assistant_first_reply.must_contain_any_of.join(", ")}\nGot:\n${text}\n`,
          ).toBe(true);
        }

        for (const forbidden of c.expected_assistant_first_reply.must_not_contain) {
          const re = new RegExp(forbidden, "i");
          expect(
            re.test(text),
            `\nCMO reply contained forbidden phrase \"${forbidden}\".\nGot:\n${text}\n`,
          ).toBe(false);
        }

        void lower;
      },
      // Allow up to 30s per case (LLM call latency).
      30_000,
    );
  }
});

if (!HAS_KEY) {
  // Surface a non-test diagnostic so the user knows evals were skipped (and why).
  // Vitest prints stdout when --reporter=verbose; in default reporter it's hidden.
  console.log(
    "[evals] OPENAI_API_KEY not set — CMO first-turn evals skipped. Run `pnpm eval` with the key in env to opt in.",
  );
}
