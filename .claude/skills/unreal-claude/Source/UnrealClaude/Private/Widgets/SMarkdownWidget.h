// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Styling/SlateTypes.h"

class SVerticalBox;
class SHorizontalBox;
class SHyperlink;
class SMultiLineEditableText;
class ITextDecorator;
class SHorizontalBox;
class SHyperlink;
class SMultiLineEditableText;

DECLARE_DELEGATE(FOnCopyAction)

/**
 * Markdown element types
 */
enum class EMarkdownElementType : uint8
{
    Paragraph,      // 普通文本段落
    Heading1,       // # 标题
    Heading2,       // ## 标题
    Heading3,       // ### 标题
    Heading4,       // #### 标题
    CodeBlock,      // ``` 代码块
    InlineCode,     // ` 行内代码
    Bold,           // **bold**
    Italic,         // *italic*
    BoldItalic,     // ***bold italic***
    BulletList,     // - 或 * 无序列表项
    NumberedList,   // 1. 有序列表项
    Link,           // [text](url)
    HorizontalRule, // --- 分隔线
    BlockQuote,     // > 引用块
    Table,          // 表格（简化处理）
    Image           // ![alt](url) - 显示 alt 文本
};

/**
 * A parsed markdown element
 */
struct FMarkdownElement
{
    EMarkdownElementType Type;
    FString Content;            // 文本内容
    FString Url;                // 链接 URL（仅 Link 类型）
    int32 Level = 0;            // 标题级别或列表序号
    TArray<FMarkdownElement> Children;  // 子元素（用于嵌套格式）
    TArray<TArray<FString>> TableRows;  // 表格数据（仅 Table 类型）

    FMarkdownElement() = default;
    FMarkdownElement(EMarkdownElementType InType, const FString& InContent)
        : Type(InType), Content(InContent) {}
};

/**
 * Markdown parser and renderer for Slate
 *
 * Supported elements:
 * - Headings: # ## ### ####
 * - Bold: **text** or __text__
 * - Italic: *text* or _text_
 * - Inline code: `code`
 * - Code blocks: ``` with language tag
 * - Bullet lists: - or *
 * - Numbered lists: 1. 2. etc.
 * - Links: [text](url)
 * - Block quotes: >
 * - Horizontal rules: ---
 * - Tables: basic support
 */
class SMarkdownWidget : public SCompoundWidget
{
public:
    SLATE_BEGIN_ARGS(SMarkdownWidget)
        : _Text("")
        , _bDarkTheme(true)
    {}
        SLATE_ARGUMENT(FString, Text)
        SLATE_ARGUMENT(bool, bDarkTheme)  // 深色主题适配
        SLATE_ATTRIBUTE(bool, bSelectionMode)  // 外部控制的选择模式（动态属性）
    SLATE_END_ARGS()

    void Construct(const FArguments& InArgs);

    /** Set new markdown text (rebuilds the widget) */
    void SetText(const FString& NewText);

    /** Get the raw markdown text */
    FString GetText() const { return MarkdownText; }

    /** Get the rendered text (without markdown markers) */
    FString GetRenderedText() const;

    /** Get plain text for selection mode (strips markdown formatting markers) */
    FString GetPlainText() const;

    /** Parse markdown text into elements */
    static TArray<FMarkdownElement> ParseMarkdown(const FString& MarkdownText);

    /** Build Slate widgets from parsed elements */
    TSharedRef<SWidget> BuildWidgetsFromElements(const TArray<FMarkdownElement>& Elements);

private:
    /** Rebuild the entire widget from current text */
    void RebuildWidget();

    /** Parse a single line into elements */
    void ParseLine(const FString& Line, TArray<FMarkdownElement>& OutElements, int32& ListCounter, bool bInBlockQuote);

    /** Parse inline formatting (bold, italic, code, links) within text */
    static TArray<FMarkdownElement> ParseInlineFormatting(const FString& Text);

    /** Build a paragraph widget with inline formatting */
    TSharedRef<SWidget> BuildParagraph(const FMarkdownElement& Element);

    /** Build a heading widget */
    TSharedRef<SWidget> BuildHeading(const FMarkdownElement& Element);

    /** Build a code block widget */
    TSharedRef<SWidget> BuildCodeBlock(const FMarkdownElement& Element);

    /** Build a list item widget */
    TSharedRef<SWidget> BuildListItem(const FMarkdownElement& Element, int32 IndentLevel);

    /** Build a link widget */
    TSharedRef<SWidget> BuildLink(const FMarkdownElement& Element);

    /** Build a block quote widget */
    TSharedRef<SWidget> BuildBlockQuote(const FMarkdownElement& Element);

    /** Build a table widget using SGridPanel */
    TSharedRef<SWidget> BuildTable(const FMarkdownElement& Element);

    /** Build rich text markup for a table cell */
    FString BuildCellMarkup(const FString& CellText, bool bIsHeader, const TArray<TSharedRef<ITextDecorator>>& Decorators);

    /** Build a horizontal rule widget */
    TSharedRef<SWidget> BuildHorizontalRule();

    /** Check if a line is a table row (starts and ends with |) */
    static bool IsTableRow(const FString& Line);

    /** Check if a line is a table separator (|---|---|) */
    static bool IsTableSeparator(const FString& Line);

    /** Parse table row into cell contents */
    static TArray<FString> ParseTableRowCells(const FString& Line);

    /** Build an inline formatted text segment */
    TSharedRef<SWidget> BuildInlineText(const FMarkdownElement& Element);

    /** Create a text run with specific styling */
    TSharedPtr<STextBlock> CreateTextRun(
        const FString& Text,
        bool bBold = false,
        bool bItalic = false,
        bool bCode = false,
        const FSlateColor& Color = FSlateColor(FLinearColor::White));

private:
    FString MarkdownText;
    bool bDarkTheme = true;
    TAttribute<bool> bSelectionModeAttr;  // Dynamic attribute for selection mode

    /** Container for all rendered elements */
    TSharedPtr<SVerticalBox> ContentBox;

    /** Selectable text box for selection mode */
    TSharedPtr<SMultiLineEditableText> SelectableTextBox;

    /** Styling constants */
    static constexpr float Heading1Size = 20.0f;
    static constexpr float Heading2Size = 16.0f;
    static constexpr float Heading3Size = 14.0f;
    static constexpr float Heading4Size = 12.0f;
    static constexpr float NormalTextSize = 10.0f;
    static constexpr float CodeTextSize = 9.0f;

    static const FLinearColor HeadingColor;
    static const FLinearColor LinkColor;
    static const FLinearColor CodeBackgroundColor;
    static const FLinearColor QuoteBackgroundColor;
    static const FLinearColor QuoteAccentColor;

    // Static text styles for headings (needed for SRichTextBlock which takes style pointers)
    static const FTextBlockStyle Heading1Style;
    static const FTextBlockStyle Heading2Style;
    static const FTextBlockStyle Heading3Style;
    static const FTextBlockStyle Heading4Style;
};

/**
 * Helper class for parsing markdown text
 */
class FMarkdownParser
{
public:
    /** Parse full markdown document */
    static TArray<FMarkdownElement> Parse(const FString& Markdown);

    /** Parse a single line */
    static FMarkdownElement ParseLine(const FString& Line, int32& OutListCounter, bool& bInCodeBlock, FString& CodeBlockLang);

    /** Parse inline formatting within a text segment */
    static TArray<FMarkdownElement> ParseInline(const FString& Text);

    /** Check if line is a heading */
    static bool IsHeading(const FString& Line, int32& OutLevel, FString& OutContent);

    /** Check if line is a code block fence */
    static bool IsCodeFence(const FString& Line, bool& bIsOpening, FString& OutLang);

    /** Check if line is a bullet list item */
    static bool IsBulletList(const FString& Line, FString& OutContent, int32& OutIndent);

    /** Check if line is a numbered list item */
    static bool IsNumberedList(const FString& Line, FString& OutContent, int32& OutNumber, int32& OutIndent);

    /** Check if line is a block quote */
    static bool IsBlockQuote(const FString& Line, FString& OutContent);

    /** Check if line is a horizontal rule */
    static bool IsHorizontalRule(const FString& Line);

    /** Strip inline formatting markers, returning segments */
    static TArray<TPair<FString, EMarkdownElementType>> StripInlineMarkers(const FString& Text);
};