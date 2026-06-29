import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js';
import { Box, Text, useInput } from '../../ink.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

// ── 版本号 ────────────────────────────────────────────
const VERSION = 1;
const STORAGE_DIR = () => join(homedir(), '.doge', 'plancppwin');

interface PersistedState {
  version: number;
  selections: Record<string, boolean>;
  config: ProjectConfig;
}

function storagePath(targetDir: string): string {
  const hash = createHash('md5')
    .update(targetDir || 'default')
    .digest('hex')
    .slice(0, 12);
  return join(STORAGE_DIR(), `${hash}.json`);
}

function loadPersisted(targetDir: string): PersistedState | null {
  try {
    const p = storagePath(targetDir);
    if (existsSync(p)) {
      const data = JSON.parse(readFileSync(p, 'utf-8'));
      if (data.version === VERSION) return data;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function persistState(targetDir: string, selections: Record<string, boolean>, config: ProjectConfig) {
  try {
    const dir = STORAGE_DIR();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(storagePath(targetDir), JSON.stringify({ version: VERSION, selections, config }), 'utf-8');
  } catch {
    /* ignore */
  }
}

function clearPersisted(targetDir: string) {
  try {
    const p = storagePath(targetDir);
    if (existsSync(p)) writeFileSync(p, JSON.stringify({ version: VERSION, selections: {}, config: null }), 'utf-8');
  } catch {
    /* ignore */
  }
}

function dirExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// ── 类型 ───────────────────────────────────────────────
interface ProjectConfig {
  name: string;
  version: string;
  cppStandard: string;
  bits: string;
  outputType: string;
}

interface CategoryGroup {
  id: string;
  title: string;
  categories: CategoryDef[];
}

interface CategoryDef {
  id: string;
  title: string;
  items: { id: number; label: string }[];
}

// ── 分组定义（将 28 类分为 6 组）────────────────────────
const GROUPS: CategoryGroup[] = [
  {
    id: 'basic',
    title: '基础设定',
    categories: [
      {
        id: 'preset',
        title: '预设模板',
        items: [
          { id: 1, label: '控制台工具' },
          { id: 2, label: 'Windows 系统服务' },
          { id: 3, label: '系统托盘小工具' },
          { id: 4, label: 'Qt Widgets 桌面应用' },
          { id: 5, label: 'WinUI 3 现代应用' },
          { id: 6, label: '纯 DLL 插件/注入模块' },
          { id: 7, label: '跨平台 C/C++ SDK' },
          { id: 8, label: '医学影像工作站 (DICOM+VTK)' },
          { id: 9, label: '工业机器视觉上位机' },
          { id: 10, label: '逆向分析工具框架' },
          { id: 11, label: 'AI 实时推理管线' },
          { id: 12, label: '音频插件 (VST3/AU)' },
          { id: 13, label: '游戏引擎模块' },
          { id: 14, label: '流媒体服务器' },
          { id: 15, label: '嵌入式物联网网关' },
          { id: 16, label: '编译器前端/代码分析器' },
          { id: 17, label: 'VR/AR 应用 (OpenXR)' },
          { id: 18, label: '密码学工具/钱包' },
          { id: 19, label: '远程桌面协助工具' },
        ],
      },
      {
        id: 'project-info',
        title: '项目信息',
        items: [
          { id: 1, label: '项目名称（自定义）' },
          { id: 2, label: '版本号: 主.次.修订' },
          { id: 3, label: '版本号: 语义化' },
          { id: 4, label: '自动生成 GUID' },
          { id: 5, label: '使用自定义 GUID' },
        ],
      },
      {
        id: 'scenario',
        title: '场景约束',
        items: [
          { id: 1, label: 'Windows 10/11 x64' },
          { id: 2, label: 'Windows 7 兼容' },
          { id: 3, label: 'ARM64' },
          { id: 4, label: '跨平台 (Win+Linux+macOS)' },
          { id: 5, label: '嵌入式 Linux' },
          { id: 6, label: 'WebAssembly (WASM)' },
          { id: 7, label: '裸机 / RTOS' },
          { id: 8, label: '独立桌面应用' },
          { id: 9, label: 'Windows 服务 / Linux daemon' },
          { id: 10, label: '客户端-服务器 (C/S)' },
          { id: 11, label: '微服务集群' },
          { id: 12, label: '库/SDK（无主进程）' },
          { id: 13, label: '全新项目' },
          { id: 14, label: '基于已有代码库扩展' },
          { id: 15, label: '软实时（多媒体）' },
          { id: 16, label: '硬实时（工业控制）' },
        ],
      },
      {
        id: 'industry',
        title: '行业领域',
        items: [
          { id: 1, label: '通用桌面软件' },
          { id: 2, label: '医疗影像与诊断' },
          { id: 3, label: '工业自动化与机器视觉' },
          { id: 4, label: '科学计算与仿真' },
          { id: 5, label: '金融与高频交易' },
          { id: 6, label: '音视频制作/流媒体' },
          { id: 7, label: '游戏开发' },
          { id: 8, label: '网络安全与逆向工程' },
          { id: 9, label: '汽车电子/ADAS' },
          { id: 10, label: '区块链与加密货币' },
          { id: 11, label: '编译器/开发工具' },
          { id: 12, label: '远程协作与屏幕共享' },
        ],
      },
    ],
  },
  {
    id: 'build',
    title: '构建与输出',
    categories: [
      {
        id: 'output',
        title: '输出类型',
        items: [
          { id: 1, label: '.exe 可执行文件' },
          { id: 2, label: '.dll 动态链接库' },
          { id: 3, label: '.lib 静态库' },
          { id: 4, label: '.sys 驱动文件' },
          { id: 5, label: 'exe + dll 分离架构' },
          { id: 6, label: 'WASM 模块' },
          { id: 7, label: 'x86 (32位)' },
          { id: 8, label: 'x64 (64位)' },
          { id: 9, label: 'ARM64' },
          { id: 10, label: '同时 x86 + x64 + ARM64' },
        ],
      },
      {
        id: 'build-system',
        title: '构建系统',
        items: [
          { id: 1, label: 'CMake ★推荐' },
          { id: 2, label: 'MSBuild (.vcxproj/.sln)' },
          { id: 3, label: 'Ninja' },
          { id: 4, label: 'Bazel' },
          { id: 5, label: 'Meson' },
          { id: 6, label: '生成 CMakePresets.json' },
          { id: 7, label: 'MSVC v143 (VS 2022)' },
          { id: 8, label: 'Clang/LLVM 18+' },
          { id: 9, label: 'MinGW/GCC 14' },
          { id: 10, label: 'Intel C++ Compiler' },
          { id: 11, label: 'Emscripten (WASM)' },
          { id: 12, label: '静态链接 (/MT)' },
          { id: 13, label: '动态链接 (/MD)' },
          { id: 14, label: 'C++14' },
          { id: 15, label: 'C++17' },
          { id: 16, label: 'C++20' },
          { id: 17, label: 'C++23' },
          { id: 18, label: 'C++20 Modules' },
          { id: 19, label: '使用预编译头' },
          { id: 20, label: 'LTCG 链接时优化' },
          { id: 21, label: 'AVX2' },
          { id: 22, label: 'AVX-512' },
          { id: 23, label: 'Control Flow Guard' },
          { id: 24, label: 'Spectre 缓解' },
          { id: 25, label: '使用 ccache/sccache' },
        ],
      },
    ],
  },
  {
    id: 'ui',
    title: '界面与交互',
    categories: [
      {
        id: 'ui-framework',
        title: '界面框架',
        items: [
          { id: 1, label: '无界面（控制台/服务）' },
          { id: 2, label: 'Win32 API 原生' },
          { id: 3, label: 'MFC' },
          { id: 4, label: 'Qt 6 (Widgets)' },
          { id: 5, label: 'Qt 6 (QML)' },
          { id: 6, label: 'WTL' },
          { id: 7, label: 'WinUI 3 / Windows App SDK' },
          { id: 8, label: 'ImGui（即时模式）' },
          { id: 9, label: 'wxWidgets' },
          { id: 10, label: 'CEF (Chromium Embedded)' },
          { id: 11, label: 'Electron 混合 C++ 扩展' },
          { id: 12, label: 'Web 前端 + C++ 后端 (HTTP/WS)' },
        ],
      },
      {
        id: 'ui-layout',
        title: '窗口布局',
        items: [
          { id: 1, label: '单文档界面 (SDI)' },
          { id: 2, label: '多文档界面 (MDI)' },
          { id: 3, label: '选项卡式' },
          { id: 4, label: '无边框自定义窗口' },
          { id: 5, label: '对话框基础' },
          { id: 6, label: 'Ribbon 功能区' },
          { id: 7, label: '可停靠面板' },
          { id: 8, label: '深色模式' },
          { id: 9, label: '多国语言 (中/英/日/韩)' },
          { id: 10, label: 'Direct2D + DirectWrite' },
          { id: 11, label: 'OpenGL 3.3+' },
          { id: 12, label: 'Vulkan' },
          { id: 13, label: 'DirectX 12' },
          { id: 14, label: 'Skia 渲染' },
        ],
      },
    ],
  },
  {
    id: 'deps',
    title: '依赖与数据',
    categories: [
      {
        id: 'pkg-mgr',
        title: '包管理器',
        items: [
          { id: 1, label: 'vcpkg ★推荐' },
          { id: 2, label: 'Conan' },
          { id: 3, label: 'NuGet' },
          { id: 4, label: '手动管理（Git Submodule）' },
          { id: 5, label: '生成 vcpkg.json 清单' },
          { id: 6, label: 'Boost' },
          { id: 7, label: 'OpenCV' },
          { id: 8, label: 'OpenSSL' },
          { id: 9, label: 'libcurl' },
          { id: 10, label: 'nlohmann/json' },
          { id: 11, label: 'spdlog' },
          { id: 12, label: 'fmt' },
          { id: 13, label: 'Catch2 / doctest' },
          { id: 14, label: 'FFmpeg' },
          { id: 15, label: 'protobuf' },
          { id: 16, label: 'gRPC' },
          { id: 17, label: 'SQLite' },
          { id: 18, label: 'libsodium' },
        ],
      },
      {
        id: 'database',
        title: '数据库',
        items: [
          { id: 1, label: '不需要数据库' },
          { id: 2, label: 'SQLite 嵌入式' },
          { id: 3, label: 'Microsoft SQL Server' },
          { id: 4, label: 'MySQL / MariaDB' },
          { id: 5, label: 'PostgreSQL' },
          { id: 6, label: 'DuckDB 分析型' },
          { id: 7, label: 'MongoDB' },
          { id: 8, label: 'ODBC 连接' },
          { id: 9, label: 'AES-256 存储加密' },
        ],
      },
      {
        id: 'industry-libs',
        title: '行业库',
        items: [
          { id: 1, label: 'ITK (医学图像)' },
          { id: 2, label: 'VTK (科学可视化)' },
          { id: 3, label: 'DCMTK (DICOM)' },
          { id: 4, label: 'PCL (点云)' },
          { id: 5, label: 'CGAL (计算几何)' },
          { id: 6, label: 'GDAL (地理空间)' },
          { id: 7, label: 'Open3D (3D 处理)' },
          { id: 8, label: 'Bullet/PhysX (物理)' },
          { id: 9, label: 'ONNX Runtime (AI推理)' },
          { id: 10, label: 'LibTorch (PyTorch)' },
          { id: 11, label: 'OpenVINO' },
          { id: 12, label: 'Tesseract (OCR)' },
          { id: 13, label: 'JUCE (音频)' },
          { id: 14, label: 'Capstone/Zydis (反汇编)' },
          { id: 15, label: 'Eigen (线性代数)' },
          { id: 16, label: 'FFTW (傅里叶变换)' },
        ],
      },
    ],
  },
  {
    id: 'net',
    title: '网络与并发',
    categories: [
      {
        id: 'network',
        title: '网络协议',
        items: [
          { id: 1, label: '不需要网络' },
          { id: 2, label: 'HTTP/HTTPS 客户端' },
          { id: 3, label: 'HTTP/HTTPS 服务端' },
          { id: 4, label: 'WebSocket' },
          { id: 5, label: 'TCP Socket' },
          { id: 6, label: 'UDP 通信' },
          { id: 7, label: 'gRPC' },
          { id: 8, label: 'Named Pipe (IPC)' },
          { id: 9, label: 'MQTT (IoT)' },
          { id: 10, label: 'Modbus TCP/RTU' },
          { id: 11, label: 'OPC UA' },
          { id: 12, label: 'RTMP/RTSP/SRT (流媒体)' },
          { id: 13, label: 'ONVIF (IP摄像头)' },
          { id: 14, label: 'WinHTTP' },
          { id: 15, label: 'libcurl' },
          { id: 16, label: 'Boost.Beast' },
          { id: 17, label: 'Drogon (Web框架)' },
          { id: 18, label: 'Basic Auth' },
          { id: 19, label: 'Bearer Token / JWT' },
          { id: 20, label: 'OAuth 2.0' },
          { id: 21, label: 'mTLS 双向认证' },
        ],
      },
      {
        id: 'concurrency',
        title: '并发模型',
        items: [
          { id: 1, label: '单线程' },
          { id: 2, label: '多线程任务队列' },
          { id: 3, label: '线程池' },
          { id: 4, label: '生产者-消费者' },
          { id: 5, label: '并行计算' },
          { id: 6, label: 'std::thread' },
          { id: 7, label: 'C++20 协程' },
          { id: 8, label: 'Windows Thread Pool' },
          { id: 9, label: 'PPL (Parallel Patterns)' },
          { id: 10, label: 'Intel TBB' },
          { id: 11, label: 'OpenMP' },
          { id: 12, label: 'std::mutex / lock_guard' },
          { id: 13, label: 'std::shared_mutex' },
          { id: 14, label: 'std::atomic 无锁' },
          { id: 15, label: '消息队列异步' },
          { id: 16, label: 'mimalloc 分配器' },
          { id: 17, label: 'jemalloc 分配器' },
        ],
      },
    ],
  },
  {
    id: 'advanced',
    title: '高级选项',
    categories: [
      {
        id: 'logging',
        title: '日志与诊断',
        items: [
          { id: 1, label: 'spdlog' },
          { id: 2, label: '自定义日志写文件' },
          { id: 3, label: 'Windows Event Log' },
          { id: 4, label: '不需要日志' },
          { id: 5, label: '文件 + 控制台日志' },
          { id: 6, label: 'OpenTelemetry C++' },
          { id: 7, label: 'Tracy / Optick 性能分析' },
          { id: 8, label: 'Sentry 崩溃收集' },
        ],
      },
      {
        id: 'testing',
        title: '测试与 CI',
        items: [
          { id: 1, label: 'Google Test' },
          { id: 2, label: 'Catch2' },
          { id: 3, label: 'doctest' },
          { id: 4, label: '单元测试' },
          { id: 5, label: '集成测试' },
          { id: 6, label: '模糊测试 (libFuzzer)' },
          { id: 7, label: '代码覆盖率' },
          { id: 8, label: 'GitHub Actions CI' },
          { id: 9, label: 'Azure Pipelines' },
          { id: 10, label: 'GitLab CI' },
          { id: 11, label: 'SonarQube 分析' },
          { id: 12, label: 'clang-format 预提交钩子' },
        ],
      },
      {
        id: 'packaging',
        title: '打包与部署',
        items: [
          { id: 1, label: '绿色免安装 (ZIP)' },
          { id: 2, label: 'MSI (WiX Toolset)' },
          { id: 3, label: 'NSIS' },
          { id: 4, label: 'Inno Setup' },
          { id: 5, label: 'MSIX 商店分发' },
          { id: 6, label: '需要数字签名' },
          { id: 7, label: 'GitHub Releases 自动更新' },
          { id: 8, label: '自建更新服务器' },
          { id: 9, label: 'Docker 容器化' },
          { id: 10, label: 'docker-compose' },
          { id: 11, label: 'Kubernetes 部署模板' },
          { id: 12, label: 'MIT 许可证' },
          { id: 13, label: 'Apache 2.0' },
          { id: 14, label: 'GPL v3' },
          { id: 15, label: '专有/自定义' },
        ],
      },
      {
        id: 'security',
        title: '安全与加固',
        items: [
          { id: 1, label: '代码混淆 (OLLVM)' },
          { id: 2, label: '反调试检测' },
          { id: 3, label: '完整性校验 (CRC/SHA)' },
          { id: 4, label: '字符串加密' },
          { id: 5, label: 'License 文件校验' },
          { id: 6, label: '硬件绑定 (机器指纹)' },
          { id: 7, label: 'DLL 插件架构' },
          { id: 8, label: '嵌入 Lua 脚本引擎' },
          { id: 9, label: '嵌入 Python (pybind11)' },
          { id: 10, label: '嵌入 JavaScript (QuickJS)' },
          { id: 11, label: 'DLL 热重载' },
          { id: 12, label: '生成 Doxygen 文档' },
        ],
      },
    ],
  },
];

const CONFIG_FIELDS: { key: keyof ProjectConfig; label: string; hint: string }[] = [
  { key: 'name', label: '项目名称', hint: '如 MyAwesomeApp' },
  { key: 'version', label: '版本号', hint: '如 1.0.0' },
  { key: 'cppStandard', label: 'C++ 标准', hint: 'C++14 / C++17 / C++20 / C++23' },
  { key: 'bits', label: '目标位数', hint: 'x86 / x64 / ARM64' },
  { key: 'outputType', label: '输出类型', hint: '.exe / .dll / .lib / .sys' },
];

// ── 颜色 ──────────────────────────────────────────────
const C = {
  sidebarBg: '#1a1b26',
  sidebarActiveBg: '#3b4261',
  sidebarText: '#565f89',
  sidebarActiveText: '#a9b1d6',
  sidebarAccent: '#7aa2f7',
  border: '#3b4261',
  headerBg: '#1f2133',
  headerText: '#c0caf5',
  checkboxOn: '#7aa2f7',
  checkboxOff: '#565f89',
  label: '#c0caf5',
  dimLabel: '#565f89',
  catTitle: '#e0af68',
  focusBg: '#2a2d3e',
  footerBg: '#1f2133',
  footerText: '#565f89',
  footerKey: '#7aa2f7',
  error: '#f7768e',
  success: '#9ece6a',
};

// ── 辅助组件 ──────────────────────────────────────────
function Checkbox({ checked }: { checked: boolean }) {
  return <Text color={checked ? C.checkboxOn : C.checkboxOff}>{checked ? '●' : '○'}</Text>;
}

function GroupTab({ group, active }: { group: CategoryGroup; active: boolean }) {
  const bg = active ? C.sidebarActiveBg : 'transparent';
  const fg = active ? C.sidebarActiveText : C.sidebarText;
  return (
    <Box backgroundColor={bg} width="100%">
      <Text color={fg}>
        {' '}
        {active ? '▶' : ' '} {group.title}
      </Text>
    </Box>
  );
}

function FooterHint({ keys }: { keys: { key: string; desc: string }[] }) {
  return (
    <Box>
      {keys.map((k, i) => (
        <Box key={i} marginRight={2}>
          <Text color={C.footerKey}>{k.key}</Text>
          <Text color={C.footerText}> {k.desc}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ── 工具函数 ──────────────────────────────────────────
function getFlatItems(groupIndex: number, catIndex: number): { id: number; label: string }[] {
  try {
    return GROUPS[groupIndex].categories[catIndex].items;
  } catch {
    return [];
  }
}

function makeKey(groupIdx: number, catIdx: number, itemId: number): string {
  return `${groupIdx}-${catIdx}-${itemId}`;
}

function getCheckedLabels(groupIdx: number, catIdx: number, selections: Record<string, boolean>): string[] {
  const items = getFlatItems(groupIdx, catIdx);
  return items.filter(item => selections[makeKey(groupIdx, catIdx, item.id)]).map(item => item.label);
}

// ── 主组件 ────────────────────────────────────────────
export function call(onDone: LocalJSXCommandOnDone, _context: unknown, args?: string) {
  return <PlanCppWinUI onDone={onDone} targetDir={args?.trim() || ''} />;
}

function PlanCppWinUI({ onDone, targetDir }: { onDone: LocalJSXCommandOnDone; targetDir: string }) {
  useExitOnCtrlCDWithKeybindings();

  // ── 加载持久化 ──
  const persisted = useRef(loadPersisted(targetDir));
  const defaultSelections = persisted.current?.selections ?? {};
  const persistedConfig = persisted.current?.config;
  const defaultConfig: ProjectConfig = persistedConfig ?? {
    name: 'MyAwesomeApp',
    version: '1.0.0',
    cppStandard: 'C++17',
    bits: 'x64',
    outputType: '.exe',
  };

  // ── 状态 ──
  const [groupIndex, setGroupIndex] = useState(0);
  const [catIndex, setCatIndex] = useState(0);
  const [focusRow, setFocusRow] = useState(0);
  const [selections, setSelections] = useState<Record<string, boolean>>(defaultSelections);
  const [config, setConfig] = useState<ProjectConfig>(defaultConfig);
  const [configFocus, setConfigFocus] = useState(0);
  const [editingConfig, setEditingConfig] = useState(false);
  const [configInput, setConfigInput] = useState('');
  const [subPage, setSubPage] = useState<'categories' | 'items' | 'config' | 'confirm'>('items');
  const [error, setError] = useState('');
  const [exitConfirm, setExitConfirm] = useState(false);

  const currentGroup = GROUPS[groupIndex];
  const targetExists = targetDir ? dirExists(targetDir) : false;

  // ── 自动保存 ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persistState(targetDir, selections, config);
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [selections, config, targetDir]);

  // ── 进度统计 ──
  const totalItems = useMemo(() => {
    let n = 0;
    for (const g of GROUPS) for (const c of g.categories) n += c.items.length;
    return n;
  }, []);
  const totalChecked = useMemo(() => {
    let n = 0;
    for (let gi = 0; gi < GROUPS.length; gi++) {
      for (let ci = 0; ci < GROUPS[gi].categories.length; ci++) {
        n += getCheckedLabels(gi, ci, selections).length;
      }
    }
    return n;
  }, [selections]);

  // 全部选项总数
  const totalAllItems = useMemo(() => {
    let n = 0;
    for (const g of GROUPS) for (const c of g.categories) n += c.items.length;
    return n;
  }, []);

  // ── 键盘 ──
  useInput(
    (input, key) => {
      setError('');

      // ── 退出确认模式 ──
      if (exitConfirm) {
        if (input === 'y') {
          onDone('', { display: 'system' });
          return;
        }
        if (input === 'n' || key.escape) {
          setExitConfirm(false);
          return;
        }
        return;
      }

      // Ctrl+R 重置所有选择
      if (key.ctrl && input === 'r') {
        setSelections({});
        clearPersisted(targetDir);
        setError('已重置所有选项');
        return;
      }

      // Ctrl+S 快速确认生成
      if (key.ctrl && input === 's') {
        generateProject(targetDir, config, selections, onDone);
        return;
      }

      // Esc 退出（带确认）
      if (key.escape) {
        if (subPage === 'items') {
          setSubPage('categories');
          return;
        }
        setExitConfirm(true);
        return;
      }

      // ════════════════════════════
      // 确认页
      // ════════════════════════════
      if (subPage === 'confirm') {
        if (key.return || input === '1' || input === 'y') {
          generateProject(targetDir, config, selections, onDone);
          return;
        }
        if (input === '2') {
          setSubPage('config');
          return;
        }
        if (input === '0' || input === 'n') {
          setExitConfirm(true);
          return;
        }
        return;
      }

      // ════════════════════════════
      // 配置页
      // ════════════════════════════
      if (subPage === 'config') {
        if (editingConfig) {
          if (key.return) {
            const field = CONFIG_FIELDS[configFocus];
            if (field) {
              setConfig(prev => ({ ...prev, [field.key]: configInput || prev[field.key] }));
            }
            setEditingConfig(false);
            setConfigInput('');
            return;
          }
          if (key.escape) {
            setEditingConfig(false);
            setConfigInput('');
            return;
          }
          if (key.backspace || key.delete) {
            setConfigInput(prev => prev.slice(0, -1));
            return;
          }
          if (input && input.length === 1 && input.charCodeAt(0) >= 32) {
            setConfigInput(prev => prev + input);
            return;
          }
          return;
        }
        if (key.upArrow || input === 'k') {
          setConfigFocus(prev => Math.max(0, prev - 1));
          return;
        }
        if (key.downArrow || input === 'j') {
          setConfigFocus(prev => Math.min(CONFIG_FIELDS.length - 1, prev + 1));
          return;
        }
        if (key.return || input === ' ') {
          setEditingConfig(true);
          setConfigInput(config[CONFIG_FIELDS[configFocus].key]);
          return;
        }
        if (input === 'c' || (key.ctrl && input === 'd')) {
          setSubPage('confirm');
          return;
        }
        return;
      }

      // ════════════════════════════
      // 分类列表
      // ════════════════════════════
      if (subPage === 'categories') {
        if (key.upArrow || input === 'k') {
          setGroupIndex(prev => Math.max(0, prev - 1));
          return;
        }
        if (key.downArrow || input === 'j') {
          setGroupIndex(prev => Math.min(GROUPS.length - 1, prev + 1));
          return;
        }
        if (key.return || input === ' ') {
          setCatIndex(0);
          setFocusRow(0);
          setSubPage('items');
          return;
        }
        if (input === 'c' || (key.ctrl && input === 'd')) {
          setSubPage('config');
          return;
        }
        return;
      }

      // ════════════════════════════
      // 选项页（具体分类下的选项）
      // ════════════════════════════
      if (subPage === 'items') {
        const items = getFlatItems(groupIndex, catIndex);

        // Tab 切换分类
        if (key.tab && !key.shift) {
          setCatIndex(prev => Math.min(currentGroup.categories.length - 1, prev + 1));
          setFocusRow(0);
          return;
        }
        if (key.tab && key.shift) {
          setCatIndex(prev => Math.max(0, prev - 1));
          setFocusRow(0);
          return;
        }

        // A 全选/取消全选
        if (input === 'a') {
          const allChecked = items.every(item => selections[makeKey(groupIndex, catIndex, item.id)]);
          const updated = { ...selections };
          for (const item of items) {
            updated[makeKey(groupIndex, catIndex, item.id)] = !allChecked;
          }
          setSelections(updated);
          return;
        }
        if (key.upArrow || input === 'k') {
          setFocusRow(prev => Math.max(0, prev - 1));
          return;
        }
        if (key.downArrow || input === 'j') {
          setFocusRow(prev => Math.min(items.length - 1, prev + 1));
          return;
        }
        if (input === ' ') {
          const item = items[focusRow];
          if (item) {
            const k = makeKey(groupIndex, catIndex, item.id);
            setSelections(prev => ({ ...prev, [k]: !prev[k] }));
          }
          return;
        }
        if (key.return) {
          const item = items[focusRow];
          if (item) {
            const k = makeKey(groupIndex, catIndex, item.id);
            setSelections(prev => ({ ...prev, [k]: !prev[k] }));
          }
          // 自动进下一分类
          if (catIndex < currentGroup.categories.length - 1) {
            setCatIndex(prev => prev + 1);
            setFocusRow(0);
          } else {
            setSubPage('categories');
          }
          return;
        }
        if (key.leftArrow || input === 'h') {
          setSubPage('categories');
          return;
        }
        if (key.rightArrow || input === 'l') {
          if (catIndex < currentGroup.categories.length - 1) {
            setCatIndex(prev => prev + 1);
            setFocusRow(0);
          }
          return;
        }
        if (input === 'c' || (key.ctrl && input === 'd')) {
          setSubPage('config');
          return;
        }
        return;
      }
    },
    { isActive: true },
  );

  // ── 渲染 ──
  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* 标题 */}
      <Box backgroundColor={C.headerBg} width="100%" height={1}>
        <Text bold color={C.headerText}>
          {'  '}C++ 项目生成器 · 完整版 <Text color={C.dimLabel}>v{VERSION}</Text>
        </Text>
        {targetDir && (
          <Text color={C.dimLabel}>
            {'  → '}
            {targetDir}
            <Text color={targetExists ? C.success : C.error}> [{targetExists ? '已存在' : '新目录'}]</Text>
          </Text>
        )}
        <Text color={C.dimLabel}>
          {'  '}
          {totalChecked}/{totalItems}
        </Text>
      </Box>

      {/* 主体 */}
      <Box flexDirection="row" flexGrow={1}>
        {/* 左侧导航 */}
        <Box
          flexDirection="column"
          width={18}
          borderStyle="single"
          borderColor={C.border}
          backgroundColor={C.sidebarBg}
        >
          {GROUPS.map((g, i) => (
            <GroupTab key={g.id} group={g} active={i === groupIndex} />
          ))}
          {/* 底部导航 */}
          <Box marginTop={1} flexDirection="column">
            <Box backgroundColor={subPage === 'config' ? C.sidebarActiveBg : 'transparent'} width="100%">
              <Text color={subPage === 'config' ? C.sidebarActiveText : C.sidebarText}>
                {' '}
                {subPage === 'config' ? '▶' : ' '} 项目配置
              </Text>
            </Box>
            <Box backgroundColor={subPage === 'confirm' ? C.sidebarActiveBg : 'transparent'} width="100%">
              <Text color={subPage === 'confirm' ? C.sidebarActiveText : C.sidebarText}>
                {' '}
                {subPage === 'confirm' ? '▶' : ' '} 确认生成
              </Text>
            </Box>
          </Box>
        </Box>

        {/* 右侧内容 */}
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={C.border} paddingX={1}>
          {subPage === 'categories' && renderCategories()}
          {subPage === 'items' && renderItems()}
          {subPage === 'config' && renderConfig()}
          {subPage === 'confirm' && renderConfirm()}
        </Box>
      </Box>

      {/* 进度条 */}
      <Box width="100%" height={1}>
        <Box
          width={`${Math.round((totalChecked / Math.max(totalItems, 1)) * 100)}%`}
          backgroundColor={C.checkboxOn}
          height={1}
        />
        <Box
          width={`${Math.round(100 - (totalChecked / Math.max(totalItems, 1)) * 100)}%`}
          backgroundColor={C.dimLabel}
          height={1}
        />
      </Box>

      {/* 底部 */}
      <Box backgroundColor={C.footerBg} width="100%" height={1}>
        <FooterHint keys={getFooterKeys()} />
      </Box>

      {exitConfirm && (
        <Box backgroundColor="#1a1b26" width="100%" height={1}>
          <Text color={C.error}> 确认退出？未保存的选择将丢失 (Y/N)</Text>
        </Box>
      )}

      {error && (
        <Box backgroundColor={C.error} width="100%">
          <Text color="#ffffff"> {error}</Text>
        </Box>
      )}
    </Box>
  );

  // ══════════════════════════════════
  //  渲染子页面
  // ══════════════════════════════════

  function renderCategories() {
    return (
      <Box flexDirection="column">
        <Text bold color={C.headerText}>
          {'  '}
          {currentGroup.title} — 选择分类
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {currentGroup.categories.map((cat, i) => {
            const count = getCheckedLabels(groupIndex, i, selections).length;
            return (
              <Box key={cat.id} height={1}>
                <Text>
                  {'  '}○ <Text color={C.catTitle}>{cat.title}</Text>
                  {count > 0 && <Text color={C.sidebarAccent}> [{count}项已选]</Text>}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  function renderItems() {
    const cat = currentGroup.categories[catIndex];
    if (!cat) return <Text color={C.dimLabel}> 无选项</Text>;
    const items = cat.items;

    return (
      <Box flexDirection="column">
        <Text bold color={C.headerText}>
          {'  '}
          {currentGroup.title} &gt; {cat.title}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {items.map((item, i) => {
            const k = makeKey(groupIndex, catIndex, item.id);
            const checked = !!selections[k];
            const focused = i === focusRow;
            return (
              <Box key={item.id} height={1} backgroundColor={focused ? C.focusBg : 'transparent'}>
                <Text>
                  {'  '}
                  {focused ? <Text color={C.sidebarAccent}>▸</Text> : <Text> </Text>} <Checkbox checked={checked} />{' '}
                  <Text color={checked ? C.label : C.dimLabel}>{item.label}</Text>
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  function renderConfig() {
    return (
      <Box flexDirection="column">
        <Text bold color={C.headerText}>
          {'  '}项目配置
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {CONFIG_FIELDS.map((field, i) => {
            const isFocus = i === configFocus;
            const isEditing = isFocus && editingConfig;
            const value = config[field.key];
            return (
              <Box key={field.key} height={1} backgroundColor={isFocus ? C.focusBg : 'transparent'}>
                <Text>
                  {'  '}
                  {isFocus ? <Text color={C.sidebarAccent}>▸</Text> : <Text> </Text>}{' '}
                  <Text color={isFocus ? C.label : C.dimLabel}>{field.label}:</Text>{' '}
                  {isEditing ? (
                    <Text color={C.success}>{configInput || '<输入...>'}</Text>
                  ) : (
                    <Text color={C.checkboxOn}>{value}</Text>
                  )}
                  {isFocus && !isEditing && <Text color={C.dimLabel}> [↵ 编辑]</Text>}
                  {isFocus && !isEditing && (
                    <Text color={C.dimLabel}>
                      {' '}
                      <Text dimColor>({field.hint})</Text>
                    </Text>
                  )}
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1}>
          <Text color={C.dimLabel}>
            {'  按 '}
            <Text color={C.footerKey}>C</Text>
            {' 进入确认页'}
          </Text>
        </Box>
      </Box>
    );
  }

  function renderConfirm() {
    const lines = buildSummary(targetDir, config, selections);
    return (
      <Box flexDirection="column">
        <Text bold color={C.headerText}>
          {'  '}确认摘要
        </Text>
        <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={C.border} paddingX={1}>
          {lines.map((line, i) => (
            <Text key={i} color={C.label}>
              {'  '}
              {line}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color={C.dimLabel}>
            {'  按 '}
            <Text color={C.footerKey}>Enter/Y</Text>
            {' 确认并生成 │ '}
            <Text color={C.footerKey}>2</Text>
            {' 返回配置 │ '}
            <Text color={C.footerKey}>0/N/Esc</Text>
            {' 取消'}
          </Text>
        </Box>
      </Box>
    );
  }

  function getFooterKeys() {
    if (subPage === 'confirm') {
      return [
        { key: 'Enter', desc: '确认生成' },
        { key: '2', desc: '返回配置' },
        { key: 'Esc', desc: '取消' },
      ];
    }
    if (subPage === 'config') {
      return [
        { key: '↑↓', desc: '选择项' },
        { key: 'Enter', desc: '编辑值' },
        { key: 'C', desc: '确认页' },
        { key: 'Esc', desc: '返回' },
      ];
    }
    if (subPage === 'categories') {
      return [
        { key: '↑↓', desc: '切换分组' },
        { key: 'Enter', desc: '进入分类' },
        { key: 'C', desc: '配置' },
        { key: 'Ctrl+R', desc: '重置' },
        { key: 'Ctrl+S', desc: '生成' },
      ];
    }
    // items
    return [
      { key: '↑↓', desc: '焦点' },
      { key: 'Space', desc: '选中' },
      { key: 'A', desc: '全选' },
      { key: 'Tab', desc: '下个分类' },
      { key: 'Ctrl+R', desc: '重置' },
      { key: 'Ctrl+S', desc: '生成' },
    ];
  }
}

// ── 摘要 & 生成 ───────────────────────────────────────
function buildSummary(targetDir: string, config: ProjectConfig, selections: Record<string, boolean>): string[] {
  const lines: string[] = [];
  const dir = targetDir || '当前目录';
  lines.push(`目标目录:  ${dir}`);
  lines.push(`项目名称:  ${config.name}`);
  lines.push(`版本:      ${config.version}`);
  lines.push(`C++ 标准:  ${config.cppStandard}`);
  lines.push(`位数:      ${config.bits}`);
  lines.push(`输出类型:  ${config.outputType}`);
  lines.push(``);
  for (let gi = 0; gi < GROUPS.length; gi++) {
    const group = GROUPS[gi];
    for (let ci = 0; ci < group.categories.length; ci++) {
      const cat = group.categories[ci];
      const checked = getCheckedLabels(gi, ci, selections);
      if (checked.length > 0) {
        lines.push(`${group.title} > ${cat.title}:  ${checked.join('、')}`);
      }
    }
  }
  return lines;
}

function generateProject(
  targetDir: string,
  config: ProjectConfig,
  selections: Record<string, boolean>,
  onDone: LocalJSXCommandOnDone,
) {
  const dir = targetDir || '当前目录';

  // 确保目标目录存在
  try {
    if (dir && dir !== '当前目录') {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
  } catch {
    /* AI 会处理 */
  }

  // 持久化最终状态
  persistState(targetDir, selections, config);

  const lines: string[] = [];
  lines.push(`# C++ 项目生成请求（完整版）`);
  lines.push(``);
  lines.push(`请根据以下配置，在目标目录 **\`${dir}\`** 生成完整的可编译 C++ 项目骨架。`);
  lines.push(``);
  lines.push(`## 项目基本信息`);
  lines.push(`- 目标目录: ${dir}`);
  lines.push(`- 项目名称: ${config.name}`);
  lines.push(`- 版本号: ${config.version}`);
  lines.push(`- C++ 标准: ${config.cppStandard}`);
  lines.push(`- 目标位数: ${config.bits}`);
  lines.push(`- 输出类型: ${config.outputType}`);
  lines.push(``);

  for (let gi = 0; gi < GROUPS.length; gi++) {
    const group = GROUPS[gi];
    for (let ci = 0; ci < group.categories.length; ci++) {
      const cat = group.categories[ci];
      const checked = getCheckedLabels(gi, ci, selections);
      if (checked.length > 0) {
        lines.push(`## ${group.title} — ${cat.title}`);
        for (const label of checked) {
          lines.push(`- ${label}`);
        }
        lines.push(``);
      }
    }
  }

  lines.push(`## 要求`);
  lines.push(`1. 生成 CMakeLists.txt + CMakePresets.json`);
  lines.push(`2. 生成 main.cpp + 各模块头文件/源文件骨架`);
  lines.push(`3. 按选中的界面框架生成窗口/界面代码`);
  lines.push(`4. 按选中的依赖库配置 vcpkg.json 和 CMake find_package`);
  lines.push(`5. 生成 include/ src/ resources/ tests/ docs/ 目录结构`);
  lines.push(`6. 生成 README.md、LICENSE、.gitignore、.clang-format、.editorconfig`);
  lines.push(`7. 按选中的 CI 平台生成 CI 配置`);
  lines.push(`8. 按选中的打包工具生成安装包脚本`);
  lines.push(`9. 所有代码可直接编译运行（仅缺业务逻辑填空）`);
  lines.push(`10. **必须严格遵循 C++ 语法规范**，生成的代码必须能通过编译器的语法检查`);
  lines.push(`11. 冲突检测规则：`);
  lines.push(`    - 无界面 + Qt/WinUI/MFC → 自动降级为控制台程序`);
  lines.push(`    - DLL 项目 + exe 安装包 → 生成 DLL 版本`);
  lines.push(`    - 跨平台 + WinUI/MFC/Win32 → 仅生成跨平台通用代码`);
  lines.push(`    - 硬实时 + 动态内存分配 → 建议使用内存池`);
  lines.push(``);
  lines.push(`请立即开始生成，不要询问额外问题。`);

  const prompt = lines.join('\n');
  onDone(prompt, { display: 'system', nextInput: prompt, submitNextInput: true });
}
