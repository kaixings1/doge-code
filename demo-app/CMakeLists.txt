cmake_minimum_required(VERSION 3.22)
project(DemoApp
    VERSION 1.0.0
    DESCRIPTION "跨平台数据处理与可视化桌面应用"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

if(NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "仅支持 x64 (64-bit) 架构")
endif()

# ── 无第三方依赖 ──
# 日志: OutputDebugString + 文件写入
# JSON: 手动解析 (json_parser.h)
# 测试: 内置简单测试框架 (minitest.h)

option(BUILD_TESTS "Build unit tests" ON)

set(SOURCES
    src/main.cpp
    src/core/engine.cpp
    src/core/config.cpp
    src/ui/window.cpp
    src/ui/console_renderer.cpp
    src/data/pipeline.cpp
    src/data/csv_reader.cpp
    src/utils/string_utils.cpp
    src/utils/timer.cpp
    src/utils/logger.cpp
    src/utils/json_parser.cpp
)

set(HEADERS
    include/config.h
    include/core/engine.h
    include/core/config.h
    include/ui/window.h
    include/ui/console_renderer.h
    include/data/pipeline.h
    include/data/csv_reader.h
    include/utils/string_utils.h
    include/utils/timer.h
    include/utils/logger.h
    include/utils/json_parser.h
)

add_executable(DemoApp ${SOURCES} ${HEADERS})

target_include_directories(DemoApp PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_options(DemoApp PRIVATE
    /W4 /utf-8 /permissive- /EHsc /std:c++20
)

if(MSVC)
    target_compile_definitions(DemoApp PRIVATE
        _CRT_SECURE_NO_WARNINGS
        NOMINMAX
        WIN32_LEAN_AND_MEAN
    )
endif()

# ── 内置简易单元测试 ──
if(BUILD_TESTS)
    add_executable(DemoApp_Tests
        tests/test_main.cpp
        tests/test_pipeline.cpp
        tests/test_string_utils.cpp
        tests/test_json_parser.cpp
        src/utils/json_parser.cpp
    )
    target_include_directories(DemoApp_Tests PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/include
    )
    target_compile_definitions(DemoApp_Tests PRIVATE
        _CRT_SECURE_NO_WARNINGS
        NOMINMAX
        WIN32_LEAN_AND_MEAN
    )
endif()

install(TARGETS DemoApp RUNTIME DESTINATION bin)
install(DIRECTORY assets/ DESTINATION assets OPTIONAL)
install(FILES README.md config.json DESTINATION .)
