#pragma once
#include <string>
#include <vector>
#include <fstream>
#include <sstream>

namespace demo {

class CsvReader {
public:
    using Row = std::vector<std::string>;
    using Table = std::vector<Row>;

    explicit CsvReader(const std::wstring& path) : path_(path) {}

    bool Open() {
        file_.open(path_);
        return file_.is_open();
    }

    bool ReadRow(Row& out) {
        if (!file_.is_open()) return false;
        std::string line;
        if (!std::getline(file_, line)) return false;
        std::stringstream ss(line);
        std::string cell;
        out.clear();
        while (std::getline(ss, cell, ',')) {
            // Trim whitespace
            cell.erase(0, cell.find_first_not_of(" \t\r\n"));
            cell.erase(cell.find_last_not_of(" \t\r\n") + 1);
            out.push_back(cell);
        }
        return true;
    }

    Table ReadAll() {
        Table table;
        Row row;
        while (ReadRow(row))
            table.push_back(std::move(row));
        return table;
    }

    void Close() { if (file_.is_open()) file_.close(); }

    ~CsvReader() { Close(); }

private:
    std::wstring path_;
    std::ifstream file_;
};

} // namespace demo
