// Copyright Natali Caggiano. All Rights Reserved.

/**
 * Unit tests for Animation Blueprint Bulk Operations (setup_transition_conditions)
 * Tests for the new bulk transition condition setup functionality
 */

#include "CoreMinimal.h"
#include "Misc/AutomationTest.h"
#include "MCP/Tools/MCPTool_AnimBlueprintModify.h"
#include "Dom/JsonObject.h"

#if WITH_DEV_AUTOMATION_TESTS

// ===== Tool Info Tests for Bulk Operations =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_BulkOps_HasRulesParam,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.BulkOps.HasRulesParam",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_BulkOps_HasRulesParam::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;
	FMCPToolInfo Info = Tool.GetInfo();

	// Check that rules parameter exists for bulk operations
	bool bHasRulesParam = false;
	for (const FMCPToolParameter& Param : Info.Parameters)
	{
		if (Param.Name == TEXT("rules"))
		{
			bHasRulesParam = true;
			TestFalse("rules parameter should be optional", Param.bRequired);
			TestEqual("rules parameter should be array type", Param.Type, TEXT("array"));
		}
	}

	TestTrue("Should have 'rules' parameter for bulk operations", bHasRulesParam);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_BulkOps_DescriptionMentionsBulkOps,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.BulkOps.DescriptionMentionsBulkOps",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_BulkOps_DescriptionMentionsBulkOps::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;
	FMCPToolInfo Info = Tool.GetInfo();

	// Verify bulk operations are documented
	TestTrue("Description mentions setup_transition_conditions",
		Info.Description.Contains(TEXT("setup_transition_conditions")));
	TestTrue("Description has Bulk Operations section",
		Info.Description.Contains(TEXT("Bulk Operations")));

	return true;
}

// ===== Parameter Validation Tests for setup_transition_conditions =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_BulkOps_RequiresStateMachine,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.BulkOps.RequiresStateMachine",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_BulkOps_RequiresStateMachine::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;

	// setup_transition_conditions without state_machine
	// Note: Blueprint loading happens first, so without a real test asset
	// we can only verify the operation fails. With a real ABP, error would mention state_machine.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("blueprint_path"), TEXT("/Game/Test/ABP_Test"));
	Params->SetStringField(TEXT("operation"), TEXT("setup_transition_conditions"));
	// Missing state_machine

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should fail without state_machine (or blueprint)", Result.bSuccess);
	// Either fails on blueprint load or state_machine validation
	TestTrue("Should have error message", !Result.Message.IsEmpty());

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_BulkOps_RequiresRulesArray,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.BulkOps.RequiresRulesArray",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_BulkOps_RequiresRulesArray::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;

	// setup_transition_conditions without rules
	// Note: Blueprint loading happens first, so without a real test asset
	// we can only verify the operation fails. With a real ABP, error would mention rules.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("blueprint_path"), TEXT("/Game/Test/ABP_Test"));
	Params->SetStringField(TEXT("operation"), TEXT("setup_transition_conditions"));
	Params->SetStringField(TEXT("state_machine"), TEXT("Locomotion"));
	// Missing rules array

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should fail without rules array (or blueprint)", Result.bSuccess);
	// Either fails on blueprint load or rules validation
	TestTrue("Should have error message", !Result.Message.IsEmpty());

	return true;
}

// ===== Batch Operations Tests for add_comparison_chain =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_Batch_SupportsComparisonChain,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.Batch.SupportsComparisonChain",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_Batch_SupportsComparisonChain::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;
	FMCPToolInfo Info = Tool.GetInfo();

	// Verify batch operation is mentioned in description
	TestTrue("Description mentions batch operation", Info.Description.Contains(TEXT("batch")));
	TestTrue("Description mentions add_comparison_chain", Info.Description.Contains(TEXT("add_comparison_chain")));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_Batch_RequiresOperationsArray,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.Batch.RequiresOperationsArray",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_Batch_RequiresOperationsArray::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;

	// batch operation without operations array
	// Note: Blueprint loading happens first, so without a real test asset
	// we can only verify the operation fails. With a real ABP, error would mention operations.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("blueprint_path"), TEXT("/Game/Test/ABP_Test"));
	Params->SetStringField(TEXT("operation"), TEXT("batch"));
	// Missing operations array

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should fail without operations array (or blueprint)", Result.bSuccess);
	// Either fails on blueprint load or operations validation
	TestTrue("Should have error message", !Result.Message.IsEmpty());

	return true;
}

// ===== Security Tests =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_BulkOps_Security_BlocksEnginePaths,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.BulkOps.Security.BlocksEnginePaths",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_BulkOps_Security_BlocksEnginePaths::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;

	// Attempt to access engine path with bulk operation
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("blueprint_path"), TEXT("/Engine/AnimBlueprints/ABP_Default"));
	Params->SetStringField(TEXT("operation"), TEXT("setup_transition_conditions"));
	Params->SetStringField(TEXT("state_machine"), TEXT("Locomotion"));

	TArray<TSharedPtr<FJsonValue>> RulesArray;
	Params->SetArrayField(TEXT("rules"), RulesArray);

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should block engine paths", Result.bSuccess);
	TestTrue("Error should mention engine paths blocked",
		Result.Message.Contains(TEXT("Engine")) || Result.Message.Contains(TEXT("blocked")));

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_BulkOps_Security_BlocksPathTraversal,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.BulkOps.Security.BlocksPathTraversal",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_BulkOps_Security_BlocksPathTraversal::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;

	// Attempt path traversal with bulk operation
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("blueprint_path"), TEXT("/Game/../../../etc/passwd"));
	Params->SetStringField(TEXT("operation"), TEXT("setup_transition_conditions"));
	Params->SetStringField(TEXT("state_machine"), TEXT("Locomotion"));

	TArray<TSharedPtr<FJsonValue>> RulesArray;
	Params->SetArrayField(TEXT("rules"), RulesArray);

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should block path traversal", Result.bSuccess);
	TestTrue("Error should mention path traversal",
		Result.Message.Contains(TEXT("traversal")) || Result.Message.Contains(TEXT("../")));

	return true;
}

// ===== Variable Param Alias Tests (var_name → variable_name) =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_AddVariable_VarNameAlias,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.Aliases.AddVariableVarNameWarns",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_AddVariable_VarNameAlias::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;

	// Pass deprecated var_name/var_type — the BP load will fail (test path doesn't exist)
	// but the alias warnings should still attach to the error result.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("blueprint_path"), TEXT("/Game/Test/ABP_Test"));
	Params->SetStringField(TEXT("operation"), TEXT("add_variable"));
	Params->SetStringField(TEXT("var_name"), TEXT("Speed"));
	Params->SetStringField(TEXT("var_type"), TEXT("float"));

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should fail (BP path does not exist)", Result.bSuccess);
	TestTrue("Should emit warnings even on early failure", Result.Warnings.Num() >= 2);

	bool bWarnsVarName = false;
	bool bWarnsVarType = false;
	for (const FString& W : Result.Warnings)
	{
		if (W.Contains(TEXT("var_name")) && W.Contains(TEXT("variable_name"))) bWarnsVarName = true;
		if (W.Contains(TEXT("var_type")) && W.Contains(TEXT("variable_type"))) bWarnsVarType = true;
	}
	TestTrue("Warning should mention var_name → variable_name", bWarnsVarName);
	TestTrue("Warning should mention var_type → variable_type", bWarnsVarType);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_RemoveVariable_VarNameAlias,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.Aliases.RemoveVariableVarNameWarns",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_RemoveVariable_VarNameAlias::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;

	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("blueprint_path"), TEXT("/Game/Test/ABP_Test"));
	Params->SetStringField(TEXT("operation"), TEXT("remove_variable"));
	Params->SetStringField(TEXT("var_name"), TEXT("Speed"));

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should fail (BP path does not exist)", Result.bSuccess);
	TestTrue("Should emit alias warning even on early failure", Result.Warnings.Num() >= 1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_SetVariableDefault_VarNameAlias,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.Aliases.SetVariableDefaultVarNameWarns",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_SetVariableDefault_VarNameAlias::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;

	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("blueprint_path"), TEXT("/Game/Test/ABP_Test"));
	Params->SetStringField(TEXT("operation"), TEXT("set_variable_default"));
	Params->SetStringField(TEXT("var_name"), TEXT("Speed"));
	Params->SetStringField(TEXT("default_value"), TEXT("42.0"));

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should fail (BP path does not exist)", Result.bSuccess);
	TestTrue("Should emit alias warning even on early failure", Result.Warnings.Num() >= 1);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AnimBlueprintModify_AddVariable_CanonicalNoWarn,
	"UnrealClaude.MCP.Tools.AnimBlueprintModify.Aliases.CanonicalNamesNoWarn",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AnimBlueprintModify_AddVariable_CanonicalNoWarn::RunTest(const FString& Parameters)
{
	FMCPTool_AnimBlueprintModify Tool;

	// Canonical names should produce zero alias warnings (BP load still fails — unrelated).
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("blueprint_path"), TEXT("/Game/Test/ABP_Test"));
	Params->SetStringField(TEXT("operation"), TEXT("add_variable"));
	Params->SetStringField(TEXT("variable_name"), TEXT("Speed"));
	Params->SetStringField(TEXT("variable_type"), TEXT("float"));

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should fail (BP path does not exist)", Result.bSuccess);
	TestEqual("Canonical names should not produce alias warnings", Result.Warnings.Num(), 0);
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
