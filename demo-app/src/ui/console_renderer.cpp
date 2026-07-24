#include "ui/console_renderer.h"
#include <cassert>
#include <algorithm>

namespace demo {

ConsoleRenderer::ConsoleRenderer(int width, int height)
    : width_(width), height_(height)
    , buffer_(width * height, CHAR_INFO{})
{
    hConsole_ = GetStdHandle(STD_OUTPUT_HANDLE);
    CONSOLE_CURSOR_INFO cursorInfo;
    GetConsoleCursorInfo(hConsole_, &cursorInfo);
    cursorInfo.bVisible = FALSE;
    SetConsoleCursorInfo(hConsole_, &cursorInfo);
    Clear();
}

ConsoleRenderer::~ConsoleRenderer() {
    if (hConsole_) {
        CONSOLE_CURSOR_INFO cursorInfo;
        GetConsoleCursorInfo(hConsole_, &cursorInfo);
        cursorInfo.bVisible = TRUE;
        SetConsoleCursorInfo(hConsole_, &cursorInfo);
    }
}

void ConsoleRenderer::Clear(char ch, WORD attr) {
    for (auto& cell : buffer_) {
        cell.Char.AsciiChar = ch;
        cell.Attributes = attr;
    }
}

void ConsoleRenderer::DrawChar(int x, int y, char ch, WORD attr) {
    if (x < 0 || x >= width_ || y < 0 || y >= height_) return;
    auto& cell = buffer_[y * width_ + x];
    cell.Char.AsciiChar = ch;
    cell.Attributes = attr;
}

void ConsoleRenderer::DrawString(int x, int y, const std::string& text, WORD attr) {
    for (size_t i = 0; i < text.size(); ++i) {
        DrawChar(x + static_cast<int>(i), y, text[i], attr);
    }
}

void ConsoleRenderer::DrawRect(int x, int y, int w, int h, WORD attr) {
    for (int i = 0; i < w; ++i) {
        DrawChar(x + i, y, '-', attr);
        DrawChar(x + i, y + h - 1, '-', attr);
    }
    for (int i = 0; i < h; ++i) {
        DrawChar(x, y + i, '|', attr);
        DrawChar(x + w - 1, y + i, '|', attr);
    }
    DrawChar(x, y, '+', attr);
    DrawChar(x + w - 1, y, '+', attr);
    DrawChar(x, y + h - 1, '+', attr);
    DrawChar(x + w - 1, y + h - 1, '+', attr);
}

void ConsoleRenderer::DrawLine(int x1, int y1, int x2, int y2, char ch, WORD attr) {
    int dx = abs(x2 - x1);
    int dy = abs(y2 - y1);
    int sx = x1 < x2 ? 1 : -1;
    int sy = y1 < y2 ? 1 : -1;
    int err = dx - dy;

    int x = x1, y = y1;
    while (true) {
        DrawChar(x, y, ch, attr);
        if (x == x2 && y == y2) break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 <  dx) { err += dx; y += sy; }
    }
}

void ConsoleRenderer::Flush() {
    if (!hConsole_) return;
    SMALL_RECT sr = {0, 0, static_cast<SHORT>(width_ - 1), static_cast<SHORT>(height_ - 1)};
    WriteConsoleOutputA(hConsole_, buffer_.data(),
                        {static_cast<SHORT>(width_), static_cast<SHORT>(height_)},
                        {0, 0}, &sr);
}

} // namespace demo
