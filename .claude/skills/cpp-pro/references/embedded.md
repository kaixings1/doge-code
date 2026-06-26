# Embedded Systems Programming

Guide to C++ programming for embedded systems, covering bare-metal, no-std, and microcontroller development.

## No-Standard Library

### Freestanding Environment

```cpp
// No standard library - bare metal
// No new, no delete, no exceptions, no RTTI

// Minimal startup
extern "C" {
    void _start() {
        // Initialize .data and .bss
        // Call constructors
        main();
        // Call destructors
        // halt
    }
}

// Custom new/delete
void* operator new(size_t size) {
    return malloc(size);
}

void operator delete(void* ptr) {
    free(ptr);
}

// Assert
void __assert_fail(const char* expr, const char* file, 
                   unsigned line, const char* func) {
    while (1);  // Hang
}
```

### Bare Metal Register Access

```cpp
// Memory-mapped I/O
volatile uint32_t* const UART = reinterpret_cast<volatile uint32_t*>(0x40001000);

void uart_putchar(char c) {
    while (UART[1] & 0x20);  // Wait TX buffer empty
    UART[0] = c;
}

void uart_puts(const char* s) {
    while (*s) {
        uart_putchar(*s++);
    }
}

// Bit manipulation
void set_bit(volatile uint32_t* reg, int bit) {
    reg[0] = (1 << bit);
}

void clear_bit(volatile uint32_t* reg, int bit) {
    reg[0] = ~(1 << bit);
}
```

## STM32 Example

```cpp
#include <cstdint>

// STM32F4 register addresses
namespace stm32 {
    constexpr uint32_t RCC_BASE = 0x40023800;
    constexpr uint32_t GPIOA_BASE = 0x40020000;
    
    struct RCC {
        volatile uint32_t* const CR = reinterpret_cast<volatile uint32_t*>(RCC_BASE + 0x00);
        volatile uint32_t* const APB1ENR = reinterpret_cast<volatile uint32_t*>(RCC_BASE + 0x1C);
    };
    
    struct GPIO {
        volatile uint32_t* const MODER = reinterpret_cast<volatile uint32_t*>(GPIOA_BASE + 0x00);
        volatile uint32_t* const ODR = reinterpret_cast<volatile uint32_t*>(GPIOA_BASE + 0x14);
    };
}

void led_on() {
    stm32::RCC rcc;
    stm32::GPIO gpio;
    
    // Enable GPIOA clock
    *rcc.APB1ENR |= (1 << 0);
    
    // Set PA5 to output
    *gpio.MODER = (*gpio.MODER & ~0x3C0) | 0x140;
    
    // Turn on LED
    *gpio.ODR |= (1 << 5);
}
```

## Interrupt Handling

```cpp
// Interrupt service routine
extern "C" {
    
void TIM2_IRQHandler() {
    // Clear pending flag
    volatile uint32_t* TIM2_SR = reinterpret_cast<volatile uint32_t*>(0x40000000);
    *TIM2_SR = 0;
    
    // Handle interrupt
    ++timer_ticks;
}

}

// Vector table
using ISR = void(*)();

__attribute__((section(".isr_vector")))
const ISR vector_table[16] = {
    0,          // Initial stack pointer
    _start,     // Reset
    0, 0, 0, 0, // NMI, HardFault, MemManage, BusFault
    0, 0, 0,   // UsageFault, Reserved
    0,          // SVCall
    0, 0,       // PendSV, SysTick
    TIM2_IRQHandler  // Timer interrupt
};
```

## Memory-Mapped I/O

```cpp
// Template for register access
template<uint32_t Address>
struct Register {
    volatile uint32_t& operator()() const {
        return *reinterpret_cast<volatile uint32_t*>(Address);
    }
    
    Register& set(uint32_t bits) {
        (*this)() |= bits;
        return *this;
    }
    
    Register& clear(uint32_t bits) {
        (*this)() &= ~bits;
        return *this;
    }
    
    bool test(uint32_t bits) const {
        return (*this)() & bits;
    }
};

// Usage
using RCC_AHB1ENR = Register<0x40023830>;
using GPIOA_MODER = Register<0x40020000>;

void init() {
    RCC_AHB1ENR().set(1 << 0);  // Enable GPIOA
    GPIOA_MODER().clear(0x3C0); // Clear bits
    GPIOA_MODER().set(0x140);   // Set output mode
}
```

## Ring Buffers

```cpp
template<typename T, size_t N>
class RingBuffer {
    T data_[N];
    size_t head_ = 0;
    size_t tail_ = 0;
    
public:
    bool write(const T& value) {
        size_t next = (head_ + 1) % N;
        if (next == tail_) return false;  // Full
        
        data_[head_] = value;
        head_ = next;
        return true;
    }
    
    bool read(T& value) {
        if (tail_ == head_) return false;  // Empty
        
        value = data_[tail_];
        tail_ = (tail_ + 1) % N;
        return true;
    }
    
    bool empty() const { return head_ == tail_; }
    bool full() const { return (head_ + 1) % N == tail_; }
};
```

## Watchdog Timer

```cpp
class Watchdog {
public:
    void start(uint32_t timeout_ms) {
        // IWDG_KR = 0x5555 to enable
        // IWDG_PR = prescaler
        // IWDG_RLR = reload value
    }
    
    void kick() {
        // IWDG_KR = 0xAAAA to reload
    }
};
```

## Optimization for Size

```cpp
// -Os for size optimization

// Use inline carefully
inline void critical_function() {
    // Inline this
}

// Bit fields for packed data
struct __attribute__((packed)) Packet {
    uint8_t header;
    uint32_t id : 24;  // 24-bit field
    uint8_t flags;
    uint16_t data;
};

// Placement new for fixed buffers
alignas(4) char buffer[1024];

void* operator new(size_t, void* p) noexcept {
    return p;
}

void use_buffer() {
    Widget* w = new (buffer) Widget();
    w->~Widget();
}
```

## RTOS Integration

```cpp
// FreeRTOS task
extern "C" void vTaskCode(void* params) {
    while (true) {
        // Do work
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

// Create task
TaskHandle_t task;
xTaskCreate(vTaskCode, "Task", 256, nullptr, 1, &task);

// Mutex
SemaphoreHandle_t mutex = xSemaphoreCreateMutex();

void critical() {
    if (xSemaphoreTake(mutex, portMAX_DELAY)) {
        // Protected access
        xSemaphoreGive(mutex);
    }
}

// Queue
QueueHandle_t queue = xQueueCreate(10, sizeof(Message));
xQueueSend(queue, &msg, 0);
```

## Testing Embedded

```cpp
// Unit tests on host
#include <gtest/gtest.h>

TEST(RegisterTest, SetBit) {
    uint32_t reg = 0;
    set_bit(reg, 5);
    EXPECT_EQ(reg, 1 << 5);
}

// Hardware abstraction for testing
class UART {
public:
    virtual void putchar(char c) = 0;
    virtual char getchar() = 0;
    virtual bool ready() = 0;
};

// Mock for testing
class MockUART : public UART {
    std::queue<char> tx_queue;
    std::queue<char> rx_queue;
public:
    void putchar(char c) override { tx_queue.push(c); }
    char getchar() override { char c = rx_queue.front(); rx_queue.pop(); return c; }
    bool ready() override { return true; }
};
```

## Best Practices

1. **Use -Os or -O2** - Optimize for size or speed
2. **Static allocation** - Avoid heap in real-time
3. **No exceptions** - Disable for embedded
4. **Custom new/delete** - Pool allocator for embedded
5. **volatile** - For hardware registers
6. **pack** - For packed structures
7. **Test on host** - Compile for native first

## Resources

- [CMSIS Documentation](https://arm-software.github.io/CMSIS_5/)
- [FreeRTOS](https://www.freertos.org/)
- [Libopencm3](https://libopencm3.github.io/)
