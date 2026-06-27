---
description: "[项目生成器] Windows C++ 项目骨架生成 — 全行业覆盖，600+决策项，定向生成可运行半成品"
argumentHint: "[目标目录]"
allowedTools: [Bash, Read, Write, Edit, Glob, Grep]
---

# Windows C++ 项目生成器

## 使用方式

```
/plan-cpp-win                    # 在当前目录生成
/plan-cpp-win D:/projects/my-app  # 在指定目录生成
/plan-cpp-win 目标目录:D:/projects/my-app  # 显式指定
```

**如果传了目录参数**：直接在目标目录生成所有文件（自动创建目录）
**如果没传目录参数**：在对话中会询问你"项目生成到哪个目录？"，也可直接回答"当前目录"

> 重要：生成文件时请使用 Bash 先 `mkdir -p <目标目录>` 再创建文件，确保所有文件写入正确位置。

## 核心理念

这不是「写一个计划」，而是「生成一个可直接编译运行的项目骨架」。你回答得越详细，输出的代码就越接近成品。

每个问题的答案都会直接影响生成的文件内容。最终产出：CMakeLists.txt、源码文件、配置文件、CI 脚本、安装包脚本——全部可直接使用。

---

## 第零步：确认目录

**如果你是带目录参数调用的（如 `/plan-cpp-win D:/projects/my-app`），直接在目标目录生成，跳过此步。**

如果没有传目录参数，请先确认目标目录：
1. 在当前目录生成（默认）
2. 在指定目录生成（请提供路径）

确定目录后，用 Bash 执行：`mkdir -p <目标目录>`，后续所有文件都创建在该目录下。

---

## 关于目标目录的约定

- **如果命令带了参数**（如 `/plan-cpp-win D:/code/myapp`），参数就是目标目录，自动 `mkdir -p` 后在该目录生成所有文件。
- **如果没带参数**，第一步会问你，你回答"当前目录"或给一个路径都行。两个都给则以参数为准。

> 记住这个目录，后续所有步骤中当你需要创建文件时，路径都必须以这个目标目录为前缀。

## 第一步：快速预设（可选）

如果您想快速启动一个常见项目类型，可以直接选择一个预设模板，生成器将为您预填所有决策项。您仍然可以随后修改任何选项。

请选择预设类型（或回复编号”0”进入逐个问题模式）：
1. [ ] 控制台工具（命令行处理/转换）
2. [ ] Windows 系统服务（后台守护）
3. [ ] 系统托盘小工具（剪贴板/快捷启动）
4. [ ] 标准 Qt Widgets 桌面应用
5. [ ] WinUI 3 现代 Windows 应用
6. [ ] 纯 DLL 插件/注入模块（用于 x64dbg/IDA 等）
7. [ ] 跨平台 C/C++ SDK（供第三方调用）
8. [ ] 医学影像工作站（DICOM + VTK）
9. [ ] 工业机器视觉上位机（OpenCV + 相机 + PLC）
10. [ ] 逆向分析工具框架（内存扫描/反汇编）
11. [ ] AI 实时推理管线（ONNX Runtime + 多线程）
12. [ ] 音频插件 (VST3/AU)
13. [ ] 游戏引擎模块（Unreal/Godot）
14. [ ] 流媒体服务器（RTMP/SRT）
15. [ ] 嵌入式物联网网关（MQTT + Modbus）
16. [ ] 打印机/扫描仪驱动或采集工具
17. [ ] 输入法框架 (TSF)
18. [ ] 编译器前端/代码分析器
19. [ ] VR/AR 应用 (OpenXR)
20. [ ] 密码学工具/钱包
21. [ ] 远程桌面协助工具
22. [ ] 自定义（仍将逐个问题回答）

---

## 第二步：逐个回答以下问题

请逐个回复，当前问题回答完再问下一个。每个问题都给出预制选项 + 自定义兜底。

## X. 项目场景与约束

### X1. 目标操作系统（可多选）
1. [ ] Windows 10/11 (x64)
2. [ ] Windows 7 兼容
3. [ ] Windows 11 on ARM64
4. [ ] Linux（请指定发行版/内核版本）
5. [ ] macOS（指定最低版本 + Apple Silicon/Intel）
6. [ ] 嵌入式 Windows (IoT / Windows PE)
7. [ ] Xbox / 游戏主机开发套件
8. [ ] 跨平台（同时支持 Windows + Linux + macOS）
9. [ ] 嵌入式 Linux（Yocto / Buildroot / Ubuntu Core）
10. [ ] 裸机 / RTOS（无操作系统 C++ 支持，如 FreeRTOS/Zephyr）
11. [ ] WebAssembly (WASM) 浏览器/边缘环境
12. [ ] 其他（请描述）

### X2. 项目性质
1. [ ] 独立桌面应用程序
2. [ ] Windows 服务 / Linux daemon
3. [ ] 系统托盘应用（无主窗口，图标+菜单）
4. [ ] 无界面后台进程（批处理/计算节点）
5. [ ] 设备驱动程序（KMDF / UMDF / WDM）
6. [ ] COM/ActiveX 组件
7. [ ] Shell 扩展（右键菜单、属性页、图标覆盖等）
8. [ ] 浏览器插件（NPAPI / CEF 子进程等）
9. [ ] 动态库注入模块 / Hook DLL
10. [ ] 脚本引擎插件（Lua / Python / .NET 扩展点）
11. [ ] 跨平台 SDK（供第三方调用的库）
12. [ ] 控制台工具
13. [ ] 服务器应用（HTTP/TCP 微服务/后端）
14. [ ] 游戏引擎/渲染器
15. [ ] 打印机驱动 / 扫描仪采集 (TWAIN/WIA)
16. [ ] Windows 文本服务框架 (TSF) 输入法
17. [ ] 其他（请描述）

### X3. 整体架构模式（选择一项，可组合）
1. [ ] 单机独立程序（所有逻辑在本地）
2. [ ] 客户端-服务器（C/S）— 客户端请求服务
3. [ ] 浏览器-服务器（B/S）— 通过 HTTP/WebSocket 访问，但本地可含 C++ 原生服务
4. [ ] 微服务集群 — 多个小型服务协作
5. [ ] P2P 网络 — 节点直接通信
6. [ ] 混合模式（如 Electron + C++ 本地计算）
7. [ ] 库/SDK — 无自身主进程，供其他程序调用
8. [ ] 边缘计算节点（端侧推理+云端同步）

### X4. 项目来源与现有代码
1. [ ] 全新项目
2. [ ] 基于已有代码库扩展（请提供路径或仓库地址）
3. [ ] 需要对接遗留 C/C++ 代码（仅有 .lib + .h 或逆向头文件）
4. [ ] 需要对接 .NET 托管代码（C++/CLI 或 COM 互操作）
5. [ ] 封装现有命令行工具为 GUI
6. [ ] 需要从其他语言（C#/Python/Rust）调用 C++ 模块
7. [ ] 代码需同时运行在多个平台
8. [ ] 移植现有项目（从其他语言或平台）

### X5. 实时性要求
1. [ ] 非实时（GUI 事件驱动 / 批处理）
2. [ ] 软实时（多媒体、音视频播放，可容忍偶尔抖动）
3. [ ] 硬实时（工业控制、信号处理，要求确定性延迟）
4. [ ] 超低延迟（微秒级优化，高频交易/游戏引擎主循环）

### X6. 硬件设备交互（可多选）
1. [ ] 无
2. [ ] 串口 / RS-485 / Modbus
3. [ ] USB HID / Bulk / 自定义 USB 设备
4. [ ] 蓝牙 / BLE
5. [ ] PCIe 采集卡 / FPGA 加速卡
6. [ ] 摄像头（UVC / DirectShow / Media Foundation / 厂商 SDK）
7. [ ] 传感器（加速度计、陀螺仪、激光雷达等）
8. [ ] 工业机器人 / PLC
9. [ ] CAN 总线 / EtherCAT / Profinet
10. [ ] SPI / I2C / GPIO（嵌入式）
11. [ ] 自定义设备（通过专有 DLL 或 SDK）
12. [ ] 需要硬件加密狗 / License Key
13. [ ] 嵌入式开发板（树莓派 / NVIDIA Jetson / STM32MP 等）
14. [ ] 物理磁盘/卷访问（直接读写扇区）

### X7. 目标行业/领域（可多选，便于自动引入相关库与规范）
1. [ ] 通用桌面软件
2. [ ] 医疗影像与诊断（CT/MRI/DICOM）
3. [ ] 工业自动化与机器视觉
4. [ ] 科学计算与仿真
5. [ ] 地理信息系统（GIS）
6. [ ] 金融与高频交易
7. [ ] 音视频制作/流媒体
8. [ ] 游戏开发
9. [ ] 网络安全与逆向工程
10. [ ] 教育/培训
11. [ ] 汽车电子/ADAS（AUTOSAR 等）
12. [ ] 区块链与加密货币
13. [ ] 音频处理与音乐制作
14. [ ] 虚拟现实/增强现实 (VR/AR)
15. [ ] 编译器/开发工具
16. [ ] 远程协作与屏幕共享
17. [ ] 其他（请描述）

---
## A. 项目基础信息

### A1. 项目名称
- 请直接输入项目英文名称（如 MyAwesomeApp）

### A2. 项目显示名称
- 请直接输入用户看到的名称（如 我的超级应用）

### A3. 项目简述
- 请用一句话描述项目用途

### A4. 版本号格式
1. [ ] 主.次.修订（1.0.0）
2. [ ] 主.次.修订.构建（1.0.0.100）
3. [ ] 语义化版本（1.0.0-alpha）
4. [ ] 自定义版本格式

### A5. 产品唯一标识符（GUID）
1. [ ] 由我自动生成
2. [ ] 使用我提供的 GUID

---
## B. 输出文件类型

### B1. 最终产出物类型（选择一项）
1. [ ] .exe 可执行文件
2. [ ] .dll 动态链接库
3. [ ] .lib 静态库
4. [ ] .sys 驱动文件
5. [ ] 同时生成 .exe + .dll（分离架构）
6. [ ] 同时生成 .exe + .lib（静态链接 SDK）
7. [ ] WASM 模块（WebAssembly）
8. [ ] 自定义

### B2. 如果生成 DLL，导出方式
1. [ ] __declspec(dllexport/dllimport) 宏
2. [ ] .def 模块定义文件
3. [ ] 同时使用两种方式
4. [ ] 不适用（非 DLL 项目）

### B3. 目标位数
1. [ ] x86（32位）
2. [ ] x64（64位）
3. [ ] ARM64（如 Surface Pro X）
4. [ ] 同时生成 x86 + x64
5. [ ] 同时生成 x86 + x64 + ARM64
6. [ ] WASM 32/64

---
## C. 构建系统与编译器

### C1. 构建系统（选择一项）
1. [ ] CMake — 现代 C++ 标准，推荐
2. [ ] MSBuild (.vcxproj/.sln) — Visual Studio 原生
3. [ ] Ninja — 高速增量构建
4. [ ] 同时生成 CMake + MSBuild（双构建系统）
5. [ ] Bazel — Google 构建系统，适合大型仓库
6. [ ] Meson — 简洁快速
7. [ ] 其他（请指定）

### C2. CMake 最小版本要求
1. [ ] 3.16（VS 2019 默认）
2. [ ] 3.22（VS 2022 默认）
3. [ ] 3.28（最新功能）
4. [ ] 自定义版本

### C3. CMake Presets 支持
1. [ ] 生成 CMakePresets.json（推荐现代工作流）
2. [ ] 不生成 Presets

### C4. 编译器/工具链（选择一项）
1. [ ] MSVC v143（VS 2022）— 推荐 Windows 原生
2. [ ] MSVC v142（VS 2019）— 兼容旧项目
3. [ ] Clang/LLVM 18+ — 跨平台兼容
4. [ ] MSVC + ClangCL — VS 内嵌 Clang 前端
5. [ ] MinGW/GCC 14 — 开源工具链
6. [ ] Intel C++ Compiler — 极限性能
7. [ ] NVIDIA HPC SDK — GPU/多核
8. [ ] ARM Compiler / GCC for embedded
9. [ ] Emscripten (WASM)
10. [ ] 其他

### C5. CRT 链接方式
1. [ ] 静态链接 (/MT /MTd) — 部署简单、体积大
2. [ ] 动态链接 (/MD /MDd) — 依赖 VC++ 运行库
3. [ ] 混合（Release 静态 / Debug 动态）

### C6. C++ 语言标准
1. [ ] C++17 — 稳定、广泛支持
2. [ ] C++20 — 模块、协程、概念、范围
3. [ ] C++23 — 最前沿、编译器支持有限
4. [ ] C++14 — 最大兼容性

### C7. C++ 模块（Modules）支持
1. [ ] 使用传统头文件 (.h)
2. [ ] 使用 C++20 Modules (.ixx/.cppm)
3. [ ] 混合（公共 API 用模块、内部用头文件）

### C8. 预编译头文件
1. [ ] 使用预编译头（pch.h / stdafx.h）
2. [ ] 不使用预编译头

### C9. 编译优化选项
1. [ ] /O2 — 最大优化（Release 默认）
2. [ ] /O1 — 最小体积
3. [ ] /Ox — 极致优化（可能增加体积）
4. [ ] /Od — 禁用优化（Debug）
5. [ ] LTCG（链接时代码生成）

### C10. 代码生成指令集
1. [ ] 通用（/arch:IA32）
2. [ ] SSE2（默认）
3. [ ] AVX2
4. [ ] AVX-512
5. [ ] 自动检测运行时 CPU 特性（动态分发）

### C11. 跨平台构建补充
1. [ ] 生成包含 Windows/Linux/macOS 的 CMakePresets.json
2. [ ] 自动生成平台检测宏（WIN32, __linux__, __APPLE__）和 platform.h
3. [ ] 提供跨平台文件系统/线程/动态库加载抽象层
4. [ ] 不使用跨平台构建

### C12. 高级优化与浮点行为
1. [ ] 开启 fast math（-ffast-math 或 /fp:fast）
2. [ ] 严格浮点模型（/fp:strict）
3. [ ] 生成 PGO 脚本（配置文件引导优化）
4. [ ] 生成性能基准测试项目（Google Benchmark）
5. [ ] 不启用额外优化

### C13. 第三方库集成方式
1. [ ] 所有库通过包管理器源码编译（vcpkg/Conan）
2. [ ] 部分使用预编译二进制（需指定路径）
3. [ ] 所有第三方库静态链接进最终产物，消除外部 DLL 依赖
4. [ ] 动态链接运行时库（按 C5 选择）

### C14. 安全编译选项
1. [ ] 启用 Control Flow Guard (/guard:cf)
2. [ ] 启用 Spectre 缓解 (/Qspectre)
3. [ ] 强制地址空间布局随机化 (/DYNAMICBASE)
4. [ ] 启用签名证书自动注入（生成后脚本）
5. [ ] 不需要特殊安全选项

### C15. 并行编译与加速
1. [ ] 使用 ccache / sccache
2. [ ] 启用 unity builds（统一构建）
3. [ ] 使用 distcc / icecream 分布式编译
4. [ ] 不需要

---
## D. 图形界面（UI）

### D1. 界面框架（选择一项）
1. [ ] 无界面 — 控制台程序 / 后台服务
2. [ ] Win32 API (WinMain + WindowProc) — 最轻量原生
3. [ ] MFC — 经典 Windows 桌面应用框架
4. [ ] Qt 6（Widgets）— 跨平台 GUI
5. [ ] Qt 6（QML）— 现代声明式 UI
6. [ ] WTL — ATL 扩展、轻量级窗口封装
7. [ ] WinUI 3 / Windows App SDK — 最新原生 Fluent 设计
8. [ ] ImGui — 即时模式 GUI，适合工具/调试面板
9. [ ] wxWidgets — 另一个跨平台选项
10. [ ] CEF (Chromium Embedded) — 内嵌浏览器
11. [ ] Sciter — 轻量嵌入 HTML/CSS UI
12. [ ] Slint — 声明式 UI，嵌入式友好
13. [ ] NoesisGUI — 矢量 UI 中间件，游戏/引擎集成
14. [ ] RmlUi — 基于 HTML/CSS 的轻量 UI
15. [ ] 自定义界面框架
16. [ ] Web 前端 + 本地 C++ 后端（通过 HTTP/WebSocket 通信）
17. [ ] Electron 混合 C++ 扩展（Node.js addon / 子进程）

### D2. 主窗口布局
1. [ ] 单文档界面（SDI）— 一个主窗口
2. [ ] 多文档界面（MDI）— 子窗口嵌套
3. [ ] 选项卡式（Tabbed）— 类似浏览器
4. [ ] 无边框自定义窗口（Frameless）— 现代设计
5. [ ] 对话框基础（Dialog-based）— 简单工具
6. [ ] Ribbon 风格（Office 风格功能区）
7. [ ] 混合布局（可停靠面板 + 多视图，如 VS Code）
8. [ ] 网页嵌套布局（CEF/WebView2 作为主视图，C++ 控制周边界面）
9. [ ] 3D 视口独占（全屏游戏/仿真）
10. [ ] 自适应多窗口（不同功能独立窗口，进程内管理）

### D3. 主窗口尺寸
1. [ ] 固定尺寸（请指定宽度x高度）
2. [ ] 可调整大小（有最小/最大限制）
3. [ ] 全屏/最大化启动
4. [ ] 记住上次窗口位置和大小

### D4. 窗口外观
1. [ ] 系统默认标题栏 + 边框
2. [ ] 自定义标题栏（有最小/最大/关闭按钮）
3. [ ] 圆角窗口（Win11 风格）
4. [ ] 透明/毛玻璃效果（Win7 Aero / Win11 Mica）
5. [ ] 深色模式支持
6. [ ] 浅色模式支持
7. [ ] 跟随系统主题（深色/浅色自动切换）

### D5. 界面语言
1. [ ] 仅中文
2. [ ] 仅英文
3. [ ] 中文 + 英文（运行时切换）
4. [ ] 多国语言（中/英/日/韩/法/德等）
5. [ ] 跟随系统区域设置

### D6. 国际化机制
1. [ ] 字符串表（.rc 文件 STRINGTABLE）
2. [ ] Qt .ts / .qm 文件
3. [ ] gettext .po / .mo 文件
4. [ ] JSON 语言文件
5. [ ] 自定义格式

### D7. 主界面包含的控件（可多选）
1. [ ] 菜单栏
2. [ ] 工具栏
3. [ ] 状态栏
4. [ ] 树形视图（TreeView）
5. [ ] 列表视图（ListView / TableView）
6. [ ] 属性表格（PropertyGrid）
7. [ ] 富文本编辑框（RichEdit / Scintilla）
8. [ ] 标签页（Tab Control）
9. [ ] 侧边面板（DockPanel）
10. [ ] 分割面板（Splitter）
11. [ ] 进度条 + 状态提示
12. [ ] 搜索框
13. [ ] Ribbon 控件
14. [ ] 自定义控件（请描述）

### D8. 图标与资源
1. [ ] 使用默认占位图标
2. [ ] 提供自定义 .ico 文件路径
3. [ ] 无图标

### D9. 启动画面
1. [ ] 无启动画面
2. [ ] 简单文本加载画面
3. [ ] 图片启动画面（Splash Screen）
4. [ ] 带动画的启动画面（如 Office 风格）
5. [ ] 进度条启动画面

### D10. 自定义渲染后端（当 UI 涉及自绘时）
1. [ ] Direct2D + DirectWrite
2. [ ] OpenGL 3.3+
3. [ ] Vulkan
4. [ ] DirectX 12
5. [ ] DirectX 11
6. [ ] Skia (CPU 或 GPU 后端)
7. [ ] 软件渲染（GDI/GDI+）
8. [ ] 无自定义渲染

### D11. 高刷新率与游戏循环
1. [ ] 标准 Windows 消息循环
2. [ ] 可变帧率游戏循环（固定逻辑步长、可变渲染）
3. [ ] 需要垂直同步控制（V-Sync）
4. [ ] 多显示器混合 DPI 感知（Per-Monitor V2）
5. [ ] 不需要特殊刷新机制

### D12. 自绘控件/编辑器需求
1. [ ] 语法高亮代码编辑器（集成 Scintilla 或自研）
2. [ ] 波形图 / 频谱可视化
3. [ ] 3D 模型视图（嵌入 OpenGL/D3D 窗口）
4. [ ] 图像查看器（缩放/平移/ROI 选取）
5. [ ] 完全自定义控件库（不继承系统公共控件）
6. [ ] 表格/数据网格高级编辑
7. [ ] 无特殊控件
8. [ ] 十六进制编辑器视图（Hex Viewer）
9. [ ] 正则表达式可视化构建器

### D13. 辅助功能与触控
1. [ ] 支持 UI Automation（辅助工具/自动化测试）
2. [ ] 支持触控/笔输入（WM_POINTER）
3. [ ] 高对比度/无障碍主题
4. [ ] 不需要

---
## E. 依赖库与第三方组件

### E1. 包管理器（选择一项）
1. [ ] vcpkg — Microsoft 官方推荐
2. [ ] Conan — 去中心化 C++ 包管理
3. [ ] NuGet — .NET 生态 C++ 包
4. [ ] Hunter — 基于 CMake 的包管理器
5. [ ] CPM.cmake — 轻量级 CMake 依赖管理
6. [ ] 手动管理依赖（Git Submodule）
7. [ ] 手动管理依赖（直接放仓库）
8. [ ] 不使用外部包管理器

### E2. vcpkg 清单模式
1. [ ] 生成 vcpkg.json 清单文件
2. [ ] 不生成（手动安装）

### E3. 需要集成的库（可多选）
1. [ ] Boost（请指定组件，如 asio/filesystem/json）
2. [ ] OpenCV — 计算机视觉
3. [ ] OpenSSL — 加密与网络通信
4. [ ] libcurl — HTTP 请求
5. [ ] nlohmann/json — JSON 解析
6. [ ] yaml-cpp — YAML 解析
7. [ ] spdlog — 高性能日志
8. [ ] fmt — 格式化字符串
9. [ ] catch2 / doctest — 测试框架
10. [ ] DirectX 11/12 — 图形渲染
11. [ ] Vulkan — 跨平台图形
12. [ ] FFmpeg — 音视频编解码
13. [ ] Skia — 2D 图形渲染引擎
14. [ ] Direct2D — Windows 2D 图形
15. [ ] WebRTC — 实时音视频通信
16. [ ] poco — 网络/工具库
17. [ ] abseil — Google 基础库
18. [ ] protobuf — 数据序列化
19. [ ] gRPC — RPC 通信
20. [ ] SQLiteCpp / sqlpp11 — SQLite 封装
21. [ ] Qt 模块（请指定 Core/Network/WebEngine 等）
22. [ ] libsodium — 现代密码学
23. [ ] mimalloc / jemalloc — 自定义内存分配器
24. [ ] Tracy / Optick — 实时性能追踪
25. [ ] OpenTelemetry C++ — 可观测性
26. [ ] Sentry / Crashpad — 错误报告与崩溃收集
27. [ ] 其他（请列出需要的库）
28. [ ] 暂无第三方依赖

### E4. 行业专用库（根据 X7 领域自动推荐，也可手动选择）
1. [ ] ITK — 医学图像分割与配准
2. [ ] VTK — 科学可视化（可结合 Qt）
3. [ ] DCMTK — DICOM 协议支持
4. [ ] Open3D — 3D 数据处理
5. [ ] CGAL — 计算几何算法库
6. [ ] PCL — 点云库
7. [ ] OpenMesh — 网格处理
8. [ ] GDAL — 地理空间数据抽象库
9. [ ] PROJ — 地图投影
10. [ ] Bullet Physics / PhysX — 物理引擎
11. [ ] Unreal Engine / Godot / Unity Native — 作为游戏引擎插件开发
12. [ ] OPC UA 库（open62541 或 commercial）
13. [ ] Modbus 库（libmodbus）
14. [ ] CAN 通信库（SocketCAN / Kvaser）
15. [ ] MQTT 客户端（paho.mqtt.cpp）
16. [ ] ZeroMQ / nanomsg — 高性能消息队列
17. [ ] gRPC / Apache Thrift — 跨语言 RPC
18. [ ] Intel oneAPI / TBB — 并行计算
19. [ ] OpenMP — 多线程并行
20. [ ] FFTW — 快速傅里叶变换
21. [ ] Eigen / Armadillo — 线性代数
22. [ ] libtorch / ONNX Runtime — 深度学习推理
23. [ ] OpenXR — VR/AR 运行时
24. [ ] JUCE — 音频应用与插件框架
25. [ ] ASIO SDK — 低延迟音频
26. [ ] VST3 SDK — 音频插件标准
27. [ ] PortAudio / RtAudio — 跨平台音频 I/O
28. [ ] libusb — 通用 USB 设备访问
29. [ ] TWAIN / WIA — 扫描仪/相机采集
30. [ ] LLVM / Clang — 编译器基础设施
31. [ ] Frida — 动态插桩
32. [ ] Capstone / Zydis — 反汇编
33. [ ] Tesseract / Leptonica — OCR 引擎
34. [ ] PrusaSlicer / libnest2d — 3D 打印切片与支撑库
35. [ ] 其他（请指定）
36. [ ] 不涉及行业专用库

---
## F. 数据库与存储

### F1. 是否需要数据库
1. [ ] 不需要数据库
2. [ ] 嵌入式数据库
3. [ ] 客户端-服务器数据库
4. [ ] 云数据库
5. [ ] 内存数据库（如 Redis）

### F2. 数据库引擎（选择一项）
1. [ ] SQLite — 嵌入式、零配置、自包含
2. [ ] Microsoft SQL Server（本地或 Express）
3. [ ] MySQL / MariaDB
4. [ ] PostgreSQL
5. [ ] DuckDB — 嵌入式分析型数据库
6. [ ] MongoDB（通过 C++ driver）
7. [ ] SQLite + SQL Server 混合（本地+服务器）
8. [ ] 其他（请指定）

### F3. 数据库连接方式
1. [ ] ODBC — 通用接口
2. [ ] OLE DB — 微软 COM 方式
3. [ ] ADO — 高层 ActiveX 封装
4. [ ] Qt SQL — Qt 封装层
5. [ ] SQLite3 C API — 直接嵌入
6. [ ] 原生驱动（请指定）

### F4. 数据库默认连接参数
- 主机地址：______
- 端口：______（默认 SQLite 不适用）
- 数据库名称：______
- 用户名：______
- 密码：______（将在生成时写入 .env / config 文件）
- 连接字符串格式：______（如未指定则使用默认格式）

### F5. 数据库配置文件存放位置
1. [ ] 与 exe 同目录的 config.ini
2. [ ] %APPDATA%//项目名称//config.json
3. [ ] 注册表 HKEY_CURRENT_USER
4. [ ] 环境变量
5. [ ] 编译时硬编码（不推荐）
6. [ ] 跨平台路径（Windows: %APPDATA%/项目名/config.json；Linux: ~/.config/项目名/config.json；macOS: ~/Library/Application Support/项目名/config.json）— 自动适配

### F6. 数据库初始化脚本
1. [ ] 需要生成建表 SQL 模板
2. [ ] 需要生成初始数据 SQL 模板
3. [ ] 不需要初始化脚本

### F7. 数据持久化方式（非数据库场景）
1. [ ] JSON 文件
2. [ ] XML 文件
3. [ ] INI 文件
4. [ ] 二进制序列化文件
5. [ ] 注册表
6. [ ] 不使用持久化（纯内存程序）

### F8. 数据加密与完整性
1. [ ] 存储文件透明加密（AES-256-GCM 等）
2. [ ] 数据库字段加密（如 SQLite SQLCipher 扩展）
3. [ ] 校验和/数字签名防篡改
4. [ ] 不需要数据加密

---
## G. 网络与通信

### G1. 网络通信需求
1. [ ] 不需要网络功能
2. [ ] HTTP/HTTPS 客户端
3. [ ] HTTP/HTTPS 服务端
4. [ ] WebSocket 客户端
5. [ ] TCP Socket 通信
6. [ ] UDP 通信
7. [ ] REST API 封装
8. [ ] gRPC
9. [ ] Named Pipe（进程间通信）
10. [ ] Windows 消息队列（MSMQ）

### G2. HTTP 库选择
1. [ ] WinHTTP — Windows 原生，适合服务端/后台
2. [ ] WinINet — 适合桌面客户端（需要 IE 设置）
3. [ ] libcurl — 跨平台，功能全面
4. [ ] cpprestsdk (Casablanca) — 异步 C++ REST
5. [ ] Boost.Beast — 底层 HTTP/WebSocket
6. [ ] Qt Network — Qt 集成
7. [ ] Drogon — 高性能 C++ Web 框架
8. [ ] Seastar — 异步高并发框架

### G3. 是否需要 REST API 客户端封装
1. [ ] 需要（生成 API 客户端类）
2. [ ] 不需要

### G4. 身份认证方式
1. [ ] 不需要认证
2. [ ] Basic Auth（用户名+密码）
3. [ ] Bearer Token / JWT
4. [ ] OAuth 2.0
5. [ ] Windows 集成认证（NTLM/Kerberos）
6. [ ] mTLS（客户端证书）

### G5. 高级网络安全与协议
1. [ ] mTLS 双向认证（提供 CA 证书）
2. [ ] SSH 隧道 / SOCKS5 代理支持
3. [ ] 自定义 TCP 协议（长度前缀 + CRC 校验）
4. [ ] HTTP/2 或 HTTP/3 (QUIC) 支持
5. [ ] 模拟浏览器 TLS 指纹 (JA3)
6. [ ] 不需要高级安全特性

### G6. 其他常用网络协议（可多选）
1. [ ] FTP / FTPS 客户端
2. [ ] SMTP / POP3 邮件发送
3. [ ] MQTT / CoAP（IoT 协议）
4. [ ] Modbus TCP / RTU
5. [ ] OPC UA 客户端/服务器
6. [ ] DDS（数据分发服务，实时系统）
7. [ ] Redis 客户端（如 hiredis）
8. [ ] RTMP / RTSP / SRT — 流媒体协议
9. [ ] ONVIF (IP 摄像头标准)
10. [ ] 其他（请指定）
11. [ ] 不需要

---
## H. 多线程与并发

### H1. 并发需求
1. [ ] 单线程（不需要并发）
2. [ ] 多线程任务队列
3. [ ] 线程池
4. [ ] 生产者-消费者模式
5. [ ] 并行计算（数据并行）

### H2. 并发模型
1. [ ] std::thread — C++ 标准线程
2. [ ] std::jthread — C++20 可中断线程
3. [ ] Windows Thread Pool API
4. [ ] Concurrency Runtime (ConcRT)
5. [ ] PPL (Parallel Patterns Library)
6. [ ] Intel TBB
7. [ ] Boost.Thread
8. [ ] Qt Concurrent
9. [ ] C++20 协程（std::coroutine）
10. [ ] HPX — 异步、分布式并行运行时
11. [ ] OpenCL / SYCL — 异构并行

### H3. 同步原语
1. [ ] std::mutex / std::lock_guard — 标准互斥
2. [ ] std::shared_mutex — 读写锁
3. [ ] Windows CRITICAL_SECTION — 轻量临界区
4. [ ] Windows SRWLOCK — 读写锁
5. [ ] std::atomic — 无锁原子操作
6. [ ] 消息队列异步模型
7. [ ] 信号量 / 条件变量

### H4. 自定义内存分配器
1. [ ] 使用 mimalloc
2. [ ] 使用 jemalloc
3. [ ] 使用 tcmalloc
4. [ ] 使用系统默认

---
## I. 日志与诊断

### I1. 日志框架
1. [ ] spdlog — 现代 C++ 高性能日志（推荐）
2. [ ] 自定义日志（写文件）
3. [ ] Windows Event Log（Event Tracing）
4. [ ] OutputDebugString（仅调试）
5. [ ] Qt 日志框架（qDebug/qInfo）
6. [ ] 不需要日志

### I2. 日志级别
1. [ ] trace / debug / info / warn / error / critical（完整）
2. [ ] info / warn / error（精简）
3. [ ] 自定义级别

### I3. 日志输出目标
1. [ ] 文件（按天/大小自动轮替）
2. [ ] 控制台
3. [ ] 调试器（OutputDebugString）
4. [ ] 远程日志服务器
5. [ ] Sentry / 错误收集服务
6. [ ] 组合（文件 + 控制台）

### I4. 日志文件位置
1. [ ] 与 exe 同目录
2. [ ] %APPDATA%//项目名称//logs/
3. [ ] %TEMP%//项目名称//
4. [ ] 自定义路径

### I5. 是否需要性能分析（Profiling）
1. [ ] 需要（集成 Tracy / Optick / ETW）
2. [ ] 不需要

### I6. 可观测性集成
1. [ ] OpenTelemetry C++ (traces, metrics, logs)
2. [ ] 暴露 Prometheus 指标
3. [ ] 自定义遥测
4. [ ] 不需要

---
## J. 测试

### J1. 测试框架
1. [ ] Google Test + Google Mock（推荐）
2. [ ] Catch2
3. [ ] doctest — 轻量单头文件
4. [ ] Microsoft C++ Unit Test 框架
5. [ ] Boost.Test
6. [ ] 不需要测试框架

### J2. 测试类型
1. [ ] 单元测试（白色盒）
2. [ ] 集成测试
3. [ ] 功能测试（黑色盒）
4. [ ] 压力/性能测试
5. [ ] 模糊测试（libFuzzer / AFL++）
6. [ ] UI 自动化测试（Squish / Appium / WinAppDriver）
7. [ ] 全部三种

### J3. 代码覆盖率工具
1. [ ] OpenCppCoverage
2. [ ] Visual Studio 内置覆盖率
3. [ ] 不需要覆盖率

### J4. 测试报告与 CI 集成
1. [ ] 生成 JUnit XML 报告
2. [ ] 集成 SonarQube 分析
3. [ ] 不需要

---
## K. 打包与分发

### K1. 安装包格式（选择一项）
1. [ ] 无需安装包（绿色免安装，zip 分发）
2. [ ] MSI（WiX Toolset）— Windows Installer 标准
3. [ ] NSIS — 轻量、广泛使用
4. [ ] Inno Setup — 功能强大的免费安装工具
5. [ ] MSIX — 现代 Windows 打包格式（商店分发）
6. [ ] AppX — 商店应用包
7. [ ] Squirrel.Windows — 自动更新友好
8. [ ] Snap / Flatpak (Linux)
9. [ ] DMG (macOS)
10. [ ] 其他（请指定）

### K2. 安装包详细信息
- 公司名称：______
- 公司网站：______
- 版权信息：______
- 安装目录默认路径：______（默认 Program Files//公司//项目）
- 开始菜单文件夹名称：______

### K3. 是否需要数字签名
1. [ ] 需要（请提供 .pfx/.p12 证书路径或使用 Azure Key Vault）
2. [ ] 暂不需要，但生成签名占位脚本
3. [ ] 不需要签名

### K4. 自动更新机制
1. [ ] 不需要自动更新
2. [ ] 检查 GitHub Releases 版本
3. [ ] 自建更新服务器（HTTP 检查）
4. [ ] Squirrel 自动更新
5. [ ] Microsoft Store 分发（系统自带更新）
6. [ ] 增量更新 (差分补丁)

### K5. 安装额外操作
1. [ ] 创建桌面快捷方式
2. [ ] 创建快速启动快捷方式
3. [ ] 注册文件关联（请指定扩展名）
4. [ ] 安装 VC++ 运行库（如果使用 /MD）
5. [ ] 添加到系统 PATH
6. [ ] 注册 Windows 服务

---
## L. 版本控制与 CI/CD

### L1. 是否推送到 Git 仓库
1. [ ] 自动初始化 Git 仓库
2. [ ] 同时推送到 GitHub/GitLab
3. [ ] 不初始化 Git

### L2. GitHub 远程仓库
- 仓库地址（如 https://github.com/用户名/项目名.git）：______
- 默认分支名：______（默认 main）

### L3. .gitignore 模板
1. [ ] 生成 Visual Studio C++ 专用 .gitignore
2. [ ] 生成 CMake 通用 .gitignore
3. [ ] 自定义 .gitignore

### L4. CI/CD 平台（可多选）
1. [ ] GitHub Actions
2. [ ] Azure Pipelines
3. [ ] GitLab CI
4. [ ] CircleCI
5. [ ] Jenkinsfile
6. [ ] AppVeyor
7. [ ] 不需要 CI/CD

### L5. CI 中包含的步骤（可多选）
1. [ ] 编译 Debug + Release
2. [ ] 运行单元测试
3. [ ] 代码静态分析（cppcheck / VS Analyze / clang-tidy）
4. [ ] 生成安装包
5. [ ] 代码签名
6. [ ] 发布到 GitHub Releases
7. [ ] 代码覆盖率报告
8. [ ] 内存泄漏检查（Valgrind / Dr. Memory）
9. [ ] 构建 Docker 镜像
10. [ ] 性能基准测试对比

### L6. 预提交钩子
1. [ ] 需要（pre-commit + clang-format）
2. [ ] 不需要

### L7. 许可证
1. [ ] MIT
2. [ ] Apache 2.0
3. [ ] GPL v3
4. [ ] LGPL
5. [ ] 专有/自定义
6. [ ] 暂不设定

---
## M. 项目结构与文件生成

### M1. 目录结构偏好
1. [ ] 标准 CMake 布局（src/include/test 分离）
2. [ ] 扁平布局（所有源文件在根目录）
3. [ ] 按模块分层（module1/src/ module2/src/）
4. [ ] 自定义布局（请说明）
5. [ ] 遵循 GNUInstallDirs 标准（CMAKE_INSTALL_PREFIX 下 bin/、lib/、share/、include/ 等）

### M2. 需要生成的源码骨架
1. [ ] main.cpp / main入口
2. [ ] 核心业务类（请说明类名和职责）
3. [ ] 配置文件读/写类
4. [ ] 日志封装类
5. [ ] 数据库封装类（Repository 模式）
6. [ ] 网络服务封装类
7. [ ] 异常体系（自定义异常类层次）
8. [ ] 通用的工具函数集合（String/File/Time utils）
9. [ ] 单元测试占位（每个模块对应测试文件）
10. [ ] 全部生成

### M3. 是否需要从开源项目获取灵感
1. [ ] 需要（请提供参考项目地址/名称）
2. [ ] 不需要，从头开始设计

### M4. 平台抽象层（跨平台项目自动触发）
1. [ ] 生成文件系统封装（基于 std::filesystem 或 ghc::filesystem）
2. [ ] 生成动态库加载封装（LoadLibrary/dlopen 统一）
3. [ ] 生成线程/同步原语统一头文件
4. [ ] 生成系统信息获取（CPU 核心数、内存、OS 版本）
5. [ ] 根据 X1 选择自动决定

### M5. 多语言绑定需求
1. [ ] 生成纯 C API 包装（用于 C#/Python/Rust 调用）
2. [ ] 生成 SWIG 接口文件
3. [ ] 生成 C++/CLI 桥接层（供 .NET 使用）
4. [ ] 不需要语言绑定

### M6. 测试策略细化
1. [ ] 生成基准测试（性能回归）
2. [ ] 生成模糊测试 harness (libFuzzer)
3. [ ] 集成内存泄漏检测配置（VLD / Dr.Memory）
4. [ ] 不需要额外测试策略

### M7. 文档生成
1. [ ] 生成 Doxygen 配置
2. [ ] 生成 ARCHITECTURE.md 架构图（Mermaid）
3. [ ] 不需要

---
## N. 高级选项

### N1. 是否需要插件/扩展系统
1. [ ] 需要（DLL 插件架构 + 插件发现机制）
2. [ ] 暂不需要

### N2. 是否需要脚本引擎嵌入
1. [ ] 嵌入 Lua（sol2/lua.hpp）
2. [ ] 嵌入 Python（pybind11）
3. [ ] 嵌入 JavaScript（QuickJS/Duktape）
4. [ ] 嵌入 V8（完整 JS 引擎，约 30MB）
5. [ ] 不需要脚本引擎

### N3. 是否需要热更新/热重载
1. [ ] 需要（DLL 热重载机制）
2. [ ] 不需要

### N4. 背景图/外观
1. [ ] 纯色背景
2. [ ] 渐变背景
3. [ ] 静态图片背景（请说明图片内容）
4. [ ] 动态/视差背景
5. [ ] 不需要特殊背景

### N5. 字符编码策略
1. [ ] UTF-8 everywhere（推荐，跨平台友好）
2. [ ] UTF-16（Windows 原生，所有字符串 WCHAR）
3. [ ] 混合（外部 UTF-8，内部 UTF-16）

### N6. 代码风格
1. [ ] Microsoft 风格（Allman 大括号、大驼峰）
2. [ ] Google 风格（BSD 大括号、下划线命名）
3. [ ] LLVM 风格
4. [ ] Qt 风格
5. [ ] 自定义（请说明 clang-format 配置偏好）

### N7. 是否生成配置文件
1. [ ] 生成 .clang-format
2. [ ] 生成 .editorconfig
3. [ ] 都生成
4. [ ] 都不生成

## O. 逆向工程与分析工具

### O1. 内存操作需求
1. [ ] 读写外部进程内存（ReadProcessMemory/WriteProcessMemory）
2. [ ] 内核模式内存访问（驱动）
3. [ ] 内存模式扫描（AOB Scan / 签名查找）
4. [ ] 生成代码注入/补丁框架
5. [ ] 不需要内存操作

### O2. 反汇编/调试集成
1. [ ] 集成反汇编引擎（Capstone / Zydis / udis86）
2. [ ] 集成汇编引擎（Keystone / AsmJit）
3. [ ] 调试器接口（Windows Debug Engine / 自定义调试循环）
4. [ ] Hook 库封装（Detours / MinHook / VTable / IAT hook）
5. [ ] 不需要

### O3. 插件/扩展架构
1. [ ] 纯 C 接口插件（函数表导出）
2. [ ] COM 接口插件（类型库）
3. [ ] 脚本扩展（Lua/Python 绑定）
4. [ ] 插件热加载/卸载管理
5. [ ] 插件市场/更新器基础架构
6. [ ] 不需要插件系统

### O4. 文件格式解析
1. [ ] PE/ELF/Mach-O 解析器
2. [ ] 自定义二进制格式读写
3. [ ] 加密/压缩容器（ZIP/自定义包）
4. [ ] 不需要

### O5. 动态插桩与沙箱
1. [ ] 集成 Frida C API
2. [ ] 自定义代码虚拟机
3. [ ] 不需要

## P. 实时处理与 AI 流水线

### P1. 图像/视频输入源
1. [ ] 静态图片文件
2. [ ] 本地摄像头（DirectShow / Media Foundation / V4L2）
3. [ ] 网络相机（RTSP / GigE Vision / USB3 Vision）
4. [ ] 屏幕捕获（Desktop Duplication / DXGI Output）
5. [ ] 自定义帧源（回调接口）
6. [ ] 无图像输入

### P2. 处理管线拓扑
1. [ ] 单帧顺序处理
2. [ ] 多线程流水线（采集→预处理→推理→后处理→显示）
3. [ ] GPU 零拷贝管线（共享纹理/缓冲区）
4. [ ] 帧缓冲池管理（Ring Buffer）
5. [ ] 不需要管线

### P3. AI 推理引擎
1. [ ] ONNX Runtime（CPU / DirectML / CUDA / TensorRT）
2. [ ] OpenVINO
3. [ ] TensorRT
4. [ ] LibTorch (C++ PyTorch)
5. [ ] Mediapipe
6. [ ] Apache TVM
7. [ ] TensorFlow Lite (Micro)
8. [ ] 自定义推理框架（加载私有模型格式）
9. [ ] 不需要 AI 推理

### P4. 图像处理加速库
1. [ ] OpenCV（可指定是否含 CUDA/OpenCL）
2. [ ] Halide
3. [ ] NPP (NVIDIA Performance Primitives)
4. [ ] Intel IPP
5. [ ] 自研 SIMD 优化滤波
6. [ ] Tesseract OCR
7. [ ] 不需要

### P5. 模型与权重管理
1. [ ] 模型嵌入资源（.rc）
2. [ ] 从云端下载并缓存
3. [ ] 支持模型热更新（文件监控）
4. [ ] 不需要

## Q. 科学计算与可视化

### Q1. 科学数据格式支持
1. [ ] DICOM（医学影像）
2. [ ] NIfTI（神经影像）
3. [ ] HDF5（通用科学数据）
4. [ ] NetCDF（气候/海洋数据）
5. [ ] STL / OBJ / PLY（3D 网格）
6. [ ] LAS / LAZ（点云）
7. [ ] GeoTIFF（地理空间栅格）
8. [ ] Parquet / Avro（大数据列式存储）
9. [ ] 3MF（3D 制造格式）
10. [ ] AMF（增材制造格式）
11. [ ] 自定义格式
12. [ ] 不需要

### Q2. 可视化需求
1. [ ] 2D 图表（如 Qt Charts、matplotlibcpp）
2. [ ] 3D 体渲染（VTK / 自研光线投射）
3. [ ] 切片视图（医学影像三视图）
4. [ ] 点云渲染（PCL Visualizer 或 Open3D）
5. [ ] 有限元网格显示（基于 VTK 或自研）
6. [ ] GIS 地图叠加（GDAL + OpenGL/Qt）
7. [ ] 实时信号波形（示波器风格）
8. [ ] 不需要科学可视化

### Q3. 数值计算库
1. [ ] Eigen — 线性代数
2. [ ] Armadillo — 类似 Matlab 的 C++ 库
3. [ ] GSL — GNU Scientific Library
4. [ ] FFTW — 快速傅里叶变换
5. [ ] IPP（Intel）— 信号/图像处理
6. [ ] CUDA / OpenCL — GPU 加速数值计算
7. [ ] Trilinos / PETSc — 大规模并行科学计算
8. [ ] 不需要

## R. 安全与加固

### R1. 代码保护需求
1. [ ] 代码混淆（OLLVM / 商业混淆器）
2. [ ] 反调试检测（IsDebuggerPresent / TLS 回调）
3. [ ] 完整性校验（CRC/SHA 防篡改）
4. [ ] 字符串加密（编译时混淆）
5. [ ] 虚拟化保护（如 Themida/VMP，需商业授权）
6. [ ] 不需要代码保护

### R2. 许可与激活
1. [ ] 本地 License 文件校验（RSA/AES）
2. [ ] 在线激活服务器
3. [ ] 硬件绑定（机器指纹）
4. [ ] 试用期限制（时间/功能）
5. [ ] 不需要许可管理

## S. 音频与多媒体制作

### S1. 音频功能类型
1. [ ] 音频播放/录制
2. [ ] 实时音频效果处理（EQ/混响）
3. [ ] 虚拟乐器/合成器
4. [ ] 音频插件格式（VST3 / AU / AAX）
5. [ ] 音频分析（FFT/频谱图）
6. [ ] MIDI 输入/输出
7. [ ] 不需要音频

### S2. 音频框架与 SDK
1. [ ] JUCE — 全面音频/插件开发框架
2. [ ] ASIO SDK — 低延迟音频驱动
3. [ ] PortAudio + RtAudio — 跨平台 I/O
4. [ ] VST3 SDK — Steinberg 音频插件
5. [ ] FMOD / Wwise — 游戏音频中间件
6. [ ] 自研音频引擎

### S3. 音频设备
1. [ ] 系统默认音频设备
2. [ ] ASIO 专业声卡
3. [ ] WASAPI 独占模式 (Windows)
4. [ ] 多通道 I/O 支持

## T. XR 与空间计算

### T1. XR 平台
1. [ ] OpenXR (跨平台 VR/AR 标准)
2. [ ] SteamVR (HTC Vive, Valve Index 等)
3. [ ] Oculus SDK (Meta Quest)
4. [ ] Microsoft HoloLens / Windows Mixed Reality
5. [ ] AR Core / ARKit (通过跨平台封装)
6. [ ] 不需要 XR

### T2. 渲染后端 (VR)
1. [ ] DirectX 11/12
2. [ ] Vulkan
3. [ ] OpenGL
4. [ ] 使用引擎内置 (Unreal/Unity)

### T3. 交互与输入
1. [ ] 6DOF 手柄追踪
2. [ ] 手部追踪 / 手势识别
3. [ ] 眼动追踪
4. [ ] 空间锚点/场景理解

## U. 外设与映像设备

### U1. 打印机/扫描仪功能
1. [ ] Windows 打印驱动 (v4 打印驱动)
2. [ ] 打印机语言支持 (PCL/PostScript/ZPL)
3. [ ] TWAIN 扫描仪采集
4. [ ] WIA (Windows Image Acquisition)
5. [ ] 不需要

### U2. 其他映像设备
1. [ ] 数码相机控制 (通过厂商 SDK 或 MTP)
2. [ ] 文档扫描仪/送纸器
3. [ ] 条码/二维码扫描枪

## V. 编译器与开发工具

### V1. 语言/编译器开发
1. [ ] 自定义编程语言前端 (Lex/Yacc, ANTLR)
2. [ ] 基于 LLVM 的编译器后端
3. [ ] 代码转换/混淆器
4. [ ] 静态代码分析工具
5. [ ] LSP 服务器 (语言服务器协议)
6. [ ] 不需要

### V2. 相关库
1. [ ] LLVM C++ API
2. [ ] Clang Tooling (LibTooling)
3. [ ] ANTLR4 C++ runtime
4. [ ] Tree-sitter
5. [ ] Keystone / AsmJit — 汇编引擎（可用于汇编 IDE）

## W. 嵌入式与物联网 OTA

### W1. 嵌入式平台特性
1. [ ] OTA 固件更新 (A/B 分区, 差分升级)
2. [ ] 安全启动与固件签名验证
3. [ ] 低功耗管理
4. [ ] 传感器数据采集与边缘计算
5. [ ] 不需要

### W2. 嵌入式通信协议
1. [ ] MQTT-SN / CoAP
2. [ ] BLE GATT
3. [ ] LoRaWAN
4. [ ] Matter / Thread
5. [ ] CAN / LIN

## Y. 密码学与区块链

### Y1. 密码学原语
1. [ ] AES/RSA 加密 (通过 libsodium/OpenSSL)
2. [ ] 哈希与 HMAC
3. [ ] 数字签名 (ECDSA/EdDSA)
4. [ ] 密钥派生 (PBKDF2/Argon2)
5. [ ] 安全随机数生成

### Y2. 区块链集成
1. [ ] 比特币/以太坊 RPC 客户端
2. [ ] 钱包密钥管理 (HD 钱包, BIP39)
3. [ ] 智能合约交互 (Ethereum, EOSIO)
4. [ ] 共识算法实现
5. [ ] 不需要区块链

## Z. 远程协作与控制

### Z1. 远程桌面/屏幕共享
1. [ ] 屏幕捕获与编码 (H.264/H.265)
2. [ ] 远程控制 (输入注入)
3. [ ] 文件传输
4. [ ] 聊天/白板叠加
5. [ ] 不需要

### Z2. 远程协议
1. [ ] 自定义协议
2. [ ] RDP 客户端 (FreeRDP)
3. [ ] VNC 客户端/服务器
4. [ ] WebRTC 数据通道

---
## AA. 错误处理与异常策略

### AA1. 错误处理范式（选择一项）
1. [ ] 使用 C++ 异常（try/catch）— 适合复杂逻辑，RAII 友好
2. [ ] 返回错误码（std::error_code / HRESULT）— 适合系统级接口
3. [ ] 使用 std::expected（C++23 或 tl::expected）— 现代函数式风格
4. [ ] 混合模式（内部异常，对外接口返回错误码）— 库/SDK 推荐
5. [ ] 使用断言 + 日志（仅调试，Release 优化掉）— 轻量工具

### AA2. 异常安全级别
1. [ ] 基本保证（对象状态一致，无资源泄漏）
2. [ ] 强保证（操作原子性，失败回滚）
3. [ ] 不抛出保证（nothrow 声明）
4. [ ] 不关心（允许崩溃）

### AA3. 错误码枚举自动生成
1. [ ] 需要（生成错误码头文件，含错误类别）
2. [ ] 不需要

---
## AB. 调试符号与发布配置

### AB1. 调试符号（PDB / debug info）策略
1. [ ] 生成完整 PDB（独立于 exe/dll，便于调试和崩溃分析）
2. [ ] 生成嵌入式 PDB（含在 exe/dll 内，增大体积）
3. [ ] 剥离符号（Release 不生成，仅留 MAP 文件）
4. [ ] 符号服务器集成（如 Microsoft Symbol Server 或自建）

### AB2. 符号文件分发
1. [ ] 随安装包一起分发（包含调试信息）
2. [ ] 单独存储（内部符号服务器或存档）
3. [ ] 不保留 Release 符号（只保留优化后的二进制）

### AB3. Release 配置额外选项
1. [ ] 启用 /GL（全程序优化）和 /LTCG
2. [ ] 生成调试信息（/Zi）但优化（/O2）并存（便于分析）
3. [ ] 禁用增强指令集以兼容低端 CPU
4. [ ] 使用增量链接（/INCREMENTAL）用于开发阶段

---
## AC. 构建产物输出结构

### AC1. 安装布局（CMAKE_INSTALL_PREFIX）
1. [ ] 遵循 GNUInstallDirs 标准（bin/、lib/、include/、share/、etc/）
2. [ ] 自定义布局（请指定各子目录名称）
3. [ ] 仅生成单个 exe，无额外目录

### AC2. 中间产物（build/ 目录）清理策略
1. [ ] 每次构建前清理（clean build）
2. [ ] 仅增量构建，保留中间对象
3. [ ] 生成独立构建目录（build/Release, build/Debug 分离）

---
## AD. 依赖合规与开源许可扫描

### AD1. 是否需要检查第三方库许可证兼容性
1. [ ] 需要，生成 vcpkg-analyze 或 Conan 许可证清单
2. [ ] 需要，生成 SPDX 合规声明（SBOM 物料清单）
3. [ ] 仅记录依赖列表，不进行合规分析
4. [ ] 不需要

### AD2. 如果发现许可证冲突（如 GPL 与闭源项目）
1. [ ] 自动警告并阻止生成
2. [ ] 建议替换为兼容库（如 LGPL/BSD/MIT）
3. [ ] 忽略，由开发者自行处理

---
## AE. ABI 稳定性（针对 SDK / 库项目）

### AE1. 是否对外导出 C++ API 并需要保持 ABI 兼容
1. [ ] 是，需保证二进制兼容（使用 pimpl 惯用法，版本宏控制导出符号）
2. [ ] 是，但仅保证源码兼容（API 不变，ABI 可破）
3. [ ] 否，导出 C 接口即可（ABI 稳定）
4. [ ] 不适用（非 SDK/库项目）

### AE2. 符号可见性控制
1. [ ] 使用 __declspec(dllexport/dllimport)（Windows）与 __attribute__((visibility("default")))（GCC/Clang）统一宏
2. [ ] 使用 .def 文件显式导出
3. [ ] 默认全部可见，手动隐藏内部符号

### AE3. 版本号宏定义
1. [ ] 生成 PROJECT_VERSION_MAJOR/MINOR/PATCH 宏，用于 API 版本检查
2. [ ] 生成 API_VERSION_STRING 供运行时查询

---
## AF. 系统服务生存周期管理（针对 Windows 服务 / Linux daemon）

### AF1. 服务控制逻辑
1. [ ] 生成 Windows Service 骨架（ServiceMain、HandlerEx、服务安装/卸载脚本）
2. [ ] 生成 Linux systemd 单元文件（.service 模板）
3. [ ] 两者都需要
4. [ ] 不适用（非服务项目）

### AF2. 服务启动类型
1. [ ] 自动启动（Automatic）
2. [ ] 手动启动（Manual）
3. [ ] 延迟自动启动（Automatic Delayed）

### AF3. 服务停止超时与优雅退出
1. [ ] 设置默认超时（如 30 秒），生成停止信号处理逻辑
2. [ ] 集成看门狗（Watchdog）检测服务无响应并自动重启
3. [ ] 不需要特殊处理

---
## AG. 容器化与编排（针对微服务 / B/S 架构）

### AG1. 是否生成 Docker 相关文件
1. [ ] 需要 Dockerfile（多阶段构建，优化镜像大小）
2. [ ] 需要 docker-compose.yml（含依赖服务如数据库、Redis）
3. [ ] 不需要容器化

### AG2. 容器基础镜像选择
1. [ ] Windows Server Core（适用于 Windows 容器）
2. [ ] Ubuntu（适用于 Linux 容器）
3. [ ] Alpine（轻量）
4. [ ] 自定义

### AG3. 容器编排工具
1. [ ] Kubernetes 部署模板（Deployment、Service、ConfigMap）
2. [ ] 仅 Docker Compose 即可
3. [ ] 不需要编排

---
## AH. 预构建脚本与开发环境初始化

### AH1. 是否需要生成环境初始化脚本
1. [ ] 是，生成 bootstrap.ps1（Windows）和 setup.sh（Linux/macOS），自动安装 vcpkg/Conan、配置环境变量
2. [ ] 是，生成 README 中的安装步骤，但无自动化脚本
3. [ ] 不需要

### AH2. 脚本包含的操作
1. [ ] 安装 CMake、Ninja 等构建工具
2. [ ] 安装 vcpkg 并执行 ./bootstrap-vcpkg
3. [ ] 安装 Conan 并配置远程仓库
4. [ ] 生成 IDE 工程文件（如 .sln）
5. [ ] 检查编译器版本并警告不兼容

---
## AI. 代码生成与元编译（元编程）

### AI1. 是否需要预编译代码生成工具
1. [ ] 需要 Protobuf（.proto → .pb.cc/.pb.h）
2. [ ] 需要 FlatBuffers（.fbs → 生成 C++ 头文件）
3. [ ] 需要 Qt 的 uic/moc/rcc（.ui → .h, .h → moc_*.cpp）
4. [ ] 需要 IDL 编译器（如 COM 类型库）
5. [ ] 需要自定义代码生成器（请指定）
6. [ ] 不需要

### AI2. CMake 生成规则
1. [ ] 配置 CMAKE_AUTOMOC / CMAKE_AUTOUIC / CMAKE_AUTORCC（Qt 项目）
2. [ ] 配置 Protobuf_GENERATE_CPP 宏
3. [ ] 配置 add_custom_command 生成自定义文件
4. [ ] 不使用自动生成

---
## AJ. 隐私合规与权限请求

### AJ1. 是否涉及用户隐私数据（摄像头、麦克风、屏幕、位置等）
1. [ ] 是，需要生成隐私提示弹窗和系统权限请求代码
2. [ ] 否

### AJ2. 隐私声明与用户授权
1. [ ] 生成首次启动时的隐私政策展示界面（含同意/拒绝）
2. [ ] 生成系统级权限请求（Windows 通过 winrt::Windows::System::UserProfile 或 Win32 请求）
3. [ ] 生成 GDPR/CCPA 合规的数据导出与删除接口（仅占位）
4. [ ] 不需要

### AJ3. 隐私数据存储策略
1. [ ] 本地加密存储（用户可删除）
2. [ ] 仅内存使用，不落盘
3. [ ] 上传云端（需明确告知用户）

---
## 第三步：生成确认摘要

收集所有答案后，展示汇总确认表，让用户确认。
═══════════════════════════════════════
Windows C++ 项目生成 - 确认摘要
═══════════════════════════════════════

[X] 场景：{目标OS} | 性质：{类型} | 架构：{CS/BS/单机} | 领域：{行业}
[A] 项目名：{名称} | 版本：{格式}
[B] 产出：{exe/dll/lib} | 位数：{x86/x64/ARM64/WASM}
[C] 构建：{系统} | 编译器：{工具链} | C++{标准}
[D] 界面：{框架} | 布局：{窗口风格} | 语言：{语言}
[E] 依赖：{包管理器} | 库：{列表} | 行业库：{ITK/VTK等}
[F] 数据库：{引擎} | 连接：{方式}
[G] 网络：{协议} | 认证：{方式}
[H] 并发：{模型} | 同步：{原语} | 分配器：{mimalloc/jemalloc}
[I] 日志：{框架} | 级别：{级别} | 目标：{输出} | 遥测：{OTel等}
[J] 测试：{框架} | 类型：{测试类型} | 报告：{JUnit/Sonar}
[K] 打包：{格式} | 签名：{是/否} | 更新：{机制}
[L] Git：{是/否/推送} | CI：{平台} | 许可：{MIT/GPL...}
[M] 骨架：{生成范围}
[N] 高级：{插件/脚本/编码/风格}
[O] 逆向：{内存/调试/插件/格式}
[P] AI/实时：{输入源/管线/推理引擎}
[Q] 科学：{数据格式/可视化/数值库}
[R] 安全：{代码保护/许可}
[S] 音频：{功能/框架}
[T] XR：{平台/渲染}
[U] 外设：{打印机/扫描仪}
[V] 编译器：{LLVM/自定义语言}
[W] 嵌入式：{OTA/协议}
[Y] 密码学：{原语/区块链}
[Z] 远程：{屏幕共享/控制}
[AA] 错误处理：{范式} | 符号：{PDB策略}
[AB] 调试符号：{生成策略}
[AC] 输出结构：{布局标准}
[AD] 许可合规：{扫描/报告}
[AE] ABI稳定性：{兼容策略}
[AF] 服务管理：{控制逻辑}
[AG] 容器化：{Docker/K8s}
[AH] 预构建：{初始化脚本}
[AI] 代码生成：{元编译工具}
[AJ] 隐私合规：{权限请求}

═══════════════════════════════════════
以上信息是否正确？(是/否)

## 第四步：生成项目骨架（在目标目录中）

确认后，在**目标目录**中生成以下全部文件（直接可编译）：

> ⚠️ 先执行 `mkdir -p <目标目录>` 确保目录存在，所有文件写入目标目录路径中。
> 如果传了目录参数，目标目录就是参数值；如果没传，使用第零步确认的目录。两个都确认就是对话中问你的那个。

1. CMakeLists.txt + CMakePresets.json（或 .vcxproj/.sln）
2. src/main.cpp + 各模块 .h/.cpp 骨架
3. include/ 公共头文件
4. tests/ 单元测试骨架
5. resources/ 图标、语言文件、配置文件
6. .gitignore + .clang-format + .editorconfig
7. .github/workflows/ CI 配置文件
8. installer/ 安装包脚本
9. vcpkg.json 依赖清单（如选择 vcpkg）
10. docs/ 项目文档框架（包括 ARCHITECTURE.md）
11. scripts/ 构建/打包辅助脚本
12. config/ 默认配置文件模板
13. README.md + LICENSE
14. platform/ 平台抽象层 (若跨平台)
15. ai/ 推理管线骨架 (若涉及AI)
16. reverse/ 内存/调试/注入工具骨架 (若涉及逆向)
17. bindings/ 语言绑定接口 (若需多语言调用)
18. science/ 科学数据处理骨架（若涉及 ITK/VTK 等）
19. security/ 代码保护/许可相关模块
20. audio/ 音频处理框架（若涉及音频）
21. xr/ VR/AR 入口骨架
22. embedded/ 嵌入式 OTA/协议模块
23. scripts/bootstrap.ps1 和 setup.sh（若 AH 选择生成）
24. docker/ Dockerfile 和 docker-compose.yml（若 AG 选择）
25. service/ 服务控制逻辑（若 AF 选择）
26. privacy/ 隐私合规与权限请求模块（若 AJ 选择）
27. cmake/ 自定义 CMake 模块（包含代码生成规则）

---
## 冲突检测提醒

生成器会检测以下冲突组合并要求用户调整：

- 无界面 + MFC/Qt/WinUI = 退出冲突 ❌
- 驱动开发 + Qt/ImGui = 退出冲突 ❌
- 控制台程序 + 启动画面 = 冲突警告 ⚠️
- 静态库 (.lib) + DLL 导出方式 = 不适用
- DLL 项目 + 生成 .exe 安装包 = 冲突警告 ⚠️
- 不需要数据库 + 配置了数据库连接参数 = 忽略数据库配置
- C++14 + C++20 Modules = 冲突 ❌
- UWP + Win32 API = 部分API不可用 ⚠️
- 嵌入 V8 + 目标体积小于 10MB = 冲突警告 ⚠️
- MinGW + MSIX 打包 = 不兼容 ❌
- 硬实时 + 动态内存分配 = ⚠️ 建议使用内存池
- 内核驱动 + vcpkg 包管理器 = ❌ 不适用
- 跨平台项目 + WinRT/WinUI 3 = ❌
- COM 组件 + 跨平台（非 Windows） = ❌ 只能 Windows
- AI 推理 + 无 GPU 加速 + 实时处理 = ⚠️ 性能警告
- 自绘 UI + 高 DPI + 未启用 Per-Monitor V2 = ⚠️ 模糊警告
- 多语言绑定 + C++ 异常抛出跨边界 = ⚠️ 需要隔离
- 使用 /fp:fast 与严格数值计算矛盾 = ⚠️
- 医学影像项目 + 未选择 DICOM 相关库 = ⚠️ 建议补充
- 嵌入式裸机 + 标准库依赖 = ⚠️ 需确认 freestanding 支持
- C/S 架构 + 无网络通信选项 = ⚠️ 请检查网络配置
- VST3 插件 + 静态 CRT 链接 = ⚠️ 推荐动态链接 CRT
- 嵌入式 OTA + 无签名验证 = ⚠️ 安全风险
- WASM 目标 + Win32 API = ❌ 不适用
- 游戏插件 + 静态链接引擎 = ⚠️ 请确认许可

**新增冲突与建议：**

- D1 选择“无界面”但 D2~D14 仍有选项 → ⚠️ 自动跳过后续 UI 问题，忽略无效选项
- C11（跨平台） + D1 选择 WinUI 3/MFC/Win32（非 Qt/wxWidgets） → ❌ 冲突，WinUI/MFC 仅 Windows
- K1 选择“绿色免安装（zip）” + K5 选择“注册文件关联”或“注册 Windows 服务” → ❌ 冲突，免安装不写入注册表，需禁用 K5 相关项
- Y1（密码学） + G4 选择“Basic Auth” → ⚠️ 建议升级为 Bearer Token/JWT 避免明文
- D10 选择 Vulkan/DirectX 12 + C4 选择 MinGW → ⚠️ 强烈建议切换至 MSVC 或 Clang/LLVM
- X3 选择“微服务集群”或“B/S” + 未选择 AG 容器化 → ⚠️ 建议生成 Docker 和编排文件以支持云原生部署
- X2 选择“Windows 服务 / Linux daemon” + 未选择 AF 服务生存周期 → ⚠️ 自动启用 AF 并生成服务控制逻辑
- X2 选择“跨平台 SDK”或 B1 为 DLL + 未选择 AE ABI 稳定性 → ⚠️ 建议启用 ABI 控制
- P1 选择“摄像头”或“屏幕捕获” + 未选择 AJ 隐私合规 → ⚠️ 建议生成权限请求代码，符合现代 OS 要求
- F5 选择注册表或 %APPDATA% + X1 包含 Linux/macOS → ⚠️ 建议使用跨平台路径选项（新增 F5 末项）
- E1 选择 vcpkg + AD1 选择“需要” → ✅ 自动生成 vcpkg.json 的 SPDX 清单
- AA1 选择“混合模式” + B1 为 DLL → ✅ 自动生成对外接口的错误码转换层
- M1 未选择 GNUInstallDirs + AC 选择遵循 → ⚠️ 自动补全 M1 的对应选项

---
## 设计哲学

这不是一个「写文档」的过程，而是一个「生成项目」的过程。
回答越详细 → 生成的代码越接近成品 → 你只需要填补业务逻辑即可编译运行。

最终你会得到：「一个完整的、可编译的、带有构建配置/测试/CI/打包的、面向特定行业的 Windows/Linux/macOS C++ 项目骨架」