#pragma once
#include <chrono>
#include <string>

namespace demo {

class Timer {
public:
    void Start() { start_ = Clock::now(); }
    void Stop()  { elapsed_ = Clock::now() - start_; }
    void Reset() { start_ = Clock::now(); elapsed_ = Duration::zero(); }

    double Seconds()     const { return std::chrono::duration<double>(elapsed_).count(); }
    double Milliseconds() const { return std::chrono::duration<double, std::milli>(elapsed_).count(); }
    double Microseconds() const { return std::chrono::duration<double, std::micro>(elapsed_).count(); }

    std::string ToString() const {
        auto ms = Milliseconds();
        if (ms >= 1000.0) return std::to_string(ms / 1000.0) + " s";
        if (ms >= 1.0)    return std::to_string(ms) + " ms";
        return std::to_string(Microseconds()) + " us";
    }

private:
    using Clock = std::chrono::high_resolution_clock;
    using Duration = std::chrono::duration<double>;

    Clock::time_point start_;
    Duration elapsed_{};
};

} // namespace demo
