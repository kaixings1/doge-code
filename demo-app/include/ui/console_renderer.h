#pragma once
#include <string>
#include <vector>
#include <Windows.h>

namespace demo {

class ConsoleRenderer {
public:
    ConsoleRenderer(int width, int height);
    ~ConsoleRenderer();

    void Clear(char ch = ' ', WORD attr = 7);
    void DrawChar(int x, int y, char ch, WORD attr = 7);
    void DrawString(int x, int y, const std::string& text, WORD attr = 7);
    void DrawRect(int x, int y, int w, int h, WORD attr = 7);
    void DrawLine(int x1, int y1, int x2, int y2, char ch = '-', WORD attr = 7);
    void Flush();

    int Width()  const { return width_; }
    int Height() const { return height_; }

private:
    int width_, height_;
    std::vector<CHAR_INFO> buffer_;
    HANDLE hConsole_ = nullptr;
};

} // namespace demo
