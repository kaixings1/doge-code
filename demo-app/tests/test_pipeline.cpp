#include "data/pipeline.h"
#include <atomic>
#include <thread>
#include <chrono>

TEST(PipelineTest_Basic) {
    bool failed = false;
    demo::Pipeline<int> pipeline(16, 1, 1);
    std::atomic<int> result{0};

    pipeline.AddStage([](int x) { return x * 2; });
    pipeline.SetOutputHandler([&](int x) { result = x; });
    pipeline.Start();
    pipeline.Enqueue(21);

    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    pipeline.Stop();

    CHECK_EQ(result.load(), 42);
}

TEST(PipelineTest_MultiStage) {
    bool failed = false;
    demo::Pipeline<int> pipeline(32, 2, 2);

    pipeline.AddStage([](int x) { return x + 1; });
    pipeline.AddStage([](int x) { return x * 10; });

    std::atomic<int> result{0};
    pipeline.SetOutputHandler([&](int x) { result = x; });
    pipeline.Start();
    pipeline.Enqueue(5);

    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    pipeline.Stop();

    // (5 + 1) * 10 = 60
    CHECK_EQ(result.load(), 60);
}
