#include "utils/string_utils.h"

TEST(StringUtils_Trim) {
    bool failed = false;
    CHECK_EQ(demo::Trim("  hello  "), "hello");
    CHECK_EQ(demo::Trim("\t\r\n test \n"), "test");
    CHECK_EQ(demo::Trim(""), "");
}

TEST(StringUtils_ToLower) {
    bool failed = false;
    CHECK_EQ(demo::ToLower("HELLO"), "hello");
    CHECK_EQ(demo::ToLower("Mixed123"), "mixed123");
}

TEST(StringUtils_ToUpper) {
    bool failed = false;
    CHECK_EQ(demo::ToUpper("hello"), "HELLO");
    CHECK_EQ(demo::ToUpper("Mixed123"), "MIXED123");
}

TEST(StringUtils_Split) {
    bool failed = false;
    auto parts = demo::Split("a,b,c", ',');
    CHECK_EQ(parts.size(), 3);
    CHECK_EQ(parts[0], "a");
    CHECK_EQ(parts[1], "b");
    CHECK_EQ(parts[2], "c");
}

TEST(StringUtils_Join) {
    bool failed = false;
    CHECK_EQ(demo::Join({"a", "b", "c"}, ", "), "a, b, c");
    CHECK_EQ(demo::Join({"hello"}, ", "), "hello");
}
