import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Prototype\n\nBuild a throwaway prototype to flesh out a design. Prototype code answers a question, then gets deleted.\n\n## Pick a branch\n\n- **Logic/state question** — build a tiny interactive terminal app that pushes the state machine through edge cases.\n- **UI question** — generate several radically different UI variations on a single route, switchable via URL param.\n\n## Rules\n\n1. **Throwaway from day one.** Name files clearly as prototypes, not production code.\n2. **One command to run.** Use the project existing task runner.\n3. **No persistence by default.** State lives in memory.\n4. **Skip the polish.** No tests, no error handling beyond runnable.\n5. **Surface the state.** After every action or variant switch, show the full relevant state.\n6. **Delete or absorb when done.** Fold findings into real code, don\'t leave prototypes rotting.\n\n## Logic prototype\n- State the question explicitly before writing code\n- Use the host project language and tooling\n- Isolate the logic in a portable pure module (the TUI is throwaway, the logic module isn\'t)\n- Let the user press buttons and watch state change\n\n## UI prototype\n- Prefer modifying an existing page with ?variant= param over a standalone route\n- Failing that, create a temporary route variant under the existing routing convention\n- Generate 3-5 radically different visual approaches\n- Include a floating bottom bar showing all available variants\n\n## When done\nCapture the answer (commit message, ADR, or NOTES.md) along with the question it answered, then delete the prototype code.'

export function registerPrototypeSkill(): void {
  registerBundledSkill({
    name: 'prototype',
    description: '构建可丢弃的原型来验证设计 — 逻辑问题用终端应用，设计问题用 UI 变体。',
    whenToUse: 'When you need to explore a design decision through runnable code before committing to implementation.',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}