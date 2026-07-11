---
name: C++ 构建系统指南，支持 CMake、xmake、Conan、vcpkg、Pr
description: C++ 构建系统指南，支持 CMake、xmake、Conan、vcpkg、Premake5 等。当用户需要配置 C++ 项目构建、依赖管理、跨平台编译时使用。包含 CMakeLists.txt 模板、xmake.lua 示例和 MSVC/GCC/Clang 编译器标志。
---
# C++ 构建系统
## CMake（推荐）
- 现代 CMake (3.16+)：基于目标，避免全局函数
- `target_sources`、`target_include_directories`、`target_link_libraries`
- 使用 `FetchContent` 处理依赖或 find_package + Conan/vcpkg
- 预设系统：`CMakePresets.json` 用于一致构建
## xmake 构建系统
- 基于 `xmake.lua`，Lua 配置
- `add_requires("fmt >=10.0")`—内置包管理
- 交叉编译：`xmake f -p [linux|mingw|android|iphoneos]`
- 多工具链：`xmake f --toolchain=clang`
## 包管理器
- **vcpkg**：`vcpkg install fmt`，CMake：`find_package(fmt)`
- **Conan**：`conan install .`、`conanfile.txt`、CMake：`find_package`
- **xmake**：内置，`add_requires("library")`
## 编译器
- GCC：`-std=c++20 -Wall -Wextra -O2`
- Clang：`-std=c++20 -Wall -Wextra -O2`
- MSVC：`/std:c++20 /W4 /O2`
