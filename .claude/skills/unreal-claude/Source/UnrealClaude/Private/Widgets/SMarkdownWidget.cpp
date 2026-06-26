// Copyright Natali Caggiano. All Rights Reserved.

#include "SMarkdownWidget.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/Text/SRichTextBlock.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/Layout/SSpacer.h"
#include "Widgets/Layout/SWidgetSwitcher.h"
#include "Widgets/Layout/SWrapBox.h"
#include "Widgets/Layout/SGridPanel.h"
#include "Widgets/Input/SHyperlink.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/SNullWidget.h"
#include "Widgets/Text/SMultiLineEditableText.h"
#include "Framework/Text/RichTextLayoutMarshaller.h"
#include "Framework/Text/TextDecorators.h"
#include "Framework/Text/ITextDecorator.h"
#include "Framework/Text/SlateTextRun.h"
#include "Framework/Text/SlateHyperlinkRun.h"
#include "Styling/AppStyle.h"
#include "Styling/CoreStyle.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/PlatformApplicationMisc.h"

#define LOCTEXT_NAMESPACE "MarkdownWidget"

// Helper function to check if a character is alphanumeric (word character)
static bool IsAlphanumeric(TCHAR Ch)
{
    return (Ch >= 'a' && Ch <= 'z') ||
           (Ch >= 'A' && Ch <= 'Z') ||
           (Ch >= '0' && Ch <= '9');
}

/**
 * Simple text decorator that applies a specific font style and color
 */
class FStyleTextDecorator : public ITextDecorator
{
public:
    static TSharedRef<FStyleTextDecorator> Create(const FString& InRunName, const FSlateColor& InColor, const FSlateFontInfo& InFont)
    {
        return MakeShareable(new FStyleTextDecorator(InRunName, InColor, InFont));
    }

    virtual ~FStyleTextDecorator() {}

    virtual bool Supports(const FTextRunParseResults& RunParseResult, const FString& Text) const override
    {
        return RunParseResult.Name == RunName;
    }

    virtual TSharedRef<ISlateRun> Create(
        const TSharedRef<class FTextLayout>& TextLayout,
        const FTextRunParseResults& RunParseResult,
        const FString& OriginalText,
        const TSharedRef<FString>& InOutModelText,
        const ISlateStyle* Style) override
    {
        FRunInfo RunInfo(RunParseResult.Name);
        for (const TPair<FString, FTextRange>& Pair : RunParseResult.MetaData)
        {
            RunInfo.MetaData.Add(Pair.Key, OriginalText.Mid(Pair.Value.BeginIndex, Pair.Value.EndIndex - Pair.Value.BeginIndex));
        }

        const FTextRange ModelRange(InOutModelText->Len(), InOutModelText->Len() + RunParseResult.ContentRange.EndIndex - RunParseResult.ContentRange.BeginIndex);
        InOutModelText->Append(OriginalText.Mid(RunParseResult.ContentRange.BeginIndex, RunParseResult.ContentRange.EndIndex - RunParseResult.ContentRange.BeginIndex));

        // Create a text block style with our font and color
        FTextBlockStyle TextStyle;
        TextStyle.SetFont(Font);
        TextStyle.SetColorAndOpacity(Color);

        // Cast to const TSharedRef for the API
        TSharedRef<const FString> ConstModelText = ConstCastSharedRef<const FString>(InOutModelText);

        return FSlateTextRun::Create(RunInfo, ConstModelText, TextStyle, ModelRange);
    }

private:
    FStyleTextDecorator(const FString& InRunName, const FSlateColor& InColor, const FSlateFontInfo& InFont)
        : RunName(InRunName)
        , Color(InColor)
        , Font(InFont)
    {}

    FString RunName;
    FSlateColor Color;
    FSlateFontInfo Font;
};

// Static color definitions
const FLinearColor SMarkdownWidget::HeadingColor = FLinearColor(0.85f, 0.85f, 0.9f);
const FLinearColor SMarkdownWidget::LinkColor = FLinearColor(0.4f, 0.7f, 1.0f);
const FLinearColor SMarkdownWidget::CodeBackgroundColor = FLinearColor(0.04f, 0.04f, 0.06f);
const FLinearColor SMarkdownWidget::QuoteBackgroundColor = FLinearColor(0.08f, 0.08f, 0.10f);
const FLinearColor SMarkdownWidget::QuoteAccentColor = FLinearColor(0.3f, 0.3f, 0.4f);

// Static heading text styles (SRichTextBlock requires style pointers, not values)
const FTextBlockStyle SMarkdownWidget::Heading1Style = FTextBlockStyle()
    .SetFont(FCoreStyle::GetDefaultFontStyle("Bold", Heading1Size))
    .SetColorAndOpacity(FSlateColor(HeadingColor));

const FTextBlockStyle SMarkdownWidget::Heading2Style = FTextBlockStyle()
    .SetFont(FCoreStyle::GetDefaultFontStyle("Bold", Heading2Size))
    .SetColorAndOpacity(FSlateColor(HeadingColor));

const FTextBlockStyle SMarkdownWidget::Heading3Style = FTextBlockStyle()
    .SetFont(FCoreStyle::GetDefaultFontStyle("Bold", Heading3Size))
    .SetColorAndOpacity(FSlateColor(HeadingColor));

const FTextBlockStyle SMarkdownWidget::Heading4Style = FTextBlockStyle()
    .SetFont(FCoreStyle::GetDefaultFontStyle("Bold", Heading4Size))
    .SetColorAndOpacity(FSlateColor(HeadingColor));

void SMarkdownWidget::Construct(const FArguments& InArgs)
{
    MarkdownText = InArgs._Text;
    bDarkTheme = InArgs._bDarkTheme;
    bSelectionModeAttr = InArgs._bSelectionMode;

    // Create container for formatted content
    SAssignNew(ContentBox, SVerticalBox);

    // Create selectable text widget for selection mode
    SAssignNew(SelectableTextBox, SMultiLineEditableText)
    .Text(FText::FromString(GetPlainText()))
    .TextStyle(FAppStyle::Get(), "NormalText")
    .AutoWrapText(true)
    .IsReadOnly(true);

    // Build the widget without toggle buttons (mode controlled externally)
    ChildSlot
    [
        SNew(SWidgetSwitcher)
        .WidgetIndex_Lambda([this]() { return bSelectionModeAttr.Get() ? 1 : 0; })

        // Index 0: Formatted markdown view
        + SWidgetSwitcher::Slot()
        [
            ContentBox.ToSharedRef()
        ]

        // Index 1: Selectable plain text view
        + SWidgetSwitcher::Slot()
        [
            SelectableTextBox.ToSharedRef()
        ]
    ];

    // Initial render
    RebuildWidget();
}

void SMarkdownWidget::SetText(const FString& NewText)
{
    if (MarkdownText != NewText)
    {
        MarkdownText = NewText;
        RebuildWidget();
    }
}

void SMarkdownWidget::RebuildWidget()
{
    // Update formatted content
    if (ContentBox.IsValid())
    {
        ContentBox->ClearChildren();

        if (!MarkdownText.IsEmpty())
        {
            // Parse markdown
            TArray<FMarkdownElement> Elements = ParseMarkdown(MarkdownText);

            // Build widgets
            TSharedRef<SWidget> Content = BuildWidgetsFromElements(Elements);

            // Add to container
            ContentBox->AddSlot()
            [
                Content
            ];
        }
    }

    // Update selectable text box
    if (SelectableTextBox.IsValid())
    {
        SelectableTextBox->SetText(FText::FromString(GetPlainText()));
    }
}

// ============================================================================
// Markdown Parsing
// ============================================================================

TArray<FMarkdownElement> SMarkdownWidget::ParseMarkdown(const FString& MarkdownText)
{
    TArray<FMarkdownElement> Elements;

    // Split into lines
    TArray<FString> Lines;
    MarkdownText.ParseIntoArrayLines(Lines);

    bool bInCodeBlock = false;
    FString CodeBlockContent;
    FString CodeBlockLang;
    bool bInBlockQuote = false;
    FString BlockQuoteContent;
    int32 ListCounter = 0;
    int32 BulletIndent = -1;  // Track bullet list indentation level

    for (int32 i = 0; i < Lines.Num(); ++i)
    {
        FString Line = Lines[i];

        // Handle code blocks
        if (bInCodeBlock)
        {
            if (Line.TrimStartAndEnd().StartsWith(TEXT("```")))
            {
                // End code block
                bInCodeBlock = false;
                FMarkdownElement CodeElement(EMarkdownElementType::CodeBlock, CodeBlockContent);
                CodeElement.Content = CodeBlockLang + TEXT("\n") + CodeBlockContent;
                Elements.Add(CodeElement);
                CodeBlockContent.Empty();
                CodeBlockLang.Empty();
            }
            else
            {
                CodeBlockContent += Line + TEXT("\n");
            }
            continue;
        }

        // Check for code block start
        FString TrimmedLine = Line.TrimStartAndEnd();
        if (TrimmedLine.StartsWith(TEXT("```")))
        {
            bInCodeBlock = true;
            CodeBlockLang = TrimmedLine.RightChop(3).TrimStartAndEnd();
            CodeBlockContent.Empty();
            continue;
        }

        // Handle block quotes
        FString QuoteContent;
        if (FMarkdownParser::IsBlockQuote(Line, QuoteContent))
        {
            bInBlockQuote = true;
            BlockQuoteContent += QuoteContent + TEXT("\n");
            continue;
        }
        else if (bInBlockQuote)
        {
            // End block quote
            bInBlockQuote = false;
            FMarkdownElement QuoteElement(EMarkdownElementType::BlockQuote, BlockQuoteContent.TrimEnd());
            Elements.Add(QuoteElement);
            BlockQuoteContent.Empty();
        }

        // Check for horizontal rule
        if (FMarkdownParser::IsHorizontalRule(TrimmedLine))
        {
            Elements.Add(FMarkdownElement(EMarkdownElementType::HorizontalRule, TEXT("")));
            continue;
        }

        // Check for heading
        int32 HeadingLevel = 0;
        FString HeadingContent;
        if (FMarkdownParser::IsHeading(Line, HeadingLevel, HeadingContent))
        {
            EMarkdownElementType HeadingType = EMarkdownElementType::Heading1;
            switch (HeadingLevel)
            {
                case 2: HeadingType = EMarkdownElementType::Heading2; break;
                case 3: HeadingType = EMarkdownElementType::Heading3; break;
                case 4: HeadingType = EMarkdownElementType::Heading4; break;
                default: HeadingType = EMarkdownElementType::Heading1; break;
            }
            FMarkdownElement HeadingElement(HeadingType, HeadingContent);
            HeadingElement.Children = ParseInlineFormatting(HeadingContent);
            Elements.Add(HeadingElement);
            continue;
        }

        // Check for bullet list
        FString BulletContent;
        int32 BulletIndentLevel = 0;
        if (FMarkdownParser::IsBulletList(Line, BulletContent, BulletIndentLevel))
        {
            FMarkdownElement ListElement(EMarkdownElementType::BulletList, BulletContent);
            ListElement.Level = BulletIndentLevel;
            ListElement.Children = ParseInlineFormatting(BulletContent);
            Elements.Add(ListElement);
            continue;
        }

        // Check for numbered list
        FString NumberedContent;
        int32 Number = 0;
    int32 NumberedIndent = 0;
        if (FMarkdownParser::IsNumberedList(Line, NumberedContent, Number, NumberedIndent))
        {
            FMarkdownElement ListElement(EMarkdownElementType::NumberedList, NumberedContent);
            ListElement.Level = Number;
            ListElement.Children = ParseInlineFormatting(NumberedContent);
            Elements.Add(ListElement);
            continue;
        }

        // Check for table start
        if (IsTableRow(Line))
        {
            // Check if next line is separator (valid table)
            if (i + 1 < Lines.Num() && IsTableSeparator(Lines[i + 1]))
            {
                FMarkdownElement TableElement(EMarkdownElementType::Table, TEXT(""));
                TableElement.TableRows.Add(ParseTableRowCells(Line));  // Header row
                i++;  // Skip separator line

                // Parse remaining table rows
                while (i + 1 < Lines.Num() && IsTableRow(Lines[i + 1]))
                {
                    i++;
                    TableElement.TableRows.Add(ParseTableRowCells(Lines[i]));
                }
                Elements.Add(TableElement);
                continue;
            }
        }

        // Empty line - start new paragraph
        if (TrimmedLine.IsEmpty())
        {
            continue;
        }

        // Regular paragraph
        FMarkdownElement ParaElement(EMarkdownElementType::Paragraph, Line);
        ParaElement.Children = ParseInlineFormatting(Line);
        Elements.Add(ParaElement);
    }

    // Close any open blocks
    if (bInCodeBlock)
    {
        FMarkdownElement CodeElement(EMarkdownElementType::CodeBlock, CodeBlockContent);
        Elements.Add(CodeElement);
    }
    if (bInBlockQuote)
    {
        FMarkdownElement QuoteElement(EMarkdownElementType::BlockQuote, BlockQuoteContent.TrimEnd());
        Elements.Add(QuoteElement);
    }

    return Elements;
}

TArray<FMarkdownElement> SMarkdownWidget::ParseInlineFormatting(const FString& Text)
{
    TArray<FMarkdownElement> Elements;

    int32 Pos = 0;
    FString CurrentText;

    while (Pos < Text.Len())
    {
        // Check for inline code `...`
        if (Text[Pos] == '`')
        {
            // Add any accumulated text first
            if (!CurrentText.IsEmpty())
            {
                Elements.Add(FMarkdownElement(EMarkdownElementType::Paragraph, CurrentText));
                CurrentText.Empty();
            }

            // Find closing `
            int32 EndPos = Text.Find(TEXT("`"), ESearchCase::CaseSensitive, ESearchDir::FromStart, Pos + 1);
            if (EndPos != INDEX_NONE)
            {
                FString CodeText = Text.Mid(Pos + 1, EndPos - Pos - 1);
                Elements.Add(FMarkdownElement(EMarkdownElementType::InlineCode, CodeText));
                Pos = EndPos + 1;
            }
            else
            {
                // No closing, treat as regular char
                CurrentText += '`';
                Pos++;
            }
            continue;
        }

        // Check for bold **...** or __...__
        bool bIsBold = false;
        FString BoldMarker;
        if (Pos + 1 < Text.Len())
        {
            if (Text[Pos] == '*' && Text[Pos + 1] == '*')
            {
                bIsBold = true;
                BoldMarker = TEXT("**");
            }
            else if (Text[Pos] == '_' && Text[Pos + 1] == '_')
            {
                bIsBold = true;
                BoldMarker = TEXT("__");
            }
        }

        if (bIsBold)
        {
            // Add accumulated text
            if (!CurrentText.IsEmpty())
            {
                Elements.Add(FMarkdownElement(EMarkdownElementType::Paragraph, CurrentText));
                CurrentText.Empty();
            }

            // Find closing marker
            int32 EndPos = Text.Find(BoldMarker, ESearchCase::CaseSensitive, ESearchDir::FromStart, Pos + 2);
            if (EndPos != INDEX_NONE)
            {
                FString BoldText = Text.Mid(Pos + 2, EndPos - Pos - 2);
                FMarkdownElement BoldElement(EMarkdownElementType::Bold, BoldText);
                // Check for nested italic ***bold italic***
                if (BoldText.StartsWith(TEXT("*")) && BoldText.EndsWith(TEXT("*")))
                {
                    BoldElement.Type = EMarkdownElementType::BoldItalic;
                    BoldElement.Content = BoldText.Mid(1, BoldText.Len() - 2);
                }
                Elements.Add(BoldElement);
                Pos = EndPos + 2;
            }
            else
            {
                CurrentText += BoldMarker;
                Pos += 2;
            }
            continue;
        }

        // Check for italic *...* or _..._
        // For _: only treat as italic if preceded by whitespace/punctuation and followed by non-underscore
        // This prevents "GE_GCS_Hit_V2" from being parsed as italic
        bool bIsItalic = false;
        FString ItalicMarker;

        if (Pos < Text.Len())
        {
            // * italic: always valid if not followed by another *
            if (Text[Pos] == '*' && (Pos + 1 >= Text.Len() || Text[Pos + 1] != '*'))
            {
                bIsItalic = true;
                ItalicMarker = TEXT("*");
            }
            // _ italic: only if not preceded/followed by alphanumeric (intra-word underscore protection)
            else if (Text[Pos] == '_' && (Pos + 1 >= Text.Len() || Text[Pos + 1] != '_'))
            {
                // Check if preceded by alphanumeric (word character)
                bool bPrecededByWordChar = (Pos > 0 && IsAlphanumeric(Text[Pos - 1]));
                // Check if followed by alphanumeric (word character)
                bool bFollowedByWordChar = (Pos + 1 < Text.Len() && IsAlphanumeric(Text[Pos + 1]));

                // Only treat as italic if NOT inside a word
                if (!bPrecededByWordChar && !bFollowedByWordChar)
                {
                    bIsItalic = true;
                    ItalicMarker = TEXT("_");
                }
            }
        }

        if (bIsItalic)
        {
            // Add accumulated text
            if (!CurrentText.IsEmpty())
            {
                Elements.Add(FMarkdownElement(EMarkdownElementType::Paragraph, CurrentText));
                CurrentText.Empty();
            }

            // Find closing marker
            int32 EndPos = INDEX_NONE;

            if (ItalicMarker == TEXT("*"))
            {
                // * marker: find next * that's not part of **
                for (int32 SearchPos = Pos + 1; SearchPos < Text.Len(); ++SearchPos)
                {
                    if (Text[SearchPos] == '*')
                    {
                        // Make sure it's not part of ** (bold)
                        if (SearchPos + 1 >= Text.Len() || Text[SearchPos + 1] != '*')
                        {
                            EndPos = SearchPos;
                            break;
                        }
                    }
                }
            }
            else if (ItalicMarker == TEXT("_"))
            {
                // _ marker: find next _ that's not preceded/followed by alphanumeric
                for (int32 SearchPos = Pos + 1; SearchPos < Text.Len(); ++SearchPos)
                {
                    if (Text[SearchPos] == '_' && (SearchPos + 1 >= Text.Len() || Text[SearchPos + 1] != '_'))
                    {
                        // Check if this _ is at word boundary
                        bool bEndPrecededByWordChar = (SearchPos > 0 && IsAlphanumeric(Text[SearchPos - 1]));
                        bool bEndFollowedByWordChar = (SearchPos + 1 < Text.Len() && IsAlphanumeric(Text[SearchPos + 1]));

                        if (!bEndPrecededByWordChar && !bEndFollowedByWordChar)
                        {
                            EndPos = SearchPos;
                            break;
                        }
                    }
                }
            }

            if (EndPos != INDEX_NONE)
            {
                FString ItalicText = Text.Mid(Pos + 1, EndPos - Pos - 1);
                // Make sure italic text is not empty and not just underscores
                if (!ItalicText.IsEmpty() && ItalicText.TrimStartAndEnd() != TEXT("_"))
                {
                    Elements.Add(FMarkdownElement(EMarkdownElementType::Italic, ItalicText));
                    Pos = EndPos + 1;
                }
                else
                {
                    // Invalid italic - keep the marker as regular text
                    CurrentText += ItalicMarker;
                    Pos++;
                }
            }
            else
            {
                CurrentText += ItalicMarker;
                Pos++;
            }
            continue;
        }

        // Check for link [text](url)
        if (Text[Pos] == '[')
        {
            // Add accumulated text
            if (!CurrentText.IsEmpty())
            {
                Elements.Add(FMarkdownElement(EMarkdownElementType::Paragraph, CurrentText));
                CurrentText.Empty();
            }

            // Find closing ]
            int32 BracketEnd = Text.Find(TEXT("]"), ESearchCase::CaseSensitive, ESearchDir::FromStart, Pos + 1);
            if (BracketEnd != INDEX_NONE && BracketEnd + 1 < Text.Len() && Text[BracketEnd + 1] == '(')
            {
                // Find closing )
                int32 ParenEnd = Text.Find(TEXT(")"), ESearchCase::CaseSensitive, ESearchDir::FromStart, BracketEnd + 2);
                if (ParenEnd != INDEX_NONE)
                {
                    FString LinkText = Text.Mid(Pos + 1, BracketEnd - Pos - 1);
                    FString LinkUrl = Text.Mid(BracketEnd + 2, ParenEnd - BracketEnd - 2);
                    FMarkdownElement LinkElement(EMarkdownElementType::Link, LinkText);
                    LinkElement.Url = LinkUrl;
                    Elements.Add(LinkElement);
                    Pos = ParenEnd + 1;
                    continue;
                }
            }
            // Invalid link syntax, treat as regular
            CurrentText += '[';
            Pos++;
            continue;
        }

        // Regular character
        CurrentText += Text[Pos];
        Pos++;
    }

    // Add remaining text
    if (!CurrentText.IsEmpty())
    {
        Elements.Add(FMarkdownElement(EMarkdownElementType::Paragraph, CurrentText));
    }

    return Elements;
}

// ============================================================================
// Widget Building
// ============================================================================

TSharedRef<SWidget> SMarkdownWidget::BuildWidgetsFromElements(const TArray<FMarkdownElement>& Elements)
{
    TSharedPtr<SVerticalBox> VBox;
    SAssignNew(VBox, SVerticalBox);

    for (const FMarkdownElement& Element : Elements)
    {
        TSharedPtr<SWidget> Widget;

        switch (Element.Type)
        {
            case EMarkdownElementType::Heading1:
            case EMarkdownElementType::Heading2:
            case EMarkdownElementType::Heading3:
            case EMarkdownElementType::Heading4:
                Widget = BuildHeading(Element);
                break;

            case EMarkdownElementType::Paragraph:
                Widget = BuildParagraph(Element);
                break;

            case EMarkdownElementType::CodeBlock:
                Widget = BuildCodeBlock(Element);
                break;

            case EMarkdownElementType::BulletList:
                Widget = BuildListItem(Element, Element.Level);
                break;

            case EMarkdownElementType::NumberedList:
                Widget = BuildListItem(Element, 0);
                break;

            case EMarkdownElementType::Link:
                Widget = BuildLink(Element);
                break;

            case EMarkdownElementType::BlockQuote:
                Widget = BuildBlockQuote(Element);
                break;

            case EMarkdownElementType::Table:
                Widget = BuildTable(Element);
                break;

            case EMarkdownElementType::HorizontalRule:
                Widget = BuildHorizontalRule();
                break;

            default:
                Widget = BuildParagraph(Element);
                break;
        }

        if (Widget.IsValid())
        {
            VBox->AddSlot()
            .AutoHeight()
            .Padding(FMargin(0.0f, 2.0f))
            [
                Widget.ToSharedRef()
            ];
        }
    }

    return VBox.ToSharedRef();
}

TSharedRef<SWidget> SMarkdownWidget::BuildParagraph(const FMarkdownElement& Element)
{
    // Convert inline elements to rich text markup format
    FString RichTextMarkup;

    if (Element.Children.Num() > 0)
    {
        for (const FMarkdownElement& Child : Element.Children)
        {
            switch (Child.Type)
            {
                case EMarkdownElementType::Bold:
                    RichTextMarkup += FString::Printf(TEXT("<Bold>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::Italic:
                    RichTextMarkup += FString::Printf(TEXT("<Italic>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::BoldItalic:
                    RichTextMarkup += FString::Printf(TEXT("<BoldItalic>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::InlineCode:
                    RichTextMarkup += FString::Printf(TEXT("<CodeInline>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::Link:
                    // Links need special handling - store URL and use hyperlink decorator
                    RichTextMarkup += FString::Printf(TEXT("<a href=\"%s\">%s</>"), *Child.Url, *Child.Content);
                    break;
                default:
                    // Escape any special characters in plain text
                    FString EscapedContent = Child.Content;
                    // Replace & with &amp; first to avoid double escaping
                    EscapedContent.ReplaceInline(TEXT("&"), TEXT("&amp;"), ESearchCase::CaseSensitive);
                    // Replace < with &lt; and > with &gt; to avoid markup confusion
                    EscapedContent.ReplaceInline(TEXT("<"), TEXT("&lt;"), ESearchCase::CaseSensitive);
                    EscapedContent.ReplaceInline(TEXT(">"), TEXT("&gt;"), ESearchCase::CaseSensitive);
                    RichTextMarkup += EscapedContent;
                    break;
            }
        }
    }
    else
    {
        // Plain text - escape special characters
        FString EscapedContent = Element.Content;
        EscapedContent.ReplaceInline(TEXT("&"), TEXT("&amp;"), ESearchCase::CaseSensitive);
        EscapedContent.ReplaceInline(TEXT("<"), TEXT("&lt;"), ESearchCase::CaseSensitive);
        EscapedContent.ReplaceInline(TEXT(">"), TEXT("&gt;"), ESearchCase::CaseSensitive);
        RichTextMarkup = EscapedContent;
    }

    // Create custom text decorators for our markup
    TArray<TSharedRef<ITextDecorator>> Decorators;

    // Bold decorator
    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("Bold"),
        FSlateColor(FLinearColor::White),
        FCoreStyle::GetDefaultFontStyle("Bold", NormalTextSize)
    ));

    // Italic decorator
    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("Italic"),
        FSlateColor(FLinearColor::White),
        FCoreStyle::GetDefaultFontStyle("Italic", NormalTextSize)
    ));

    // BoldItalic decorator
    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("BoldItalic"),
        FSlateColor(FLinearColor::White),
        FCoreStyle::GetDefaultFontStyle("BoldItalic", NormalTextSize)
    ));

    // Inline code decorator
    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("CodeInline"),
        FSlateColor(FLinearColor(0.8f, 0.85f, 0.75f)),
        FCoreStyle::GetDefaultFontStyle("Mono", CodeTextSize)
    ));

    // Use SRichTextBlock for proper text wrapping across inline elements
    return SNew(SRichTextBlock)
        .Text(FText::FromString(RichTextMarkup))
        .AutoWrapText(true)
        .Decorators(Decorators)
        .TextStyle(FAppStyle::Get(), "NormalText");
}

TSharedRef<SWidget> SMarkdownWidget::BuildHeading(const FMarkdownElement& Element)
{
    float FontSize = NormalTextSize;
    const FTextBlockStyle* HeadingStylePtr = &FCoreStyle::Get().GetWidgetStyle<FTextBlockStyle>("NormalText");

    switch (Element.Type)
    {
        case EMarkdownElementType::Heading1:
            FontSize = Heading1Size;
            HeadingStylePtr = &Heading1Style;
            break;
        case EMarkdownElementType::Heading2:
            FontSize = Heading2Size;
            HeadingStylePtr = &Heading2Style;
            break;
        case EMarkdownElementType::Heading3:
            FontSize = Heading3Size;
            HeadingStylePtr = &Heading3Style;
            break;
        case EMarkdownElementType::Heading4:
            FontSize = Heading4Size;
            HeadingStylePtr = &Heading4Style;
            break;
        default:
            break;
    }

    // Convert inline elements to rich text markup format
    FString RichTextMarkup;

    if (Element.Children.Num() > 0)
    {
        for (const FMarkdownElement& Child : Element.Children)
        {
            switch (Child.Type)
            {
                case EMarkdownElementType::Bold:
                    RichTextMarkup += FString::Printf(TEXT("<Bold>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::Italic:
                    RichTextMarkup += FString::Printf(TEXT("<Italic>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::BoldItalic:
                    RichTextMarkup += FString::Printf(TEXT("<BoldItalic>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::InlineCode:
                    RichTextMarkup += FString::Printf(TEXT("<CodeInline>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::Link:
                    RichTextMarkup += FString::Printf(TEXT("<a href=\"%s\">%s</>"), *Child.Url, *Child.Content);
                    break;
                default:
                    FString EscapedContent = Child.Content;
                    EscapedContent.ReplaceInline(TEXT("&"), TEXT("&amp;"), ESearchCase::CaseSensitive);
                    EscapedContent.ReplaceInline(TEXT("<"), TEXT("&lt;"), ESearchCase::CaseSensitive);
                    EscapedContent.ReplaceInline(TEXT(">"), TEXT("&gt;"), ESearchCase::CaseSensitive);
                    RichTextMarkup += EscapedContent;
                    break;
            }
        }
    }
    else
    {
        FString EscapedContent = Element.Content;
        EscapedContent.ReplaceInline(TEXT("&"), TEXT("&amp;"), ESearchCase::CaseSensitive);
        EscapedContent.ReplaceInline(TEXT("<"), TEXT("&lt;"), ESearchCase::CaseSensitive);
        EscapedContent.ReplaceInline(TEXT(">"), TEXT("&gt;"), ESearchCase::CaseSensitive);
        RichTextMarkup = EscapedContent;
    }

    // Create custom text decorators for our markup with heading font size
    TArray<TSharedRef<ITextDecorator>> Decorators;

    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("Bold"),
        FSlateColor(HeadingColor),
        FCoreStyle::GetDefaultFontStyle("Bold", FontSize)
    ));

    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("Italic"),
        FSlateColor(HeadingColor),
        FCoreStyle::GetDefaultFontStyle("Italic", FontSize)
    ));

    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("BoldItalic"),
        FSlateColor(HeadingColor),
        FCoreStyle::GetDefaultFontStyle("BoldItalic", FontSize)
    ));

    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("CodeInline"),
        FSlateColor(FLinearColor(0.8f, 0.85f, 0.75f)),
        FCoreStyle::GetDefaultFontStyle("Mono", FontSize - 1.0f)
    ));

    return SNew(SBox)
    .Padding(FMargin(0.0f, 8.0f, 0.0f, 4.0f))
    [
        SNew(SRichTextBlock)
        .Text(FText::FromString(RichTextMarkup))
        .AutoWrapText(true)
        .Decorators(Decorators)
        .TextStyle(HeadingStylePtr)
    ];
}

TSharedRef<SWidget> SMarkdownWidget::BuildCodeBlock(const FMarkdownElement& Element)
{
    // Extract language tag and content
    FString Content = Element.Content;
    FString LangTag;
    int32 NewlinePos = Content.Find(TEXT("\n"));
    if (NewlinePos != INDEX_NONE)
    {
        LangTag = Content.Left(NewlinePos);
        Content = Content.RightChop(NewlinePos + 1);
    }
    Content.TrimEndInline();

    // Store content for copy button
    FString CodeContent = Content;

    // Code block styling - more distinct like table
    const FLinearColor CodeBlockBorderColor = FLinearColor(0.35f, 0.35f, 0.40f);  // Visible border
    const FLinearColor CodeBlockBgColor = FLinearColor(0.10f, 0.10f, 0.12f);      // Distinct background
    const FLinearColor CodeBlockAccentColor = FLinearColor(0.15f, 0.22f, 0.30f);     // Accent bar color (dimmed blue)

    return SNew(SHorizontalBox)

    // Accent bar on left (similar to block quote)
    + SHorizontalBox::Slot()
    .AutoWidth()
    [
        SNew(SBorder)
        .BorderImage(FAppStyle::GetBrush("WhiteBrush"))
        .BorderBackgroundColor(CodeBlockAccentColor)
        .Padding(FMargin(4.0f, 0.0f))
        [
            SNullWidget::NullWidget
        ]
    ]

    // Code content with border
    + SHorizontalBox::Slot()
    .FillWidth(1.0f)
    [
        SNew(SBorder)
        .BorderImage(FAppStyle::GetBrush("ToolPanel.DarkGroupBorder"))
        .BorderBackgroundColor(CodeBlockBorderColor)
        .Padding(FMargin(1.0f))
        [
            SNew(SBorder)
            .BorderBackgroundColor(CodeBlockBgColor)
            .Padding(FMargin(10.0f, 8.0f))
            [
                SNew(SVerticalBox)

                // Header row with language tag
                + SVerticalBox::Slot()
                .AutoHeight()
                .Padding(0, 0, 0, 4)
                [
                    SNew(STextBlock)
                    .Text(FText::FromString(LangTag.IsEmpty() ? TEXT("code") : LangTag))
                    .Font(FCoreStyle::GetDefaultFontStyle("Mono", 8))
                    .ColorAndOpacity(FSlateColor(FLinearColor(0.5f, 0.6f, 0.7f)))
                    .Visibility_Lambda([LangTag]() { return LangTag.IsEmpty() ? EVisibility::Collapsed : EVisibility::Visible; })
                ]

                // Code content
                + SVerticalBox::Slot()
                .AutoHeight()
                [
                    SNew(STextBlock)
                    .Text(FText::FromString(Content))
                    .Font(FCoreStyle::GetDefaultFontStyle("Mono", CodeTextSize))
                    .ColorAndOpacity(FSlateColor(FLinearColor(0.85f, 0.90f, 0.80f)))
                    .AutoWrapText(true)
                ]
            ]
        ]
    ]

    // Copy button on right side (vertical aligned)
    + SHorizontalBox::Slot()
    .AutoWidth()
    .VAlign(VAlign_Top)
    .Padding(4.0f, 8.0f, 4.0f, 0.0f)
    [
        SNew(SButton)
        .Text(LOCTEXT("CopyCode", "Copy"))
        .ButtonStyle(FAppStyle::Get(), "SimpleButton")
        .OnClicked_Lambda([CodeContent]()
        {
            FPlatformApplicationMisc::ClipboardCopy(*CodeContent);
            return FReply::Handled();
        })
        .ToolTipText(LOCTEXT("CopyCodeTooltip", "Copy code to clipboard"))
    ];
}

TSharedRef<SWidget> SMarkdownWidget::BuildListItem(const FMarkdownElement& Element, int32 IndentLevel)
{
    float Indent = IndentLevel * 20.0f + 12.0f;
    FString Prefix;

    if (Element.Type == EMarkdownElementType::BulletList)
    {
        Prefix = TEXT("• ");
    }
    else
    {
        Prefix = FString::Printf(TEXT("%d. "), Element.Level);
    }

    // Convert inline elements to rich text markup format
    FString RichTextMarkup;

    if (Element.Children.Num() > 0)
    {
        for (const FMarkdownElement& Child : Element.Children)
        {
            switch (Child.Type)
            {
                case EMarkdownElementType::Bold:
                    RichTextMarkup += FString::Printf(TEXT("<Bold>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::Italic:
                    RichTextMarkup += FString::Printf(TEXT("<Italic>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::BoldItalic:
                    RichTextMarkup += FString::Printf(TEXT("<BoldItalic>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::InlineCode:
                    RichTextMarkup += FString::Printf(TEXT("<CodeInline>%s</>"), *Child.Content);
                    break;
                case EMarkdownElementType::Link:
                    RichTextMarkup += FString::Printf(TEXT("<a href=\"%s\">%s</>"), *Child.Url, *Child.Content);
                    break;
                default:
                    FString EscapedContent = Child.Content;
                    EscapedContent.ReplaceInline(TEXT("&"), TEXT("&amp;"), ESearchCase::CaseSensitive);
                    EscapedContent.ReplaceInline(TEXT("<"), TEXT("&lt;"), ESearchCase::CaseSensitive);
                    EscapedContent.ReplaceInline(TEXT(">"), TEXT("&gt;"), ESearchCase::CaseSensitive);
                    RichTextMarkup += EscapedContent;
                    break;
            }
        }
    }
    else
    {
        FString EscapedContent = Element.Content;
        EscapedContent.ReplaceInline(TEXT("&"), TEXT("&amp;"), ESearchCase::CaseSensitive);
        EscapedContent.ReplaceInline(TEXT("<"), TEXT("&lt;"), ESearchCase::CaseSensitive);
        EscapedContent.ReplaceInline(TEXT(">"), TEXT("&gt;"), ESearchCase::CaseSensitive);
        RichTextMarkup = EscapedContent;
    }

    // Create custom text decorators for our markup
    TArray<TSharedRef<ITextDecorator>> Decorators;

    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("Bold"),
        FSlateColor(FLinearColor::White),
        FCoreStyle::GetDefaultFontStyle("Bold", NormalTextSize)
    ));

    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("Italic"),
        FSlateColor(FLinearColor::White),
        FCoreStyle::GetDefaultFontStyle("Italic", NormalTextSize)
    ));

    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("BoldItalic"),
        FSlateColor(FLinearColor::White),
        FCoreStyle::GetDefaultFontStyle("BoldItalic", NormalTextSize)
    ));

    Decorators.Add(FStyleTextDecorator::Create(
        TEXT("CodeInline"),
        FSlateColor(FLinearColor(0.8f, 0.85f, 0.75f)),
        FCoreStyle::GetDefaultFontStyle("Mono", CodeTextSize)
    ));

    // Combine prefix + content in a horizontal box
    return SNew(SHorizontalBox)
    + SHorizontalBox::Slot()
    .AutoWidth()
    [
        SNew(STextBlock)
        .Text(FText::FromString(Prefix))
        .TextStyle(FAppStyle::Get(), "NormalText")
    ]
    + SHorizontalBox::Slot()
    .FillWidth(1.0f)
    [
        SNew(SBox)
        .Padding(FMargin(Indent, 2.0f, 0.0f, 2.0f))
        [
            SNew(SRichTextBlock)
            .Text(FText::FromString(RichTextMarkup))
            .AutoWrapText(true)
            .Decorators(Decorators)
            .TextStyle(FAppStyle::Get(), "NormalText")
        ]
    ];
}

TSharedRef<SWidget> SMarkdownWidget::BuildLink(const FMarkdownElement& Element)
{
    FString Url = Element.Url;
    if (!Url.StartsWith(TEXT("http://")) && !Url.StartsWith(TEXT("https://")))
    {
        Url = TEXT("https://") + Url;
    }

    return SNew(SHyperlink)
    .Text(FText::FromString(Element.Content))
    .Style(FCoreStyle::Get(), "Hyperlink")
    .OnNavigate_Lambda([Url]()
    {
        FString PlatformUrl = Url;
        FPlatformProcess::LaunchURL(*PlatformUrl, nullptr, nullptr);
    });
}

TSharedRef<SWidget> SMarkdownWidget::BuildBlockQuote(const FMarkdownElement& Element)
{
    return SNew(SHorizontalBox)

    // Accent bar
    + SHorizontalBox::Slot()
    .AutoWidth()
    [
        SNew(SBorder)
        .BorderImage(FAppStyle::GetBrush("WhiteBrush"))
        .BorderBackgroundColor(QuoteAccentColor)
        .Padding(FMargin(3.0f, 0.0f))
        [
            SNullWidget::NullWidget
        ]
    ]

    // Quote content
    + SHorizontalBox::Slot()
    .FillWidth(1.0f)
    [
        SNew(SBorder)
        .BorderImage(FAppStyle::GetBrush("ToolPanel.DarkGroupBorder"))
        .BorderBackgroundColor(QuoteBackgroundColor)
        .Padding(FMargin(12.0f, 8.0f))
        [
            SNew(STextBlock)
            .Text(FText::FromString(Element.Content))
            .TextStyle(FAppStyle::Get(), "NormalText")
            .ColorAndOpacity(FSlateColor(FLinearColor(0.7f, 0.7f, 0.75f)))
            .AutoWrapText(true)
        ]
    ];
}

TSharedRef<SWidget> SMarkdownWidget::BuildTable(const FMarkdownElement& Element)
{
    if (Element.TableRows.Num() == 0)
    {
        return SNullWidget::NullWidget;
    }

    int32 NumCols = Element.TableRows[0].Num();
    if (NumCols == 0)
    {
        return SNullWidget::NullWidget;
    }

    // Separator line color (visible grid lines)
    const FLinearColor SeparatorColor = FLinearColor(0.25f, 0.25f, 0.30f);
    const FLinearColor HeaderBgColor = FLinearColor(0.12f, 0.12f, 0.15f);
    const FLinearColor RowBgColor1 = FLinearColor(0.06f, 0.06f, 0.08f);
    const FLinearColor RowBgColor2 = FLinearColor(0.04f, 0.04f, 0.06f);

    // Use SGridPanel for proper column width alignment
    TSharedPtr<SGridPanel> GridPanel;
    SAssignNew(GridPanel, SGridPanel);

    // Create common decorators for all cells
    TArray<TSharedRef<ITextDecorator>> Decorators;
    Decorators.Add(FStyleTextDecorator::Create(TEXT("Bold"), FSlateColor(FLinearColor::White), FCoreStyle::GetDefaultFontStyle("Bold", NormalTextSize)));
    Decorators.Add(FStyleTextDecorator::Create(TEXT("Italic"), FSlateColor(FLinearColor::White), FCoreStyle::GetDefaultFontStyle("Italic", NormalTextSize)));
    Decorators.Add(FStyleTextDecorator::Create(TEXT("BoldItalic"), FSlateColor(FLinearColor::White), FCoreStyle::GetDefaultFontStyle("BoldItalic", NormalTextSize)));
    Decorators.Add(FStyleTextDecorator::Create(TEXT("CodeInline"), FSlateColor(FLinearColor(0.8f, 0.85f, 0.75f)), FCoreStyle::GetDefaultFontStyle("Mono", CodeTextSize)));

    // Build all cells
    for (int32 RowIdx = 0; RowIdx < Element.TableRows.Num(); ++RowIdx)
    {
        const TArray<FString>& RowCells = Element.TableRows[RowIdx];
        bool bIsHeader = (RowIdx == 0);
        FLinearColor BgColor = bIsHeader ? HeaderBgColor : ((RowIdx % 2 == 1) ? RowBgColor1 : RowBgColor2);

        for (int32 Col = 0; Col < NumCols; ++Col)
        {
            FString CellText = (Col < RowCells.Num()) ? RowCells[Col].TrimStartAndEnd() : TEXT("");
            FString RichTextMarkup = BuildCellMarkup(CellText, bIsHeader, Decorators);

            // Add cell to grid
            GridPanel->AddSlot(Col, RowIdx)
            [
                SNew(SBorder)
                .BorderBackgroundColor(BgColor)
                .Padding(FMargin(8.0f, 6.0f, 8.0f, 6.0f))
                [
                    SNew(SRichTextBlock)
                    .Text(FText::FromString(RichTextMarkup))
                    .AutoWrapText(true)
                    .Decorators(Decorators)
                    .TextStyle(FAppStyle::Get(), "NormalText")
                ]
            ];
        }
    }

    // Wrap in horizontal box to prevent filling entire page
    return SNew(SHorizontalBox)
    + SHorizontalBox::Slot()
    .AutoWidth()
    .HAlign(HAlign_Left)
    [
        SNew(SBorder)
        .BorderImage(FAppStyle::GetBrush("ToolPanel.DarkGroupBorder"))
        .BorderBackgroundColor(SeparatorColor)
        .Padding(FMargin(1.0f))
        [
            SNew(SBorder)
            .BorderBackgroundColor(FLinearColor(0.05f, 0.05f, 0.07f))
            .Padding(FMargin(0.0f))
            [
                GridPanel.ToSharedRef()
            ]
        ]
    ]
    // Spacer to fill remaining width
    + SHorizontalBox::Slot()
    .FillWidth(1.0f)
    [
        SNullWidget::NullWidget
    ];
}

FString SMarkdownWidget::BuildCellMarkup(const FString& CellText, bool bIsHeader, const TArray<TSharedRef<ITextDecorator>>& Decorators)
{
    TArray<FMarkdownElement> InlineElements = ParseInlineFormatting(CellText);
    FString RichTextMarkup;

    if (InlineElements.Num() > 0)
    {
        for (const FMarkdownElement& InlineElement : InlineElements)
        {
            switch (InlineElement.Type)
            {
                case EMarkdownElementType::Bold:
                    RichTextMarkup += FString::Printf(TEXT("<Bold>%s</>"), *InlineElement.Content);
                    break;
                case EMarkdownElementType::Italic:
                    RichTextMarkup += FString::Printf(TEXT("<Italic>%s</>"), *InlineElement.Content);
                    break;
                case EMarkdownElementType::BoldItalic:
                    RichTextMarkup += FString::Printf(TEXT("<BoldItalic>%s</>"), *InlineElement.Content);
                    break;
                case EMarkdownElementType::InlineCode:
                    RichTextMarkup += FString::Printf(TEXT("<CodeInline>%s</>"), *InlineElement.Content);
                    break;
                case EMarkdownElementType::Link:
                    RichTextMarkup += FString::Printf(TEXT("<a href=\"%s\">%s</>"), *InlineElement.Url, *InlineElement.Content);
                    break;
                default:
                    if (bIsHeader)
                    {
                        FString EscapedContent = InlineElement.Content;
                        EscapedContent.ReplaceInline(TEXT("&"), TEXT("&amp;"), ESearchCase::CaseSensitive);
                        EscapedContent.ReplaceInline(TEXT("<"), TEXT("&lt;"), ESearchCase::CaseSensitive);
                        EscapedContent.ReplaceInline(TEXT(">"), TEXT("&gt;"), ESearchCase::CaseSensitive);
                        RichTextMarkup += FString::Printf(TEXT("<Bold>%s</>"), *EscapedContent);
                    }
                    else
                    {
                        FString EscapedContent = InlineElement.Content;
                        EscapedContent.ReplaceInline(TEXT("&"), TEXT("&amp;"), ESearchCase::CaseSensitive);
                        EscapedContent.ReplaceInline(TEXT("<"), TEXT("&lt;"), ESearchCase::CaseSensitive);
                        EscapedContent.ReplaceInline(TEXT(">"), TEXT("&gt;"), ESearchCase::CaseSensitive);
                        RichTextMarkup += EscapedContent;
                    }
                    break;
            }
        }
    }
    else if (bIsHeader)
    {
        RichTextMarkup = TEXT("<Bold></>");
    }

    return RichTextMarkup;
}

bool SMarkdownWidget::IsTableRow(const FString& Line)
{
    FString Trimmed = Line.TrimStartAndEnd();
    return Trimmed.Len() > 2 && Trimmed.StartsWith(TEXT("|")) && Trimmed.EndsWith(TEXT("|"));
}

bool SMarkdownWidget::IsTableSeparator(const FString& Line)
{
    FString Trimmed = Line.TrimStartAndEnd();
    if (!Trimmed.StartsWith(TEXT("|")) || !Trimmed.EndsWith(TEXT("|")))
    {
        return false;
    }

    // Content between pipes may contain dashes, spaces, pipes, and ':' alignment markers (GFM).
    FString Content = Trimmed.Mid(1, Trimmed.Len() - 2);
    bool bHasDash = false;
    for (int32 i = 0; i < Content.Len(); ++i)
    {
        const TCHAR Ch = Content[i];
        if (Ch != '-' && Ch != ' ' && Ch != '|' && Ch != ':')
        {
            return false;
        }
        if (Ch == '-')
        {
            bHasDash = true;
        }
    }
    return bHasDash;
}

TArray<FString> SMarkdownWidget::ParseTableRowCells(const FString& Line)
{
    TArray<FString> Cells;

    FString Trimmed = Line.TrimStartAndEnd();
    // Remove leading and trailing pipes
    if (Trimmed.StartsWith(TEXT("|")))
    {
        Trimmed = Trimmed.RightChop(1);
    }
    if (Trimmed.EndsWith(TEXT("|")))
    {
        Trimmed = Trimmed.LeftChop(1);
    }

    // Split by | and trim each cell
    TArray<FString> RawCells;
    Trimmed.ParseIntoArray(RawCells, TEXT("|"));

    for (const FString& Cell : RawCells)
    {
        Cells.Add(Cell.TrimStartAndEnd());
    }

    return Cells;
}

TSharedRef<SWidget> SMarkdownWidget::BuildHorizontalRule()
{
    return SNew(SSeparator)
    .ColorAndOpacity(FSlateColor(FLinearColor(0.2f, 0.2f, 0.25f, 0.8f)));
}

TSharedRef<SWidget> SMarkdownWidget::BuildInlineText(const FMarkdownElement& Element)
{
    switch (Element.Type)
    {
        case EMarkdownElementType::Bold:
            return SNew(STextBlock)
                .Text(FText::FromString(Element.Content))
                .Font(FCoreStyle::GetDefaultFontStyle("Bold", NormalTextSize))
                .ColorAndOpacity(FSlateColor(FLinearColor::White))
                .AutoWrapText(true);

        case EMarkdownElementType::Italic:
            return SNew(STextBlock)
                .Text(FText::FromString(Element.Content))
                .Font(FCoreStyle::GetDefaultFontStyle("Italic", NormalTextSize))
                .ColorAndOpacity(FSlateColor(FLinearColor::White))
                .AutoWrapText(true);

        case EMarkdownElementType::BoldItalic:
            return SNew(STextBlock)
                .Text(FText::FromString(Element.Content))
                .Font(FCoreStyle::GetDefaultFontStyle("BoldItalic", NormalTextSize))
                .ColorAndOpacity(FSlateColor(FLinearColor::White))
                .AutoWrapText(true);

        case EMarkdownElementType::InlineCode:
            return SNew(SBorder)
                .BorderImage(FAppStyle::GetBrush("ToolPanel.DarkGroupBorder"))
                .BorderBackgroundColor(CodeBackgroundColor)
                .Padding(FMargin(2.0f, 1.0f))
                [
                    SNew(STextBlock)
                    .Text(FText::FromString(Element.Content))
                    .Font(FCoreStyle::GetDefaultFontStyle("Mono", CodeTextSize))
                    .ColorAndOpacity(FSlateColor(FLinearColor(0.8f, 0.85f, 0.75f)))
                ];

        case EMarkdownElementType::Link:
            return BuildLink(Element);

        default:
            return SNew(STextBlock)
                .Text(FText::FromString(Element.Content))
                .TextStyle(FAppStyle::Get(), "NormalText")
                .AutoWrapText(true);
    }
}

// ============================================================================
// FMarkdownParser Helpers
// ============================================================================

bool FMarkdownParser::IsHeading(const FString& Line, int32& OutLevel, FString& OutContent)
{
    FString Trimmed = Line.TrimStart();

    // Count leading #
    int32 Level = 0;
    int32 Pos = 0;
    while (Pos < Trimmed.Len() && Trimmed[Pos] == '#')
    {
        Level++;
        Pos++;
    }

    // Must have 1-4 # followed by space
    if (Level >= 1 && Level <= 4 && Pos < Trimmed.Len() && Trimmed[Pos] == ' ')
    {
        OutLevel = Level;
        OutContent = Trimmed.RightChop(Pos + 1).TrimStartAndEnd();
        return true;
    }

    return false;
}

bool FMarkdownParser::IsCodeFence(const FString& Line, bool& bIsOpening, FString& OutLang)
{
    FString Trimmed = Line.TrimStartAndEnd();

    if (!Trimmed.StartsWith(TEXT("```")))
    {
        return false;
    }

    bIsOpening = !Trimmed.EndsWith(TEXT("```")) || Trimmed.Len() > 3;
    OutLang = Trimmed.RightChop(3).TrimStartAndEnd();
    return true;
}

bool FMarkdownParser::IsBulletList(const FString& Line, FString& OutContent, int32& OutIndent)
{
    FString Trimmed = Line.TrimStart();

    // Count indentation (spaces before marker)
    OutIndent = Line.Len() - Trimmed.Len();

    // Check for - or * followed by space
    if (Trimmed.Len() > 1 && (Trimmed[0] == '-' || Trimmed[0] == '*') && Trimmed[1] == ' ')
    {
        // Make sure it's not a horizontal rule or italic
        FString Rest = Trimmed.RightChop(1).TrimStartAndEnd();
        if (!Rest.IsEmpty() && Rest != TEXT("---") && Rest != TEXT("***"))
        {
            OutContent = Trimmed.RightChop(2).TrimStart();
            return true;
        }
    }

    return false;
}

bool FMarkdownParser::IsNumberedList(const FString& Line, FString& OutContent, int32& OutNumber, int32& OutIndent)
{
    FString Trimmed = Line.TrimStart();

    // Count indentation
    OutIndent = Line.Len() - Trimmed.Len();

    // Find number followed by . and space
    int32 DotPos = Trimmed.Find(TEXT(". "));
    if (DotPos > 0)
    {
        FString NumberPart = Trimmed.Left(DotPos);
        if (NumberPart.IsNumeric())
        {
            OutNumber = FCString::Atoi(*NumberPart);
            OutContent = Trimmed.RightChop(DotPos + 2);
            return true;
        }
    }

    return false;
}

bool FMarkdownParser::IsBlockQuote(const FString& Line, FString& OutContent)
{
    FString Trimmed = Line.TrimStart();

    if (Trimmed.StartsWith(TEXT(">")))
    {
        OutContent = Trimmed.RightChop(1).TrimStart();
        return true;
    }

    return false;
}

bool FMarkdownParser::IsHorizontalRule(const FString& Line)
{
    FString Trimmed = Line.TrimStartAndEnd();

    // Must be at least 3 chars: ---, ***, ___
    if (Trimmed.Len() < 3)
    {
        return false;
    }

    bool bAllDash = true;
    bool bAllStar = true;
    bool bAllUnderscore = true;

    for (int32 i = 0; i < Trimmed.Len(); ++i)
    {
        if (Trimmed[i] != '-') bAllDash = false;
        if (Trimmed[i] != '*') bAllStar = false;
        if (Trimmed[i] != '_') bAllUnderscore = false;
    }

    return bAllDash || bAllStar || bAllUnderscore;
}

FString SMarkdownWidget::GetRenderedText() const
{
    // Return the raw markdown text for now
    // In a more complex implementation, we could strip markdown markers
    return MarkdownText;
}

FString SMarkdownWidget::GetPlainText() const
{
    // Return the full markdown text with all formatting markers intact
    // This allows users to copy the exact markdown source
    return MarkdownText;
}

#undef LOCTEXT_NAMESPACE