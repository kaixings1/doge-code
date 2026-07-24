#pragma once
#include <memory>
#include <vector>
#include <functional>
#include <string>
#include <thread>
#include <atomic>
#include <queue>
#include <mutex>
#include <condition_variable>

namespace demo {

template<typename T>
class Pipeline {
public:
    using Processor = std::function<T(T)>;

    Pipeline(size_t queueSize = 1024, size_t numProducers = 2, size_t numConsumers = 4)
        : maxQueueSize_(queueSize)
        , numProducers_(numProducers)
        , numConsumers_(numConsumers)
        , running_(false) {}

    ~Pipeline() { Stop(); }

    void AddStage(Processor proc) { stages_.push_back(std::move(proc)); }

    void Start() {
        running_ = true;
        for (size_t i = 0; i < numProducers_; ++i)
            producers_.emplace_back(&Pipeline::ProducerLoop, this);
        for (size_t i = 0; i < numConsumers_; ++i)
            consumers_.emplace_back(&Pipeline::ConsumerLoop, this);
    }

    void Stop() {
        running_ = false;
        cv_.notify_all();
        for (auto& t : producers_) if (t.joinable()) t.join();
        for (auto& t : consumers_) if (t.joinable()) t.join();
    }

    void Enqueue(T item) {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            queue_.push(std::move(item));
        }
        cv_.notify_one();
    }

    void SetOutputHandler(std::function<void(T)> handler) {
        outputHandler_ = std::move(handler);
    }

private:
    void ProducerLoop() {
        while (running_) {
            T item{};
            // 模拟生产数据
            item = T{};
            Enqueue(std::move(item));
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }

    void ConsumerLoop() {
        while (running_) {
            T item;
            {
                std::unique_lock<std::mutex> lock(mutex_);
                cv_.wait_for(lock, std::chrono::milliseconds(100), [this] {
                    return !queue_.empty() || !running_;
                });
                if (!running_ && queue_.empty()) return;
                item = std::move(queue_.front());
                queue_.pop();
            }
            for (auto& stage : stages_) {
                item = stage(std::move(item));
            }
            if (outputHandler_) {
                outputHandler_(std::move(item));
            }
        }
    }

    std::vector<Processor> stages_;
    std::queue<T> queue_;
    std::mutex mutex_;
    std::condition_variable cv_;
    std::vector<std::thread> producers_, consumers_;
    std::function<void(T)> outputHandler_;
    std::atomic<bool> running_;
    size_t maxQueueSize_, numProducers_, numConsumers_;
};

} // namespace demo
