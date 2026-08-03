import { type Tool } from '../../engine/types.js'

export class TerminalCaptureTool implements Tool {
  name = 'terminal_capture'
  description = 'Capture terminal output'
  parameters = { type: 'object', properties: {}, required: [] }
  validate = () => ({ valid: true })
  execute = async () => ({ content: [{ type: 'text', text: 'Not available in this build' }] })
}
