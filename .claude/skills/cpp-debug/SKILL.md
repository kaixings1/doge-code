---
name: cpp-debug
description: C++ 调试和错误诊断技能，涵盖编译错误解析、运行时崩溃分析、内存泄漏检测、GDB/Lldb/WinDbg 调试技巧。当用户遇到 C++ 编译失败、段错误、内存问题、链接错误或运行时异常时使用。
---
# C++ Debugging & Error Diagnosis ## Compile Errors
- Template error messages: read from bottom up, focus on first error
- Link errors: check symbol visibility, ODR violations, library order
- Common: missing `const`/`&`, wrong include, template instantiation failure ## Runtime Debugging
- **GDB**: `gdb ./binary`, `run`, `bt`, `frame N`, `print var`, `list`
- **LLDB**: `lldb ./binary`, `run`, `bt`, `frame variable`, `thread inspect`
- **WinDbg**: `!analyze -v`, `kb`, `dv`, `.exr -1`
- Sanitizers: `-fsanitize=address,undefined,leak` (GCC/Clang) ## Memory Issues
- Use AddressSanitizer: catches use-after-free, buffer overflow, memory leaks
- Valgrind: `valgrind --leak-check=full ./binary`
- Enable debug flags: `-D_GLIBCXX_DEBUG -D_LIBCPP_DEBUG` for STL bounds checking
