// Copyright Natali Caggiano. All Rights Reserved.

/**
 * Tests for execute_script + get_script_history tool surfaces and EScriptType
 * conversion helpers. Covers the removal of the editor_utility script type so
 * future regressions that re-add it surface immediately.
 */

#include "CoreMinimal.h"
#include "Misc/AutomationTest.h"
#include "MCP/Tools/MCPTool_ExecuteScript.h"
#include "MCP/Tools/MCPTool_GetScriptHistory.h"
#include "ScriptTypes.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_ExecuteScript_GetInfo_DropsEditorUtility,
	"UnrealClaude.MCP.Tools.ExecuteScript.DropsEditorUtility",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_ExecuteScript_GetInfo_DropsEditorUtility::RunTest(const FString& Parameters)
{
	FMCPTool_ExecuteScript Tool;
	FMCPToolInfo Info = Tool.GetInfo();

	TestEqual("Tool name should be execute_script", Info.Name, TEXT("execute_script"));
	TestFalse("Tool description must not mention editor_utility",
		Info.Description.Contains(TEXT("editor_utility")));
	TestFalse("Tool description must not mention Editor Utility",
		Info.Description.Contains(TEXT("Editor Utility")));

	TestTrue("Tool description should still list cpp",
		Info.Description.Contains(TEXT("'cpp'")));
	TestTrue("Tool description should still list python",
		Info.Description.Contains(TEXT("'python'")));
	TestTrue("Tool description should still list console",
		Info.Description.Contains(TEXT("'console'")));

	bool bHasScriptTypeParam = false;
	for (const FMCPToolParameter& Param : Info.Parameters)
	{
		if (Param.Name == TEXT("script_type"))
		{
			bHasScriptTypeParam = true;
			TestFalse("script_type description must not mention editor_utility",
				Param.Description.Contains(TEXT("editor_utility")));
		}
	}
	TestTrue("Should have script_type parameter", bHasScriptTypeParam);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_GetScriptHistory_GetInfo_DropsEditorUtility,
	"UnrealClaude.MCP.Tools.GetScriptHistory.DropsEditorUtility",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_GetScriptHistory_GetInfo_DropsEditorUtility::RunTest(const FString& Parameters)
{
	FMCPTool_GetScriptHistory Tool;
	FMCPToolInfo Info = Tool.GetInfo();

	TestEqual("Tool name should be get_script_history", Info.Name, TEXT("get_script_history"));
	TestFalse("Tool description must not mention editor_utility",
		Info.Description.Contains(TEXT("editor_utility")));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FScriptType_StringToType_KnownValues,
	"UnrealClaude.ScriptType.StringToType.KnownValues",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FScriptType_StringToType_KnownValues::RunTest(const FString& Parameters)
{
	TestEqual("cpp string maps to Cpp",
		(int32)StringToScriptType(TEXT("cpp")), (int32)EScriptType::Cpp);
	TestEqual("python string maps to Python",
		(int32)StringToScriptType(TEXT("python")), (int32)EScriptType::Python);
	TestEqual("console string maps to Console",
		(int32)StringToScriptType(TEXT("console")), (int32)EScriptType::Console);

	TestEqual("CPP uppercase maps to Cpp (case-insensitive)",
		(int32)StringToScriptType(TEXT("CPP")), (int32)EScriptType::Cpp);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FScriptType_StringToType_EditorUtilityFallsBackToConsole,
	"UnrealClaude.ScriptType.StringToType.EditorUtilityFallsBackToConsole",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FScriptType_StringToType_EditorUtilityFallsBackToConsole::RunTest(const FString& Parameters)
{
	// editor_utility was removed in favour of cpp/python/console. Legacy callers
	// passing the old string must not crash — the conversion falls back to Console.
	TestEqual("legacy editor_utility falls back to Console",
		(int32)StringToScriptType(TEXT("editor_utility")), (int32)EScriptType::Console);
	TestEqual("unknown string falls back to Console",
		(int32)StringToScriptType(TEXT("bogus_type")), (int32)EScriptType::Console);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FScriptType_TypeToString_NoEditorUtilityCase,
	"UnrealClaude.ScriptType.TypeToString.NoEditorUtilityCase",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FScriptType_TypeToString_NoEditorUtilityCase::RunTest(const FString& Parameters)
{
	TestEqual("Cpp stringifies as cpp", ScriptTypeToString(EScriptType::Cpp), TEXT("cpp"));
	TestEqual("Python stringifies as python", ScriptTypeToString(EScriptType::Python), TEXT("python"));
	TestEqual("Console stringifies as console", ScriptTypeToString(EScriptType::Console), TEXT("console"));

	// Regression guard: nothing in the enum should stringify to editor_utility
	const EScriptType ValidTypes[] = { EScriptType::Cpp, EScriptType::Python, EScriptType::Console };
	for (EScriptType Type : ValidTypes)
	{
		TestNotEqual("No enum value should stringify to editor_utility",
			ScriptTypeToString(Type), FString(TEXT("editor_utility")));
	}

	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
