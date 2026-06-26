// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "IClaudeRunner.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

class SMultiLineEditableTextBox;
class SScrollBox;
class SVerticalBox;
class SClaudeInputArea;
class SExpandableArea;
class SMarkdownWidget;
class STextBlock;

/**
 * Helper widget that wraps a scroll box and provides right-click drag scrolling
 */
class SRightClickDragBox : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SRightClickDragBox)
	{}
		SLATE_ARGUMENT(TSharedPtr<SScrollBox>, ScrollBox)
		SLATE_DEFAULT_SLOT(FArguments, Content)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual FReply OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnMouseButtonUp(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnMouseMove(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual FReply OnMouseWheel(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;
	virtual TOptional<EMouseCursor::Type> GetCursor() const override;

private:
	TSharedPtr<SScrollBox> TargetScrollBox;
	bool bIsDragging = false;
	FVector2D DragStartMousePos;
	float DragStartScrollOffset = 0.0f;
};

/** Returns the text that a copy button should place on the clipboard (evaluated at click time) */
DECLARE_DELEGATE_RetVal(FString, FOnGetCopyText)

/**
 * Small "Copy" button that copies a caller-provided string to the clipboard and
 * briefly shows "Copied!" feedback. The text is resolved lazily via OnGetText so it
 * works for content that is still streaming when the button is created.
 */
class SCopyButton : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SCopyButton)
	{}
		/** Called on click to obtain the text to copy */
		SLATE_EVENT(FOnGetCopyText, OnGetText)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	FReply OnCopyClicked();
	EActiveTimerReturnType TickFeedback(double InCurrentTime, float InDeltaTime);

	FOnGetCopyText OnGetTextDelegate;
	TSharedPtr<STextBlock> Label;
	bool bShowingFeedback = false;
	double FeedbackDeadline = 0.0;
};

/**
 * Chat message display widget with optional Markdown rendering
 */
class SChatMessage : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SChatMessage)
		: _IsUser(true)
		, _bRenderMarkdown(true)
	{}
		SLATE_ARGUMENT(FString, Message)
		SLATE_ARGUMENT(bool, IsUser)
		SLATE_ARGUMENT(bool, bRenderMarkdown)
		SLATE_ATTRIBUTE(bool, bSelectionMode)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	TSharedPtr<SMarkdownWidget> MarkdownWidget;
	bool bUseMarkdown = true;
	TAttribute<bool> bSelectionModeAttr;
};

/**
 * Main Claude chat widget for the editor
 */
class UNREALCLAUDE_API SClaudeEditorWidget : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SClaudeEditorWidget)
	{}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	virtual ~SClaudeEditorWidget();

private:
	/** UI Construction */
	TSharedRef<SWidget> BuildToolbar();
	TSharedRef<SWidget> BuildChatArea();
	TSharedRef<SWidget> BuildInputArea();
	TSharedRef<SWidget> BuildStatusBar();
	
	/** Add a message to the chat display */
	void AddMessage(const FString& Message, bool bIsUser);
	
	/** Add streaming response (appends to last assistant message) */
	void AppendToLastResponse(const FString& Text);
	
	/** Send the current input to Claude */
	void SendMessage();
	
	/** Clear chat history */
	void ClearChat();

	/** Cancel current request */
	void CancelRequest();

	/** Restore previous session context */
	void RestoreSession();

	/** Start a new session (clear history and saved session) */
	void NewSession();
	
	/** Handle response from Claude */
	void OnClaudeResponse(const FString& Response, bool bSuccess);
	
	/** Check if Claude CLI is available */
	bool IsClaudeAvailable() const;
	
	/** Get status text */
	FText GetStatusText() const;
	
	/** Get status color */
	FSlateColor GetStatusColor() const;
	
private:
	/** Chat message container */
	TSharedPtr<SVerticalBox> ChatMessagesBox;

	/** Scroll box for chat */
	TSharedPtr<SScrollBox> ChatScrollBox;

	/** Input area widget */
	TSharedPtr<SClaudeInputArea> InputArea;

	/** Stored Claude message widgets for updating selection mode */
	TArray<TSharedPtr<SMarkdownWidget>> ClaudeMessageWidgets;

	/** Stored message texts for rebuilding on mode change */
	TArray<TPair<FString, bool>> MessageHistory;  // Message text + IsUser flag

	/** Current input text */
	FString CurrentInputText;
	
	/** Is currently waiting for response */
	bool bIsWaitingForResponse = false;

	/** Timestamp when the current streaming request started (FPlatformTime::Seconds) */
	double StreamingStartTime = 0.0;

	/** Number of tool calls observed during current streaming response */
	int32 StreamingToolCallCount = 0;

	/** Final stats from the Result event (persists after streaming ends until next request) */
	FString LastResultStats;

	/** Accumulated streaming response */
	FString StreamingResponse;

	/** Per-bubble copy text for the current streaming response, filled in on finalize.
	 *  Held by shared ref so the streaming bubble's copy button keeps copying its own
	 *  text even after later requests overwrite StreamingResponse. */
	TSharedPtr<FString> StreamingCopyTextRef;

	/** Current streaming message widget (for updating in place) */
	TSharedPtr<STextBlock> StreamingTextBlock;

	/** Inner content box for streaming bubble (holds text segments + tool indicators) */
	TSharedPtr<SVerticalBox> StreamingContentBox;

	/** Text accumulated for the current segment only (reset on each tool use) */
	FString CurrentSegmentText;

	/** Tool call status labels by call ID */
	TMap<FString, TSharedPtr<STextBlock>> ToolCallStatusLabels;

	/** Tool call result text blocks by call ID */
	TMap<FString, TSharedPtr<STextBlock>> ToolCallResultTexts;

	/** Tool call expandable areas by call ID */
	TMap<FString, TSharedPtr<SExpandableArea>> ToolCallExpandables;

	/** Tool names by call ID */
	TMap<FString, FString> ToolCallNames;

	/** All text segments in order (frozen when tool events arrive) */
	TArray<FString> AllTextSegments;

	/** Text block widgets for each segment (for code block post-processing) */
	TArray<TSharedPtr<STextBlock>> TextSegmentBlocks;

	/** Container vertical boxes wrapping each text segment (for code block replacement) */
	TArray<TSharedPtr<SVerticalBox>> TextSegmentContainers;

	/** Current tool group expandable area */
	TSharedPtr<SExpandableArea> ToolGroupExpandArea;

	/** Inner box holding tool entries in current group */
	TSharedPtr<SVerticalBox> ToolGroupInnerBox;

	/** Summary text for current tool group header */
	TSharedPtr<STextBlock> ToolGroupSummaryText;

	/** Number of tools in current group */
	int32 ToolGroupCount = 0;

	/** Number of completed tools in current group */
	int32 ToolGroupDoneCount = 0;

	/** Tool call IDs in current group (for showing/hiding labels on transition) */
	TArray<FString> ToolGroupCallIds;

	/** Include UE5.7 context in prompts */
	bool bIncludeUE57Context = true;

	/** Include project context in prompts */
	bool bIncludeProjectContext = true;

	/** Selection mode for Claude responses (true = plain text for copying) */
	bool bSelectionMode = false;

	/** Handle streaming progress from Claude (legacy, still used for accumulation) */
	void OnClaudeProgress(const FString& PartialOutput);

	/** Handle structured NDJSON stream events from Claude */
	void OnClaudeStreamEvent(const FClaudeStreamEvent& Event);

	/** Reset all streaming and tool tracking state to defaults */
	void ResetStreamingState();

	/** Start a new streaming response message */
	void StartStreamingResponse();

	/** Finalize streaming response */
	void FinalizeStreamingResponse();

	/** Handle a ToolUse stream event (insert tool indicator, start new text segment) */
	void HandleToolUseEvent(const FClaudeStreamEvent& Event);

	/** Handle a ToolResult stream event (update tool indicator with completion + result) */
	void HandleToolResultEvent(const FClaudeStreamEvent& Event);

	/** Handle a Result stream event (append stats footer) */
	void HandleResultEvent(const FClaudeStreamEvent& Event);

	/** Handle a Refusal stream event (display refusal message, reset context) */
	void HandleRefusalEvent(const FClaudeStreamEvent& Event);

	/** Update tool group summary text based on pending/completed state */
	void UpdateToolGroupSummary();

	/** Get display-friendly tool name (strips MCP server prefix) */
	static FString GetDisplayToolName(const FString& FullToolName);

	/** Post-process text segments to render code blocks with monospace styling */
	void ParseAndRenderCodeBlocks();

	/** Parse text into alternating plain/code sections split on triple-backtick fences */
	static void ParseCodeFences(const FString& Input, TArray<TPair<FString, bool>>& OutSections);

	/** Refresh project context */
	void RefreshProjectContext();

	/** Get project context summary for status bar */
	FText GetProjectContextSummary() const;

	/** Generate MCP tool status message for greeting */
	FString GenerateMCPStatusMessage() const;

	/** Rebuild all chat messages with current selection mode */
	void RebuildChatMessages();

	/** Check if scroll box is at or near the bottom */
	bool IsScrolledToBottom() const;

	/** Scroll to end (use when user was at bottom before content update) */
	void ScrollToEnd();
};
