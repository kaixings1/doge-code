# Networking

Comprehensive guide to network programming in modern C++, covering sockets, HTTP, WebSocket, and asynchronous networking with ASIO.

## Sockets

### TCP Server

```cpp
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>

class TCPServer {
    int sockfd_;
    
public:
    TCPServer(int port) {
        sockfd_ = socket(AF_INET, SOCK_STREAM, 0);
        
        int opt = 1;
        setsockopt(sockfd_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
        
        struct sockaddr_in addr = {};
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = INADDR_ANY;
        addr.sin_port = htons(port);
        
        bind(sockfd_, (struct sockaddr*)&addr, sizeof(addr));
        listen(sockfd_, 128);
    }
    
    int accept_client() {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        return accept(sockfd_, (struct sockaddr*)&client_addr, &client_len);
    }
    
    void handle_client(int client_fd) {
        char buffer[4096];
        ssize_t n = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
        if (n > 0) {
            buffer[n] = '\0';
            // Process request
            const char* response = "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nHello";
            send(client_fd, response, strlen(response), 0);
        }
        close(client_fd);
    }
    
    void run() {
        while (true) {
            int client = accept_client();
            handle_client(client);
        }
    }
    
    ~TCPServer() { close(sockfd_); }
};
```

### TCP Client

```cpp
class TCPClient {
    int sockfd_;
    
public:
    TCPClient(const std::string& host, int port) {
        sockfd_ = socket(AF_INET, SOCK_STREAM, 0);
        
        struct hostent* server = gethostbyname(host.c_str());
        struct sockaddr_in addr = {};
        addr.sin_family = AF_INET;
        memcpy(&addr.sin_addr.s_addr, server->h_addr, server->h_length);
        addr.sin_port = htons(port);
        
        connect(sockfd_, (struct sockaddr*)&addr, sizeof(addr));
    }
    
    std::string send_request(const std::string& data) {
        send(sockfd_, data.data(), data.size(), 0);
        
        char buffer[4096];
        std::string response;
        ssize_t n;
        while ((n = recv(sockfd_, buffer, sizeof(buffer) - 1, 0)) > 0) {
            buffer[n] = '\0';
            response += buffer;
        }
        return response;
    }
    
    ~TCPClient() { close(sockfd_); }
};
```

### UDP

```cpp
class UDPServer {
    int sockfd_;
    struct sockaddr_in addr_;
    
public:
    UDPServer(int port) {
        sockfd_ = socket(AF_INET, SOCK_DGRAM, 0);
        
        struct sockaddr_in addr = {};
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = INADDR_ANY;
        addr.sin_port = htons(port);
        
        bind(sockfd_, (struct sockaddr*)&addr, sizeof(addr));
    }
    
    std::pair<std::string, struct sockaddr_in> receive() {
        char buffer[4096];
        struct sockaddr_in client_addr;
        socklen_t len = sizeof(client_addr);
        
        ssize_t n = recvfrom(sockfd_, buffer, sizeof(buffer) - 1, 0,
                            (struct sockaddr*)&client_addr, &len);
        buffer[n] = '\0';
        
        return {buffer, client_addr};
    }
    
    void send_to(const std::string& data, const struct sockaddr_in& dest) {
        sendto(sockfd_, data.data(), data.size(), 0,
               (struct sockaddr*)&dest, sizeof(dest));
    }
    
    ~UDPServer() { close(sockfd_); }
};
```

## HTTP

### HTTP Client (libcurl)

```cpp
#include <curl/curl.h>
#include <string>

class HTTPClient {
    CURL* curl_;
    
public:
    HTTPClient() {
        curl_ = curl_easy_init();
        curl_easy_setopt(curl_, CURLOPT_FOLLOWLOCATION, 1L);
    }
    
    std::string get(const std::string& url) {
        curl_easy_setopt(curl_, CURLOPT_URL, url.c_str());
        
        std::string response;
        curl_easy_setopt(curl_, CURLOPT_WRITEFUNCTION, 
            +[](char* ptr, size_t size, size_t nmemb, void* userdata) {
                auto* response = static_cast<std::string*>(userdata);
                response->append(ptr, size * nmemb);
                return size * nmemb;
            });
        curl_easy_setopt(curl_, CURLOPT_WRITEDATA, &response);
        
        curl_easy_perform(curl_);
        return response;
    }
    
    std::string post(const std::string& url, const std::string& data) {
        curl_easy_setopt(curl_, CURLOPT_URL, url.c_str());
        curl_easy_setopt(curl_, CURLOPT_POSTFIELDS, data.c_str());
        
        std::string response;
        curl_easy_setopt(curl_, CURLOPT_WRITEFUNCTION, 
            +[](char* ptr, size_t size, size_t nmemb, void* userdata) {
                auto* response = static_cast<std::string*>(userdata);
                response->append(ptr, size * nmemb);
                return size * nmemb;
            });
        curl_easy_setopt(curl_, CURLOPT_WRITEDATA, &response);
        
        curl_easy_perform(curl_);
        return response;
    }
    
    ~HTTPClient() { curl_easy_cleanup(curl_); }
};
```

### HTTP Server (Built-in)

```cpp
#include <boost/beast/core.hpp>
#include <boost/beast/http.hpp>

namespace beast = boost::beast;
namespace http = beast::http;

class HTTPServer {
    tcp::acceptor acceptor_;
    tcp::socket socket_;
    
public:
    HTTPServer(boost::asio::io_context& ioc, uint16_t port)
        : acceptor_(ioc, {boost::asio::ip::tcp::v4(), port}),
          socket_(ioc) {
        accept();
    }
    
    void accept() {
        acceptor_.async_accept(socket_, 
            [this](boost::system::error_code ec) {
                if (!ec) {
                    std::make_shared<Session>(std::move(socket_))->run();
                }
                accept();
            });
    }
};

class Session : public std::enable_shared_from_this<Session> {
    beast::tcp_stream stream_;
    beast::flat_buffer buffer_;
    http::request<http::dynamic_body> req_;
    
public:
    explicit Session(tcp::socket socket) : stream_(std::move(socket)) {}
    
    void run() {
        do_read();
    }
    
    void do_read() {
        http::async_read(stream_, buffer_, req_,
            [self=shared_from_this()](boost::system::error_code ec, size_t) {
                if (!ec) {
                    self->handle_request();
                }
            });
    }
    
    void handle_request() {
        http::response<http::string_body> res{http::status::ok, req_.version()};
        res.set(http::field::content_type, "text/plain");
        res.body() = "Hello, World!";
        res.prepare_payload();
        
        http::async_write(stream_, res,
            [self=shared_from_this()](boost::system::error_code ec, size_t) {
                self->stream_.socket().shutdown(tcp::socket::shutdown_send, ec);
            });
    }
};
```

## Boost ASIO

### Async TCP Echo Server

```cpp
#include <boost/asio.hpp>
#include <memory>
#include <array>

using boost::asio::ip::tcp;

class Session : public std::enable_shared_from_this<Session> {
    tcp::socket socket_;
    std::array<char, 1024> data_;
    
public:
    explicit Session(tcp::socket socket) : socket_(std::move(socket)) {}
    
    void start() { do_read(); }
    
private:
    void do_read() {
        auto self(shared_from_this());
        socket_.async_read_some(boost::asio::buffer(data_),
            [this, self](boost::system::error_code ec, size_t length) {
                if (!ec) {
                    do_write(length);
                }
            });
    }
    
    void do_write(size_t length) {
        auto self(shared_from_this());
        boost::asio::async_write(socket_,
            boost::asio::buffer(data_, length),
            [this, self](boost::system::error_code ec, size_t /*length*/) {
                if (!ec) {
                    do_read();
                }
            });
    }
};

class Server {
    tcp::acceptor acceptor_;
    
public:
    Server(boost::asio::io_context& ioc, uint16_t port)
        : acceptor_(ioc, tcp::endpoint(tcp::v4(), port)) {
        do_accept();
    }
    
private:
    void do_accept() {
        acceptor_.async_accept(
            [this](boost::system::error_code ec, tcp::socket socket) {
                if (!ec) {
                    std::make_shared<Session>(std::move(socket))->start();
                }
                do_accept();
            });
    }
};
```

### Timer

```cpp
#include <boost/asio.hpp>
#include <iostream>

int main() {
    boost::asio::io_context io;
    
    boost::asio::steady_timer timer(io);
    timer.expires_after(std::chrono::seconds(1));
    
    timer.async_wait([](const boost::system::error_code& ec) {
        if (!ec) {
            std::cout << "Timer expired!\n";
        }
    });
    
    std::cout << "Waiting...\n";
    io.run();
}
```

## WebSocket

### WebSocket Server

```cpp
#include <boost/beast/websocket.hpp>

namespace websocket = beast::websocket;

class WSSession : public std::enable_shared_from_this<WSSession> {
    websocket::stream<tcp::socket> ws_;
    beast::flat_buffer buffer_;
    
public:
    explicit WSSession(tcp::socket socket) : ws_(std::move(socket)) {}
    
    void run() {
        ws_.async_accept([self=shared_from_this()](auto ec) {
            if (!ec) self->do_read();
        });
    }
    
private:
    void do_read() {
        ws_.async_read(buffer_,
            [self=shared_from_this()](auto ec, size_t) {
                if (!ec) {
                    auto out = beast::buffers_to_string(self->buffer_.data());
                    self->buffer_.consume(self->buffer_.size());
                    
                    // Echo back
                    self->ws_.text(self->ws_.got_text());
                    self->ws_.async_write(
                        boost::asio::buffer(out),
                        [self=shared_from_this()](auto ec, size_t) {
                            if (!ec) self->do_read();
                        });
                }
            });
    }
};
```

### WebSocket Client

```cpp
class WSClient {
    websocket::stream<tcp::socket> ws_;
    
public:
    WSClient(boost::asio::io_context& ioc) 
        : ws_(ioc) {}
    
    void connect(const std::string& host, const std::string& port) {
        tcp::resolver resolver(ws_.get_executor());
        auto results = resolver.resolve(host, port);
        
        boost::asio::connect(ws_.next_layer(), results);
        
        ws_.handshake(host, "/");
    }
    
    void send(const std::string& message) {
        ws_.write(boost::asio::buffer(message));
    }
    
    std::string receive() {
        beast::flat_buffer buffer;
        ws_.read(buffer);
        return beast::buffers_to_string(buffer.data());
    }
};
```

## Serialization

### JSON

```cpp
#include <nlohmann/json.hpp>

using json = nlohmann::json;

// Create JSON
json j = {
    {"name", "John"},
    {"age", 30},
    {"address", {
        {"city", "NYC"},
        {"zip", "10001"}
    }},
    {"skills", {"C++", "Python", "Rust"}}
};

// Parse JSON
json parsed = json::parse(R"({"key": "value"})");

// Access
std::string name = j["name"].get<std::string>();
int age = j.at("age").get<int>();

// Modify
j["age"] = 31;
j["skills"].push_back("Go");

// Serialize to string
std::string str = j.dump();
std::string pretty = j.dump(4);

// Iterate
for (auto& [key, value] : j.items()) {
    std::cout << key << ": " << value << '\n';
}
```

### Protocol Buffers

```proto
// person.proto
syntax = "proto3";

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
```

```cpp
#include <person.pb.h>

// Serialize
Person person;
person.set_name("John");
person.set_id(123);
person.add_phones()->set_number("555-1234");

std::string data;
person.SerializeToString(&data);

// Deserialize
Person parsed;
parsed.ParseFromString(data);
std::cout << parsed.name() << '\n';
```

### CBOR

```cpp
#include <cbor.h>

// Encode
cbor::encoder enc;
std::vector<uint8_t> buffer;
enc.encode(buffer, json::parse("{\"key\": \"value\"}"));

// Decode
cbor::decoder dec(buffer);
json j = dec.decode();
```

## Best Practices

1. **Use async I/O** - Boost ASIO for scalable servers
2. **Handle errors gracefully** - Check all system calls
3. **Set timeouts** - Prevent slow clients from blocking
4. **Reuse connections** - HTTP keep-alive, connection pooling
5. **Validate input** - Never trust network data
6. **Use secure protocols** - TLS/SSL for sensitive data
7. **Buffer management** - Avoid buffer overflows
8. **Resource cleanup** - Close sockets, cancel operations

## Resources

- [Boost Beast](https://github.com/boostorg/beast)
- [libcurl](https://curl.se/libcurl/)
- [nlohmann/json](https://github.com/nlohmann/json)
- [Protocol Buffers](https://developers.google.com/protocol-buffers)
