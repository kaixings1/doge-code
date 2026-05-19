import { feature } from 'bun:bundle'

type TemplateJob = {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: Date
}

// 模拟模板作业数据存储
const templateJobs = new Map<string, TemplateJob>()

export async function templatesMain(args: string[]): Promise<void> {
  const subcommand = args[0]

  switch (subcommand) {
    case 'new': {
      const name = args[1]
      if (!name) {
        console.error('用法: claude new <作业名称>')
        process.exit(1)
      }
      const job: TemplateJob = {
        id: `job_${Date.now()}`,
        name,
        description: `模板作业 ${name}`,
        status: 'pending',
        createdAt: new Date(),
      }
      templateJobs.set(job.id, job)
      // biome-ignore lint/suspicious/noConsole: intentional console output
      console.log(`已创建模板作业: ${job.id} - ${name}`)
      break
    }

    case 'list': {
      if (templateJobs.size === 0) {
        // biome-ignore lint/suspicious/noConsole: intentional console output
        console.log('没有模板作业')
        return
      }
      // biome-ignore lint/suspicious/noConsole: intentional console output
      console.log('模板作业列表:')
      for (const job of templateJobs.values()) {
        // biome-ignore lint/suspicious/noConsole: intentional console output
        console.log(`  ${job.id} - ${job.name} (${job.status})`)
      }
      break
    }

    case 'reply': {
      if (!feature('TEMPLATES')) {
        console.error('模板功能未启用')
        process.exit(1)
      }
      // biome-ignore lint/suspicious/noConsole: intentional console output
      console.log('回复模板作业...')
      break
    }

    default:
      // biome-ignore lint/suspicious/noConsole: intentional console output
      console.log(`用法: claude <new|list|reply> [参数]`)
      process.exit(1)
  }
}
