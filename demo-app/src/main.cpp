#include <iostream>
#include <cstdlib>
#include "core/engine.h"
#include "config.h"
#include "utils/logger.h"

int main(int argc, char* argv[]) {
    // 初始化日志
    demo::Logger::Instance().SetFile(L"logs/app.log");
    demo::Logger::Instance().SetLevel(demo::LogLevel::Info);

    LOG_INFO("DemoApp v1.0.0 启动中...");
    LOG_INFO(std::string("平台: Windows x64, 编译: ") + __DATE__ + " " + __TIME__);

    // 加载配置
    auto cfg = demo::LoadConfig();
    LOG_INFO(std::string("配置加载完成, 日志级别: ") + cfg.logLevel);

    // 创建并运行引擎
    auto engine = std::make_unique<demo::Engine>(std::move(cfg));
    if (!engine->Initialize()) {
        LOG_CRITICAL("引擎初始化失败");
        MessageBoxA(nullptr, "引擎初始化失败", "错误", MB_ICONERROR | MB_OK);
        return EXIT_FAILURE;
    }
    LOG_INFO("引擎初始化成功");

    int result = engine->Run();

    engine->Shutdown();
    LOG_INFO(std::string("DemoApp 正常退出, 返回值: ") + std::to_string(result));
    return result;
}
