// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "Misc/AutomationTest.h"

namespace UnrealClaudeTest
{
	/** Shared test flags used across UnrealClaude automation tests. */
	constexpr EAutomationTestFlags DefaultTestFlags =
		EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter;
}
