# Boost Libraries

Comprehensive guide to commonly used Boost libraries for professional C++ development.

## Smart Pointers (boost::movelib)

```cpp
#include <boost/move/unique_ptr.hpp>
#include <boost/move/shared_ptr.hpp>

// unique_ptr with custom deleter
boost::movelib::unique_ptr<FILE, boost::movelib::file_deleter> 
    file(boost::movelib::file_open("data.txt"));

// compatible with std::unique_ptr
using boost::movelib::unique_ptr;
```

## Optional (boost::optional)

```cpp
#include <boost/optional.hpp>

boost::optional<int> find_value(const std::vector<int>& vec, int target) {
    auto it = std::find(vec.begin(), vec.end(), target);
    if (it != vec.end()) return *it;
    return boost::none;
}

// With references
boost::optional<std::string&> find_by_key(
    std::map<std::string, std::string>& map, 
    const std::string& key
) {
    auto it = map.find(key);
    if (it != map.end()) return it->second;
    return boost::none;
}

// Optional with transformations
boost::optional<double> result = find_value(vec, 42)
    | [](int v) { return static_cast<double>(v) * 2.0; };
```

## Variant (boost::variant)

```cpp
#include <boost/variant.hpp>

using Value = boost::variant<int, double, std::string>;

Value v = 42;
v = 3.14;
v = std::string("hello");

// Visitor pattern
struct PrintVisitor : boost::static_visitor<void> {
    void operator()(int i) const { std::cout << "int: " << i << '\n'; }
    void operator()(double d) const { std::cout << "double: " << d << '\n'; }
    void operator()(const std::string& s) const { 
        std::cout << "string: " << s << '\n'; 
    }
};

boost::apply_visitor(PrintVisitor{}, v);

// Lambda visitor (C++14+)
auto double_visitor = [](auto& val) {
    using T = std::decay_t<decltype(val)>;
    if constexpr (std::is_arithmetic_v<T>) {
        std::cout << val * 2 << '\n';
    }
};
boost::apply_visitor(double_visitor, v);
```

## Any (boost::any)

```cpp
#include <boost/any.hpp>

boost::any data = 42;
data = std::string("hello");
data = std::vector<int>{1, 2, 3};

// Safe extraction
if (auto* val = boost::any_cast<int>(&data)) {
    std::cout << *val << '\n';
}

// With holder pattern
class AnyHolder {
    boost::any data_;
public:
    template<typename T>
    void set(T&& value) { data_ = std::forward<T>(value); }
    
    template<typename T>
    T* get() { return boost::any_cast<T>(&data_); }
};
```

## String Algorithms

```cpp
#include <boost/algorithm/string.hpp>

std::string s = "  Hello, World!  ";

// Trimming
std::string trimmed = boost::algorithm::trim(s);  // "Hello, World!"
boost::algorithm::trim_left(s);
boost::algorithm::trim_right(s);

// Case conversion
std::string upper = boost::algorithm::to_upper_copy(s);
std::string lower = boost::algorithm::to_lower_copy(s);

// Splitting
std::vector<std::string> parts;
boost::algorithm::split(parts, "a,b,c", boost::algorithm::is_any_of(","));

// Joining
std::vector<std::string> vec = {"a", "b", "c"};
std::string joined = boost::algorithm::join(vec, "-");  // "a-b-c"

// Finding and replacing
std::string result = boost::algorithm::replace_all_copy(
    "hello world", "world", "there"
);
```

## Container Utilities

```cpp
#include <boost/container/vector.hpp>
#include <boost/container/string.hpp>

// Flat containers (contiguous, no allocator issues)
boost::container::vector<int> vec = {1, 2, 3};
boost::container::string str = "hello";

// Small vector (embedded storage for small sizes)
boost::container::small_vector<int, 4> small_vec;
small_vec.push_back(1);  // Uses embedded storage

// Stable vector (stable iterators)
boost::container::stable_vector<int> stable_vec;

// Static vector (fixed capacity)
boost::container::static_vector<int, 10> fixed_vec;
```

## Tokenizer

```cpp
#include <boost/tokenizer.hpp>

std::string data = "one,two,three,four";

// Simple tokenizer
boost::tokenizer<boost::char_separator<char>> tok(
    data, boost::char_separator<char>(",")
);
for (const auto& t : tok) {
    std::cout << t << '\n';
}

// Escaped list tokenizer
std::string csv = "a,\"b,c\",d";
boost::tokenizer<boost::escaped_list_separator<char>> csv_tok(csv);

// Fixed-width tokenizer
std::string fixed = "1234567890";
boost::tokenizer<boost::offset_separator> fix_tok(
    fixed, boost::offset_separator({3, 5, 7})
);
```

## Date/Time (boost::posix_time)

```cpp
#include <boost/date_time/posix_time/posix_time.hpp>

namespace pt = boost::posix_time;
namespace gd = boost::gregorian;

// Current time
pt::ptime now = pt::second_clock::local_time();
std::cout << now << '\n';  // 2024-01-15 14:30:00

// Time duration
pt::time_duration dur = pt::hours(2) + pt::minutes(30);
pt::ptime later = now + dur;

// Date
gd::date today = gd::day_clock::local_day();
gd::date tomorrow = today + gd::days(1);

// Date/Time parsing
pt::ptime parsed = pt::time_from_string("2024-01-15 14:gd30:00");
::date parsed_date = gd::from_string("2024-01-15");
```

## Format (boost::format)

```cpp
#include <boost/format.hpp>

// Python-like formatting
std::cout << boost::format("|%1%| %2% %3%") % 42 % "hello" % 3.14;

// Zero-padded
std::cout << boost::format("%05d") % 42;  // "00042"

// Hex, octal
std::cout << boost::format("%x") % 255;   // "ff"
std::cout << boost::format("%02x") % 255; // "ff"

// Positional arguments
std::cout << boost::format("%1% %2% %1%") % "a" % "b";  // "a b a"
```

## Lexical Cast

```cpp
#include <boost/lexical_cast.hpp>

// String to number
int i = boost::lexical_cast<int>("42");
double d = boost::lexical_cast<double>("3.14");

// Number to string
std::string s = boost::lexical_cast<std::string>(123);

// With error handling
try {
    int x = boost::lexical_cast<int>("not a number");
} catch (const boost::bad_lexical_cast& e) {
    std::cerr << e.what() << '\n';
}
```

## Smart Pointers (boost::intrusive)

```cpp
#include <boost/intrusive/list.hpp>
#include <boost/intrusive/set.hpp>

// Intrusive list (no extra memory per element)
struct MyNode : boost::intrusive::list_base_hook<> {
    int value;
};

boost::intrusive::list<MyNode> my_list;
MyNode node1{1}, node2{2};
my_list.push_back(node1);
my_list.push_back(node2);

// Intrusive set
struct MyItem : boost::intrusive::set_base_hook<> {
    int key;
    std::string value;
    // Less comparator
    bool operator<(const MyItem& other) const { return key < other.key; }
};

boost::intrusive::set<MyItem> my_set;
```

## Property Tree (JSON/XML/INI)

```cpp
#include <boost/property_tree/ptree.hpp>
#include <boost/property_tree/json_parser.hpp>
#include <boost/property_tree/xml_parser.hpp>

namespace pt = boost::property_tree;

// Create JSON
pt::ptree json;
json.put("name", "John");
json.put("age", 30);
json.add("address.city", "NYC");

// Add array
pt::ptree hobbies;
hobbies.push_back({}, "reading");
hobbies.push_back({}, "coding");
json.add_child("hobbies", hobbies);

// Write to string
std::ostringstream oss;
write_json(oss, json);
std::string json_str = oss.str();

// Parse JSON
pt::ptree parsed;
std::istringstream iss(json_str);
read_json(iss, parsed);

std::string name = parsed.get<std::string>("name");
int age = parsed.get<int>("age");
```

## UUID

```cpp
#include <boost/uuid/uuid.hpp>
#include <boost/uuid/uuid_generators.hpp>
#include <boost/uuid/uuid_io.hpp>

boost::uuids::uuid id = boost::uuids::random_generator()();
std::string id_str = boost::uuids::to_string(id);

// Nil UUID
boost::uuids::uuid nil = boost::uuids::nil_uuid();

// Name-based UUID (deterministic)
boost::uuids::uuid name_id = boost::uuids::name_generator(
    boost::uuids::uuid(boost::uuid::nil_generator()())
)("my_namespace_string");
```

## Multi-Index Container

```cpp
#include <boost/multi_index_container.hpp>
#include <boost/multi_index/ordered_index.hpp>
#include <boost/multi_index/sequenced_index.hpp>

namespace bmi = boost::multi_index;

struct Employee {
    int id;
    std::string name;
    std::string department;
    int salary;
};

using EmployeeIndex = bmi::multi_index_container<
    Employee,
    bmi::indexed_by<
        // Primary key - ordered by ID
        bmi::ordered_unique<
            bmi::tag<struct by_id>,
            bmi::member<Employee, int, &Employee::id>
        >,
        // Secondary key - ordered by name
        bmi::ordered_unique<
            bmi::tag<struct by_name>,
            bmi::member<Employee, std::string, &Employee::name>
        >,
        // Ordered by salary
        bmi::ordered_non_unique<
            bmi::tag<struct by_salary>,
            bmi::member<Employee, int, &Employee::salary>
        >
    >
>;

EmployeeIndex employees;

// Query by different indices
auto& by_id = employees.get<by_id>();
auto& by_name = employees.get<by_name>();
auto& by_salary = employees.get<by_salary>();

// Find by name
auto it = by_name.find("John");
```

## Program Options

```cpp
#include <boost/program_options.hpp>

namespace po = boost::program_options;

int main(int argc, char* argv[]) {
    po::options_description desc("Allowed options");
    desc.add_options()
        ("help,h", "produce help message")
        ("config,c", po::value<std::string>()->default_value("config.txt"),
            "configuration file")
        ("verbose,v", po::value<int>()->implicit_value(1),
            "verbose output (optional level)")
        ("input,i", po::value<std::vector<std::string>>(),
            "input files");
    
    po::variables_map vm;
    po::store(po::parse_command_line(argc, argv, desc), vm);
    po::notify(vm);
    
    if (vm.count("help")) {
        std::cout << desc << '\n';
        return 0;
    }
    
    if (vm.count("config")) {
        std::string config = vm["config"].as<std::string>();
    }
}
```

## Threading (boost::thread)

```cpp
#include <boost/thread.hpp>
#include <boost/thread/mutex.hpp>

boost::mutex mtx;
int counter = 0;

void worker(int id) {
    for (int i = 0; i < 1000; ++i) {
        boost::lock_guard<boost::mutex> lock(mtx);
        ++counter;
    }
}

int main() {
    std::vector<boost::thread> threads;
    for (int i = 0; i < 4; ++i) {
        threads.emplace_back(worker, i);
    }
    
    for (auto& t : threads) {
        t.join();
    }
}
```

## CRC

```cpp
#include <boost/crc.hpp>

// CRC-32
boost::crc_32_type crc;
crc.process_bytes(data, length);
uint32_t checksum = crc.checksum();

// CRC-CCITT
boost::crc_ccitt_type crc_ccitt;
crc_ccitt.process_byte(0x01);
crc_ccitt.process_bytes(buffer, size);
```

## Endian

```cpp
#include <boost/endian/conversion.hpp>

// Big/Little endian conversion
int32_t big = boost::endian::native_to_big(42);
int32_t little = boost::endian::native_to_little(42);

// Reverse byte order
int32_t reversed = boost::endian::byteswap(42);

//浮点数的字节交换也支持
float f = 3.14f;
float swapped = boost::endian::byteswap(f);
```

## Container Hash

```cpp
#include <boost/container_hash/hash.hpp>

// Hash any type
size_t h = boost::hash_value(42);
h = boost::hash_value("hello");

// Combine hashes
boost::hash_combine(h, 123);
boost::hash_combine(h, "string");

// Hash containers
std::vector<int> vec = {1, 2, 3};
h = boost::hash_range(vec.begin(), vec.end());
```

## Error Handling (boost::system)

```cpp
#include <boost/system/system_error.hpp>
#include <boost/system/error_code.hpp>

namespace sys = boost::system;

// Using error_code with filesystem
boost::filesystem::path p("nonexistent");
boost::system::error_code ec;
bool exists = boost::filesystem::exists(p, ec);

if (ec) {
    std::cerr << "Error: " << ec.message() << '\n';
}

// Create custom error codes
const sys::error_category& my_category();
sys::error_code make_error_code(MyError e);

enum class MyError { success, not_found, permission_denied };
```

## Best Practices

1. **Use C++11 equivalents when available** - std::unique_ptr, std::make_shared
2. **Boost.Thread is deprecated** - Use std::thread instead
3. **Header-only vs compiled** - Some Boost libs need linking (regex, filesystem)
4. **Version compatibility** - Check Boost version requirements
5. **Linking** - Many Boost libraries are header-only; some need `-lboost_xxx`

## Resources

- [Boost Documentation](https://www.boost.org/doc/)
- [Boost Getting Started](https://www.boost.org/doc/libs/release/more/getting_started/)
- [Boost Header Organization](https://www.boost.org/doc/libs/release/libs/headers/)
