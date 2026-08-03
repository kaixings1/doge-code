import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Scaffold Exercises\n\nCreate exercise directory structures with sections, problems, solutions, and explainers.\n\n## Directory structure\n- Sections: XX-section-name/\n- Exercises: XX.YY-exercise-name/ inside a section\n- Each exercise needs at least one of: problem/, solution/, explainer/\n- Names are dash-case (lowercase, hyphens)\n\n## Required files\nEach subfolder needs a readme.md with real content (at least a title).\nCode subfolders also need a main.ts.\n\n## Workflow\n1. Parse the plan — extract section names, exercise names, variant types\n2. Create directories — mkdir -p for each path\n3. Create stub readmes — one per variant folder with title\n4. Validate structure — ensure readmes exist and are non-empty\n\n## Renaming\nUse git mv (not mv) to rename directories — preserves git history.\nUpdate numeric prefix.\n\n## Example\nPlan:\nSection 01: Basics\n- 01.01 Introduction (explainer)\n- 01.02 Variables (explainer + problem + solution)\n\nCreates:\nexercises/01-basics/01.01-introduction/explainer/readme.md\nexercises/01-basics/01.02-variables/{explainer,problem,solution}/readme.md'

export function registerScaffoldExercisesSkill(): void {
  registerBundledSkill({
    name: 'scaffold-exercises',
    description: '创建包含章节、问题、解答和解释器的练习目录结构，通过验证。',
    whenToUse: 'When setting up a new course section, creating exercise stubs, or scaffolding a learning curriculum.',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}