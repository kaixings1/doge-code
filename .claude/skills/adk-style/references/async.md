# 异步与并发风格指南

-   **所有 I/O 操作必须在异步函数中**：任何执行 I/O 的操作（网络调用、文件系统访问、数据库查询等）都必须定义在 `async def` 函数中。
-   **不要阻塞事件循环**：避免在异步代码中直接调用阻塞的同步函数。
-   **包装同步 I/O**：如果必须对 I/O 使用同步库（例如标准的 `open()`、`pathlib` 文件操作或同步客户端），将阻塞调用包装在 `asyncio.to_thread` 中，在独立线程中运行以防止阻塞主事件循环。

示例：

```python
async def save_data(path: Path, data: bytes) -> None:
  # 将阻塞文件写入包装在 asyncio.to_thread 中
  await asyncio.to_thread(path.write_bytes, data)
```
