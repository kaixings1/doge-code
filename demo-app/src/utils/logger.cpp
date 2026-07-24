#include "utils/logger.h"
#include <chrono>
#include <iomanip>

namespace demo {

Logger& Logger::Instance() {
    static Logger instance;
    return instance;
}

Logger::~Logger() {
    if (file_.is_open()) file_.close();
}

void Logger::SetLevel(LogLevel level) {
    level_ = level;
}

void Logger::SetFile(const std::wstring& path) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (file_.is_open()) file_.close();
    file_.open(path, std::ios::app);
}

const char* Logger::LevelToString(LogLevel level) {
    switch (level) {
        case LogLevel::Trace:    return "TRACE";
        case LogLevel::Debug:    return "DEBUG";
        case LogLevel::Info:     return "INFO";
        case LogLevel::Warn:     return "WARN";
        case LogLevel::Error:    return "ERROR";
        case LogLevel::Critical: return "CRITICAL";
        default: return "UNKNOWN";
    }
}

void Logger::Log(LogLevel level, const std::string& msg) {
    if (level < level_) return;

    // 时间戳
    auto now = std::chrono::system_clock::now();
    auto t = std::chrono::system_clock::to_time_t(now);
    std::tm tm;
    localtime_s(&tm, &t);
    char timebuf[32];
    strftime(timebuf, sizeof(timebuf), "%Y-%m-%d %H:%M:%S", &tm);

    // 格式: [2026-07-12 00:00:00] [INFO] message
    std::stringstream ss;
    ss << "[" << timebuf << "] [" << LevelToString(level) << "] " << msg;

    std::string output = ss.str();

    // OutputDebugString (VS 输出窗口可见)
    OutputDebugStringA((output + "\n").c_str());

    // 写入文件
    std::lock_guard<std::mutex> lock(mutex_);
    if (file_.is_open()) {
        file_ << output << std::endl;
        file_.flush();
    }
}

void Logger::Trace(const std::string& msg)    { Log(LogLevel::Trace, msg); }
void Logger::Debug(const std::string& msg)    { Log(LogLevel::Debug, msg); }
void Logger::Info(const std::string& msg)     { Log(LogLevel::Info, msg); }
void Logger::Warn(const std::string& msg)     { Log(LogLevel::Warn, msg); }
void Logger::Error(const std::string& msg)    { Log(LogLevel::Error, msg); }
void Logger::Critical(const std::string& msg) { Log(LogLevel::Critical, msg); }

} // namespace demo
