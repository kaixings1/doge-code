import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = 'Design deep modules: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface.\n\n## Glossary\nUse these terms exactly:\n- **Module** — anything with an interface and implementation\n- **Interface** — everything a caller must know (type, invariants, ordering, errors, config, perf)\n- **Depth** — leverage: behaviour per unit of interface\n- **Seam** — where you can alter behaviour without editing there\n- **Adapter** — concrete thing that satisfies an interface at a seam\n- **Leverage** — callers: more capability per interface learned\n- **Locality** — maintainers: change concentrates in one place\n\n## Deep vs Shallow\nDeep module = small interface + lots of implementation (good).\nShallow module = large interface + little implementation (avoid).\n\n## Principles\n1. Depth is a property of the interface, not the implementation.\n2. The deletion test: if deleting the module makes complexity vanish, it was a pass-through.\n3. The interface is the test surface.\n4. One adapter = hypothetical seam. Two adapters = real seam.\n\n## Dependency Categories\n- In-process: always deepenable\n- Local-substitutable: deepen if test stand-in exists\n- Remote but owned: Ports & Adapters pattern\n- True external: inject as port, mock in tests\n\n## Testing: replace, don\'t layer\n- Old unit tests on shallow modules become waste once tests at deepened interface exist — delete them.\n- Tests assert on observable outcomes through the interface, not internal state.'

export function registerCodebaseDesignSkill(): void {
  registerBundledSkill({
    name: 'codebase-design',
    description: 'Deep module design vocabulary — design small interfaces with deep implementations for maximum leverage and locality.',
    whenToUse: 'When designing or improving a module interface, deciding where a seam goes, or making code more testable.',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}