# DemoApp 构建计划
生成日期: 2026-07-12

## 问答记录

| 编号 | 答案 |
|------|------|
| X1 | Windows 10/11 (x64) |
| X2 | 独立桌面应用程序 |
| X3 | 混合模式（C++ 本地计算 + 控制台 UI） |
| X4 | 全新项目 |
| X5 | 软实时 (多媒体/数据处理) |
| X6 | 无硬件设备交互 |
| X7 | 数据处理与可视化 |
| A1 | DemoApp |
| A2 | DemoApp |
| A3 | 跨平台数据处理与可视化桌面应用 |
| A4 | 1.0.0 |
| A5 | 自动生成 |
| B1 | .exe 可执行文件 |
| B3 | x64 (64位) |
| C1 | CMake |
| C2 | MSVC v143 (VS 2022) |
| C3 | Windows 11 SDK |
| C5 | C++20 |
| D1 | Win32 API (纯窗口) |
| D5 | 中文 + 英文 (UTF-8) |
| E1 | vcpkg |
| G1 | 生产者-消费者模式 |
| G2 | 文件日志 (spdlog) |
| G3 | 绿色免安装 (zip) |
| G4 | Microsoft 风格 |
| G5 | Google Test |
| G6 | GitHub Actions |
| Z1 | 数据处理管线 + CSV 读取 + 控制台双缓冲渲染 |

## 生成的文件列表

| 文件 | 说明 |
|------|------|
| CMakeLists.txt | CMake 构建配置 (C++20, MSVC, vcpkg) |
| config.json | JSON 配置文件 |
| README.md | 项目文档 |
| .gitignore | Git 忽略规则 |
| scripts/build.bat | 一键构建脚本 |
| src/main.cpp | 主入口 |
| src/core/engine.cpp | 引擎核心 (窗口+管线+渲染) |
| src/core/config.cpp | 配置加载/保存 |
| src/ui/window.cpp | Win32 窗口实现 |
| src/ui/console_renderer.cpp | 控制台双缓冲渲染 |
| src/data/pipeline.cpp | 管线桩文件 |
| src/data/csv_reader.cpp | CSV 读取桩文件 |
| src/utils/string_utils.cpp | 字符串工具桩文件 |
| src/utils/timer.cpp | 计时器桩文件 |
| include/config.h | 应用配置结构体 |
| include/core/engine.h | 引擎声明 |
| include/core/config.h | 配置转发头 |
| include/ui/window.h | 窗口声明 |
| include/ui/console_renderer.h | 渲染器声明 |
| include/data/pipeline.h | 生产者-消费者管线模板 |
| include/data/csv_reader.h | CSV 读取器 |
| include/utils/string_utils.h | 字符串工具 (trim/split/join/编码转换) |
| include/utils/timer.h | 高精度计时器 |
| tests/test_main.cpp | 测试入口 |
| tests/test_pipeline.cpp | 管线单元测试 |
| tests/test_string_utils.cpp | 字符串工具单元测试 |

## 项目目录

```
D:\doge-code\demo-app\
```
