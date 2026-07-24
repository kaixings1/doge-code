#pragma once
#include <functional>
#include <string>
#include <Windows.h>

namespace demo {

// 前向声明
class ConsoleRenderer;

class Window {
public:
    using DrawCallback = std::function<void(ConsoleRenderer&)>;

    Window(int width, int height, const std::wstring& title);
    ~Window();

    bool Create();
    void Show();
    void Hide();
    void SetTitle(const std::wstring& title);
    void SetDrawCallback(DrawCallback cb);
    void Invalidate();

    HWND Handle() const { return hwnd_; }

private:
    static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);

    HWND hwnd_ = nullptr;
    int width_, height_;
    std::wstring title_;
    DrawCallback drawCb_;
};

} // namespace demo
