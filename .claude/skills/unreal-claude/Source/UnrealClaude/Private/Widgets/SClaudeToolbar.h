// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"

DECLARE_DELEGATE(FOnToolbarAction)
DECLARE_DELEGATE_OneParam(FOnCheckboxChanged, bool)

/**
 * Toolbar widget for Claude Editor
 * Handles UE context toggles, session management buttons, and view mode toggle
 */
class SClaudeToolbar : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SClaudeToolbar)
		: _bUE57ContextEnabled(true)
		, _bProjectContextEnabled(true)
		, _bRestoreEnabled(false)
		, _bSelectionMode(false)
	{}
		SLATE_ATTRIBUTE(bool, bUE57ContextEnabled)
		SLATE_ATTRIBUTE(bool, bProjectContextEnabled)
		SLATE_ATTRIBUTE(bool, bRestoreEnabled)
		SLATE_ATTRIBUTE(bool, bSelectionMode)
		SLATE_EVENT(FOnCheckboxChanged, OnUE57ContextChanged)
		SLATE_EVENT(FOnCheckboxChanged, OnProjectContextChanged)
		SLATE_EVENT(FOnCheckboxChanged, OnSelectionModeChanged)
		SLATE_EVENT(FOnToolbarAction, OnRefreshContext)
		SLATE_EVENT(FOnToolbarAction, OnRestoreSession)
		SLATE_EVENT(FOnToolbarAction, OnNewSession)
		SLATE_EVENT(FOnToolbarAction, OnClear)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	TAttribute<bool> bUE57ContextEnabled;
	TAttribute<bool> bProjectContextEnabled;
	TAttribute<bool> bRestoreEnabled;
	TAttribute<bool> bSelectionMode;

	FOnCheckboxChanged OnUE57ContextChanged;
	FOnCheckboxChanged OnProjectContextChanged;
	FOnCheckboxChanged OnSelectionModeChanged;
	FOnToolbarAction OnRefreshContext;
	FOnToolbarAction OnRestoreSession;
	FOnToolbarAction OnNewSession;
	FOnToolbarAction OnClear;
};
