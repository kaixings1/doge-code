# Database Programming

Comprehensive guide to database programming in modern C++, covering SQLite, ORM patterns, and connection pooling.

## SQLite

### Basic Operations

```cpp
#include <sqlite3.h>
#include <string>
#include <iostream>

class Database {
    sqlite3* db_;
    
public:
    Database(const std::string& filename) {
        sqlite3_open(filename.c_str(), &db_);
    }
    
    ~Database() { sqlite3_close(db_); }
    
    void execute(const std::string& sql) {
        char* err_msg = nullptr;
        int rc = sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &err_msg);
        if (rc != SQLITE_OK) {
            std::string error = err_msg;
            sqlite3_free(err_msg);
            throw std::runtime_error(error);
        }
    }
    
    // Prepared statements
    class Statement {
        sqlite3_stmt* stmt_;
    public:
        Statement(sqlite3* db, const std::string& sql) {
            sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt_, nullptr);
        }
        ~Statement() { sqlite3_finalize(stmt_); }
        
        void bind(int idx, int value) { sqlite3_bind_int(stmt_, idx, value); }
        void bind(int idx, const std::string& value) { 
            sqlite3_bind_text(stmt_, idx, value.c_str(), -1, SQLITE_TRANSIENT); 
        }
        
        bool step() { return sqlite3_step(stmt_) == SQLITE_ROW; }
        
        int get_int(int col) { return sqlite3_column_int(stmt_, col); }
        std::string get_string(int col) { 
            return reinterpret_cast<const char*>(sqlite3_column_text(stmt_, col));
        }
    };
};
```

### Query Example

```cpp
void query_example(Database& db) {
    // Create table
    db.execute("CREATE TABLE IF NOT EXISTS users ("
               "id INTEGER PRIMARY KEY, "
               "name TEXT NOT NULL, "
               "email TEXT UNIQUE"
               ")");
    
    // Insert with prepared statement
    Database::Statement insert(db.db_, 
        "INSERT INTO users (name, email) VALUES (?, ?)");
    insert.bind(1, "John");
    insert.bind(2, "john@example.com");
    insert.step();
    
    // Query
    Database::Statement select(db.db_, 
        "SELECT id, name, email FROM users WHERE id > ?");
    select.bind(1, 0);
    
    while (select.step()) {
        std::cout << select.get_int(0) << ": " 
                  << select.get_string(1) << " <" 
                  << select.get_string(2) << ">\n";
    }
}
```

### Transactions

```cpp
void transaction_example(Database& db) {
    db.execute("BEGIN TRANSACTION");
    
    try {
        db.execute("INSERT INTO users (name) VALUES ('Alice')");
        db.execute("INSERT INTO users (name) VALUES ('Bob')");
        db.execute("COMMIT");
    } catch (...) {
        db.execute("ROLLBACK");
        throw;
    }
}
```

## SQL Database with soci

```cpp
#include <soci/soci.h>
#include <soci/sqlite3/soci-sqlite3.h>

using namespace soci;

int main() {
    session sql(sqlite3, "database.db");
    
    // Create table
    sql << "CREATE TABLE IF NOT EXISTS person ("
           "id INTEGER PRIMARY KEY, "
           "name VARCHAR(100), "
           "age INTEGER)";
    
    // Insert
    int id = 1;
    std::string name = "John";
    int age = 30;
    sql << "INSERT INTO person (id, name, age) VALUES (:id, :name, :age)",
        use(id), use(name), use(age);
    
    // Query single row
    row row;
    sql << "SELECT id, name, age FROM person WHERE id = 1", into(row);
    
    int pid = row.get<int>(0);
    std::string pname = row.get<std::string>(1);
    int page = row.get<int>(2);
    
    // Query multiple rows
    std::vector<Person> people;
    sql << "SELECT id, name, age FROM person", 
        into(people);  // Person must map to struct
    
    // With prepared statement
    statement st = (sql.prepare << 
        "SELECT name FROM person WHERE age > :age", 
        use(age));
    st.execute();
    while (st.fetch()) {
        std::string n;
        st.into(n);
        std::cout << n << '\n';
    }
}
```

## ORM Patterns

### Simple ORM

```cpp
#include <string>
#include <map>
#include <vector>
#include <memory>
#include <sqlite3.h>

// Model base
class Model {
public:
    virtual void save() = 0;
    virtual void remove() = 0;
    virtual ~Model() = default;
};

class User : public Model {
public:
    int id = 0;
    std::string name;
    std::string email;
    
    static User find(int id);
    static std::vector<User> all();
    static void destroy(int id);
    
    void save() override;
    void remove() override;
    
private:
    static std::string table_name() { return "users"; }
};

// Usage
User user;
user.name = "John";
user.email = "john@example.com";
user.save();

User found = User::find(1);
found.email = "newemail@example.com";
found.save();

User::destroy(2);
```

### Repository Pattern

```cpp
template<typename T>
class Repository {
public:
    virtual ~Repository() = default;
    virtual std::optional<T> find_by_id(int id) = 0;
    virtual std::vector<T> find_all() = 0;
    virtual void save(const T& entity) = 0;
    virtual void remove(int id) = 0;
};

class UserRepository : public Repository<User> {
    Database& db_;
    
public:
    explicit UserRepository(Database& db) : db_(db) {}
    
    std::optional<User> find_by_id(int id) override {
        Database::Statement stmt(db_.db_, 
            "SELECT id, name, email FROM users WHERE id = ?");
        stmt.bind(1, id);
        
        if (stmt.step()) {
            User u;
            u.id = stmt.get_int(0);
            u.name = stmt.get_string(1);
            u.email = stmt.get_string(2);
            return u;
        }
        return std::nullopt;
    }
    
    void save(const User& user) override {
        if (user.id == 0) {
            // Insert
        } else {
            // Update
        }
    }
};
```

## Connection Pooling

```cpp
#include <queue>
#include <mutex>
#include <condition_variable>
#include <memory>

class ConnectionPool {
    struct Connection {
        sqlite3* db;
        bool in_use = false;
        std::chrono::steady_clock::time_point last_used;
    };
    
    std::queue<std::unique_ptr<Connection>> pool_;
    std::mutex mutex_;
    std::condition_variable cv_;
    const size_t max_size_;
    
public:
    ConnectionPool(const std::string& db_path, size_t max_size) 
        : max_size_(max_size) {
        std::lock_guard lock(mutex_);
        for (size_t i = 0; i < max_size_; ++i) {
            sqlite3* db;
            sqlite3_open(db_path.c_str(), &db);
            pool_.push(std::make_unique<Connection>(Connection{db, false, {}}));
        }
    }
    
    std::unique_ptr<Connection> acquire() {
        std::unique_lock lock(mutex_);
        cv_.wait(lock, [this] { return !pool_.empty(); });
        
        auto conn = std::move(pool_.front());
        pool_.pop();
        conn->in_use = true;
        conn->last_used = std::chrono::steady_clock::now();
        
        return conn;
    }
    
    void release(std::unique_ptr<Connection> conn) {
        std::lock_guard lock(mutex_);
        conn->in_use = false;
        pool_.push(std::move(conn));
        cv_.notify_one();
    }
    
    ~ConnectionPool() {
        std::lock_guard lock(mutex_);
        while (!pool_.empty()) {
            sqlite3_close(pool_.front()->db);
            pool_.pop();
        }
    }
};
```

## Migration

```cpp
class Migration {
    Database& db_;
    
public:
    explicit Migration(Database& db) : db_(db) {}
    
    void run() {
        db_.execute("CREATE TABLE IF NOT EXISTS schema_migrations ("
                   "version INTEGER PRIMARY KEY, "
                   "name TEXT NOT NULL, "
                   "applied_at TEXT NOT NULL)");
        
        auto pending = get_pending_migrations();
        
        for (auto& migration : pending) {
            db_.execute("BEGIN TRANSACTION");
            try {
                migration.up();
                record_migration(migration);
                db_.execute("COMMIT");
            } catch (...) {
                db_.execute("ROLLBACK");
                throw;
            }
        }
    }
    
private:
    std::vector<Migration> get_pending_migrations() {
        // Return migrations not yet applied
    }
    
    void record_migration(const Migration& m) {
        // Insert into schema_migrations
    }
};

// Example migration
class CreateUsersTable : public Migration {
public:
    explicit CreateUsersTable(Database& db) : Migration(db) {}
    
    void up() override {
        execute("CREATE TABLE users ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "name TEXT NOT NULL, "
                "email TEXT UNIQUE NOT NULL, "
                "created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
    }
};
```

## Best Practices

1. **Use prepared statements** - Prevent SQL injection
2. **Use transactions** - Ensure atomicity for multiple operations
3. **Connection pooling** - Reuse connections for performance
4. **Handle errors gracefully** - Catch exceptions, log failures
5. **Validate input** - Sanitize all user data
6. **Use migrations** - Version control your schema
7. **Close connections** - Always release resources
8. **Index wisely** - Optimize query performance

## Resources

- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [ SOCI Library](http://soci.sourceforge.net/)
- [SQLite C++ Tutorial](https://www.tutorialspoint.com/sqlite/sqlite_c_cpp.htm)
