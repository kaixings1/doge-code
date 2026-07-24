#pragma once
#include <memory>
#include "config.h"

namespace demo {

class Engine {
public:
    explicit Engine(AppConfig cfg);
    ~Engine();

    bool Initialize();
    int  Run();
    void Shutdown();

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace demo
