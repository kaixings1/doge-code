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
  // ── X. 项目场景与约束 ──
  {
    id: 'x',
    title: 'X. 项目场景',
    categories: [
      {
        id: 'x1-os',
        title: 'X1.目标操作系统',
        items: [
          { id: 1, label: 'Windows 10/11 (x64)' },
          { id: 2, label: 'Windows 7 兼容' },
          { id: 3, label: 'Windows 11 on ARM64' },
          { id: 4, label: 'Linux（请指定）' },
          { id: 5, label: 'macOS' },
          { id: 6, label: '嵌入式 Windows (IoT)' },
          { id: 7, label: 'Xbox / 游戏主机' },
          { id: 8, label: '跨平台(Win+Linux+macOS)' },
          { id: 9, label: '嵌入式 Linux(Yocto等)' },
          { id: 10, label: '裸机/RTOS(FreeRTOS等)' },
          { id: 11, label: 'WebAssembly (WASM)' },
          { id: 12, label: '其他' },
        ],
      },
      {
        id: 'x2-nature',
        title: 'X2.项目性质',
        items: [
          { id: 1, label: '独立桌面应用' },
          { id: 2, label: 'Windows服务/Linux daemon' },
          { id: 3, label: '系统托盘应用' },
          { id: 4, label: '无界面后台进程' },
          { id: 5, label: '设备驱动(KMDF/UMDF/WDM)' },
          { id: 6, label: 'COM/ActiveX组件' },
          { id: 7, label: 'Shell扩展' },
          { id: 8, label: '浏览器插件(CEF等)' },
          { id: 9, label: 'Hook DLL注入模块' },
          { id: 10, label: '脚本引擎插件' },
          { id: 11, label: '跨平台SDK' },
          { id: 12, label: '控制台工具' },
          { id: 13, label: '服务器应用(HTTP/TCP)' },
          { id: 14, label: '游戏引擎/渲染器' },
          { id: 15, label: '打印机/扫描仪驱动' },
          { id: 16, label: 'TSF输入法' },
          { id: 17, label: '其他' },
        ],
      },
      {
        id: 'x3-arch',
        title: 'X3.架构模式',
        items: [
          { id: 1, label: '单机独立程序' },
          { id: 2, label: '客户端-服务器(C/S)' },
          { id: 3, label: '浏览器-服务器(B/S)' },
          { id: 4, label: '微服务集群' },
          { id: 5, label: 'P2P网络' },
          { id: 6, label: '混合模式(Electron+C++)' },
          { id: 7, label: '库/SDK' },
          { id: 8, label: '边缘计算节点' },
        ],
      },
      {
        id: 'x4-source',
        title: 'X4.项目来源',
        items: [
          { id: 1, label: '全新项目' },
          { id: 2, label: '基于已有代码库扩展' },
          { id: 3, label: '对接遗留C/C++代码' },
          { id: 4, label: '对接.NET托管代码' },
          { id: 5, label: '封装CLI为GUI' },
          { id: 6, label: '被其他语言调用C++模块' },
          { id: 7, label: '跨平台运行' },
          { id: 8, label: '移植项目' },
        ],
      },
      {
        id: 'x5-realtime',
        title: 'X5.实时性要求',
        items: [
          { id: 1, label: '非实时(GUI事件驱动)' },
          { id: 2, label: '软实时(音视频)' },
          { id: 3, label: '硬实时(工业控制)' },
          { id: 4, label: '超低延迟(微秒级)' },
        ],
      },
      {
        id: 'x6-hardware',
        title: 'X6.硬件设备',
        items: [
          { id: 1, label: '无' },
          { id: 2, label: '串口/RS-485/Modbus' },
          { id: 3, label: 'USB HID/Bulk' },
          { id: 4, label: '蓝牙/BLE' },
          { id: 5, label: 'PCIe/FPGA采集卡' },
          { id: 6, label: '摄像头(UVC/DirectShow)' },
          { id: 7, label: '传感器(IMU/激光雷达等)' },
          { id: 8, label: '工业机器人/PLC' },
          { id: 9, label: 'CAN总线/EtherCAT' },
          { id: 10, label: 'SPI/I2C/GPIO(嵌入式)' },
          { id: 11, label: '自定义设备(DLL/SDK)' },
          { id: 12, label: '硬件加密狗/License' },
          { id: 13, label: '嵌入式开发板' },
          { id: 14, label: '磁盘/卷直接访问' },
        ],
      },
      {
        id: 'x7-industry',
        title: 'X7.行业领域',
        items: [
          { id: 1, label: '通用桌面软件' },
          { id: 2, label: '医疗影像与诊断' },
          { id: 3, label: '工业自动化与机器视觉' },
          { id: 4, label: '科学计算与仿真' },
          { id: 5, label: 'GIS地理信息系统' },
          { id: 6, label: '金融与高频交易' },
          { id: 7, label: '音视频制作/流媒体' },
          { id: 8, label: '游戏开发' },
          { id: 9, label: '网络安全与逆向工程' },
          { id: 10, label: '教育/培训' },
          { id: 11, label: '汽车电子/ADAS' },
          { id: 12, label: '区块链与加密货币' },
          { id: 13, label: '音频处理与音乐制作' },
          { id: 14, label: 'VR/AR' },
          { id: 15, label: '编译器/开发工具' },
          { id: 16, label: '远程协作与屏幕共享' },
          { id: 17, label: '其他' },
        ],
      },
    ],
  },
  // ── A. 项目基础信息 ──
  {
    id: 'a',
    title: 'A. 项目信息',
    categories: [
      {
        id: 'a1-name',
        title: 'A1.项目名称',
        items: [
          { id: 1, label: '项目英文名称' },
          { id: 2, label: '项目显示名称(中文)' },
          { id: 3, label: '项目简述(一句话)' },
        ],
      },
      {
        id: 'a4-version',
        title: 'A4.版本号格式',
        items: [
          { id: 1, label: '主.次.修订(1.0.0)' },
          { id: 2, label: '主.次.修订.构建(1.0.0.100)' },
          { id: 3, label: '语义化版本(1.0.0-alpha)' },
          { id: 4, label: '自定义版本格式' },
        ],
      },
      {
        id: 'a5-guid',
        title: 'A5.产品GUID',
        items: [
          { id: 1, label: '自动生成GUID' },
          { id: 2, label: '使用我提供的GUID' },
        ],
      },
    ],
  },
  // ── B. 输出文件类型 ──
  {
    id: 'b',
    title: 'B. 输出类型',
    categories: [
      {
        id: 'b1-output',
        title: 'B1.最终产出物',
        items: [
          { id: 1, label: '.exe 可执行文件' },
          { id: 2, label: '.dll 动态链接库' },
          { id: 3, label: '.lib 静态库' },
          { id: 4, label: '.sys 驱动文件' },
          { id: 5, label: 'exe+dll 分离架构' },
          { id: 6, label: 'exe+lib 静态链接SDK' },
          { id: 7, label: 'WASM 模块' },
          { id: 8, label: '自定义' },
        ],
      },
      {
        id: 'b2-dllexport',
        title: 'B2.DLL导出方式',
        items: [
          { id: 1, label: '__declspec 宏导出' },
          { id: 2, label: '.def 模块定义文件' },
          { id: 3, label: '同时使用两种方式' },
          { id: 4, label: '不适用(非DLL项目)' },
        ],
      },
      {
        id: 'b3-bits',
        title: 'B3.目标位数',
        items: [
          { id: 1, label: 'x86(32位)' },
          { id: 2, label: 'x64(64位)' },
          { id: 3, label: 'ARM64' },
          { id: 4, label: '同时x86+x64' },
          { id: 5, label: '同时x86+x64+ARM64' },
          { id: 6, label: 'WASM 32/64' },
        ],
      },
    ],
  },
  // ── C. 构建系统与编译器 ──
  {
    id: 'c',
    title: 'C. 构建与编译',
    categories: [
      {
        id: 'c1-buildsys',
        title: 'C1.构建系统',
        items: [
          { id: 1, label: 'CMake ★推荐' },
          { id: 2, label: 'MSBuild(.vcxproj/.sln)' },
          { id: 3, label: 'Ninja' },
          { id: 4, label: 'Bazel' },
          { id: 5, label: 'Meson' },
          { id: 6, label: 'CMake+MSBuild双系统' },
          { id: 7, label: '其他' },
        ],
      },
      {
        id: 'c2-cmakever',
        title: 'C2.CMake版本',
        items: [
          { id: 1, label: '3.16(VS2019默认)' },
          { id: 2, label: '3.22(VS2022默认)' },
          { id: 3, label: '3.28(最新功能)' },
          { id: 4, label: '自定义版本' },
        ],
      },
      {
        id: 'c3-presets',
        title: 'C3.CMake Presets',
        items: [
          { id: 1, label: '生成CMakePresets.json' },
          { id: 2, label: '不生成Presets' },
        ],
      },
      {
        id: 'c4-compiler',
        title: 'C4.编译器/工具链',
        items: [
          { id: 1, label: 'MSVC v143(VS2022)' },
          { id: 2, label: 'MSVC v142(VS2019)' },
          { id: 3, label: 'Clang/LLVM 18+' },
          { id: 4, label: 'MSVC+ClangCL' },
          { id: 5, label: 'MinGW/GCC 14' },
          { id: 6, label: 'Intel C++ Compiler' },
          { id: 7, label: 'NVIDIA HPC SDK' },
          { id: 8, label: 'ARM Compiler(嵌入式)' },
          { id: 9, label: 'Emscripten(WASM)' },
          { id: 10, label: '其他' },
        ],
      },
      {
        id: 'c5-crt',
        title: 'C5.CRT链接',
        items: [
          { id: 1, label: '静态链接(/MT)' },
          { id: 2, label: '动态链接(/MD)' },
          { id: 3, label: '混合(Release静态)' },
        ],
      },
      {
        id: 'c6-cppstd',
        title: 'C6.C++标准',
        items: [
          { id: 1, label: 'C++14(最大兼容)' },
          { id: 2, label: 'C++17(稳定广泛)' },
          { id: 3, label: 'C++20(模块/协程)' },
          { id: 4, label: 'C++23(最前沿)' },
        ],
      },
      {
        id: 'c7-modules',
        title: 'C7.C++Modules',
        items: [
          { id: 1, label: '传统头文件(.h)' },
          { id: 2, label: 'C++20 Modules(.ixx)' },
          { id: 3, label: '混合(API用模块)' },
        ],
      },
      {
        id: 'c8-pch',
        title: 'C8.预编译头',
        items: [
          { id: 1, label: '使用预编译头(pch.h)' },
          { id: 2, label: '不使用' },
        ],
      },
      {
        id: 'c9-optimize',
        title: 'C9.编译优化',
        items: [
          { id: 1, label: '/O2 最大优化(Release)' },
          { id: 2, label: '/O1 最小体积' },
          { id: 3, label: '/Ox 极致优化' },
          { id: 4, label: '/Od 禁用优化(Debug)' },
          { id: 5, label: 'LTCG链接时优化' },
        ],
      },
      {
        id: 'c10-isa',
        title: 'C10.指令集',
        items: [
          { id: 1, label: '通用(/arch:IA32)' },
          { id: 2, label: 'SSE2(默认)' },
          { id: 3, label: 'AVX2' },
          { id: 4, label: 'AVX-512' },
          { id: 5, label: '自动检测CPU特性' },
        ],
      },
      {
        id: 'c11-crossplat',
        title: 'C11.跨平台补充',
        items: [
          { id: 1, label: '跨平台CMakePresets' },
          { id: 2, label: '平台检测宏+platform.h' },
          { id: 3, label: '文件系统/线程抽象层' },
          { id: 4, label: '不使用跨平台构建' },
        ],
      },
      {
        id: 'c12-advanced',
        title: 'C12.高级优化',
        items: [
          { id: 1, label: 'fast math(/fp:fast)' },
          { id: 2, label: '严格浮点(/fp:strict)' },
          { id: 3, label: 'PGO脚本' },
          { id: 4, label: 'Google Benchmark基准' },
          { id: 5, label: '不启用额外优化' },
        ],
      },
      {
        id: 'c13-thirdparty',
        title: 'C13.第三方库集成',
        items: [
          { id: 1, label: '包管理器源码编译' },
          { id: 2, label: '部分使用预编译二进制' },
          { id: 3, label: '全部静态链接' },
          { id: 4, label: '动态链接运行库' },
        ],
      },
      {
        id: 'c14-security',
        title: 'C14.安全编译',
        items: [
          { id: 1, label: 'Control Flow Guard' },
          { id: 2, label: 'Spectre缓解(/Qspectre)' },
          { id: 3, label: 'ASLR(/DYNAMICBASE)' },
          { id: 4, label: '签名证书自动注入' },
          { id: 5, label: '不需要' },
        ],
      },
      {
        id: 'c15-parallel',
        title: 'C15.并行编译',
        items: [
          { id: 1, label: 'ccache/sccache' },
          { id: 2, label: 'Unity Builds统一构建' },
          { id: 3, label: 'distcc分布式编译' },
          { id: 4, label: '不需要' },
        ],
      },
    ],
  },
  // ── D. 图形界面 ──
  {
    id: 'd',
    title: 'D. 图形界面',
    categories: [
      {
        id: 'd1-framework',
        title: 'D1.界面框架',
        items: [
          { id: 1, label: '无界面(控制台/服务)' },
          { id: 2, label: 'Win32 API原生' },
          { id: 3, label: 'MFC' },
          { id: 4, label: 'Qt 6(Widgets)' },
          { id: 5, label: 'Qt 6(QML)' },
          { id: 6, label: 'WTL' },
          { id: 7, label: 'WinUI 3/Windows App SDK' },
          { id: 8, label: 'ImGui(即时模式)' },
          { id: 9, label: 'wxWidgets' },
          { id: 10, label: 'CEF(Chromium Embedded)' },
          { id: 11, label: 'Sciter(轻量嵌入HTML)' },
          { id: 12, label: 'Slint(声明式UI)' },
          { id: 13, label: 'NoesisGUI(矢量UI)' },
          { id: 14, label: 'RmlUi(HTML/CSS轻量)' },
          { id: 15, label: '自定义界面框架' },
          { id: 16, label: 'Web前端+C++后端(HTTP)' },
          { id: 17, label: 'Electron混合C++扩展' },
        ],
      },
      {
        id: 'd2-layout',
        title: 'D2.窗口布局',
        items: [
          { id: 1, label: '单文档界面(SDI)' },
          { id: 2, label: '多文档界面(MDI)' },
          { id: 3, label: '选项卡式(Tabbed)' },
          { id: 4, label: '无边框自定义窗口' },
          { id: 5, label: '对话框基础' },
          { id: 6, label: 'Ribbon功能区' },
          { id: 7, label: '可停靠面板(混合布局)' },
          { id: 8, label: '网页嵌套(CEF/WebView2)' },
          { id: 9, label: '3D视口独占' },
          { id: 10, label: '自适应多窗口' },
        ],
      },
      {
        id: 'd3-size',
        title: 'D3.主窗口尺寸',
        items: [
          { id: 1, label: '固定尺寸' },
          { id: 2, label: '可调整大小(有最小限制)' },
          { id: 3, label: '全屏/最大化启动' },
          { id: 4, label: '记住上次窗口位置' },
        ],
      },
      {
        id: 'd4-appearance',
        title: 'D4.窗口外观',
        items: [
          { id: 1, label: '系统默认标题栏' },
          { id: 2, label: '自定义标题栏' },
          { id: 3, label: '圆角窗口(Win11)' },
          { id: 4, label: '透明/毛玻璃效果' },
          { id: 5, label: '深色模式' },
          { id: 6, label: '浅色模式' },
          { id: 7, label: '跟随系统主题' },
        ],
      },
      {
        id: 'd5-lang',
        title: 'D5.界面语言',
        items: [
          { id: 1, label: '仅中文' },
          { id: 2, label: '仅英文' },
          { id: 3, label: '中文+英文(运行时切换)' },
          { id: 4, label: '多国语言' },
          { id: 5, label: '跟随系统区域设置' },
        ],
      },
      {
        id: 'd6-i18n',
        title: 'D6.国际化机制',
        items: [
          { id: 1, label: '字符串表(.rc STRINGTABLE)' },
          { id: 2, label: 'Qt .ts/.qm文件' },
          { id: 3, label: 'gettext .po/.mo' },
          { id: 4, label: 'JSON语言文件' },
          { id: 5, label: '自定义格式' },
        ],
      },
      {
        id: 'd7-controls',
        title: 'D7.界面控件',
        items: [
          { id: 1, label: '菜单栏' },
          { id: 2, label: '工具栏' },
          { id: 3, label: '状态栏' },
          { id: 4, label: '树形视图(TreeView)' },
          { id: 5, label: '列表视图(ListView)' },
          { id: 6, label: '属性表格(PropertyGrid)' },
          { id: 7, label: '富文本编辑框' },
          { id: 8, label: '标签页(Tab Control)' },
          { id: 9, label: '侧边面板(DockPanel)' },
          { id: 10, label: '分割面板(Splitter)' },
          { id: 11, label: '进度条+状态提示' },
          { id: 12, label: '搜索框' },
          { id: 13, label: 'Ribbon控件' },
          { id: 14, label: '自定义控件' },
        ],
      },
      {
        id: 'd8-icons',
        title: 'D8.图标与资源',
        items: [
          { id: 1, label: '默认占位图标' },
          { id: 2, label: '提供自定义.ico' },
          { id: 3, label: '无图标' },
        ],
      },
      {
        id: 'd9-splash',
        title: 'D9.启动画面',
        items: [
          { id: 1, label: '无启动画面' },
          { id: 2, label: '简单文本加载' },
          { id: 3, label: '图片启动画面(Splash)' },
          { id: 4, label: '带动画启动画面' },
          { id: 5, label: '进度条启动画面' },
        ],
      },
      {
        id: 'd10-render',
        title: 'D10.自定义渲染',
        items: [
          { id: 1, label: 'Direct2D+DirectWrite' },
          { id: 2, label: 'OpenGL 3.3+' },
          { id: 3, label: 'Vulkan' },
          { id: 4, label: 'DirectX 12' },
          { id: 5, label: 'DirectX 11' },
          { id: 6, label: 'Skia渲染' },
          { id: 7, label: '软件渲染(GDI/GDI+)' },
          { id: 8, label: '无自定义渲染' },
        ],
      },
      {
        id: 'd11-refresh',
        title: 'D11.高刷新率',
        items: [
          { id: 1, label: '标准Windows消息循环' },
          { id: 2, label: '可变帧率游戏循环' },
          { id: 3, label: '垂直同步控制(V-Sync)' },
          { id: 4, label: 'Per-Monitor V2 DPI' },
          { id: 5, label: '不需要' },
        ],
      },
      {
        id: 'd12-customctrl',
        title: 'D12.自绘控件',
        items: [
          { id: 1, label: '语法高亮代码编辑器' },
          { id: 2, label: '波形图/频谱可视化' },
          { id: 3, label: '3D模型视图' },
          { id: 4, label: '图像查看器' },
          { id: 5, label: '完全自定义控件库' },
          { id: 6, label: '表格/数据网格编辑' },
          { id: 7, label: '无特殊控件' },
          { id: 8, label: '十六进制编辑器(Hex)' },
          { id: 9, label: '正则可视化构建器' },
        ],
      },
      {
        id: 'd13-a11y',
        title: 'D13.辅助功能',
        items: [
          { id: 1, label: 'UI Automation支持' },
          { id: 2, label: '触控/笔输入支持' },
          { id: 3, label: '高对比度/无障碍主题' },
          { id: 4, label: '不需要' },
        ],
      },
    ],
  },
  // ── E. 依赖库与第三方组件 ──
  {
    id: 'e',
    title: 'E. 依赖与库',
    categories: [
      {
        id: 'e1-pkgmgr',
        title: 'E1.包管理器',
        items: [
          { id: 1, label: 'vcpkg(Microsoft官方)' },
          { id: 2, label: 'Conan' },
          { id: 3, label: 'NuGet' },
          { id: 4, label: 'Hunter(CMake)' },
          { id: 5, label: 'CPM.cmake(轻量)' },
          { id: 6, label: '手动管理(Git Submodule)' },
          { id: 7, label: '手动管理(直接放仓库)' },
          { id: 8, label: '不使用' },
        ],
      },
      {
        id: 'e2-vcpkg',
        title: 'E2.vcpkg清单',
        items: [
          { id: 1, label: '生成vcpkg.json' },
          { id: 2, label: '不生成(手动安装)' },
        ],
      },
      {
        id: 'e3-libs',
        title: 'E3.通用库',
        items: [
          { id: 1, label: 'Boost' },
          { id: 2, label: 'OpenCV(计算机视觉)' },
          { id: 3, label: 'OpenSSL(加密/网络)' },
          { id: 4, label: 'libcurl(HTTP)' },
          { id: 5, label: 'nlohmann/json(JSON)' },
          { id: 6, label: 'yaml-cpp(YAML)' },
          { id: 7, label: 'spdlog(高性能日志)' },
          { id: 8, label: 'fmt(格式化)' },
          { id: 9, label: 'Catch2/doctest(测试)' },
          { id: 10, label: 'DirectX 11/12' },
          { id: 11, label: 'Vulkan' },
          { id: 12, label: 'FFmpeg(音视频)' },
          { id: 13, label: 'Skia(2D渲染)' },
          { id: 14, label: 'WebRTC(实时通信)' },
          { id: 15, label: 'poco(网络/工具)' },
          { id: 16, label: 'abseil(Google基础库)' },
          { id: 17, label: 'protobuf(序列化)' },
          { id: 18, label: 'gRPC(RPC通信)' },
          { id: 19, label: 'SQLiteCpp(sqlpp11)' },
          { id: 20, label: 'Qt模块' },
          { id: 21, label: 'libsodium(密码学)' },
          { id: 22, label: 'mimalloc/jemalloc' },
          { id: 23, label: 'Tracy/Optick(性能追踪)' },
          { id: 24, label: 'OpenTelemetry C++' },
          { id: 25, label: 'Sentry/Crashpad' },
          { id: 26, label: '其他' },
          { id: 27, label: '暂无第三方依赖' },
        ],
      },
      {
        id: 'e4-industry',
        title: 'E4.行业专用库',
        items: [
          { id: 1, label: 'ITK(医学图像)' },
          { id: 2, label: 'VTK(科学可视化)' },
          { id: 3, label: 'DCMTK(DICOM)' },
          { id: 4, label: 'Open3D(3D处理)' },
          { id: 5, label: 'CGAL(计算几何)' },
          { id: 6, label: 'PCL(点云)' },
          { id: 7, label: 'OpenMesh(网格)' },
          { id: 8, label: 'GDAL(地理空间)' },
          { id: 9, label: 'PROJ(地图投影)' },
          { id: 10, label: 'Bullet/PhysX(物理)' },
          { id: 11, label: '游戏引擎插件开发' },
          { id: 12, label: 'OPC UA(open62541)' },
          { id: 13, label: 'libmodbus(Modbus)' },
          { id: 14, label: 'SocketCAN/CAN通信' },
          { id: 15, label: 'paho.mqtt.cpp(MQTT)' },
          { id: 16, label: 'ZeroMQ/nanomsg(消息)' },
          { id: 17, label: 'gRPC/Thrift(RPC)' },
          { id: 18, label: 'Intel oneAPI/TBB' },
          { id: 19, label: 'OpenMP(多线程并行)' },
          { id: 20, label: 'FFTW(傅里叶变换)' },
          { id: 21, label: 'Eigen/Armadillo(线性代数)' },
          { id: 22, label: 'libtorch/ONNX(AI推理)' },
          { id: 23, label: 'OpenXR(VR/AR)' },
          { id: 24, label: 'JUCE(音频框架)' },
          { id: 25, label: 'ASIO SDK(低延迟音频)' },
          { id: 26, label: 'VST3 SDK(音频插件)' },
          { id: 27, label: 'PortAudio/RtAudio(音频I/O)' },
          { id: 28, label: 'libusb(USB设备)' },
          { id: 29, label: 'TWAIN/WIA(扫描仪)' },
          { id: 30, label: 'LLVM/Clang(编译器)' },
          { id: 31, label: 'Frida(动态插桩)' },
          { id: 32, label: 'Capstone/Zydis(反汇编)' },
          { id: 33, label: 'Tesseract/Leptonica(OCR)' },
          { id: 34, label: '3D打印切片库' },
          { id: 35, label: '其他' },
          { id: 36, label: '不涉及行业库' },
        ],
      },
    ],
  },
  // ── F. 数据库与存储 ──
  {
    id: 'f',
    title: 'F. 数据库',
    categories: [
      {
        id: 'f1-need',
        title: 'F1.是否需要数据库',
        items: [
          { id: 1, label: '不需要数据库' },
          { id: 2, label: '嵌入式数据库' },
          { id: 3, label: '客户端-服务器数据库' },
          { id: 4, label: '云数据库' },
          { id: 5, label: '内存数据库(Redis)' },
        ],
      },
      {
        id: 'f2-engine',
        title: 'F2.数据库引擎',
        items: [
          { id: 1, label: 'SQLite(嵌入式)' },
          { id: 2, label: 'SQL Server(本地/Express)' },
          { id: 3, label: 'MySQL/MariaDB' },
          { id: 4, label: 'PostgreSQL' },
          { id: 5, label: 'DuckDB(分析型)' },
          { id: 6, label: 'MongoDB' },
          { id: 7, label: 'SQLite+SQL Server混合' },
          { id: 8, label: '其他' },
        ],
      },
      {
        id: 'f3-connect',
        title: 'F3.连接方式',
        items: [
          { id: 1, label: 'ODBC(通用接口)' },
          { id: 2, label: 'OLE DB(COM方式)' },
          { id: 3, label: 'ADO(ActiveX封装)' },
          { id: 4, label: 'Qt SQL(Qt封装)' },
          { id: 5, label: 'SQLite3 C API' },
          { id: 6, label: '原生驱动' },
        ],
      },
      {
        id: 'f5-config',
        title: 'F5.配置文件位置',
        items: [
          { id: 1, label: '与exe同目录config.ini' },
          { id: 2, label: '%APPDATA%/项目/config.json' },
          { id: 3, label: '注册表 HKCU' },
          { id: 4, label: '环境变量' },
          { id: 5, label: '编译时硬编码' },
          { id: 6, label: '跨平台自动适配' },
        ],
      },
      {
        id: 'f6-init',
        title: 'F6.初始化脚本',
        items: [
          { id: 1, label: '生成建表SQL模板' },
          { id: 2, label: '生成初始数据SQL' },
          { id: 3, label: '不需要' },
        ],
      },
      {
        id: 'f7-persist',
        title: 'F7.持久化方式',
        items: [
          { id: 1, label: 'JSON文件' },
          { id: 2, label: 'XML文件' },
          { id: 3, label: 'INI文件' },
          { id: 4, label: '二进制序列化' },
          { id: 5, label: '注册表' },
          { id: 6, label: '不使用持久化' },
        ],
      },
      {
        id: 'f8-encrypt',
        title: 'F8.数据加密',
        items: [
          { id: 1, label: 'AES-256-GCM透明加密' },
          { id: 2, label: 'SQLCipher字段加密' },
          { id: 3, label: '校验和防篡改' },
          { id: 4, label: '不需要' },
        ],
      },
    ],
  },
  // ── G. 网络与通信 ──
  {
    id: 'g',
    title: 'G. 网络通信',
    categories: [
      {
        id: 'g1-need',
        title: 'G1.网络需求',
        items: [
          { id: 1, label: '不需要网络' },
          { id: 2, label: 'HTTP/HTTPS客户端' },
          { id: 3, label: 'HTTP/HTTPS服务端' },
          { id: 4, label: 'WebSocket客户端' },
          { id: 5, label: 'TCP Socket通信' },
          { id: 6, label: 'UDP通信' },
          { id: 7, label: 'REST API封装' },
          { id: 8, label: 'gRPC' },
          { id: 9, label: 'Named Pipe(IPC)' },
          { id: 10, label: 'MSMQ消息队列' },
        ],
      },
      {
        id: 'g2-http',
        title: 'G2.HTTP库',
        items: [
          { id: 1, label: 'WinHTTP(原生)' },
          { id: 2, label: 'WinINet(桌面客户端)' },
          { id: 3, label: 'libcurl(跨平台)' },
          { id: 4, label: 'cpprestsdk(异步)' },
          { id: 5, label: 'Boost.Beast(底层)' },
          { id: 6, label: 'Qt Network' },
          { id: 7, label: 'Drogon(Web框架)' },
          { id: 8, label: 'Seastar(高并发)' },
        ],
      },
      {
        id: 'g3-rest',
        title: 'G3.REST封装',
        items: [
          { id: 1, label: '需要(生成API客户端类)' },
          { id: 2, label: '不需要' },
        ],
      },
      {
        id: 'g4-auth',
        title: 'G4.身份认证',
        items: [
          { id: 1, label: '不需要认证' },
          { id: 2, label: 'Basic Auth(用户名+密码)' },
          { id: 3, label: 'Bearer Token/JWT' },
          { id: 4, label: 'OAuth 2.0' },
          { id: 5, label: 'NTLM/Kerberos(Windows)' },
          { id: 6, label: 'mTLS(客户端证书)' },
        ],
      },
      {
        id: 'g5-advanced',
        title: 'G5.高级网络安全',
        items: [
          { id: 1, label: 'mTLS双向认证' },
          { id: 2, label: 'SSH隧道/SOCKS5' },
          { id: 3, label: '自定义TCP协议' },
          { id: 4, label: 'HTTP/2或HTTP/3(QUIC)' },
          { id: 5, label: '模拟浏览器TLS指纹' },
          { id: 6, label: '不需要' },
        ],
      },
      {
        id: 'g6-protocols',
        title: 'G6.其他协议',
        items: [
          { id: 1, label: 'FTP/FTPS客户端' },
          { id: 2, label: 'SMTP/POP3邮件' },
          { id: 3, label: 'MQTT/CoAP(IoT)' },
          { id: 4, label: 'Modbus TCP/RTU' },
          { id: 5, label: 'OPC UA' },
          { id: 6, label: 'DDS(实时系统)' },
          { id: 7, label: 'Redis客户端(hiredis)' },
          { id: 8, label: 'RTMP/RTSP/SRT(流媒体)' },
          { id: 9, label: 'ONVIF(IP摄像头)' },
          { id: 10, label: '其他' },
          { id: 11, label: '不需要' },
        ],
      },
    ],
  },
  // ── H. 多线程与并发 ──
  {
    id: 'h',
    title: 'H. 并发模型',
    categories: [
      {
        id: 'h1-need',
        title: 'H1.并发需求',
        items: [
          { id: 1, label: '单线程(不需要并发)' },
          { id: 2, label: '多线程任务队列' },
          { id: 3, label: '线程池' },
          { id: 4, label: '生产者-消费者模式' },
          { id: 5, label: '并行计算(数据并行)' },
        ],
      },
      {
        id: 'h2-model',
        title: 'H2.并发模型',
        items: [
          { id: 1, label: 'std::thread' },
          { id: 2, label: 'std::jthread(C++20)' },
          { id: 3, label: 'Windows Thread Pool' },
          { id: 4, label: 'ConcRT' },
          { id: 5, label: 'PPL(Parallel Patterns)' },
          { id: 6, label: 'Intel TBB' },
          { id: 7, label: 'Boost.Thread' },
          { id: 8, label: 'Qt Concurrent' },
          { id: 9, label: 'C++20协程' },
          { id: 10, label: 'HPX(分布式并行)' },
          { id: 11, label: 'OpenCL/SYCL(异构)' },
        ],
      },
      {
        id: 'h3-sync',
        title: 'H3.同步原语',
        items: [
          { id: 1, label: 'std::mutex/lock_guard' },
          { id: 2, label: 'std::shared_mutex(读写锁)' },
          { id: 3, label: 'CRITICAL_SECTION(轻量)' },
          { id: 4, label: 'SRWLOCK(读写锁)' },
          { id: 5, label: 'std::atomic无锁' },
          { id: 6, label: '消息队列异步模型' },
          { id: 7, label: '信号量/条件变量' },
        ],
      },
      {
        id: 'h4-alloc',
        title: 'H4.内存分配器',
        items: [
          { id: 1, label: 'mimalloc' },
          { id: 2, label: 'jemalloc' },
          { id: 3, label: 'tcmalloc' },
          { id: 4, label: '系统默认' },
        ],
      },
    ],
  },
  // ── I. 日志与诊断 ──
  {
    id: 'i',
    title: 'I. 日志诊断',
    categories: [
      {
        id: 'i1-framework',
        title: 'I1.日志框架',
        items: [
          { id: 1, label: 'spdlog(推荐)' },
          { id: 2, label: '自定义日志写文件' },
          { id: 3, label: 'Windows Event Log' },
          { id: 4, label: 'OutputDebugString' },
          { id: 5, label: 'Qt日志(qDebug)' },
          { id: 6, label: '不需要日志' },
        ],
      },
      {
        id: 'i2-level',
        title: 'I2.日志级别',
        items: [
          { id: 1, label: 'trace~critical(完整)' },
          { id: 2, label: 'info/warn/error(精简)' },
          { id: 3, label: '自定义级别' },
        ],
      },
      {
        id: 'i3-target',
        title: 'I3.日志输出',
        items: [
          { id: 1, label: '文件(按天/大小轮替)' },
          { id: 2, label: '控制台' },
          { id: 3, label: '调试器(OutputDebugString)' },
          { id: 4, label: '远程日志服务器' },
          { id: 5, label: '❌ 错误: Sentry错误收集' },
          { id: 6, label: '组合(文件+控制台)' },
        ],
      },
      {
        id: 'i4-path',
        title: 'I4.日志位置',
        items: [
          { id: 1, label: '与exe同目录' },
          { id: 2, label: '%APPDATA%/项目/logs/' },
          { id: 3, label: '%TEMP%/项目/' },
          { id: 4, label: '自定义路径' },
        ],
      },
      {
        id: 'i5-profiling',
        title: 'I5.性能分析',
        items: [
          { id: 1, label: 'Tracy/Optick/ETW' },
          { id: 2, label: '不需要' },
        ],
      },
      {
        id: 'i6-observability',
        title: 'I6.可观测性',
        items: [
          { id: 1, label: 'OpenTelemetry C++' },
          { id: 2, label: 'Prometheus指标暴露' },
          { id: 3, label: '自定义遥测' },
          { id: 4, label: '不需要' },
        ],
      },
    ],
  },
  // ── J. 测试 ──
  {
    id: 'j',
    title: 'J. 测试',
    categories: [
      {
        id: 'j1-framework',
        title: 'J1.测试框架',
        items: [
          { id: 1, label: 'Google Test+Mock(推荐)' },
          { id: 2, label: 'Catch2' },
          { id: 3, label: 'doctest(轻量)' },
          { id: 4, label: 'MS C++ Unit Test' },
          { id: 5, label: 'Boost.Test' },
          { id: 6, label: '不需要' },
        ],
      },
      {
        id: 'j2-type',
        title: 'J2.测试类型',
        items: [
          { id: 1, label: '单元测试(白盒)' },
          { id: 2, label: '集成测试' },
          { id: 3, label: '功能测试(黑盒)' },
          { id: 4, label: '压力/性能测试' },
          { id: 5, label: '模糊测试(libFuzzer)' },
          { id: 6, label: 'UI自动化测试' },
          { id: 7, label: '全部三种' },
        ],
      },
      {
        id: 'j3-coverage',
        title: 'J3.代码覆盖率',
        items: [
          { id: 1, label: 'OpenCppCoverage' },
          { id: 2, label: 'VS内置覆盖率' },
          { id: 3, label: '不需要' },
        ],
      },
      {
        id: 'j4-report',
        title: 'J4.测试报告',
        items: [
          { id: 1, label: 'JUnit XML报告' },
          { id: 2, label: 'SonarQube分析' },
          { id: 3, label: '不需要' },
        ],
      },
    ],
  },
  // ── K. 打包与分发 ──
  {
    id: 'k',
    title: 'K. 打包分发',
    categories: [
      {
        id: 'k1-format',
        title: 'K1.安装包格式',
        items: [
          { id: 1, label: '绿色免安装(ZIP)' },
          { id: 2, label: 'MSI(WiX Toolset)' },
          { id: 3, label: 'NSIS' },
          { id: 4, label: 'Inno Setup' },
          { id: 5, label: 'MSIX(商店分发)' },
          { id: 6, label: 'AppX' },
          { id: 7, label: 'Squirrel.Windows' },
          { id: 8, label: 'Snap/Flatpak(Linux)' },
          { id: 9, label: 'DMG(macOS)' },
          { id: 10, label: '其他' },
        ],
      },
      {
        id: 'k3-sign',
        title: 'K3.数字签名',
        items: [
          { id: 1, label: '需要(PFX证书)' },
          { id: 2, label: '暂不需要(生成占位脚本)' },
          { id: 3, label: '不需要签名' },
        ],
      },
      {
        id: 'k4-update',
        title: 'K4.自动更新',
        items: [
          { id: 1, label: '不需要' },
          { id: 2, label: 'GitHub Releases检查' },
          { id: 3, label: '自建更新服务器' },
          { id: 4, label: 'Squirrel自动更新' },
          { id: 5, label: 'Microsoft Store分发' },
          { id: 6, label: '增量更新(差分补丁)' },
        ],
      },
      {
        id: 'k5-extra',
        title: 'K5.安装操作',
        items: [
          { id: 1, label: '创建桌面快捷方式' },
          { id: 2, label: '创建快速启动快捷方式' },
          { id: 3, label: '注册文件关联' },
          { id: 4, label: '安装VC++运行库' },
          { id: 5, label: '添加到系统PATH' },
          { id: 6, label: '注册Windows服务' },
        ],
      },
    ],
  },
  // ── L. 版本控制与CI/CD ──
  {
    id: 'l',
    title: 'L. 版本控制',
    categories: [
      {
        id: 'l1-git',
        title: 'L1.Git仓库',
        items: [
          { id: 1, label: '自动初始化Git' },
          { id: 2, label: '同时推送到GitHub/GitLab' },
          { id: 3, label: '不初始化Git' },
        ],
      },
      {
        id: 'l3-gitignore',
        title: 'L3..gitignore',
        items: [
          { id: 1, label: 'VS C++专用.gitignore' },
          { id: 2, label: 'CMake通用.gitignore' },
          { id: 3, label: '自定义.gitignore' },
        ],
      },
      {
        id: 'l4-ci',
        title: 'L4.CI/CD平台',
        items: [
          { id: 1, label: 'GitHub Actions' },
          { id: 2, label: 'Azure Pipelines' },
          { id: 3, label: 'GitLab CI' },
          { id: 4, label: 'CircleCI' },
          { id: 5, label: 'Jenkinsfile' },
          { id: 6, label: 'AppVeyor' },
          { id: 7, label: '不需要' },
        ],
      },
      {
        id: 'l5-ci-steps',
        title: 'L5.CI步骤',
        items: [
          { id: 1, label: '编译Debug+Release' },
          { id: 2, label: '运行单元测试' },
          { id: 3, label: '静态分析(cppcheck等)' },
          { id: 4, label: '生成安装包' },
          { id: 5, label: '代码签名' },
          { id: 6, label: '发布到GitHub Releases' },
          { id: 7, label: '代码覆盖率报告' },
          { id: 8, label: '内存泄漏检查' },
          { id: 9, label: '构建Docker镜像' },
          { id: 10, label: '性能基准测试' },
        ],
      },
      {
        id: 'l6-hooks',
        title: 'L6.预提交钩子',
        items: [
          { id: 1, label: 'pre-commit+clang-format' },
          { id: 2, label: '不需要' },
        ],
      },
      {
        id: 'l7-license',
        title: 'L7.许可证',
        items: [
          { id: 1, label: 'MIT' },
          { id: 2, label: 'Apache 2.0' },
          { id: 3, label: 'GPL v3' },
          { id: 4, label: 'LGPL' },
          { id: 5, label: '专有/自定义' },
          { id: 6, label: '暂不设定' },
        ],
      },
    ],
  },
  // ── M. 项目结构 ──
  {
    id: 'm',
    title: 'M. 项目结构',
    categories: [
      {
        id: 'm1-layout',
        title: 'M1.目录结构',
        items: [
          { id: 1, label: '标准CMake(src/include/test)' },
          { id: 2, label: '扁平布局(根目录)' },
          { id: 3, label: '按模块分层' },
          { id: 4, label: '自定义布局' },
          { id: 5, label: 'GNUInstallDirs标准' },
        ],
      },
      {
        id: 'm2-skeleton',
        title: 'M2.源码骨架',
        items: [
          { id: 1, label: 'main.cpp入口' },
          { id: 2, label: '核心业务类' },
          { id: 3, label: '配置文件读写类' },
          { id: 4, label: '日志封装类' },
          { id: 5, label: '数据库封装(Repository)' },
          { id: 6, label: '网络服务封装' },
          { id: 7, label: '异常体系' },
          { id: 8, label: '工具函数集合' },
          { id: 9, label: '单元测试占位' },
          { id: 10, label: '全部生成' },
        ],
      },
      {
        id: 'm4-abstract',
        title: 'M4.平台抽象层',
        items: [
          { id: 1, label: '文件系统封装' },
          { id: 2, label: '动态库加载封装' },
          { id: 3, label: '线程/同步原语封装' },
          { id: 4, label: '系统信息获取' },
          { id: 5, label: '根据OS自动决定' },
        ],
      },
      {
        id: 'm5-bindings',
        title: 'M5.多语言绑定',
        items: [
          { id: 1, label: '纯C API包装' },
          { id: 2, label: 'SWIG接口文件' },
          { id: 3, label: 'C++/CLI桥接(.NET)' },
          { id: 4, label: '不需要' },
        ],
      },
      {
        id: 'm6-test-strat',
        title: 'M6.测试策略',
        items: [
          { id: 1, label: '基准测试(性能回归)' },
          { id: 2, label: '模糊测试harness' },
          { id: 3, label: '内存泄漏检测' },
          { id: 4, label: '不需要' },
        ],
      },
      {
        id: 'm7-docs',
        title: 'M7.文档生成',
        items: [
          { id: 1, label: 'Doxygen配置' },
          { id: 2, label: 'ARCHITECTURE.md(Mermaid)' },
          { id: 3, label: '不需要' },
        ],
      },
    ],
  },
  // ── N. 高级选项 ──
  {
    id: 'n',
    title: 'N. 高级选项',
    categories: [
      {
        id: 'n1-plugin',
        title: 'N1.插件系统',
        items: [
          { id: 1, label: '需要(DLL插件+发现机制)' },
          { id: 2, label: '暂不需要' },
        ],
      },
      {
        id: 'n2-script',
        title: 'N2.脚本引擎',
        items: [
          { id: 1, label: '嵌入Lua(sol2)' },
          { id: 2, label: '嵌入Python(pybind11)' },
          { id: 3, label: '嵌入JS(QuickJS/Duktape)' },
          { id: 4, label: '嵌入V8(完整JS引擎)' },
          { id: 5, label: '不需要' },
        ],
      },
      {
        id: 'n3-hotreload',
        title: 'N3.热重载',
        items: [
          { id: 1, label: '需要(DLL热重载)' },
          { id: 2, label: '不需要' },
        ],
      },
      {
        id: 'n5-encoding',
        title: 'N5.字符编码',
        items: [
          { id: 1, label: 'UTF-8 everywhere(推荐)' },
          { id: 2, label: 'UTF-16(Windows原生)' },
          { id: 3, label: '混合(外部UTF-8/内部UTF-16)' },
        ],
      },
      {
        id: 'n6-style',
        title: 'N6.代码风格',
        items: [
          { id: 1, label: 'Microsoft风格(Allman)' },
          { id: 2, label: 'Google风格' },
          { id: 3, label: 'LLVM风格' },
          { id: 4, label: 'Qt风格' },
          { id: 5, label: '自定义(clang-format)' },
        ],
      },
      {
        id: 'n7-configgen',
        title: 'N7.配置文件生成',
        items: [
          { id: 1, label: '.clang-format' },
          { id: 2, label: '.editorconfig' },
          { id: 3, label: '都生成' },
          { id: 4, label: '都不生成' },
        ],
      },
    ],
  },
  // ── O. 逆向工程 ──
  {
    id: 'o',
    title: 'O. 逆向工程',
    categories: [
      {
        id: 'o1-memory',
        title: 'O1.内存操作',
        items: [
          { id: 1, label: '读写外部进程内存' },
          { id: 2, label: '内核模式内存访问(驱动)' },
          { id: 3, label: '内存模式扫描(AOB)' },
          { id: 4, label: '代码注入/补丁框架' },
          { id: 5, label: '不需要' },
        ],
      },
      {
        id: 'o2-disasm',
        title: 'O2.反汇编集成',
        items: [
          { id: 1, label: '反汇编引擎(Capstone等)' },
          { id: 2, label: '汇编引擎(Keystone/AsmJit)' },
          { id: 3, label: '调试器接口' },
          { id: 4, label: 'Hook库(Detours/MinHook)' },
          { id: 5, label: '不需要' },
        ],
      },
      {
        id: 'o3-pluginarch',
        title: 'O3.插件架构',
        items: [
          { id: 1, label: '纯C接口插件' },
          { id: 2, label: 'COM接口插件' },
          { id: 3, label: '脚本扩展(Lua/Python)' },
          { id: 4, label: '插件热加载/卸载' },
          { id: 5, label: '插件市场基础设施' },
          { id: 6, label: '不需要' },
        ],
      },
      {
        id: 'o4-format',
        title: 'O4.文件格式解析',
        items: [
          { id: 1, label: 'PE/ELF/Mach-O解析' },
          { id: 2, label: '自定义二进制格式' },
          { id: 3, label: '加密/压缩容器' },
          { id: 4, label: '不需要' },
        ],
      },
      {
        id: 'o5-instrument',
        title: 'O5.动态插桩',
        items: [
          { id: 1, label: '集成Frida C API' },
          { id: 2, label: '自定义代码虚拟机' },
          { id: 3, label: '不需要' },
        ],
      },
    ],
  },
  // ── P. AI与实时处理 ──
  {
    id: 'p',
    title: 'P. AI/实时',
    categories: [
      {
        id: 'p1-source',
        title: 'P1.图像输入源',
        items: [
          { id: 1, label: '静态图片文件' },
          { id: 2, label: '本地摄像头(DirectShow)' },
          { id: 3, label: '网络相机(RTSP/GigE)' },
          { id: 4, label: '屏幕捕获(DXGI)' },
          { id: 5, label: '自定义帧源' },
          { id: 6, label: '无图像输入' },
        ],
      },
      {
        id: 'p2-pipeline',
        title: 'P2.处理管线',
        items: [
          { id: 1, label: '单帧顺序处理' },
          { id: 2, label: '多线程流水线' },
          { id: 3, label: 'GPU零拷贝管线' },
          { id: 4, label: '帧缓冲池(Ring Buffer)' },
          { id: 5, label: '不需要管线' },
        ],
      },
      {
        id: 'p3-inference',
        title: 'P3.AI推理引擎',
        items: [
          { id: 1, label: 'ONNX Runtime' },
          { id: 2, label: 'OpenVINO' },
          { id: 3, label: 'TensorRT' },
          { id: 4, label: 'LibTorch(PyTorch C++)' },
          { id: 5, label: 'Mediapipe' },
          { id: 6, label: 'Apache TVM' },
          { id: 7, label: 'TensorFlow Lite' },
          { id: 8, label: '自定义推理框架' },
          { id: 9, label: '不需要AI推理' },
        ],
      },
      {
        id: 'p4-accel',
        title: 'P4.图像加速',
        items: [
          { id: 1, label: 'OpenCV(含CUDA)' },
          { id: 2, label: 'Halide' },
          { id: 3, label: 'NPP(NVIDIA)' },
          { id: 4, label: 'Intel IPP' },
          { id: 5, label: '自研SIMD优化' },
          { id: 6, label: 'Tesseract OCR' },
          { id: 7, label: '不需要' },
        ],
      },
      {
        id: 'p5-model',
        title: 'P5.模型管理',
        items: [
          { id: 1, label: '模型嵌入资源(.rc)' },
          { id: 2, label: '从云端下载缓存' },
          { id: 3, label: '模型热更新(文件监控)' },
          { id: 4, label: '不需要' },
        ],
      },
    ],
  },
  // ── Q. 科学计算 ──
  {
    id: 'q',
    title: 'Q. 科学计算',
    categories: [
      {
        id: 'q1-format',
        title: 'Q1.科学数据格式',
        items: [
          { id: 1, label: 'DICOM(医学影像)' },
          { id: 2, label: 'NIfTI(神经影像)' },
          { id: 3, label: 'HDF5(通用科学数据)' },
          { id: 4, label: 'NetCDF(气候数据)' },
          { id: 5, label: 'STL/OBJ/PLY(3D网格)' },
          { id: 6, label: 'LAS/LAZ(点云)' },
          { id: 7, label: 'GeoTIFF(地理空间)' },
          { id: 8, label: 'Parquet/Avro(大数据)' },
          { id: 9, label: '3MF(3D制造格式)' },
          { id: 10, label: 'AMF(增材制造)' },
          { id: 11, label: '自定义格式' },
          { id: 12, label: '不需要' },
        ],
      },
      {
        id: 'q2-viz',
        title: 'Q2.可视化需求',
        items: [
          { id: 1, label: '2D图表(Qt Charts等)' },
          { id: 2, label: '3D体渲染(VTK)' },
          { id: 3, label: '切片视图(医学影像)' },
          { id: 4, label: '点云渲染(PCL)' },
          { id: 5, label: '有限元网格显示' },
          { id: 6, label: 'GIS地图叠加' },
          { id: 7, label: '实时信号波形' },
          { id: 8, label: '不需要' },
        ],
      },
      {
        id: 'q3-numeric',
        title: 'Q3.数值计算',
        items: [
          { id: 1, label: 'Eigen(线性代数)' },
          { id: 2, label: 'Armadillo(类似Matlab)' },
          { id: 3, label: 'GSL(GNU科学库)' },
          { id: 4, label: 'FFTW(傅里叶变换)' },
          { id: 5, label: 'IPP(Intel信号处理)' },
          { id: 6, label: 'CUDA/OpenCL(GPU加速)' },
          { id: 7, label: 'Trilinos/PETSc(大规模)' },
          { id: 8, label: '不需要' },
        ],
      },
    ],
  },
  // ── R. 安全与加固 ──
  {
    id: 'r',
    title: 'R. 安全加固',
    categories: [
      {
        id: 'r1-protect',
        title: 'R1.代码保护',
        items: [
          { id: 1, label: '代码混淆(OLLVM)' },
          { id: 2, label: '反调试检测' },
          { id: 3, label: '完整性校验(CRC/SHA)' },
          { id: 4, label: '字符串加密(编译时)' },
          { id: 5, label: '虚拟化保护(Themida/VMP)' },
          { id: 6, label: '不需要' },
        ],
      },
      {
        id: 'r2-license',
        title: 'R2.许可激活',
        items: [
          { id: 1, label: '本地License(RSA/AES)' },
          { id: 2, label: '在线激活服务器' },
          { id: 3, label: '硬件绑定(机器指纹)' },
          { id: 4, label: '试用期限制' },
          { id: 5, label: '不需要' },
        ],
      },
    ],
  },
  // ── S. 音频与多媒体 ──
  {
    id: 's',
    title: 'S. 音频媒体',
    categories: [
      {
        id: 's1-type',
        title: 'S1.音频功能',
        items: [
          { id: 1, label: '音频播放/录制' },
          { id: 2, label: '实时音频效果处理' },
          { id: 3, label: '虚拟乐器/合成器' },
          { id: 4, label: '音频插件(VST3/AU/AAX)' },
          { id: 5, label: '音频分析(FFT/频谱)' },
          { id: 6, label: 'MIDI输入/输出' },
          { id: 7, label: '不需要音频' },
        ],
      },
      {
        id: 's2-framework',
        title: 'S2.音频框架',
        items: [
          { id: 1, label: 'JUCE(全面音频框架)' },
          { id: 2, label: 'ASIO SDK(低延迟驱动)' },
          { id: 3, label: 'PortAudio+RtAudio' },
          { id: 4, label: 'VST3 SDK' },
          { id: 5, label: 'FMOD/Wwise(游戏音频)' },
          { id: 6, label: '自研音频引擎' },
        ],
      },
      {
        id: 's3-device',
        title: 'S3.音频设备',
        items: [
          { id: 1, label: '系统默认音频设备' },
          { id: 2, label: 'ASIO专业声卡' },
          { id: 3, label: 'WASAPI独占模式' },
          { id: 4, label: '多通道I/O支持' },
        ],
      },
    ],
  },
  // ── T. XR与空间计算 ──
  {
    id: 't',
    title: 'T. XR/空间',
    categories: [
      {
        id: 't1-platform',
        title: 'T1.XR平台',
        items: [
          { id: 1, label: 'OpenXR(跨平台标准)' },
          { id: 2, label: 'SteamVR' },
          { id: 3, label: 'Oculus SDK(Meta Quest)' },
          { id: 4, label: 'HoloLens/WMR' },
          { id: 5, label: 'AR Core/ARKit' },
          { id: 6, label: '不需要XR' },
        ],
      },
      {
        id: 't2-render',
        title: 'T2.渲染后端',
        items: [
          { id: 1, label: 'DirectX 11/12' },
          { id: 2, label: 'Vulkan' },
          { id: 3, label: 'OpenGL' },
          { id: 4, label: '引擎内置(Unreal/Unity)' },
        ],
      },
      {
        id: 't3-input',
        title: 'T3.交互输入',
        items: [
          { id: 1, label: '6DOF手柄追踪' },
          { id: 2, label: '手部追踪/手势' },
          { id: 3, label: '眼动追踪' },
          { id: 4, label: '空间锚点/场景理解' },
        ],
      },
    ],
  },
  // ── U. 外设与映像 ──
  {
    id: 'u',
    title: 'U. 外设映像',
    categories: [
      {
        id: 'u1-printer',
        title: 'U1.打印机/扫描仪',
        items: [
          { id: 1, label: 'Windows v4打印驱动' },
          { id: 2, label: 'PCL/PostScript/ZPL' },
          { id: 3, label: 'TWAIN扫描仪采集' },
          { id: 4, label: 'WIA(Windows Image)' },
          { id: 5, label: '不需要' },
        ],
      },
      {
        id: 'u2-other',
        title: 'U2.其他映像设备',
        items: [
          { id: 1, label: '数码相机控制(SDK/MTP)' },
          { id: 2, label: '文档扫描仪/送纸器' },
          { id: 3, label: '条码/二维码扫描枪' },
        ],
      },
    ],
  },
  // ── V. 编译器与开发工具 ──
  {
    id: 'v',
    title: 'V. 编译器',
    categories: [
      {
        id: 'v1-langdev',
        title: 'V1.语言/编译器开发',
        items: [
          { id: 1, label: '自定义语言前端(Lex/Yacc)' },
          { id: 2, label: 'LLVM编译器后端' },
          { id: 3, label: '代码转换/混淆器' },
          { id: 4, label: '静态代码分析工具' },
          { id: 5, label: 'LSP服务器' },
          { id: 6, label: '不需要' },
        ],
      },
      {
        id: 'v2-libs',
        title: 'V2.编译器相关库',
        items: [
          { id: 1, label: 'LLVM C++ API' },
          { id: 2, label: 'Clang Tooling' },
          { id: 3, label: 'ANTLR4 C++ runtime' },
          { id: 4, label: 'Tree-sitter' },
          { id: 5, label: 'Keystone/AsmJit' },
        ],
      },
    ],
  },
  // ── W. 嵌入式与IoT ──
  {
    id: 'w',
    title: 'W. 嵌入式',
    categories: [
      {
        id: 'w1-platform',
        title: 'W1.嵌入式平台',
        items: [
          { id: 1, label: 'OTA固件更新(A/B分区)' },
          { id: 2, label: '安全启动+签名验证' },
          { id: 3, label: '低功耗管理' },
          { id: 4, label: '传感器采集+边缘计算' },
          { id: 5, label: '不需要' },
        ],
      },
      {
        id: 'w2-protocol',
        title: 'W2.嵌入式通信',
        items: [
          { id: 1, label: 'MQTT-SN/CoAP' },
          { id: 2, label: 'BLE GATT' },
          { id: 3, label: 'LoRaWAN' },
          { id: 4, label: 'Matter/Thread' },
          { id: 5, label: 'CAN/LIN' },
        ],
      },
    ],
  },
  // ── Y. 密码学与区块链 ──
  {
    id: 'y',
    title: 'Y. 密码学',
    categories: [
      {
        id: 'y1-primitives',
        title: 'Y1.密码学原语',
        items: [
          { id: 1, label: 'AES/RSA加密' },
          { id: 2, label: '哈希与HMAC' },
          { id: 3, label: '数字签名(ECDSA/EdDSA)' },
          { id: 4, label: '密钥派生(PBKDF2/Argon2)' },
          { id: 5, label: '安全随机数生成' },
        ],
      },
      {
        id: 'y2-blockchain',
        title: 'Y2.区块链集成',
        items: [
          { id: 1, label: 'BTC/ETH RPC客户端' },
          { id: 2, label: '钱包密钥管理(HD/BIP39)' },
          { id: 3, label: '智能合约交互' },
          { id: 4, label: '共识算法实现' },
          { id: 5, label: '不需要区块链' },
        ],
      },
    ],
  },
  // ── Z. 远程协作 ──
  {
    id: 'z',
    title: 'Z. 远程协作',
    categories: [
      {
        id: 'z1-desktop',
        title: 'Z1.远程桌面/共享',
        items: [
          { id: 1, label: '屏幕捕获+编码(H.264)' },
          { id: 2, label: '远程控制(输入注入)' },
          { id: 3, label: '文件传输' },
          { id: 4, label: '聊天/白板叠加' },
          { id: 5, label: '不需要' },
        ],
      },
      {
        id: 'z2-protocol',
        title: 'Z2.远程协议',
        items: [
          { id: 1, label: '自定义协议' },
          { id: 2, label: 'RDP客户端(FreeRDP)' },
          { id: 3, label: 'VNC客户端/服务器' },
          { id: 4, label: 'WebRTC数据通道' },
        ],
      },
    ],
  },
  // ── ❌ 错误: AA. 错误处理 ──
  {
    id: 'aa',
    title: '❌ 错误: AA. 错误处理',
    categories: [
      {
        id: 'aa1-paradigm',
        title: '❌ 错误: AA1.错误处理范式',
        items: [
          { id: 1, label: '❌ 错误: C++异常(try/catch)' },
          { id: 2, label: '错误码(std::error_code)' },
          { id: 3, label: 'std::expected(函数式)' },
          { id: 4, label: '混合模式' },
          { id: 5, label: '断言+日志(仅Debug)' },
        ],
      },
      {
        id: 'aa2-safety',
        title: '❌ 错误: AA2.异常安全',
        items: [
          { id: 1, label: '基本保证' },
          { id: 2, label: '强保证(原子回滚)' },
          { id: 3, label: '不抛出(nothrow)' },
          { id: 4, label: '不关心' },
        ],
      },
      {
        id: 'aa3-errgen',
        title: '❌ 错误: AA3.错误码生成',
        items: [
          { id: 1, label: '需要生成错误码头文件' },
          { id: 2, label: '不需要' },
        ],
      },
    ],
  },
  // ── AB. 调试符号 ──
  {
    id: 'ab',
    title: 'AB. 调试符号',
    categories: [
      {
        id: 'ab1-pdb',
        title: 'AB1.调试符号策略',
        items: [
          { id: 1, label: '完整PDB(独立于exe)' },
          { id: 2, label: '嵌入式PDB(含在exe)' },
          { id: 3, label: '剥离符号(仅MAP文件)' },
          { id: 4, label: '符号服务器集成' },
        ],
      },
      {
        id: 'ab2-dist',
        title: 'AB2.符号文件分发',
        items: [
          { id: 1, label: '随安装包分发' },
          { id: 2, label: '单独存储(内部服务器)' },
          { id: 3, label: '不保留Release符号' },
        ],
      },
      {
        id: 'ab3-release',
        title: 'AB3.Release额外',
        items: [
          { id: 1, label: '/GL+/LTCG全程序优化' },
          { id: 2, label: '/Zi+/O2并存(可分析)' },
          { id: 3, label: '禁用增强指令集(兼容)' },
          { id: 4, label: '增量链接(开发阶段)' },
        ],
      },
    ],
  },
  // ── AC. 构建产物 ──
  {
    id: 'ac',
    title: 'AC. 产物结构',
    categories: [
      {
        id: 'ac1-layout',
        title: 'AC1.安装布局',
        items: [
          { id: 1, label: 'GNUInstallDirs标准' },
          { id: 2, label: '自定义布局' },
          { id: 3, label: '单个exe无目录' },
        ],
      },
      {
        id: 'ac2-cleanup',
        title: 'AC2.清理策略',
        items: [
          { id: 1, label: '每次构建前清理' },
          { id: 2, label: '增量构建保留中间对象' },
          { id: 3, label: '独立构建目录(build/Debug)' },
        ],
      },
    ],
  },
  // ── AD. 许可合规 ──
  {
    id: 'ad',
    title: 'AD. 许可合规',
    categories: [
      {
        id: 'ad1-scan',
        title: 'AD1.许可证扫描',
        items: [
          { id: 1, label: 'vcpkg-analyze许可证清单' },
          { id: 2, label: 'SPDX合规声明(SBOM)' },
          { id: 3, label: '仅记录依赖列表' },
          { id: 4, label: '不需要' },
        ],
      },
      {
        id: 'ad2-conflict',
        title: 'AD2.冲突处理',
        items: [
          { id: 1, label: '自动警告并阻止' },
          { id: 2, label: '建议替换兼容库' },
          { id: 3, label: '忽略(自行处理)' },
        ],
      },
    ],
  },
  // ── AE. ABI稳定性 ──
  {
    id: 'ae',
    title: 'AE. ABI稳定',
    categories: [
      {
        id: 'ae1-compat',
        title: 'AE1.ABI兼容策略',
        items: [
          { id: 1, label: '二进制兼容(pimpl+版本宏)' },
          { id: 2, label: '仅源码兼容' },
          { id: 3, label: '仅导出C接口' },
          { id: 4, label: '不适用(非SDK项目)' },
        ],
      },
      {
        id: 'ae2-visibility',
        title: 'AE2.符号可见性',
        items: [
          { id: 1, label: '统一宏(dllexport+visibility)' },
          { id: 2, label: '.def文件显式导出' },
          { id: 3, label: '默认全部可见' },
        ],
      },
      {
        id: 'ae3-versionmacros',
        title: 'AE3.版本号宏',
        items: [
          { id: 1, label: 'MAJOR/MINOR/PATCH宏' },
          { id: 2, label: 'API_VERSION_STRING' },
        ],
      },
    ],
  },
  // ── AF. 系统服务 ──
  {
    id: 'af',
    title: 'AF. 系统服务',
    categories: [
      {
        id: 'af1-control',
        title: 'AF1.服务控制',
        items: [
          { id: 1, label: 'Windows Service骨架' },
          { id: 2, label: 'Linux systemd单元' },
          { id: 3, label: '两者都需要' },
          { id: 4, label: '不适用' },
        ],
      },
      {
        id: 'af2-startup',
        title: 'AF2.启动类型',
        items: [
          { id: 1, label: '自动启动(Automatic)' },
          { id: 2, label: '手动启动(Manual)' },
          { id: 3, label: '延迟自动启动' },
        ],
      },
      {
        id: 'af3-graceful',
        title: 'AF3.优雅退出',
        items: [
          { id: 1, label: '设置超时+停止信号' },
          { id: 2, label: '看门狗自动重启' },
          { id: 3, label: '不需要' },
        ],
      },
    ],
  },
  // ── AG. 容器化 ──
  {
    id: 'ag',
    title: 'AG. 容器化',
    categories: [
      {
        id: 'ag1-docker',
        title: 'AG1.Docker',
        items: [
          { id: 1, label: 'Dockerfile(多阶段构建)' },
          { id: 2, label: 'docker-compose.yml' },
          { id: 3, label: '不需要容器化' },
        ],
      },
      {
        id: 'ag2-baseimage',
        title: 'AG2.基础镜像',
        items: [
          { id: 1, label: 'Windows Server Core' },
          { id: 2, label: 'Ubuntu' },
          { id: 3, label: 'Alpine(轻量)' },
          { id: 4, label: '自定义' },
        ],
      },
      {
        id: 'ag3-orch',
        title: 'AG3.容器编排',
        items: [
          { id: 1, label: 'K8s模板(Deployment等)' },
          { id: 2, label: '仅Docker Compose' },
          { id: 3, label: '不需要' },
        ],
      },
    ],
  },
  // ── AH. 预构建脚本 ──
  {
    id: 'ah',
    title: 'AH. 预构建',
    categories: [
      {
        id: 'ah1-script',
        title: 'AH1.环境初始化',
        items: [
          { id: 1, label: 'bootstrap.ps1+setup.sh' },
          { id: 2, label: 'README安装步骤(无脚本)' },
          { id: 3, label: '不需要' },
        ],
      },
      {
        id: 'ah2-ops',
        title: 'AH2.脚本操作',
        items: [
          { id: 1, label: '安装CMake/Ninja等' },
          { id: 2, label: '安装vcpkg并引导' },
          { id: 3, label: '安装Conan配置远程' },
          { id: 4, label: '生成IDE工程文件' },
          { id: 5, label: '检查编译器版本' },
        ],
      },
    ],
  },
  // ── AI. 代码生成 ──
  {
    id: 'ai',
    title: 'AI. 代码生成',
    categories: [
      {
        id: 'ai1-tools',
        title: 'AI1.预编译工具',
        items: [
          { id: 1, label: 'Protobuf(.proto→.pb)' },
          { id: 2, label: 'FlatBuffers(.fbs→.h)' },
          { id: 3, label: 'Qt uic/moc/rcc' },
          { id: 4, label: 'IDL编译器(COM类型库)' },
          { id: 5, label: '自定义代码生成器' },
          { id: 6, label: '不需要' },
        ],
      },
      {
        id: 'ai2-cmake',
        title: 'AI2.CMake生成规则',
        items: [
          { id: 1, label: 'AUTOMOC/AUTOUIC/AUTORCC' },
          { id: 2, label: 'Protobuf_GENERATE_CPP' },
          { id: 3, label: 'add_custom_command' },
          { id: 4, label: '不使用自动生成' },
        ],
      },
    ],
  },
  // ── AJ. 隐私合规 ──
  {
    id: 'aj',
    title: 'AJ. 隐私合规',
    categories: [
      {
        id: 'aj1-privacy',
        title: 'AJ1.隐私数据',
        items: [
          { id: 1, label: '需权限(摄像头/麦克风等)' },
          { id: 2, label: '否' },
        ],
      },
      {
        id: 'aj2-statement',
        title: 'AJ2.隐私授权',
        items: [
          { id: 1, label: '隐私政策展示+同意/拒绝' },
          { id: 2, label: '系统权限请求代码' },
          { id: 3, label: 'GDPR/CCPA数据导出接口' },
          { id: 4, label: '不需要' },
        ],
      },
      {
        id: 'aj3-storage',
        title: 'AJ3.隐私存储',
        items: [
          { id: 1, label: '本地加密存储(可删除)' },
          { id: 2, label: '仅内存使用不落盘' },
          { id: 3, label: '上传云端(需告知用户)' },
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

  // ── 全部选项统计 ──
  const totalItems = useMemo(() => {
    let n = 0;
    for (const g of GROUPS) for (const c of g.categories) n += c.items.length;
    return n;
  }, []);
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
