#include "utils/json_parser.h"

TEST(JsonParser_Basic) {
    bool failed = false;
    auto json = demo::JsonParser::Parse(R"({"name":"test","value":42,"flag":true})");
    CHECK(json.IsObject());
    CHECK_EQ(json["name"].AsString(), "test");
    CHECK_EQ(json["value"].AsInt(), 42);
    CHECK(json["flag"].AsBool());
}

TEST(JsonParser_Array) {
    bool failed = false;
    auto json = demo::JsonParser::Parse(R"([1,2,3])");
    CHECK(json.IsArray());
    CHECK_EQ(json[0].AsInt(), 1);
    CHECK_EQ(json[1].AsInt(), 2);
    CHECK_EQ(json[2].AsInt(), 3);
}

TEST(JsonParser_Nested) {
    bool failed = false;
    auto json = demo::JsonParser::Parse(R"({"obj":{"a":1,"b":[10,20]}})");
    CHECK(json.IsObject());
    CHECK(json["obj"].IsObject());
    CHECK_EQ(json["obj"]["a"].AsInt(), 1);
    CHECK(json["obj"]["b"].IsArray());
    CHECK_EQ(json["obj"]["b"][0].AsInt(), 10);
    CHECK_EQ(json["obj"]["b"][1].AsInt(), 20);
}

TEST(JsonParser_Serialize) {
    bool failed = false;
    auto json = demo::JsonParser::Parse(R"({"hello":"world","num":42})");
    auto serialized = demo::JsonParser::Serialize(json, false);
    CHECK(!serialized.empty());
    // 反序列化回来验证
    auto json2 = demo::JsonParser::Parse(serialized);
    CHECK_EQ(json2["hello"].AsString(), "world");
    CHECK_EQ(json2["num"].AsInt(), 42);
}