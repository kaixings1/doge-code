#pragma once
#include <string>
#include <cstdint>

namespace demo {

struct AppConfig {
    std::wstring appName  = L"DemoApp";
    std::wstring version  = L"1.0.0";
    std::wstring logDir   = L"./logs";
    std::wstring dataDir  = L"./data";

    // 生产者-消费者模式参数
    uint32_t producerThreads = 2;
    uint32_t consumerThreads = 4;
    uint32_t queueSize       = 1024;

    // 日志级别: trace, debug, info, warn, error, critical
    std::string logLevel = "info";
};

AppConfig LoadConfig(const std::wstring& path = L"./config.json");
void SaveConfig(const AppConfig& cfg, const std::wstring& path = L"./config.json");

} // namespace demo
