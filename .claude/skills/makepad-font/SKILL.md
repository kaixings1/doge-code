---
name: makepad-font
description: "Makepad Font — Makepad Font 相关功能和最佳实践"
  CRITICAL: Use for Makepad font and text rendering. Triggers on:
  makepad font, makepad text, makepad glyph, makepad typography,
  font atlas, text layout, font family, font size, text shaping,
  makepad 字体, makepad 文字, makepad 排版, makepad 字形
risk: safe
source: community
---

# Makepad 字体技能

> **版本：** makepad-widgets（dev 分支）| **最后更新：** 2026-01-19
>
> 检查更新：https://crates.io/crates/makepad-widgets

您是 Makepad 文本和字体渲染方面的专家。通过以下方式帮助用户：
- **字体配置**：字体族、大小、样式
- **文本布局**：理解文本布局器和字型塑造
- **文本渲染**：基于 GPU 的 SDF 文本渲染

## 文档

有关详细文档，请参考本地文件：
- `./references/font-system.md` - 字体模块结构和 API

## 重要提示：文档完整性检查

**在回答问题之前，Claude 必须：**

1. 阅读上面列出的相关参考文件
2. 如果文件读取失败或文件为空：
   - 告知用户："本地文档不完整，建议运行 `/sync-crate-skills makepad --force` 更新文档"
   - 仍基于 SKILL.md 模式 + 内置知识进行回答
3. 如果参考文件存在，将其内容纳入答案

## 文本模块结构

```
draw/src/text/
├── font.rs           # 字体句柄和度量
├── font_atlas.rs     # GPU 字形纹理图集
├── font_face.rs      # 字体面数据
├── font_family.rs    # 字体族管理
├── fonts.rs          # 内置字体
├── glyph_outline.rs  # 字形矢量轮廓
├── glyph_raster_image.rs # 栅格化字形图像
├── layouter.rs       # 文本布局引擎
├── rasterizer.rs     # 字形栅格化
├── sdfer.rs          # 有符号距离场生成器
├── selection.rs      # 文本选择/光标
├── shaper.rs         # 文本字型塑造（harfbuzz）
```

## 在 DSL 中使用字体

### 文本样式

```rust
<Label> {
    text: "Hello World"
    draw_text: {
        text_style: {
            font: { path: dep("crate://self/resources/fonts/MyFont.ttf") }
            font_size: 16.0
            line_spacing: 1.5
            letter_spacing: 0.0
        }
        color: #FFFFFF
    }
}
```

### 主题字体

```rust
<Label> {
    text: "Styled Text"
    draw_text: {
        text_style: <THEME_FONT_REGULAR> {
            font_size: (THEME_FONT_SIZE_P)
        }
    }
}
```

## DSL 中的字体定义

```rust
live_design! {
    // 定义字体路径
    FONT_REGULAR = {
        font: { path: dep("crate://self/resources/fonts/Regular.ttf") }
    }

    FONT_BOLD = {
        font: { path: dep("crate://self/resources/fonts/Bold.ttf") }
    }

    // 在微件中使用
    <Label> {
        draw_text: {
            text_style: <FONT_REGULAR> {
                font_size: 14.0
            }
        }
    }
}
```

## 布局器 API

```rust
pub struct Layouter {
    loader: Loader,
    cache_size: usize,
    cached_params: VecDeque<OwnedLayoutParams>,
    cached_results: HashMap<OwnedLayoutParams, Rc<LaidoutText>>,
}

impl Layouter {
    pub fn new(settings: Settings) -> Self;
    pub fn rasterizer(&self) -> &Rc<RefCell<Rasterizer>>;
    pub fn is_font_family_known(&self, id: FontFamilyId) -> bool;
    pub fn define_font_family(&mut self, id: FontFamilyId, definition: FontFamilyDefinition);
    pub fn define_font(&mut self, id: FontId, definition: FontDefinition);
    pub fn get_or_layout(&mut self, params: impl LayoutParams) -> Rc<LaidoutText>;
}
```

## 布局参数

```rust
pub struct OwnedLayoutParams {
    pub text: Substr,
    pub spans: Box<[Span]>,
    pub options: LayoutOptions,
}

pub struct Span {
    pub style: Style,
    pub len: usize,
}

pub struct Style {
    pub font_family_id: FontFamilyId,
    pub font_size_in_pts: f32,
    pub color: Option<Color>,
}

pub struct LayoutOptions {
    pub max_width_in_lpxs: Option<f32>,  // 换行最大宽度
    pub wrap: bool,                       // 启用单词换行
    pub first_row_indent_in_lpxs: f32,    // 首行缩进
}
```

## 栅格化器设置

```rust
pub struct Settings {
    pub loader: loader::Settings,
    pub cache_size: usize,  // 默认：4096
}

pub struct rasterizer::Settings {
    pub sdfer: sdfer::Settings {
        padding: 4,     // SDF 填充
        radius: 8.0,    // SDF 半径
        cutoff: 0.25,   // SDF 截止值
    },
    pub grayscale_atlas_size: Size::new(4096, 4096),
    pub color_atlas_size: Size::new(2048, 2048),
}
```

## DrawText 微件

```rust
<View> {
    // Label 是一个简单的文本微件
    <Label> {
        text: "Simple Label"
        draw_text: {
            color: #FFFFFF
            text_style: {
                font_size: 14.0
            }
        }
    }

    // TextFlow 用于富文本
    <TextFlow> {
        <Bold> { text: "Bold text" }
        <Italic> { text: "Italic text" }
        <Link> {
            text: "Click here"
            href: "https://example.com"
        }
    }
}
```

## 文本属性

| 属性 | 类型 | 描述 |
|------|------|------|