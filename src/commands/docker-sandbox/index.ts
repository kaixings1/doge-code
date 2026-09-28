import type { Command } from '../../commands.js'
import type { LocalJSXCommandModule } from '../../types/command.js'
import { DockerSandboxManager } from '../../utils/sandbox/docker-sandbox.js'
import { getCwdState } from '../../bootstrap/state.js'

const command = {
  type: 'local-jsx' as const,
  name: 'sandbox-docker',
  description: 'Docker 沙箱隔离：在容器内运行 Agent（OpenHands/Devin 风格）',
  argumentHint: '<start|stop|status|logs|exec|shell>',
  isEnabled: () => true,
  load: () =>
    import('./docker-sandbox.tsx').then(
      m => ({ call: m.dockerSandboxUI }) as unknown as LocalJSXCommandModule,
    ),
} satisfies Command

export default command
