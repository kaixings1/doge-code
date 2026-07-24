# DemoApp v1.0.0

跨平台数据处理与可视化桌面应用。

## 功能特性

- 生产者-消费者数据处理管线
- 控制台双缓冲渲染引擎
- CSV 文件读取与解析
- JSON 配置系统
- 多线程任务调度
- Google Test 单元测试覆盖
- spdlog 日志系统
- 绿色免安装，解压即用

## 环境要求

- Windows 10/11 x64
- Visual Studio 2022 (MSVC v143)
- Windows 11 SDK (10.0.22621.0)
- CMake 3.22+
- vcpkg

## 快速开始

```bash
# 1. 安装依赖
vcpkg install fmt spdlog nlohmann-json gtest

# 2. 配置
cmake -B build -S . -DCMAKE_TOOLCHAIN_FILE=<vcpkg-root>/scripts/buildsystems/vcpkg.cmake

# 3. 构建
cmake --build build --config Release

# 4. 运行
build\bin\DemoApp.exe
```

## 项目结构

```
demo-app/
├── CMakeLists.txt          # CMake 构建配置
├── config.json             # 应用配置
├── README.md               # 本文件
├── include/                # 公有头文件
│   ├── config.h
│   ├── core/
│   │   ├── engine.h
│   │   └── config.h
│   ├── ui/
│   │   ├── window.h
│   │   └── console_renderer.h
│   ├── data/
│   │   ├── pipeline.h
│   │   └── csv_reader.h
│   └── utils/
│       ├── string_utils.h
│       └── timer.h
├── src/                    # 源代码
│   ├── main.cpp
│   ├── core/
│   │   ├── engine.cpp
│   │   └── config.cpp
│   ├── ui/
│   │   ├── window.cpp
│   │   └── console_renderer.cpp
│   ├── data/
│   │   ├── pipeline.cpp
│   │   └── csv_reader.cpp
│   └── utils/
│       ├── string_utils.cpp
│       └── timer.cpp
├── tests/                  # 单元测试
│   ├── test_main.cpp
│   ├── test_pipeline.cpp
│   └── test_string_utils.cpp
└── scripts/                # 构建脚本
    └── build.bat
