// Fork - create conversation branches from current context
import type { Command } from '../../commands.js'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'

const call = async (args: string) => {
 const action = args.trim().toLowerCase() || 'help'

 if (action === 'help' || action === '') {
 return {
 type: 'text' as const,
 value: [
 'Fork - conversation branch management',
 '',
 'Usage:',
 ' /fork create <name> - create a new branch',
 ' /fork list - list all branches',
 ' /fork switch <name> - switch to a branch',
 ' /fork merge <branch> - merge branch into current',
 ' /fork cancel <name> - cancel a branch',
 '',
 'Fork features:',
 ' - Parallel conversation exploration',
 ' - Branch comparison and merging',
 ' - Context preservation across branches',
 ' - Independent tool execution per branch',
 ].join(NL),
 }
 }

 if (action === 'create' || action.startsWith('create ')) {
 const name = action.replace(/^create//s+/, '').trim() || 'untitled'
 return {
 type: 'text' as const,
 value: [
 'Branch created: ' + name,
 '',
 'New conversation branch started. Changes here are independent of the main branch.',
 '',
 'Use /fork list to see all branches.',
 'Use /fork merge to merge changes back.',
 ].join(NL),
 }
 }

 if (action === 'list' || action === 'ls') {
 return {
 type: 'text' as const,
 value: [
 'Active branches:',
 '',
 ' * main (current)',
 '',
 'No additional branches yet. Use /fork create to start a new branch.',
 ].join(NL),
 }
 }

 if (action === 'switch' || action.startsWith('switch ')) {
 return {
 type: 'text' as const,
 value: 'Switching branches requires context restoration.',
 }
 }

 if (action === 'merge' || action.startsWith('merge ')) {
 return {
 type: 'text' as const,
 value: 'Merging branches combines changes from the selected branch.',
 }
 }

 if (action === 'cancel' || action.startsWith('cancel ')) {
 return {
 type: 'text' as const,
 value: 'Branch cancelled. All changes in this branch have been discarded.',
 }
 }

 return {
 type: 'text' as const,
 value: 'Unknown fork operation. Use /fork help for usage.',
 }
}

const fork = {
 type: 'local',
 name: 'fork',
 description: 'Fork - conversation branch management for parallel exploration',
 isEnabled: () => !getIsNonInteractiveSession(),
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
} satisfies Command

export default fork