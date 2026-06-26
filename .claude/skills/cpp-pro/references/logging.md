# Logging

Comprehensive guide to logging in modern C++, covering spdlog, glog, and logging patterns.

## spdlog

### Basic Usage

```cpp
#include <spdlog/spdlog.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/sinks/rotating_file_sink.h>

int main() {
    // Console logger
    auto console = spdlog::stdout_color_mt("console");
    console->info("Hello, {}!", "World");
    console->warn("Warning: {}", 42);
    console->error("Error code: {}", -1);
    
    // With format
    console->info("Value: {:.2f}", 3.14159);
    console->info("Hex: {:#x}", 255);
    
    // Levels
    console->trace("Trace message");
    console->debug("Debug message");
    console->info("Info message");
    console->warn("Warning message");
    console->error("Error message");
    console->critical("Critical message");
}
```

### File Logging

```cpp
#include <spdlog/sinks/rotating_file_sink.h>
#include <spdlog/sinks/daily_file_sink.h>

int main() {
    // Rotating file (max 5MB, keep 3 files)
    auto file = spdlog::rotating_logger_mt(
        "file", "logs/app.log", 1024 * 1024 * 5, 3);
    
    file->info("Logging to file");
    
    // Daily rotating (midnight)
    auto daily = spdlog::daily_logger_mt(
        "daily", "logs/app-daily.log", 0, 0);  // hour, minute
    
    daily->info("Daily log message");
}
```

### Custom Formatting

```cpp
#include <spdlog/fmt/bundled/chrono.h>

// Set pattern
spdlog::set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%^%l%$] [%n] %v");

// Custom pattern
// %v - the message text
// %t - thread id
// %n - logger name
// %l - log level
// %D - short date
// %T - short time

// Colored output
spdlog::set_level(spdlog::level::debug);
spdlog::flush_on(spdlog::level::warn);
```

### Async Logging

```cpp
#include <spdlog/async.h>

int main() {
    // Create async logger with queue size
    spdlog::init_thread_pool(8192, 1);
    
    auto async_file = spdlog::rotating_logger_mt<spdlog::async_factory>(
        "async_file", "logs/async.log", 1024 * 1024, 3);
    
    // Async logging (non-blocking)
    for (int i = 0; i < 10000; ++i) {
        async_file->info("Async message {}", i);
    }
}
```

## glog (Google Logging)

```cpp
#include <glog/logging.h>

int main(int argc, char* argv[]) {
    google::InitGoogleLogging(argv[0]);
    google::SetLogDestination(google::INFO, "logs/info_");
    google::SetLogDestination(google::WARNING, "logs/warn_");
    google::SetLogDestination(google::ERROR, "logs/error_");
    
    LOG(INFO) << "Info message";
    LOG(WARNING) << "Warning message";
    LOG(ERROR) << "Error message";
    
    // Conditional logging
    LOG_IF(INFO, count > 10) << "Count is " << count;
    
    // Every N iterations
    LOG_EVERY_N(INFO, 100) << "Got " << google::COUNTER << " items";
    
    // Check
    CHECK_NOTNULL(ptr);
    CHECK_EQ(a, b) << "a and b must be equal";
    CHECK(file) << "Failed to open " << filename;
    
    google::FlushLogFiles(google::INFO);
}
```

## Structured Logging

```cpp
#include <spdlog/spdlog.h>

// Using fmtlib directly for structured logging
struct LogContext {
    int user_id;
    std::string action;
};

void log_with_context(const LogContext& ctx, const std::string& message) {
    auto logger = spdlog::get("main");
    logger->info("user_id={} action={} message={}", 
                 ctx.user_id, ctx.action, message);
}

// Using scopes
class ScopedLog {
    spdlog::logger& logger_;
    std::string operation_;
    std::chrono::steady_clock::time_point start_;
    
public:
    ScopedLog(spdlog::logger& logger, const std::string& op)
        : logger_(logger), operation_(op), start_(std::chrono::steady_clock::now()) {
        logger_.info("Starting: {}", operation_);
    }
    
    ~ScopedLog() {
        auto duration = std::chrono::steady_clock::now() - start_;
        logger_.info("Completed: {} in {}ms", 
                     operation_,
                     std::chrono::duration_cast<std::chrono::milliseconds>(duration).count());
    }
};

// Usage
{
    ScopedLog log(*logger, "process_data");
    // Do work
}
```

## Best Practices

1. **Use appropriate levels** - TRACE/DEBUG for development, INFO+ for production
2. **Include context** - User IDs, request IDs, transaction IDs
3. **Structured logging** - JSON format for machine parsing
4. **Don't log sensitive data** - Passwords, tokens, PII
5. **Async for high throughput** - Don't block on logging
6. **Log rotation** - Prevent disk exhaustion
7. **Flush appropriately** - For critical logs, flush immediately

## Resources

- [spdlog](https://github.com/gabime/spdlog)
- [glog](https://github.com/google/glog)
- [fmt](https://github.com/fmtlib/fmt)
