#pragma once
#include <string>
#include <fstream>
#include <mutex>
#include <sstream>
#include <Windows.h>

namespace demo {

enum class LogLevel {
    Trace = 0,
    Debug,
    Info,
    Warn,
    Error,
    Critical
};

class Logger {
public:
    static Logger& Instance();

    void SetLevel(LogLevel level);
    void SetFile(const std::wstring& path);

    void Trace(const std::string& msg);
    void Debug(const std::string& msg);
    void Info(const std::string& msg);
    void Warn(const std::string& msg);
    void Error(const std::string& msg);
    void Critical(const std::string& msg);

    void Log(LogLevel level, const std::string& msg);

private:
    Logger() = default;
    ~Logger();
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;

    static const char* LevelToString(LogLevel level);

    LogLevel level_ = LogLevel::Info;
    std::ofstream file_;
    std::mutex mutex_;
};

// 便捷宏
#define LOG_TRACE(msg)    demo::Logger::Instance().Trace(msg)
#define LOG_DEBUG(msg)    demo::Logger::Instance().Debug(msg)
#define LOG_INFO(msg)     demo::Logger::Instance().Info(msg)
#define LOG_WARN(msg)     demo::Logger::Instance().Warn(msg)
#define LOG_ERROR(msg)    demo::Logger::Instance().Error(msg)
#define LOG_CRITICAL(msg) demo::Logger::Instance().Critical(msg)

} // namespace demo
