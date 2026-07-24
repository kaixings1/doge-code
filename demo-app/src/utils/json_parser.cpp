#include "utils/json_parser.h"
#include <fstream>
#include <sstream>
#include <cctype>
#include <stack>

namespace demo {

JsonValue JsonValue::s_null_;

const JsonValue& JsonValue::operator[](const std::string& key) const {
    if (type_ != JsonObject) return s_null_;
    auto it = obj_.find(key);
    if (it == obj_.end()) return s_null_;
    return it->second;
}

const JsonValue& JsonValue::operator[](size_t idx) const {
    if (type_ != JsonArray || idx >= arr_.size()) return s_null_;
    return arr_[idx];
}

bool JsonValue::Contains(const std::string& key) const {
    if (type_ != JsonObject) return false;
    return obj_.find(key) != obj_.end();
}

std::string JsonValue::ToString() const {
    return JsonParser::Serialize(*this, false);
}

std::wstring JsonValue::ToWString() const {
    auto s = JsonParser::Serialize(*this, false);
    int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
    std::wstring ws(len, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, &ws[0], len);
    ws.pop_back();
    return ws;
}

// ── 简易 JSON 解析器（递归下降） ──

class JsonReader {
public:
    explicit JsonReader(const std::string& input) : input_(input), pos_(0) {}

    JsonValue Parse() {
        SkipWhitespace();
        if (pos_ >= input_.size()) return {};
        return ParseValue();
    }

private:
    const std::string& input_;
    size_t pos_;

    char Peek() {
        SkipWhitespace();
        return pos_ < input_.size() ? input_[pos_] : '\0';
    }

    char Next() {
        SkipWhitespace();
        return pos_ < input_.size() ? input_[pos_++] : '\0';
    }

    void SkipWhitespace() {
        while (pos_ < input_.size() && (input_[pos_] == ' ' || input_[pos_] == '\t' ||
               input_[pos_] == '\n' || input_[pos_] == '\r'))
            ++pos_;
    }

    void Expect(char c) {
        if (Next() != c) throw std::runtime_error(std::string("Expected '") + c + "'");
    }

    JsonValue ParseValue() {
        char c = Peek();
        switch (c) {
            case '{': return ParseObject();
            case '[': return ParseArray();
            case '"': return ParseString();
            case 't': case 'f': return ParseBool();
            case 'n': return ParseNull();
            default:
                if (c == '-' || (c >= '0' && c <= '9')) return ParseNumber();
                throw std::runtime_error(std::string("Unexpected char: ") + c);
        }
    }

    JsonValue ParseObject() {
        Expect('{');
        JsonValue::Object obj;
        if (Peek() == '}') { Next(); return obj; }
        while (true) {
            auto key = ParseString().AsString();
            Expect(':');
            obj[key] = ParseValue();
            if (Peek() == '}') { Next(); break; }
            Expect(',');
        }
        return obj;
    }

    JsonValue ParseArray() {
        Expect('[');
        JsonValue::Array arr;
        if (Peek() == ']') { Next(); return arr; }
        while (true) {
            arr.push_back(ParseValue());
            if (Peek() == ']') { Next(); break; }
            Expect(',');
        }
        return arr;
    }

    JsonValue ParseString() {
        Expect('"');
        std::string s;
        while (pos_ < input_.size()) {
            char c = input_[pos_++];
            if (c == '"') break;
            if (c == '\\') {
                if (pos_ >= input_.size()) break;
                char esc = input_[pos_++];
                switch (esc) {
                    case '"': s += '"'; break;
                    case '\\': s += '\\'; break;
                    case '/': s += '/'; break;
                    case 'n': s += '\n'; break;
                    case 't': s += '\t'; break;
                    case 'r': s += '\r'; break;
                    default: s += esc; break;
                }
            } else {
                s += c;
            }
        }
        return s;
    }

    JsonValue ParseNumber() {
        size_t start = pos_;
        if (pos_ < input_.size() && input_[pos_] == '-') ++pos_;
        while (pos_ < input_.size() && std::isdigit(input_[pos_])) ++pos_;
        if (pos_ < input_.size() && input_[pos_] == '.') {
            ++pos_;
            while (pos_ < input_.size() && std::isdigit(input_[pos_])) ++pos_;
        }
        if (pos_ < input_.size() && (input_[pos_] == 'e' || input_[pos_] == 'E')) {
            ++pos_;
            if (pos_ < input_.size() && (input_[pos_] == '+' || input_[pos_] == '-')) ++pos_;
            while (pos_ < input_.size() && std::isdigit(input_[pos_])) ++pos_;
        }
        return std::stod(input_.substr(start, pos_ - start));
    }

    JsonValue ParseBool() {
        if (input_.substr(pos_, 4) == "true") { pos_ += 4; return true; }
        if (input_.substr(pos_, 5) == "false") { pos_ += 5; return false; }
        throw std::runtime_error("Expected bool");
    }

    JsonValue ParseNull() {
        if (input_.substr(pos_, 4) == "null") { pos_ += 4; return {}; }
        throw std::runtime_error("Expected null");
    }
};

JsonValue JsonParser::Parse(const std::string& json) {
    JsonReader reader(json);
    return reader.Parse();
}

JsonValue JsonParser::ParseFile(const std::wstring& path) {
    std::ifstream file(path);
    if (!file.is_open()) return {};
    std::stringstream ss;
    ss << file.rdbuf();
    return Parse(ss.str());
}

std::string JsonParser::Serialize(const JsonValue& value, bool pretty, int indent) {
    std::string pad(indent * 2, ' ');
    std::string padNext = pretty ? std::string((indent + 1) * 2, ' ') : "";

    switch (value.Type()) {
        case JsonNull:
            return "null";
        case JsonBool:
            return value.AsBool() ? "true" : "false";
        case JsonNumber: {
            double n = value.AsNumber();
            if (n == static_cast<int>(n))
                return std::to_string(static_cast<int>(n));
            return std::to_string(n);
        }
        case JsonString:
            return "\"" + value.AsString() + "\"";
        case JsonArray: {
            std::string s = "[";
            bool first = true;
            for (size_t i = 0; i < value.arr_.size(); ++i) {
                if (!first) s += ",";
                if (pretty) s += "\n" + padNext;
                s += Serialize(value.arr_[i], pretty, indent + 1);
                first = false;
            }
            if (pretty && !value.arr_.empty()) s += "\n" + pad;
            s += "]";
            return s;
        }
        case JsonObject: {
            std::string s = "{";
            bool first = true;
            for (auto& [k, v] : value.obj_) {
                if (!first) s += ",";
                if (pretty) s += "\n" + padNext;
                s += "\"" + k + "\":" + (pretty ? " " : "") + Serialize(v, pretty, indent + 1);
                first = false;
            }
            if (pretty && !value.obj_.empty()) s += "\n" + pad;
            s += "}";
            return s;
        }
    }
    return "null";
}

} // namespace demo
