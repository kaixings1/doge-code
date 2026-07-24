// ── 简易单元测试框架（无外部依赖） ──
// 用法:
//   TEST(TestName) { CHECK(expr); CHECK_EQ(a, b); }
//   int main() { return RUN_ALL_TESTS(); }

#include <iostream>
#include <string>
#include <functional>
#include <vector>
#include <sstream>

#define STRINGIFY(x) #x

struct TestCase {
    std::string name;
    std::function<void()> func;
};

static std::vector<TestCase>& Tests() {
    static std::vector<TestCase> tests;
    return tests;
}

#define TEST(Name) \
    static void Test_##Name(); \
    static struct TestReg_##Name { \
        TestReg_##Name() { Tests().push_back({#Name, Test_##Name}); } \
    } reg_##Name; \
    static void Test_##Name()

#define CHECK(expr) do { \
    if (!(expr)) { \
        std::cerr << "  [FAIL] " << __FILE__ << ":" << __LINE__ << ": CHECK(" << STRINGIFY(expr) << ")" << std::endl; \
        failed = true; \
    } \
} while(0)

#define CHECK_EQ(a, b) do { \
    auto _a = (a); auto _b = (b); \
    if (_a != _b) { \
        std::cerr << "  [FAIL] " << __FILE__ << ":" << __LINE__ << ": CHECK_EQ(" << STRINGIFY(a) << ", " << STRINGIFY(b) << ")" \
                  << " (" << _a << " != " << _b << ")" << std::endl; \
        failed = true; \
    } \
} while(0)

#define CHECK_NE(a, b) do { \
    auto _a = (a); auto _b = (b); \
    if (_a == _b) { \
        std::cerr << "  [FAIL] " << __FILE__ << ":" << __LINE__ << ": CHECK_NE(" << STRINGIFY(a) << ", " << STRINGIFY(b) << ")" \
                  << " (" << _a << " == " << _b << ")" << std::endl; \
        failed = true; \
    } \
} while(0)

int RUN_ALL_TESTS() {
    int total = (int)Tests().size();
    int passed = 0;
    int failed_count = 0;

    std::cout << "[==========] Running " << total << " test(s)." << std::endl;

    for (auto& t : Tests()) {
        bool failed = false;
        std::cout << "[ RUN      ] " << t.name << std::endl;
        t.func();
        if (failed) {
            std::cout << "[  FAILED  ] " << t.name << std::endl;
            failed_count++;
        } else {
            std::cout << "[       OK ] " << t.name << std::endl;
            passed++;
        }
    }

    std::cout << "[==========] " << total << " test(s) ran." << std::endl;
    std::cout << "[  PASSED  ] " << passed << " test(s)." << std::endl;
    if (failed_count > 0) {
        std::cout << "[  FAILED  ] " << failed_count << " test(s)." << std::endl;
        return 1;
    }
    return 0;
}

// 空实现：test_pipeline.cpp 和 test_string_utils.cpp 会注册自己的测试
int main(int argc, char** argv) {
    return RUN_ALL_TESTS();
}
