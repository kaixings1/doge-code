#include "config.h"
#include "utils/json_parser.h"
#include <fstream>

namespace demo {

AppConfig LoadConfig(const std::wstring& path) {
    AppConfig cfg;
    auto json = JsonParser::ParseFile(path);
    if (json.IsNull()) return cfg;

    if (json.Contains("appName")) {
        auto s = json["appName"].AsString();
        cfg.appName = {s.begin(), s.end()};
    }
    if (json.Contains("version")) {
        auto s = json["version"].AsString();
        cfg.version = {s.begin(), s.end()};
    }
    if (json.Contains("logDir")) {
        auto s = json["logDir"].AsString();
        cfg.logDir = {s.begin(), s.end()};
    }
    if (json.Contains("dataDir")) {
        auto s = json["dataDir"].AsString();
        cfg.dataDir = {s.begin(), s.end()};
    }
    if (json.Contains("logLevel"))        cfg.logLevel        = json["logLevel"].AsString();
    if (json.Contains("producerThreads")) cfg.producerThreads = json["producerThreads"].AsInt();
    if (json.Contains("consumerThreads")) cfg.consumerThreads = json["consumerThreads"].AsInt();
    if (json.Contains("queueSize"))       cfg.queueSize       = json["queueSize"].AsInt();

    return cfg;
}

void SaveConfig(const AppConfig& cfg, const std::wstring& path) {
    JsonValue::Object obj;
    obj["appName"]         = std::string(cfg.appName.begin(), cfg.appName.end());
    obj["version"]         = std::string(cfg.version.begin(), cfg.version.end());
    obj["logDir"]          = std::string(cfg.logDir.begin(), cfg.logDir.end());
    obj["dataDir"]         = std::string(cfg.dataDir.begin(), cfg.dataDir.end());
    obj["logLevel"]        = cfg.logLevel;
    obj["producerThreads"] = static_cast<double>(cfg.producerThreads);
    obj["consumerThreads"] = static_cast<double>(cfg.consumerThreads);
    obj["queueSize"]       = static_cast<double>(cfg.queueSize);

    std::ofstream file(path);
    file << JsonParser::Serialize(obj);
}

} // namespace demo
