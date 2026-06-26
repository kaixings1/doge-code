# Serialization

Comprehensive guide to data serialization in modern C++, covering JSON, XML, Protocol Buffers, and binary formats.

## JSON

### nlohmann/json

```cpp
#include <nlohmann/json.hpp>

using json = nlohmann::json;

// Creating JSON
json j = {
    {"name", "John"},
    {"age", 30},
    {"address", {
        {"city", "NYC"},
        {"zip", "10001"}
    }},
    {"skills", {"C++", "Python", "Rust"}},
    {"active", true}
};

// From string
json j2 = json::parse(R"({"key": "value"})");

// Serialization
std::string str = j.dump();  // Compact
std::string pretty = j.dump(4);  // Pretty print

// Accessing values
std::string name = j["name"].get<std::string>();
int age = j.at("age").get<int>();

// Optional access
auto it = j.find("email");
if (it != j.end()) {
    std::string email = it->get<std::string>();
}

// Default values
std::string city = j.value("city", "Unknown");

// Iteration
for (auto& [key, value] : j.items()) {
    std::cout << key << ": " << value << '\n';
}

// Arrays
j["scores"].push_back(95);
j["scores"].push_back(87);

// Nested objects
j["metadata"]["created"] = "2024-01-01";
j["metadata"]["version"] = 1;
```

### RapidJSON

```cpp
#include <rapidjson/document.h>
#include <rapidjson/writer.h>
#include <rapidjson/stringbuffer.h>

using namespace rapidjson;

// Parse
Document d;
d.Parse(json_string.c_str());

// Check for errors
if (d.HasParseError()) {
    std::cerr << "Parse error at " << d.GetErrorOffset() << '\n';
}

// Access
const Value& name = d["name"];
std::string name_str = name.GetString();

int age = d["age"].GetInt();

// Iterate
for (Value::ConstMemberIterator it = d.MemberBegin(); 
     it != d.MemberEnd(); ++it) {
    std::cout << it->name.GetString() << ": " << it->value << '\n';
}

// Build JSON
StringBuffer sb;
Writer<StringBuffer> writer(sb);
d.Accept(writer);
std::string result = sb.GetString();
```

## Protocol Buffers

### .proto Definition

```proto
syntax = "proto3";

package myapp;

message Person {
    string name = 1;
    int32 id = 2;
    string email = 3;
    
    enum PhoneType {
        MOBILE = 0;
        HOME = 1;
        WORK = 2;
    }
    
    message PhoneNumber {
        string number = 1;
        PhoneType type = 2;
    }
    
    repeated PhoneNumber phones = 4;
}

message AddressBook {
    repeated Person people = 1;
}
```

### C++ Usage

```cpp
#include <person.pb.h>

// Create message
Person person;
person.set_name("John Doe");
person.set_id(123);
person.set_email("john@example.com");

// Add phone
PhoneNumber* phone = person.add_phones();
phone->set_number("555-1234");
phone->set_type(PhoneType::MOBILE);

// Serialize to string
std::string data;
person.SerializeToString(&data);

// Deserialize
Person parsed;
if (!parsed.ParseFromString(data)) {
    std::cerr << "Failed to parse\n";
}

// Access fields
std::cout << parsed.name() << '\n';
for (const auto& phone : parsed.phones()) {
    std::cout << phone.number() << '\n';
}

// Working with Unknown fields (forward compatibility)
std::string unknown_data;
person.SerializeToString(&unknown_data);
parsed.ParseFromString(unknown_data);
```

## Binary Serialization

### Custom Binary Format

```cpp
#include <fstream>
#include <vector>
#include <cstring>

class BinaryWriter {
    std::vector<uint8_t> buffer_;
    
public:
    void write_int32(int32_t value) {
        uint8_t bytes[4];
        bytes[0] = (value >> 0) & 0xFF;
        bytes[1] = (value >> 8) & 0xFF;
        bytes[2] = (value >> 16) & 0xFF;
        bytes[3] = (value >> 24) & 0xFF;
        buffer_.insert(buffer_.end(), bytes, bytes + 4);
    }
    
    void write_string(const std::string& s) {
        write_int32(static_cast<int32_t>(s.size()));
        buffer_.insert(buffer_.end(), s.begin(), s.end());
    }
    
    void write_float(float value) {
        uint8_t bytes[4];
        std::memcpy(bytes, &value, 4);
        buffer_.insert(buffer_.end(), bytes, bytes + 4);
    }
    
    const std::vector<uint8_t>& data() const { return buffer_; }
};

class BinaryReader {
    const uint8_t* data_;
    size_t pos_ = 0;
    size_t size_;
    
public:
    BinaryReader(const uint8_t* data, size_t size) 
        : data_(data), size_(size) {}
    
    int32_t read_int32() {
        int32_t value = static_cast<int32_t>(data_[pos_]) |
                       (static_cast<int32_t>(data_[pos_+1]) << 8) |
                       (static_cast<int32_t>(data_[pos_+2]) << 16) |
                       (static_cast<int32_t>(data_[pos_+3]) << 24);
        pos_ += 4;
        return value;
    }
    
    std::string read_string() {
        int32_t len = read_int32();
        std::string s(reinterpret_cast<const char*>(data_ + pos_), len);
        pos_ += len;
        return s;
    }
};
```

### FlatBuffers

```cpp
#include <flatbuffers/flatbuffers.h>

// Schema (idlschema)
namespace MyGame {
    namespace Sample {
        struct MonsterT {
            int hp;
            int mana;
            std::string name;
            std::vector<std::string> inventory;
        };
    }
}

// Building
flatbuffers::DetachedBuffer buffer = CreateMonsterDirect(
    fbb,
    80,  // hp
    100,  // mana
    "MyMonster",  // name
    nullptr,  // equipment
    &inventory  // inventory
);

// Reading
auto monster = GetMonster(buffer.data());
int hp = monster->hp();
std::string name = monster->name()->str();
```

## MessagePack

```cpp
#include <msgpack.hpp>

// Serialize
msgpack::sbuffer buffer;
msgpack::pack(buffer, std::make_tuple(1, "hello", true));

// Deserialize
msgpack::unpacked result = msgpack::unpack(buffer.data(), buffer.size());
std::tuple<int, std::string, bool> data;
result.get().convert(data);

// With map
msgpack::type::map<std::string, int> m = {{"a", 1}, {"b", 2}};
msgpack::pack(buffer, m);
```

## XML

### TinyXML2

```cpp
#include <tinyxml2.h>

using namespace tinyxml2;

// Create document
XMLDocument doc;
XMLDeclaration* decl = doc.NewDeclaration();
doc.InsertFirstChild(decl);

// Add element
XMLElement* root = doc.NewElement("config");
doc.InsertFirstChild(root);

XMLElement* server = doc.NewElement("server");
server->SetAttribute("port", 8080);
server->SetText("localhost");
root->InsertEndChild(server);

// Save to file
doc.SaveFile("config.xml");

// Load
XMLDocument loaded;
loaded.LoadFile("config.xml");
XMLElement* r = loaded.FirstChildElement("config");
for (XMLElement* s = r->FirstChildElement("server"); 
     s != nullptr; 
     s = s->NextSiblingElement("server")) {
    const char* host = s->GetText();
    int port = s->IntAttribute("port");
}
```

## YAML

```cpp
#include <yaml-cpp/yaml.h>

// Load
YAML::Node config = YAML::LoadFile("config.yaml");

// Access
std::string name = config["name"].as<std::string>();
int age = config["age"].as<int>();

// Nested
std::string city = config["address"]["city"].as<std::string>();

// Iterate
for (const auto& item : config["items"]) {
    std::cout << item.as<std::string>() << '\n';
}

// Build
YAML::Node node;
node["name"] = "John";
node["age"] = 30;
node["address"]["city"] = "NYC";
node["items"].push_back("a");
node["items"].push_back("b");

std::string yaml = YAML::Dump(node);
```

## Best Practices

1. **Choose right format** - JSON for web, Protobuf for efficiency
2. **Version schemas** - Plan for backward/forward compatibility
3. **Validate input** - Never trust deserialized data
4. **Use streaming** - For large data, avoid loading everything
5. **Consider compression** - gzip for large payloads
6. **Schema evolution** - Design for change
7. **Security** - Validate sizes, prevent buffer overflows
8. **Performance** - Profile serialization/deserialization

## Resources

- [nlohmann/json](https://github.com/nlohmann/json)
- [Protocol Buffers](https://developers.google.com/protocol-buffers)
- [RapidJSON](https://github.com/Tencent/rapidjson)
- [FlatBuffers](https://google.github.io/flatbuffers/)
- [YAML-CPP](https://github.com/jbeder/yaml-cpp)
