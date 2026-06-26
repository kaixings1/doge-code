# Cross-Platform Windows Development

Guide to Windows-specific C++ development including Win32 API, COM, and ATL/WTL patterns.

## Win32 API Basics

```cpp
#include <windows.h>

// Wide strings (Windows uses UTF-16)
int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, 
                    LPWSTR lpCmdLine, int nCmdShow) {
    // Message box
    MessageBoxW(nullptr, L"Hello, World!", L"Title", MB_OK);
    
    // Window class registration
    WNDCLASSW wc = {};
    wc.lpfnWndProc = [](HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) -> LRESULT {
        switch (msg) {
            case WM_DESTROY:
                PostQuitMessage(0);
                return 0;
        }
        return DefWindowProcW(hWnd, msg, wParam, lParam);
    };
    wc.hInstance = hInstance;
    wc.lpszClassName = L"MyWindow";
    RegisterClassW(&wc);
    
    // Create window
    HWND hwnd = CreateWindowW(L"MyWindow", L"Title", WS_OVERLAPPEDWINDOW,
                              CW_USEDEFAULT, CW_USEDEFAULT, 800, 600,
                              nullptr, nullptr, hInstance, nullptr);
    
    ShowWindow(hwnd, nCmdShow);
    
    // Message loop
    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW);
    }
    
    return 0;
}
```

## COM (Component Object Model)

### Basic COM

```cpp
#include <windows.h>
#include <unknwn.h>

// COM Interface
class IMyInterface : public IUnknown {
public:
    virtual HRESULT STDMETHODCALLTYPE DoSomething(int param) = 0;
};

// COM Implementation
class CMyClass : public IMyInterface {
    long ref_count_ = 1;
    
public:
    // IUnknown
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (riid == IID_IUnknown || riid == IID_IMyInterface) {
            *ppv = this;
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    
    ULONG STDMETHODCALLTYPE AddRef() override { return ++ref_count_; }
    ULONG STDMETHODCALLTYPE Release() override { 
        if (--ref_count_ == 0) { delete this; return 0; }
        return ref_count_;
    }
    
    // IMyInterface
    HRESULT STDMETHODCALLTYPE DoSomething(int param) override {
        return S_OK;
    }
};

// COM usage
CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
IMyInterface* p = nullptr;
CoCreateInstance(CLSID_MyClass, nullptr, CLSCTX_INPROC_SERVER,
                 IID_IMyInterface, (void**)&p);
p->DoSomething(42);
p->Release();
CoUninitialize();
```

### Smart COM Pointers

```cpp
#include <windows.h>
#include <combaseapi.h>

// CComPtr - ATL smart pointer
#include <atlbase.h>
CComPtr<IMyInterface> p;
p.CoCreateInstance(CLSID_MyClass);
// Automatically Release'd

// CComQIPtr - QueryInterface helper
CComQIPtr<ISomeInterface> p2 = p;  // Calls QueryInterface
```

## ATL (Active Template Library)

```cpp
#include <atlbase.h>
#include <atlwin.h>

// ATL Window
class CMyWindow : public CWindowImpl<CMyWindow> {
public:
    DECLARE_WND_CLASS_EX(L"MyWindow", CS_DBLCLKS, (-1));
    
    BEGIN_MSG_MAP(CMyWindow)
        MESSAGE_HANDLER(WM_PAINT, OnPaint)
        MESSAGE_HANDLER(WM_DESTROY, OnDestroy)
    END_MSG_MAP()
    
    LRESULT OnPaint(UINT, WPARAM, LPARAM, BOOL&) {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(&ps);
        TextOutW(hdc, 10, 10, L"Hello!", 6);
        EndPaint(&ps);
        return 0;
    }
    
    LRESULT OnDestroy(UINT, WPARAM, LPARAM, BOOL&) {
        PostQuitMessage(0);
        return 0;
    }
};
```

## Windows Data Types

```cpp
// Basic Windows types
HINSTANCE   // Handle to instance
HWND       // Handle to window
HANDLE     // Generic handle
HMODULE    // Handle to module
HDC        // Device context
HPEN, HBRUSH, HFONT  // GDI objects

// String types
LPCSTR     // const char*
LPCWSTR    // const wchar_t*
LPTSTR     // char* or wchar_t* based on UNICODE define

// Error handling
if (!function()) {
    DWORD err = GetLastError();
    // Handle error
}
```

## WinRT (Windows Runtime)

```cpp
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Storage.h>

using namespace winrt;
using namespace Windows::Storage;

// Async operations
IAsyncOperation<StorageFile> save_async = 
    KnownFolders::Documents().CreateFileAsync(L"data.txt");

save_async.get();  // Wait for completion

// Or co_await
winrt::fire_and_forget save_async() {
    auto file = co_await KnownFolders::Documents().CreateFileAsync(L"data.txt");
    co_await FileIO::WriteTextAsync(file, L"Hello, WinRT!");
}
```

## Windows Registry

```cpp
#include <windows.h>

// Read registry value
HKEY key;
if (RegOpenKeyExW(HKEY_CURRENT_USER, L"Software\\MyApp", 0, 
                  KEY_READ, &key) == ERROR_SUCCESS) {
    DWORD type, size = sizeof(wchar_t) * 256;
    wchar_t value[256];
    RegQueryValueExW(key, L"Version", nullptr, &type, (LPBYTE)value, &size);
    RegCloseKey(key);
}

// Write registry value
RegCreateKeyExW(HKEY_CURRENT_USER, L"Software\\MyApp", 0, nullptr, 0,
                KEY_WRITE, nullptr, &key, nullptr);
RegSetValueExW(key, L"Version", 0, REG_SZ, (const BYTE*)L"1.0", 10);
RegCloseKey(key);
```

## Best Practices

1. **Use ATL/WTL** - Simplifies COM and window creation
2. **Use smart pointers** - CComPtr for COM, unique_ptr for handles
3. **Wide strings** - Use LPCWSTR on Windows
4. **Error handling** - Check return values, use GetLastError
5. **Unicode** - Write Unicode-aware code from start

## Resources

- [Windows API Reference](https://docs.microsoft.com/en-us/windows/win32/api/)
- [ATL Reference](https://docs.microsoft.com/en-us/cpp/atl/atl-library-reference)
- [WinRT Documentation](https://docs.microsoft.com/en-us/windows/uwp/cpp-and-winrt-apis/)
