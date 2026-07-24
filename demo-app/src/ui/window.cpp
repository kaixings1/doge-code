#include "ui/window.h"
#include "ui/console_renderer.h"
#include "utils/logger.h"

namespace demo {

Window::Window(int width, int height, const std::wstring& title)
    : width_(width), height_(height), title_(title) {}

Window::~Window() {
    if (hwnd_) DestroyWindow(hwnd_);
}

bool Window::Create() {
    WNDCLASSEXW wc = {};
    wc.cbSize        = sizeof(WNDCLASSEXW);
    wc.style         = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc   = WndProc;
    wc.hInstance     = GetModuleHandleW(nullptr);
    wc.hCursor       = LoadCursorW(nullptr, (LPCWSTR)IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"DemoAppWindow";

    if (!RegisterClassExW(&wc)) {
        LOG_ERROR(std::string("窗口类注册失败, error=") + std::to_string(GetLastError()));
        return false;
    }

    RECT rc = {0, 0, width_ * 8, height_ * 16};
    AdjustWindowRect(&rc, WS_OVERLAPPEDWINDOW, FALSE);

    hwnd_ = CreateWindowExW(
        0, L"DemoAppWindow", title_.c_str(),
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT, CW_USEDEFAULT,
        rc.right - rc.left, rc.bottom - rc.top,
        nullptr, nullptr, GetModuleHandleW(nullptr), this
    );

    if (!hwnd_) {
        LOG_ERROR(std::string("窗口创建失败, error=") + std::to_string(GetLastError()));
        return false;
    }

    return true;
}

void Window::Show() {
    ShowWindow(hwnd_, SW_SHOW);
    UpdateWindow(hwnd_);
}

void Window::Hide() {
    ShowWindow(hwnd_, SW_HIDE);
}

void Window::SetTitle(const std::wstring& title) {
    title_ = title;
    if (hwnd_) SetWindowTextW(hwnd_, title.c_str());
}

void Window::SetDrawCallback(DrawCallback cb) {
    drawCb_ = std::move(cb);
}

void Window::Invalidate() {
    if (hwnd_) InvalidateRect(hwnd_, nullptr, TRUE);
}

LRESULT CALLBACK Window::WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    Window* self = nullptr;
    if (msg == WM_NCCREATE) {
        auto* cs = reinterpret_cast<CREATESTRUCT*>(lParam);
        self = static_cast<Window*>(cs->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
    } else {
        self = reinterpret_cast<Window*>(GetWindowLongPtr(hwnd, GWLP_USERDATA));
    }

    if (self) {
        switch (msg) {
            case WM_PAINT: {
                PAINTSTRUCT ps;
                BeginPaint(hwnd, &ps);
                if (self->drawCb_) {
                    ConsoleRenderer renderer(self->width_, self->height_);
                    self->drawCb_(renderer);
                }
                EndPaint(hwnd, &ps);
                return 0;
            }
            case WM_KEYDOWN: {
                if (wParam == VK_ESCAPE) {
                    PostQuitMessage(0);
                    return 0;
                }
                break;
            }
            case WM_DESTROY:
                PostQuitMessage(0);
                return 0;
        }
    }
    return DefWindowProc(hwnd, msg, wParam, lParam);
}

} // namespace demo
