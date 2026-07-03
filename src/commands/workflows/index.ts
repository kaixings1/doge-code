// Workflows - automate repetitive tasks with scriptable sequences
import type { Command } from '../../commands.js'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'

const NL = '\n'

const call = async (args: string) => {
 const action = args.trim().toLowerCase() || 'help'

 if (action === 'help' || action === '') {
 return {
 type: 'text' as const,
 value: [
 'Workflows - automation workflow scripts',
 '',
 'Usage:',
 ' /workflows list - list all available workflows',
 ' /workflows run <name> - run specified workflow',
 ' /workflows create <name> - create new workflow',
 ' /workflows edit <name> - edit workflow',
 ' /workflows delete <name> - delete workflow',
 '',
 'Preset workflows:',
 ' - full-stack-app - create full stack app',
 ' - api-service - build REST API service',
 ' - migrate-project - project migration assistant',
 ' - code-review - automated code review',
 ' - test-generator - batch test case generation',
 '',
 'Features:',
 ' - Scriptable task sequences',
 ' - Support conditional branching and loops',
 ' - Seamless integration with existing commands and tools',
 ' - Shareable and reusable workflow templates',
 ].join(NL),
 }
 }

 if (action === 'list' || action === 'ls') {
 return {
 type: 'text' as const,
 value: [
 'Available workflows',
 '',
 ' full-stack-app - create full stack app',
 ' api-service - build REST API service',
 ' migrate-project - project migration assistant',
 ' code-review - automated code review',
 ' test-generator - batch test case generation',
 '',
 'Use /workflows run <name> to execute a workflow.',
 ].join(NL),
 }
 }

 if (action.startsWith('run ') || action.startsWith('execute ')) {
 const wfName = action.replace(/^(run|execute)//s+/, '').trim()
 return {
 type: 'text' as const,
 value: [
 '',
 'Steps:',
 ' 1. Analyze project structure and requirements',
 ' 2. Create implementation plan',
 ' 3. Execute automated tasks step by step',
 ' 4. Verify results and submit',
 ].join(NL),
 }
 }

 if (action.startsWith('create ')) {
 const wfName = action.replace(/^create//s+/, '').trim()
 return {
 type: 'text' as const,
 value: [
 '',
 'In the workflow creation wizard, you can:',
 ' - Define trigger conditions',
 ' - Orchestrate tool call sequences',
 ' - Set conditional branches',
 ' - Add manual confirmation points',
 '',
 'Use /workflows edit for further configuration.',
 ].join(NL),
 }
 }

 return {
 type: 'text' as const,
 value: 'Unknown workflow operation. Use /workflows help.',
 }
}

const workflows: Command = {
 type: 'local',
 name: 'workflows',
 description: 'Automated workflow scripts - orchestrate reusable task sequences',
 isEnabled: () => !getIsNonInteractiveSession(),
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
} satisfies Command

export default workflows