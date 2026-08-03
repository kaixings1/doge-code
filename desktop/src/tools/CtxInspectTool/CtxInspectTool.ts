import { type Tool } from '../../engine/types.js'
export class CtxInspectTool implements Tool {
  name = 'context_inspect'
  description = 'Inspect context'
  parameters = { type: 'object', properties: {}, required: [] }
  validate = () => ({ valid: true })
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
