#pragma once
#include <string>
#include <unordered_map>
#include <vector>
#include <memory>
#include <Windows.h>

namespace demo {

// 前向声明枚举和类
enum JsonValueType { JsonNull, JsonBool, JsonNumber, JsonString, JsonArray, JsonObject };

class JsonParser;

class JsonValue {
public:
    using Object = std::unordered_map<std::string, JsonValue>;
    using Array = std::vector<JsonValue>;

    JsonValue() : type_(JsonNull), bool_(false), num_(0.0) {}
    JsonValue(bool b) : type_(JsonBool), bool_(b), num_(0.0) {}
    JsonValue(double n) : type_(JsonNumber), bool_(false), num_(n) {}
    JsonValue(const std::string& s) : type_(JsonString), bool_(false), num_(0.0), str_(s) {}
    JsonValue(const char* s) : type_(JsonString), bool_(false), num_(0.0), str_(s) {}
    JsonValue(Object obj) : type_(JsonObject), bool_(false), num_(0.0), obj_(std::move(obj)) {}
    JsonValue(Array arr) : type_(JsonArray), bool_(false), num_(0.0), arr_(std::move(arr)) {}

    JsonValueType Type() const { return type_; }
    bool IsNull()   const { return type_ == JsonNull; }
    bool IsBool()   const { return type_ == JsonBool; }
    bool IsNumber() const { return type_ == JsonNumber; }
    bool IsString() const { return type_ == JsonString; }
    bool IsArray()  const { return type_ == JsonArray; }
    bool IsObject() const { return type_ == JsonObject; }

    bool        AsBool()   const { return bool_; }
    double      AsNumber() const { return num_; }
    int         AsInt()    const { return static_cast<int>(num_); }
    std::string AsString() const { return str_; }

    const JsonValue& operator[](const std::string& key) const;
    const JsonValue& operator[](size_t idx) const;

    bool Contains(const std::string& key) const;

    std::string ToString() const;
    std::wstring ToWString() const;

    friend class JsonParser;

private:
    JsonValueType type_;
    bool bool_;
    double num_;
    std::string str_;
    Object obj_;
    Array arr_;

    static JsonValue s_null_;
};

class JsonParser {
public:
    static JsonValue Parse(const std::string& json);
    static JsonValue ParseFile(const std::wstring& path);
    static std::string Serialize(const JsonValue& value, bool pretty = true, int indent = 0);
};

} // namespace demo
