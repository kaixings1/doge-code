import { type Tool } from '../../engine/types.js'
export class CtxInspectTool implements Tool {
  name = 'context_inspect'
  description = 'Inspect context'
  isEnabled = () => false
  inputSchema = { type: 'object', properties: {}, required: [] }
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
