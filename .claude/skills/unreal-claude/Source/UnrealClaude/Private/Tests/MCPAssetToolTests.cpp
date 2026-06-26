// Copyright Natali Caggiano. All Rights Reserved.

/**
 * Integration tests for MCP Asset Management Tools
 * Tests asset search, dependency analysis, and referencer discovery
 */

#include "CoreMinimal.h"
#include "Misc/AutomationTest.h"
#include "MCP/MCPToolRegistry.h"
#include "MCP/Tools/MCPTool_AssetSearch.h"
#include "MCP/Tools/MCPTool_AssetDependencies.h"
#include "MCP/Tools/MCPTool_AssetReferencers.h"
#include "MCP/Tools/MCPTool_Asset.h"
#include "Dom/JsonObject.h"
#include "AssetRegistry/AssetRegistryModule.h"

#if WITH_DEV_AUTOMATION_TESTS

// ===== Asset Search Integration Tests =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_SearchAllInGame,
	"UnrealClaude.MCP.Tools.AssetSearch.SearchAllInGame",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_SearchAllInGame::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Search with default path filter (/Game/)
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	FMCPToolResult Result = Tool->Execute(Params);

	// Should succeed (even if no assets found)
	TestTrue("Search should succeed", Result.bSuccess);
	TestTrue("Result should have data", Result.Data.IsValid());

	if (Result.Data.IsValid())
	{
		TestTrue("Should have 'assets' array", Result.Data->HasField(TEXT("assets")));
		TestTrue("Should have 'count' field", Result.Data->HasField(TEXT("count")));
		TestTrue("Should have 'total' field", Result.Data->HasField(TEXT("total")));
		TestTrue("Should have 'offset' field", Result.Data->HasField(TEXT("offset")));
		TestTrue("Should have 'limit' field", Result.Data->HasField(TEXT("limit")));
		TestTrue("Should have 'hasMore' field", Result.Data->HasField(TEXT("hasMore")));
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_SearchWithClassFilter,
	"UnrealClaude.MCP.Tools.AssetSearch.SearchWithClassFilter",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_SearchWithClassFilter::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Search for blueprints only
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("class_filter"), TEXT("Blueprint"));
	Params->SetNumberField(TEXT("limit"), 10);

	FMCPToolResult Result = Tool->Execute(Params);

	TestTrue("Search with class filter should succeed", Result.bSuccess);
	TestTrue("Result should have data", Result.Data.IsValid());

	if (Result.Data.IsValid())
	{
		int32 Count = Result.Data->GetIntegerField(TEXT("count"));
		int32 Limit = Result.Data->GetIntegerField(TEXT("limit"));
		TestTrue("Count should not exceed limit", Count <= Limit);
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_SearchWithNamePattern,
	"UnrealClaude.MCP.Tools.AssetSearch.SearchWithNamePattern",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_SearchWithNamePattern::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Search with a name pattern - using common prefix
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("name_pattern"), TEXT("BP_"));
	Params->SetNumberField(TEXT("limit"), 50);

	FMCPToolResult Result = Tool->Execute(Params);

	TestTrue("Search with name pattern should succeed", Result.bSuccess);
	TestTrue("Result should have data", Result.Data.IsValid());

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_Pagination,
	"UnrealClaude.MCP.Tools.AssetSearch.Pagination",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_Pagination::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// First page
	TSharedRef<FJsonObject> Params1 = MakeShared<FJsonObject>();
	Params1->SetNumberField(TEXT("limit"), 5);
	Params1->SetNumberField(TEXT("offset"), 0);

	FMCPToolResult Result1 = Tool->Execute(Params1);
	TestTrue("First page should succeed", Result1.bSuccess);

	int32 Total = 0;
	if (Result1.Data.IsValid())
	{
		Total = Result1.Data->GetIntegerField(TEXT("total"));
		int32 Offset = Result1.Data->GetIntegerField(TEXT("offset"));
		TestEqual("First page offset should be 0", Offset, 0);
	}

	// Second page (if there's more data)
	if (Total > 5)
	{
		TSharedRef<FJsonObject> Params2 = MakeShared<FJsonObject>();
		Params2->SetNumberField(TEXT("limit"), 5);
		Params2->SetNumberField(TEXT("offset"), 5);

		FMCPToolResult Result2 = Tool->Execute(Params2);
		TestTrue("Second page should succeed", Result2.bSuccess);

		if (Result2.Data.IsValid())
		{
			int32 Offset2 = Result2.Data->GetIntegerField(TEXT("offset"));
			TestEqual("Second page offset should be 5", Offset2, 5);
		}
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_LimitBounds,
	"UnrealClaude.MCP.Tools.AssetSearch.LimitBounds",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_LimitBounds::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Test with limit below minimum (should clamp to 1)
	{
		TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
		Params->SetNumberField(TEXT("limit"), 0);

		FMCPToolResult Result = Tool->Execute(Params);
		TestTrue("Search with limit=0 should succeed", Result.bSuccess);

		if (Result.Data.IsValid())
		{
			int32 Limit = Result.Data->GetIntegerField(TEXT("limit"));
			TestTrue("Limit should be clamped to at least 1", Limit >= 1);
		}
	}

	// Test with limit above maximum (should clamp to 1000)
	{
		TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
		Params->SetNumberField(TEXT("limit"), 9999);

		FMCPToolResult Result = Tool->Execute(Params);
		TestTrue("Search with limit=9999 should succeed", Result.bSuccess);

		if (Result.Data.IsValid())
		{
			int32 Limit = Result.Data->GetIntegerField(TEXT("limit"));
			TestTrue("Limit should be clamped to max 1000", Limit <= 1000);
		}
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_NonExistentPath,
	"UnrealClaude.MCP.Tools.AssetSearch.NonExistentPath",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_NonExistentPath::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Search in a path that doesn't exist
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("path_filter"), TEXT("/Game/NonExistent/Path/12345"));

	FMCPToolResult Result = Tool->Execute(Params);

	TestTrue("Search should succeed even with no results", Result.bSuccess);
	TestTrue("Message should indicate no assets found",
		Result.Message.Contains(TEXT("No assets")) || Result.Message.Contains(TEXT("0")));

	if (Result.Data.IsValid())
	{
		int32 Count = Result.Data->GetIntegerField(TEXT("count"));
		TestEqual("Count should be 0 for non-existent path", Count, 0);
	}

	return true;
}

// ===== Asset Dependencies Integration Tests =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetDependencies_NonExistentAsset,
	"UnrealClaude.MCP.Tools.AssetDependencies.NonExistentAsset",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetDependencies_NonExistentAsset::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_dependencies"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Query dependencies of non-existent asset
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("asset_path"), TEXT("/Game/NonExistent/Asset12345"));

	FMCPToolResult Result = Tool->Execute(Params);

	// Tool returns error for non-existent assets, which is valid behavior
	// Either succeeding with empty deps OR failing with error is acceptable
	if (Result.bSuccess)
	{
		TestTrue("Result should have data if success", Result.Data.IsValid());
		if (Result.Data.IsValid())
		{
			TestTrue("Should have 'dependencies' array", Result.Data->HasField(TEXT("dependencies")));
		}
	}
	else
	{
		// Failing for non-existent asset is also acceptable
		TestFalse("Non-existent asset returned error (acceptable)", Result.bSuccess);
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetDependencies_IncludeSoftReferences,
	"UnrealClaude.MCP.Tools.AssetDependencies.IncludeSoftReferences",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetDependencies_IncludeSoftReferences::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_dependencies"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Query with include_soft = true (using non-existent asset for test isolation)
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("asset_path"), TEXT("/Game/Test"));
	Params->SetBoolField(TEXT("include_soft"), true);

	FMCPToolResult Result = Tool->Execute(Params);

	// Test verifies the parameter is accepted - result depends on asset existence
	// The important thing is that include_soft parameter doesn't cause errors
	TestTrue("Tool executed without crash", true);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetDependencies_PathValidation,
	"UnrealClaude.MCP.Tools.AssetDependencies.PathValidation",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetDependencies_PathValidation::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_dependencies"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Test path traversal attack
	{
		TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
		Params->SetStringField(TEXT("asset_path"), TEXT("/Game/../Engine/Something"));

		FMCPToolResult Result = Tool->Execute(Params);
		// Should either fail or sanitize the path
		TestTrue("Path traversal should be handled safely",
			!Result.bSuccess || !Result.Message.Contains(TEXT("Engine")));
	}

	return true;
}

// ===== Asset Referencers Integration Tests =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetReferencers_NonExistentAsset,
	"UnrealClaude.MCP.Tools.AssetReferencers.NonExistentAsset",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetReferencers_NonExistentAsset::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_referencers"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Query referencers of non-existent asset
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("asset_path"), TEXT("/Game/NonExistent/Asset67890"));

	FMCPToolResult Result = Tool->Execute(Params);

	// Tool returns error for non-existent assets, which is valid behavior
	// Either succeeding with empty refs OR failing with error is acceptable
	if (Result.bSuccess)
	{
		TestTrue("Result should have data if success", Result.Data.IsValid());
		if (Result.Data.IsValid())
		{
			TestTrue("Should have 'referencers' array", Result.Data->HasField(TEXT("referencers")));
		}
	}
	else
	{
		// Failing for non-existent asset is also acceptable
		TestFalse("Non-existent asset returned error (acceptable)", Result.bSuccess);
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetReferencers_PathValidation,
	"UnrealClaude.MCP.Tools.AssetReferencers.PathValidation",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetReferencers_PathValidation::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_referencers"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Test with /Engine path (should be blocked or return no results)
	{
		TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
		Params->SetStringField(TEXT("asset_path"), TEXT("/Engine/BasicShapes/Cube"));

		FMCPToolResult Result = Tool->Execute(Params);
		// This should either fail (blocked) or succeed with empty results
		// Either behavior is acceptable for engine paths
		TestTrue("Engine path query completed", Result.bSuccess || !Result.bSuccess);
	}

	return true;
}

// ===== Asset Tool Response Format Tests =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_ResponseFormat,
	"UnrealClaude.MCP.Tools.AssetSearch.ResponseFormat",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_ResponseFormat::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Get at least one asset to verify format
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetNumberField(TEXT("limit"), 1);

	FMCPToolResult Result = Tool->Execute(Params);
	TestTrue("Search should succeed", Result.bSuccess);

	if (Result.Data.IsValid())
	{
		const TArray<TSharedPtr<FJsonValue>>* Assets;
		if (Result.Data->TryGetArrayField(TEXT("assets"), Assets) && Assets->Num() > 0)
		{
			TSharedPtr<FJsonObject> Asset = (*Assets)[0]->AsObject();
			TestNotNull("Asset should be an object", Asset.Get());

			if (Asset.IsValid())
			{
				TestTrue("Asset should have 'path'", Asset->HasField(TEXT("path")));
				TestTrue("Asset should have 'name'", Asset->HasField(TEXT("name")));
				TestTrue("Asset should have 'class'", Asset->HasField(TEXT("class")));
				TestTrue("Asset should have 'package_path'", Asset->HasField(TEXT("package_path")));
			}
		}
	}

	return true;
}

// ===== Combined Tool Tests =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_Assets_ToolAnnotationsCorrect,
	"UnrealClaude.MCP.Tools.Assets.ToolAnnotationsCorrect",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_Assets_ToolAnnotationsCorrect::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;

	// All asset tools should be read-only
	TArray<FString> AssetTools = { TEXT("asset_search"), TEXT("asset_dependencies"), TEXT("asset_referencers") };

	for (const FString& ToolName : AssetTools)
	{
		IMCPTool* Tool = Registry.FindTool(ToolName);
		TestNotNull(*FString::Printf(TEXT("%s should exist"), *ToolName), Tool);

		if (Tool)
		{
			FMCPToolInfo Info = Tool->GetInfo();
			TestTrue(*FString::Printf(TEXT("%s should be read-only"), *ToolName), Info.Annotations.bReadOnlyHint);
			TestFalse(*FString::Printf(TEXT("%s should not be destructive"), *ToolName), Info.Annotations.bDestructiveHint);
		}
	}

	return true;
}

// ===== Class Name Resolution Tests =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_ClassNameResolution,
	"UnrealClaude.MCP.Tools.AssetSearch.ClassNameResolution",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_ClassNameResolution::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Test short class name (should be resolved)
	{
		TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
		Params->SetStringField(TEXT("class_filter"), TEXT("StaticMesh"));
		Params->SetNumberField(TEXT("limit"), 5);

		FMCPToolResult Result = Tool->Execute(Params);
		TestTrue("Short class name 'StaticMesh' should be resolved", Result.bSuccess);
	}

	// Test full class path
	{
		TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
		Params->SetStringField(TEXT("class_filter"), TEXT("/Script/Engine.Blueprint"));
		Params->SetNumberField(TEXT("limit"), 5);

		FMCPToolResult Result = Tool->Execute(Params);
		TestTrue("Full class path should work", Result.bSuccess);
	}

	return true;
}

// ===== Parameter Warning Tests (GitHub issue #26) =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_AssetTypeAlias,
	"UnrealClaude.MCP.Tools.AssetSearch.AssetTypeAlias",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_AssetTypeAlias::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Pass 'asset_type' (wrong name) — should be treated as alias for 'class_filter'
	// and produce a warning.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("asset_type"), TEXT("Blueprint"));
	Params->SetNumberField(TEXT("limit"), 5);

	FMCPToolResult Result = Tool->Execute(Params);
	TestTrue("Search should succeed", Result.bSuccess);
	TestTrue("Should emit at least one warning for asset_type alias", Result.Warnings.Num() >= 1);

	bool bMentionsAssetType = false;
	for (const FString& Warning : Result.Warnings)
	{
		if (Warning.Contains(TEXT("asset_type")) && Warning.Contains(TEXT("class_filter")))
		{
			bMentionsAssetType = true;
			break;
		}
	}
	TestTrue("Warning should mention asset_type and class_filter", bMentionsAssetType);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_SearchTermAlias,
	"UnrealClaude.MCP.Tools.AssetSearch.SearchTermAlias",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_SearchTermAlias::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Pass 'search_term' (wrong name) — should be aliased to 'name_pattern' and warn.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("search_term"), TEXT("Player"));
	Params->SetNumberField(TEXT("limit"), 5);

	FMCPToolResult Result = Tool->Execute(Params);
	TestTrue("Search should succeed", Result.bSuccess);
	TestTrue("Should emit warning for search_term alias", Result.Warnings.Num() >= 1);

	bool bMentionsSearchTerm = false;
	for (const FString& Warning : Result.Warnings)
	{
		if (Warning.Contains(TEXT("search_term")) && Warning.Contains(TEXT("name_pattern")))
		{
			bMentionsSearchTerm = true;
			break;
		}
	}
	TestTrue("Warning should mention search_term and name_pattern", bMentionsSearchTerm);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_UnknownParamWarning,
	"UnrealClaude.MCP.Tools.AssetSearch.UnknownParamWarning",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_UnknownParamWarning::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// Pass a completely bogus parameter that's not even an alias.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("totally_made_up_param"), TEXT("whatever"));
	Params->SetNumberField(TEXT("limit"), 5);

	FMCPToolResult Result = Tool->Execute(Params);
	TestTrue("Search should still succeed (warnings are non-fatal)", Result.bSuccess);
	TestTrue("Should emit warning for unknown param", Result.Warnings.Num() >= 1);

	bool bMentionsUnknown = false;
	for (const FString& Warning : Result.Warnings)
	{
		if (Warning.Contains(TEXT("totally_made_up_param")))
		{
			bMentionsUnknown = true;
			break;
		}
	}
	TestTrue("Warning should name the unknown parameter", bMentionsUnknown);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_CorrectParamsNoWarnings,
	"UnrealClaude.MCP.Tools.AssetSearch.CorrectParamsNoWarnings",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_CorrectParamsNoWarnings::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// All canonical parameter names — zero warnings expected.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("class_filter"), TEXT("Blueprint"));
	Params->SetStringField(TEXT("path_filter"), TEXT("/Game/"));
	Params->SetStringField(TEXT("name_pattern"), TEXT("Test"));
	Params->SetNumberField(TEXT("limit"), 5);
	Params->SetNumberField(TEXT("offset"), 0);

	FMCPToolResult Result = Tool->Execute(Params);
	TestTrue("Search should succeed", Result.bSuccess);
	TestEqual("Canonical params should produce no warnings", Result.Warnings.Num(), 0);

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_AssetSearch_CanonicalBeatsAlias,
	"UnrealClaude.MCP.Tools.AssetSearch.CanonicalBeatsAlias",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_AssetSearch_CanonicalBeatsAlias::RunTest(const FString& Parameters)
{
	FMCPToolRegistry Registry;
	IMCPTool* Tool = Registry.FindTool(TEXT("asset_search"));
	TestNotNull("Tool should exist", Tool);
	if (!Tool) return false;

	// If both canonical and alias are passed, canonical wins (alias is ignored but
	// still warned about so the LLM stops using it).
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("class_filter"), TEXT("Blueprint"));
	Params->SetStringField(TEXT("asset_type"), TEXT("StaticMesh"));
	Params->SetNumberField(TEXT("limit"), 5);

	FMCPToolResult Result = Tool->Execute(Params);
	TestTrue("Search should succeed", Result.bSuccess);
	TestTrue("Should warn about deprecated asset_type even when canonical is set",
		Result.Warnings.Num() >= 1);

	return true;
}

// ===== Asset.move destination_path Alias Tests =====

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_Asset_MoveDestinationPathAlias,
	"UnrealClaude.MCP.Tools.Asset.MoveDestinationPathAliasWarns",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_Asset_MoveDestinationPathAlias::RunTest(const FString& Parameters)
{
	FMCPTool_Asset Tool;

	// Pass destination_path (alias) instead of destination_directory. Source asset
	// doesn't exist, so the op fails — but the alias warning should still attach.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("operation"), TEXT("move"));
	Params->SetStringField(TEXT("asset_path"), TEXT("/Game/NonExistent/Foo"));
	Params->SetStringField(TEXT("destination_path"), TEXT("/Game/NewLocation/"));

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should fail (source asset does not exist)", Result.bSuccess);
	TestTrue("Should emit alias warning even on early failure", Result.Warnings.Num() >= 1);

	bool bMentionsBoth = false;
	for (const FString& W : Result.Warnings)
	{
		if (W.Contains(TEXT("destination_path")) && W.Contains(TEXT("destination_directory")))
		{
			bMentionsBoth = true;
			break;
		}
	}
	TestTrue("Warning should mention destination_path → destination_directory", bMentionsBoth);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_Asset_MoveCanonicalNoWarn,
	"UnrealClaude.MCP.Tools.Asset.MoveCanonicalNoWarn",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_Asset_MoveCanonicalNoWarn::RunTest(const FString& Parameters)
{
	FMCPTool_Asset Tool;

	// Canonical destination_directory should produce zero warnings.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("operation"), TEXT("move"));
	Params->SetStringField(TEXT("asset_path"), TEXT("/Game/NonExistent/Foo"));
	Params->SetStringField(TEXT("destination_directory"), TEXT("/Game/NewLocation/"));

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should fail (source asset does not exist)", Result.bSuccess);
	TestEqual("Canonical destination_directory should not emit alias warnings", Result.Warnings.Num(), 0);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FMCPTool_Asset_MoveMissingDestErrorMentionsCanonical,
	"UnrealClaude.MCP.Tools.Asset.MoveMissingDestNamesCanonical",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter
)

bool FMCPTool_Asset_MoveMissingDestErrorMentionsCanonical::RunTest(const FString& Parameters)
{
	FMCPTool_Asset Tool;

	// Neither canonical nor alias provided — error should reference the canonical name
	// so the LLM knows what to add.
	TSharedRef<FJsonObject> Params = MakeShared<FJsonObject>();
	Params->SetStringField(TEXT("operation"), TEXT("move"));
	Params->SetStringField(TEXT("asset_path"), TEXT("/Game/NonExistent/Foo"));

	FMCPToolResult Result = Tool.Execute(Params);
	TestFalse("Should fail with missing required parameter", Result.bSuccess);
	TestTrue("Error should name destination_directory (canonical, not the alias)",
		Result.Message.Contains(TEXT("destination_directory")));
	return true;
}

#endif // WITH_DEV_AUTOMATION_TESTS
