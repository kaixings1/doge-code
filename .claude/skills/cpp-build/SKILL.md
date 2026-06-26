---
name: cpp-build
description: C++ 构建系统指南，支持 CMake、xmake、Conan、vcpkg、Premake5 等。当用户需要配置 C++ 项目构建、依赖管理、跨平台编译时使用。包含 CMakeLists.txt 模板、xmake.lua 示例和 MSVC/GCC/Clang 编译器标志。
---
# C++ Build Systems ## CMake (Recommended)
- Modern CMake (3.16+): target-based, avoid global functions
- `target_sources`, `target_include_directories`, `target_link_libraries`
- Use `FetchContent` for dependencies or find_package + Conan/vcpkg
- Preset system: `CMakePresets.json` for consistent builds ## xmake Build System
- `xmake.lua` based, Lua configuration
- `add_requires("fmt >=10.0")` — built-in package management
- Cross-compilation: `xmake f -p [linux|mingw|android|iphoneos]`
- Multi-toolchain: `xmake f --toolchain=clang` ## Package Managers
- **vcpkg**: `vcpkg install fmt`, CMake: `find_package(fmt)`
- **Conan**: `conan install .`, `conanfile.txt`, CMake: `find_package`
- **xmake**: built-in, `add_requires("library")` ## Compilers
- GCC: `-std=c++20 -Wall -Wextra -O2`
- Clang: `-std=c++20 -Wall -Wextra -O2`
- MSVC: `/std:c++20 /W4 /O2`
