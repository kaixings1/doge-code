#include "core/engine.h"
#include "core/config.h"
#include "ui/window.h"
#include "ui/console_renderer.h"
#include "data/pipeline.h"
#include "utils/timer.h"
#include "utils/logger.h"
#include <iostream>

namespace demo {

struct Engine::Impl {
    AppConfig cfg;
    std::unique_ptr<Window> window;
    std::unique_ptr<ConsoleRenderer> renderer;
    std::unique_ptr<Pipeline<std::string>> pipeline;
    Timer frameTimer;
    bool running = false;

    explicit Impl(AppConfig config) : cfg(std::move(config)) {}
};

Engine::Engine(AppConfig cfg)
    : impl_(std::make_unique<Impl>(std::move(cfg))) {}

Engine::~Engine() = default;

bool Engine::Initialize() {
    LOG_INFO("Engine::Initialize()");

    // 创建窗口
    impl_->window = std::make_unique<Window>(80, 40, L"DemoApp v1.0.0");
    if (!impl_->window->Create()) {
        LOG_ERROR("窗口创建失败");
        return false;
    }

    // 创建渲染器
    impl_->renderer = std::make_unique<ConsoleRenderer>(80, 40);

    // 创建数据处理管线
    impl_->pipeline = std::make_unique<Pipeline<std::string>>(
        impl_->cfg.queueSize,
        impl_->cfg.producerThreads,
        impl_->cfg.consumerThreads
    );

    // 配置管线处理阶段
    impl_->pipeline->AddStage([](std::string s) {
        std::transform(s.begin(), s.end(), s.begin(), ::toupper);
        return s;
    });
    impl_->pipeline->AddStage([](std::string s) {
        auto now = std::chrono::system_clock::now();
        auto t = std::chrono::system_clock::to_time_t(now);
        char buf[32];
        ctime_s(buf, sizeof(buf), &t);
        std::string ts(buf);
        ts.pop_back();
        return "[" + ts + "] " + s;
    });

    impl_->pipeline->SetOutputHandler([this](std::string processed) {
        LOG_INFO(std::string("管线输出: ") + processed);
    });

    // 设置窗口绘制回调
    impl_->window->SetDrawCallback([this](ConsoleRenderer& r) {
        r.Clear();
        r.DrawString(2, 1, "DemoApp v1.0.0 - 数据处理与可视化", 0x0A);
        r.DrawRect(1, 3, 78, 35, 0x07);
        r.DrawString(4, 5, "状态: 运行中", 0x0B);
        r.DrawString(4, 7, "按 ESC 退出 | FPS: " + impl_->frameTimer.ToString(), 0x07);
        r.Flush();
    });

    return true;
}

int Engine::Run() {
    impl_->running = true;
    impl_->pipeline->Start();
    impl_->window->Show();

    LOG_INFO("Engine 主循环开始");
    MSG msg = {};
    while (impl_->running && GetMessage(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
        impl_->frameTimer.Start();
        impl_->window->Invalidate();
        impl_->frameTimer.Stop();
    }

    impl_->pipeline->Stop();
    impl_->running = false;
    return 0;
}

void Engine::Shutdown() {
    LOG_INFO("Engine::Shutdown()");
    impl_->pipeline->Stop();
    impl_->window.reset();
    impl_->renderer.reset();
}

} // namespace demo
