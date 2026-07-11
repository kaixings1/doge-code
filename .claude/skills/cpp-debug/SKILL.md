---
name: C++ 调试和错误诊断技能，涵盖编译错误解析、运行时崩溃分析、内存泄漏检测、GD
description: C++ 调试和错误诊断技能，涵盖编译错误解析、运行时崩溃分析、内存泄漏检测、GDB/Lldb/WinDbg 调试技巧。当用户遇到 C++ 编译失败、段错误、内存问题、链接错误或运行时异常时使用。
---
# C++ 调试与错误诊断
## 编译错误
- 模板错误信息：从底部向上读，关注第一个错误
- 链接错误：检查符号可见性、ODR 违规、库顺序
- 常见：缺少 `const`/`&`、错误的 include、模板实例化失败
## 运行时调试
- **GDB**：`gdb ./binary`、`run`、`bt`、`frame N`、`print var`、`list`
- **LLDB**：`lldb ./binary`、`run`、`bt`、`frame variable`、`thread inspect`
- **WinDbg**：`!analyze -v`、`kb`、`dv`、`.exr -1`
- 检测器：`-fsanitize=address,undefined,leak`（GCC/Clang）
## 内存问题
- 使用 AddressSanitizer：捕获 use-after-free、缓冲区溢出、内存泄漏
- Valgrind：`valgrind --leak-check=full ./binary`
- 启用调试标志：`-D_GLIBCXX_DEBUG -D_LIBCPP_DEBUG` 用于 STL 边界检查
