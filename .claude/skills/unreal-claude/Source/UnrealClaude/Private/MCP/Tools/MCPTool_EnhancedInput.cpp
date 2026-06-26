// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_EnhancedInput.h"
#include "UnrealClaudeModule.h"
#include "MCP/MCPParamValidator.h"

#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputTriggers.h"
#include "InputModifiers.h"
#include "EnhancedActionKeyMapping.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "EditorAssetLibrary.h"
#include "UObject/SavePackage.h"
#include "UObject/Package.h"

FMCPToolResult FMCPTool_EnhancedInput::Execute(const TSharedRef<FJsonObject>& Params)
{
	FString Operation;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("operation"), Operation, Error))
	{
		return Error.GetValue();
	}

	if (Operation == TEXT("create_input_action"))
	{
		return ExecuteCreateInputAction(Params);
	}
	if (Operation == TEXT("create_mapping_context"))
	{
		return ExecuteCreateMappingContext(Params);
	}
	if (Operation == TEXT("add_mapping"))
	{
		return ExecuteAddMapping(Params);
	}
	if (Operation == TEXT("remove_mapping"))
	{
		return ExecuteRemoveMapping(Params);
	}
	if (Operation == TEXT("add_trigger"))
	{
		return ExecuteAddTrigger(Params);
	}
	if (Operation == TEXT("add_modifier"))
	{
		return ExecuteAddModifier(Params);
	}
	if (Operation == TEXT("query_context"))
	{
		return ExecuteQueryContext(Params);
	}
	if (Operation == TEXT("query_action"))
	{
		return ExecuteQueryAction(Params);
	}
	if (Operation == TEXT("list_actions"))
	{
		return ExecuteListActions(Params);
	}
	if (Operation == TEXT("list_contexts"))
	{
		return ExecuteListContexts(Params);
	}
	if (Operation == TEXT("get_action_info"))
	{
		return ExecuteGetActionInfo(Params);
	}

	return FMCPToolResult::Error(FString::Printf(
		TEXT("Unknown operation: %s. Valid operations: create_input_action, create_mapping_context, "
			"add_mapping, remove_mapping, add_trigger, add_modifier, query_context, query_action, "
			"list_actions, list_contexts, get_action_info"),
		*Operation));
}

// ============================================================================
// Asset Creation Operations
// ============================================================================

FMCPToolResult FMCPTool_EnhancedInput::ExecuteCreateInputAction(const TSharedRef<FJsonObject>& Params)
{
	// Accept 'name' as alias for 'action_name' — context docs and examples use the
	// shorter form; align with the same alias UX as the v0.1.0 fixes.
	TArray<FString> Warnings;
	FString Name = ExtractOptionalString(Params, TEXT("action_name"));
	FString NameAlias;
	const bool bAliasPresent = Name.IsEmpty()
		&& Params->TryGetStringField(TEXT("name"), NameAlias)
		&& !NameAlias.IsEmpty();
	if (bAliasPresent)
	{
		Name = NameAlias;
		Warnings.Add(TEXT("Parameter 'name' is not the canonical input for 'create_input_action' — use 'action_name'. Treating as alias for this call."));
	}

	auto WithWarnings = [&Warnings](FMCPToolResult R) -> FMCPToolResult
	{
		R.Warnings = Warnings;
		return R;
	};

	if (Name.IsEmpty())
	{
		return WithWarnings(FMCPToolResult::Error(TEXT("Missing required parameter: action_name")));
	}

	FString PackagePath = ExtractOptionalString(Params, TEXT("package_path"), TEXT("/Game/Input"));
	FString ValueTypeStr = ExtractOptionalString(Params, TEXT("value_type"), TEXT("Digital"));

	FString ValidationError;
	if (!FMCPParamValidator::ValidateBlueprintPath(PackagePath, ValidationError))
	{
		return WithWarnings(FMCPToolResult::Error(ValidationError));
	}

	EInputActionValueType ValueType = EInputActionValueType::Boolean;
	if (ValueTypeStr == TEXT("Digital") || ValueTypeStr == TEXT("Boolean") || ValueTypeStr == TEXT("Bool"))
	{
		ValueType = EInputActionValueType::Boolean;
	}
	else if (ValueTypeStr == TEXT("Axis1D") || ValueTypeStr == TEXT("Float"))
	{
		ValueType = EInputActionValueType::Axis1D;
	}
	else if (ValueTypeStr == TEXT("Axis2D") || ValueTypeStr == TEXT("Vector2D"))
	{
		ValueType = EInputActionValueType::Axis2D;
	}
	else if (ValueTypeStr == TEXT("Axis3D") || ValueTypeStr == TEXT("Vector"))
	{
		ValueType = EInputActionValueType::Axis3D;
	}
	else
	{
		return WithWarnings(FMCPToolResult::Error(FString::Printf(
			TEXT("Invalid value_type: '%s'. Valid types: Digital (or Boolean/Bool), Axis1D (or Float), Axis2D (or Vector2D), Axis3D (or Vector)"), *ValueTypeStr)));
	}

	FString FullPath = PackagePath / Name;
	UPackage* Package = CreatePackage(*FullPath);
	if (!Package)
	{
		return WithWarnings(FMCPToolResult::Error(FString::Printf(TEXT("Failed to create package: %s"), *FullPath)));
	}

	UInputAction* NewAction = NewObject<UInputAction>(Package, FName(*Name), RF_Public | RF_Standalone);
	if (!NewAction)
	{
		return WithWarnings(FMCPToolResult::Error(TEXT("Failed to create InputAction")));
	}

	NewAction->ValueType = ValueType;

	Package->MarkPackageDirty();
	FString SaveError;
	if (!SaveAsset(NewAction, SaveError))
	{
		return WithWarnings(FMCPToolResult::Error(SaveError));
	}

	FAssetRegistryModule::AssetCreated(NewAction);

	UE_LOG(LogUnrealClaude, Log, TEXT("Created InputAction: %s (ValueType: %s)"), *FullPath, *ValueTypeStr);

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("asset_path"), NewAction->GetPathName());
	ResultData->SetStringField(TEXT("name"), Name);
	ResultData->SetStringField(TEXT("value_type"), ValueTypeStr);

	return WithWarnings(FMCPToolResult::Success(
		FString::Printf(TEXT("Created InputAction '%s' at %s"), *Name, *FullPath),
		ResultData));
}

FMCPToolResult FMCPTool_EnhancedInput::ExecuteCreateMappingContext(const TSharedRef<FJsonObject>& Params)
{
	// Accept 'name' as alias for 'context_name' — same friction-fix shape as create_input_action.
	TArray<FString> Warnings;
	FString Name = ExtractOptionalString(Params, TEXT("context_name"));
	FString NameAlias;
	const bool bAliasPresent = Name.IsEmpty()
		&& Params->TryGetStringField(TEXT("name"), NameAlias)
		&& !NameAlias.IsEmpty();
	if (bAliasPresent)
	{
		Name = NameAlias;
		Warnings.Add(TEXT("Parameter 'name' is not the canonical input for 'create_mapping_context' — use 'context_name'. Treating as alias for this call."));
	}

	auto WithWarnings = [&Warnings](FMCPToolResult R) -> FMCPToolResult
	{
		R.Warnings = Warnings;
		return R;
	};

	if (Name.IsEmpty())
	{
		return WithWarnings(FMCPToolResult::Error(TEXT("Missing required parameter: context_name")));
	}

	FString PackagePath = ExtractOptionalString(Params, TEXT("package_path"), TEXT("/Game/Input"));

	FString ValidationError;
	if (!FMCPParamValidator::ValidateBlueprintPath(PackagePath, ValidationError))
	{
		return WithWarnings(FMCPToolResult::Error(ValidationError));
	}

	FString FullPath = PackagePath / Name;
	UPackage* Package = CreatePackage(*FullPath);
	if (!Package)
	{
		return WithWarnings(FMCPToolResult::Error(FString::Printf(TEXT("Failed to create package: %s"), *FullPath)));
	}

	UInputMappingContext* NewContext = NewObject<UInputMappingContext>(Package, FName(*Name), RF_Public | RF_Standalone);
	if (!NewContext)
	{
		return WithWarnings(FMCPToolResult::Error(TEXT("Failed to create InputMappingContext")));
	}

	Package->MarkPackageDirty();
	FString SaveError;
	if (!SaveAsset(NewContext, SaveError))
	{
		return WithWarnings(FMCPToolResult::Error(SaveError));
	}

	FAssetRegistryModule::AssetCreated(NewContext);

	UE_LOG(LogUnrealClaude, Log, TEXT("Created InputMappingContext: %s"), *FullPath);

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("asset_path"), NewContext->GetPathName());
	ResultData->SetStringField(TEXT("name"), Name);
	ResultData->SetNumberField(TEXT("mapping_count"), 0);

	return WithWarnings(FMCPToolResult::Success(
		FString::Printf(TEXT("Created InputMappingContext '%s' at %s"), *Name, *FullPath),
		ResultData));
}

// ============================================================================
// Mapping Operations
// ============================================================================

FMCPToolResult FMCPTool_EnhancedInput::ExecuteAddMapping(const TSharedRef<FJsonObject>& Params)
{
	FString ContextPath, ActionPath, KeyName;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("context_path"), ContextPath, Error))
	{
		return Error.GetValue();
	}
	if (!ExtractRequiredString(Params, TEXT("action_path"), ActionPath, Error))
	{
		return Error.GetValue();
	}
	if (!ExtractRequiredString(Params, TEXT("key"), KeyName, Error))
	{
		return Error.GetValue();
	}

	FString LoadError;
	UInputMappingContext* Context = LoadMappingContext(ContextPath, LoadError);
	if (!Context)
	{
		return FMCPToolResult::Error(LoadError);
	}

	UInputAction* Action = LoadInputAction(ActionPath, LoadError);
	if (!Action)
	{
		return FMCPToolResult::Error(LoadError);
	}

	FString KeyError;
	FKey Key = ParseKey(KeyName, KeyError);
	if (!Key.IsValid())
	{
		return FMCPToolResult::Error(KeyError);
	}

	FEnhancedActionKeyMapping& NewMapping = Context->MapKey(Action, Key);

	Context->MarkPackageDirty();
	FString SaveError;
	if (!SaveAsset(Context, SaveError))
	{
		return FMCPToolResult::Error(SaveError);
	}

	UE_LOG(LogUnrealClaude, Log, TEXT("Added mapping: %s -> %s in %s"),
		*KeyName, *Action->GetName(), *Context->GetName());

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("context_path"), Context->GetPathName());
	ResultData->SetStringField(TEXT("action_path"), Action->GetPathName());
	ResultData->SetStringField(TEXT("key"), KeyName);
	ResultData->SetNumberField(TEXT("mapping_index"), Context->GetMappings().Num() - 1);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Added mapping: %s -> %s"), *KeyName, *Action->GetName()),
		ResultData);
}

FMCPToolResult FMCPTool_EnhancedInput::ExecuteRemoveMapping(const TSharedRef<FJsonObject>& Params)
{
	FString ContextPath;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("context_path"), ContextPath, Error))
	{
		return Error.GetValue();
	}

	int32 MappingIndex = ExtractOptionalNumber<int32>(Params, TEXT("mapping_index"), -1);
	if (MappingIndex < 0)
	{
		return FMCPToolResult::Error(TEXT("Missing or invalid mapping_index parameter"));
	}

	FString LoadError;
	UInputMappingContext* Context = LoadMappingContext(ContextPath, LoadError);
	if (!Context)
	{
		return FMCPToolResult::Error(LoadError);
	}

	TArray<FEnhancedActionKeyMapping>& Mappings = const_cast<TArray<FEnhancedActionKeyMapping>&>(Context->GetMappings());
	if (MappingIndex >= Mappings.Num())
	{
		return FMCPToolResult::Error(FString::Printf(
			TEXT("Invalid mapping_index %d. Context has %d mappings (0-%d)"),
			MappingIndex, Mappings.Num(), Mappings.Num() - 1));
	}

	// Capture pre-removal info for the result payload (UnmapKey invalidates the entry)
	FString RemovedKey = Mappings[MappingIndex].Key.GetFName().ToString();
	FString RemovedAction = Mappings[MappingIndex].Action ? Mappings[MappingIndex].Action->GetName() : TEXT("None");

	Context->UnmapKey(Mappings[MappingIndex].Action, Mappings[MappingIndex].Key);

	Context->MarkPackageDirty();
	FString SaveError;
	if (!SaveAsset(Context, SaveError))
	{
		return FMCPToolResult::Error(SaveError);
	}

	UE_LOG(LogUnrealClaude, Log, TEXT("Removed mapping at index %d: %s -> %s"),
		MappingIndex, *RemovedKey, *RemovedAction);

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("context_path"), Context->GetPathName());
	ResultData->SetNumberField(TEXT("removed_index"), MappingIndex);
	ResultData->SetStringField(TEXT("removed_key"), RemovedKey);
	ResultData->SetStringField(TEXT("removed_action"), RemovedAction);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Removed mapping at index %d: %s -> %s"), MappingIndex, *RemovedKey, *RemovedAction),
		ResultData);
}

FMCPToolResult FMCPTool_EnhancedInput::ExecuteAddTrigger(const TSharedRef<FJsonObject>& Params)
{
	FString ContextPath, ActionPath, TriggerType;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("context_path"), ContextPath, Error))
	{
		return Error.GetValue();
	}
	if (!ExtractRequiredString(Params, TEXT("action_path"), ActionPath, Error))
	{
		return Error.GetValue();
	}
	if (!ExtractRequiredString(Params, TEXT("trigger_type"), TriggerType, Error))
	{
		return Error.GetValue();
	}

	FString LoadError;
	UInputMappingContext* Context = LoadMappingContext(ContextPath, LoadError);
	if (!Context)
	{
		return FMCPToolResult::Error(LoadError);
	}

	UInputAction* Action = LoadInputAction(ActionPath, LoadError);
	if (!Action)
	{
		return FMCPToolResult::Error(LoadError);
	}

	FString MappingError;
	int32 MappingIndex = FindMappingIndex(Context, Action, Params, MappingError);
	if (MappingIndex < 0)
	{
		return FMCPToolResult::Error(MappingError);
	}

	TArray<FEnhancedActionKeyMapping>& Mappings = const_cast<TArray<FEnhancedActionKeyMapping>&>(Context->GetMappings());

	FString TriggerError;
	UInputTrigger* Trigger = CreateTrigger(TriggerType, Params, TriggerError);
	if (!Trigger)
	{
		return FMCPToolResult::Error(TriggerError);
	}

	Mappings[MappingIndex].Triggers.Add(Trigger);

	Context->MarkPackageDirty();
	FString SaveError;
	if (!SaveAsset(Context, SaveError))
	{
		return FMCPToolResult::Error(SaveError);
	}

	UE_LOG(LogUnrealClaude, Log, TEXT("Added %s trigger to %s in %s"),
		*TriggerType, *Action->GetName(), *Context->GetName());

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("context_path"), Context->GetPathName());
	ResultData->SetStringField(TEXT("action_path"), Action->GetPathName());
	ResultData->SetStringField(TEXT("trigger_type"), TriggerType);
	ResultData->SetNumberField(TEXT("trigger_count"), Mappings[MappingIndex].Triggers.Num());

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Added %s trigger to %s"), *TriggerType, *Action->GetName()),
		ResultData);
}

FMCPToolResult FMCPTool_EnhancedInput::ExecuteAddModifier(const TSharedRef<FJsonObject>& Params)
{
	FString ContextPath, ActionPath, ModifierType;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("context_path"), ContextPath, Error))
	{
		return Error.GetValue();
	}
	if (!ExtractRequiredString(Params, TEXT("action_path"), ActionPath, Error))
	{
		return Error.GetValue();
	}
	if (!ExtractRequiredString(Params, TEXT("modifier_type"), ModifierType, Error))
	{
		return Error.GetValue();
	}

	FString LoadError;
	UInputMappingContext* Context = LoadMappingContext(ContextPath, LoadError);
	if (!Context)
	{
		return FMCPToolResult::Error(LoadError);
	}

	UInputAction* Action = LoadInputAction(ActionPath, LoadError);
	if (!Action)
	{
		return FMCPToolResult::Error(LoadError);
	}

	FString MappingError;
	int32 MappingIndex = FindMappingIndex(Context, Action, Params, MappingError);
	if (MappingIndex < 0)
	{
		return FMCPToolResult::Error(MappingError);
	}

	TArray<FEnhancedActionKeyMapping>& Mappings = const_cast<TArray<FEnhancedActionKeyMapping>&>(Context->GetMappings());

	FString ModifierError;
	UInputModifier* Modifier = CreateModifier(ModifierType, Params, ModifierError);
	if (!Modifier)
	{
		return FMCPToolResult::Error(ModifierError);
	}

	Mappings[MappingIndex].Modifiers.Add(Modifier);

	Context->MarkPackageDirty();
	FString SaveError;
	if (!SaveAsset(Context, SaveError))
	{
		return FMCPToolResult::Error(SaveError);
	}

	UE_LOG(LogUnrealClaude, Log, TEXT("Added %s modifier to %s in %s"),
		*ModifierType, *Action->GetName(), *Context->GetName());

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("context_path"), Context->GetPathName());
	ResultData->SetStringField(TEXT("action_path"), Action->GetPathName());
	ResultData->SetStringField(TEXT("modifier_type"), ModifierType);
	ResultData->SetNumberField(TEXT("modifier_count"), Mappings[MappingIndex].Modifiers.Num());

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Added %s modifier to %s"), *ModifierType, *Action->GetName()),
		ResultData);
}

// ============================================================================
// Query Operations
// ============================================================================

namespace
{
	// Shared enumeration helper — searches AssetRegistry for assets of TargetClass under PackagePath,
	// optionally filtering by case-insensitive name substring. Returns up to Limit results.
	TArray<FAssetData> EnumerateInputAssets(
		UClass* TargetClass,
		const FString& PackagePath,
		const FString& NamePattern,
		int32 Limit,
		int32& OutTotalFound)
	{
		IAssetRegistry& AssetRegistry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry")).Get();

		TArray<FAssetData> AllAssets;
		AssetRegistry.GetAssetsByClass(TargetClass->GetClassPathName(), AllAssets, /*bSearchSubClasses*/ true);

		const FString PathPrefix = PackagePath.IsEmpty() ? TEXT("/Game/") : PackagePath;
		const bool bHasPattern = !NamePattern.IsEmpty();

		TArray<FAssetData> Filtered;
		Filtered.Reserve(AllAssets.Num());

		for (const FAssetData& AssetData : AllAssets)
		{
			const FString PackageName = AssetData.PackageName.ToString();
			if (!PackageName.StartsWith(PathPrefix))
			{
				continue;
			}
			if (bHasPattern)
			{
				const FString AssetName = AssetData.AssetName.ToString();
				if (!AssetName.Contains(NamePattern, ESearchCase::IgnoreCase))
				{
					continue;
				}
			}
			Filtered.Add(AssetData);
		}

		OutTotalFound = Filtered.Num();
		if (Filtered.Num() > Limit)
		{
			Filtered.SetNum(Limit);
		}
		return Filtered;
	}

	// Resolve a friendly asset name (e.g. "IA_Jump") to its full object path by
	// searching the asset registry. Prefers exact name match; falls back to substring.
	// Used by query_action/query_context to accept a name alias for the canonical *_path param.
	bool ResolveAssetPathByName(
		UClass* TargetClass,
		const FString& Name,
		const FString& PackagePath,
		FString& OutPath,
		FString& OutError)
	{
		int32 TotalFound = 0;
		const TArray<FAssetData> Candidates = EnumerateInputAssets(
			TargetClass, PackagePath, Name, /*Limit*/ 100, TotalFound);

		TArray<FAssetData> Matches;
		for (const FAssetData& AssetData : Candidates)
		{
			if (AssetData.AssetName.ToString().Equals(Name, ESearchCase::IgnoreCase))
			{
				Matches.Add(AssetData);
			}
		}
		const TArray<FAssetData>& Effective = Matches.Num() > 0 ? Matches : Candidates;

		if (Effective.Num() == 0)
		{
			OutError = FString::Printf(
				TEXT("No %s asset found with name matching '%s' under '%s'"),
				*TargetClass->GetName(), *Name, *PackagePath);
			return false;
		}
		if (Effective.Num() > 1)
		{
			TArray<FString> Paths;
			for (const FAssetData& AssetData : Effective)
			{
				Paths.Add(AssetData.GetObjectPathString());
			}
			OutError = FString::Printf(
				TEXT("Ambiguous: %d %s assets matched '%s'. Pass the full path with one of: %s"),
				Effective.Num(), *TargetClass->GetName(), *Name, *FString::Join(Paths, TEXT(", ")));
			return false;
		}

		OutPath = Effective[0].GetObjectPathString();
		return true;
	}
}

FMCPToolResult FMCPTool_EnhancedInput::ExecuteQueryContext(const TSharedRef<FJsonObject>& Params)
{
	// Accept context_name as alias — same friction-fix shape as the v0.1.0 trio.
	// Mirrors get_action_info's name resolution so the friendly name "just works".
	TArray<FString> Warnings;
	FString ContextPath = ExtractOptionalString(Params, TEXT("context_path"));
	FString ContextName;
	const bool bAliasPresent = ContextPath.IsEmpty()
		&& Params->TryGetStringField(TEXT("context_name"), ContextName)
		&& !ContextName.IsEmpty();
	if (bAliasPresent)
	{
		const FString PackagePath = ExtractOptionalString(Params, TEXT("package_path"), TEXT("/Game/"));
		FString ResolveError;
		if (!ResolveAssetPathByName(UInputMappingContext::StaticClass(), ContextName, PackagePath, ContextPath, ResolveError))
		{
			FMCPToolResult R = FMCPToolResult::Error(ResolveError);
			R.Warnings.Add(TEXT("Parameter 'context_name' is not the canonical input for 'query_context' — use 'context_path'."));
			return R;
		}
		Warnings.Add(FString::Printf(
			TEXT("Parameter 'context_name' is not the canonical input for 'query_context' — use 'context_path'. Resolved '%s' to '%s'."),
			*ContextName, *ContextPath));
	}

	auto WithWarnings = [&Warnings](FMCPToolResult R) -> FMCPToolResult
	{
		R.Warnings = Warnings;
		return R;
	};

	if (ContextPath.IsEmpty())
	{
		return WithWarnings(FMCPToolResult::Error(TEXT("Missing required parameter: context_path")));
	}

	FString LoadError;
	UInputMappingContext* Context = LoadMappingContext(ContextPath, LoadError);
	if (!Context)
	{
		return WithWarnings(FMCPToolResult::Error(LoadError));
	}

	TSharedPtr<FJsonObject> ResultData = MappingContextToJson(Context);

	return WithWarnings(FMCPToolResult::Success(
		FString::Printf(TEXT("Queried context '%s' with %d mappings"),
			*Context->GetName(), Context->GetMappings().Num()),
		ResultData));
}

FMCPToolResult FMCPTool_EnhancedInput::ExecuteQueryAction(const TSharedRef<FJsonObject>& Params)
{
	// Accept action_name as alias — get_action_info already does the same resolution.
	TArray<FString> Warnings;
	FString ActionPath = ExtractOptionalString(Params, TEXT("action_path"));
	FString ActionName;
	const bool bAliasPresent = ActionPath.IsEmpty()
		&& Params->TryGetStringField(TEXT("action_name"), ActionName)
		&& !ActionName.IsEmpty();
	if (bAliasPresent)
	{
		const FString PackagePath = ExtractOptionalString(Params, TEXT("package_path"), TEXT("/Game/"));
		FString ResolveError;
		if (!ResolveAssetPathByName(UInputAction::StaticClass(), ActionName, PackagePath, ActionPath, ResolveError))
		{
			FMCPToolResult R = FMCPToolResult::Error(ResolveError);
			R.Warnings.Add(TEXT("Parameter 'action_name' is not the canonical input for 'query_action' — use 'action_path' (or call 'get_action_info' which is the friendly-name variant)."));
			return R;
		}
		Warnings.Add(FString::Printf(
			TEXT("Parameter 'action_name' is not the canonical input for 'query_action' — use 'action_path' (or 'get_action_info'). Resolved '%s' to '%s'."),
			*ActionName, *ActionPath));
	}

	auto WithWarnings = [&Warnings](FMCPToolResult R) -> FMCPToolResult
	{
		R.Warnings = Warnings;
		return R;
	};

	if (ActionPath.IsEmpty())
	{
		return WithWarnings(FMCPToolResult::Error(TEXT("Missing required parameter: action_path")));
	}

	FString LoadError;
	UInputAction* Action = LoadInputAction(ActionPath, LoadError);
	if (!Action)
	{
		return WithWarnings(FMCPToolResult::Error(LoadError));
	}

	TSharedPtr<FJsonObject> ResultData = InputActionToJson(Action);

	return WithWarnings(FMCPToolResult::Success(
		FString::Printf(TEXT("Queried action '%s'"), *Action->GetName()),
		ResultData));
}

FMCPToolResult FMCPTool_EnhancedInput::ExecuteListActions(const TSharedRef<FJsonObject>& Params)
{
	const FString PackagePath = ExtractOptionalString(Params, TEXT("package_path"), TEXT("/Game/"));
	const FString NamePattern = ExtractOptionalString(Params, TEXT("name_pattern"));
	const int32 Limit = FMath::Clamp(ExtractOptionalNumber<int32>(Params, TEXT("limit"), 50), 1, 1000);

	int32 TotalFound = 0;
	const TArray<FAssetData> Results = EnumerateInputAssets(
		UInputAction::StaticClass(), PackagePath, NamePattern, Limit, TotalFound);

	TArray<TSharedPtr<FJsonValue>> ActionsArray;
	for (const FAssetData& AssetData : Results)
	{
		TSharedPtr<FJsonObject> ActionObj = MakeShared<FJsonObject>();
		ActionObj->SetStringField(TEXT("name"), AssetData.AssetName.ToString());
		ActionObj->SetStringField(TEXT("path"), AssetData.GetObjectPathString());
		ActionObj->SetStringField(TEXT("package"), AssetData.PackageName.ToString());
		ActionsArray.Add(MakeShared<FJsonValueObject>(ActionObj));
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("package_path"), PackagePath);
	ResultData->SetNumberField(TEXT("count"), Results.Num());
	ResultData->SetNumberField(TEXT("total_found"), TotalFound);
	ResultData->SetArrayField(TEXT("actions"), ActionsArray);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d InputAction asset(s) under '%s'"), Results.Num(), *PackagePath),
		ResultData);
}

FMCPToolResult FMCPTool_EnhancedInput::ExecuteListContexts(const TSharedRef<FJsonObject>& Params)
{
	const FString PackagePath = ExtractOptionalString(Params, TEXT("package_path"), TEXT("/Game/"));
	const FString NamePattern = ExtractOptionalString(Params, TEXT("name_pattern"));
	const int32 Limit = FMath::Clamp(ExtractOptionalNumber<int32>(Params, TEXT("limit"), 50), 1, 1000);

	int32 TotalFound = 0;
	const TArray<FAssetData> Results = EnumerateInputAssets(
		UInputMappingContext::StaticClass(), PackagePath, NamePattern, Limit, TotalFound);

	TArray<TSharedPtr<FJsonValue>> ContextsArray;
	for (const FAssetData& AssetData : Results)
	{
		TSharedPtr<FJsonObject> CtxObj = MakeShared<FJsonObject>();
		CtxObj->SetStringField(TEXT("name"), AssetData.AssetName.ToString());
		CtxObj->SetStringField(TEXT("path"), AssetData.GetObjectPathString());
		CtxObj->SetStringField(TEXT("package"), AssetData.PackageName.ToString());

		// Mapping count requires loading the asset; cheap enough for InputMappingContexts (small)
		if (UInputMappingContext* Ctx = Cast<UInputMappingContext>(AssetData.GetAsset()))
		{
			CtxObj->SetNumberField(TEXT("mapping_count"), Ctx->GetMappings().Num());
		}

		ContextsArray.Add(MakeShared<FJsonValueObject>(CtxObj));
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("package_path"), PackagePath);
	ResultData->SetNumberField(TEXT("count"), Results.Num());
	ResultData->SetNumberField(TEXT("total_found"), TotalFound);
	ResultData->SetArrayField(TEXT("contexts"), ContextsArray);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d InputMappingContext asset(s) under '%s'"), Results.Num(), *PackagePath),
		ResultData);
}

FMCPToolResult FMCPTool_EnhancedInput::ExecuteGetActionInfo(const TSharedRef<FJsonObject>& Params)
{
	FString ActionName;
	TOptional<FMCPToolResult> Error;

	if (!ExtractRequiredString(Params, TEXT("action_name"), ActionName, Error))
	{
		return Error.GetValue();
	}

	const FString PackagePath = ExtractOptionalString(Params, TEXT("package_path"), TEXT("/Game/"));

	int32 TotalFound = 0;
	// Use the action name as both the substring filter and the exact-match check below
	const TArray<FAssetData> Candidates = EnumerateInputAssets(
		UInputAction::StaticClass(), PackagePath, ActionName, /*Limit*/ 1000, TotalFound);

	// Prefer exact name match — falls back to substring matches when no exact hit
	TArray<FAssetData> ExactMatches;
	for (const FAssetData& AssetData : Candidates)
	{
		if (AssetData.AssetName.ToString().Equals(ActionName, ESearchCase::IgnoreCase))
		{
			ExactMatches.Add(AssetData);
		}
	}

	const TArray<FAssetData>& Effective = ExactMatches.Num() > 0 ? ExactMatches : Candidates;

	if (Effective.Num() == 0)
	{
		return FMCPToolResult::Error(FString::Printf(
			TEXT("No InputAction found with name matching '%s' under '%s'"), *ActionName, *PackagePath));
	}
	if (Effective.Num() > 1)
	{
		TArray<FString> PathStrings;
		for (const FAssetData& AssetData : Effective)
		{
			PathStrings.Add(AssetData.GetObjectPathString());
		}
		return FMCPToolResult::Error(FString::Printf(
			TEXT("Ambiguous: %d InputAction assets matched '%s'. Use action_path with one of: %s"),
			Effective.Num(), *ActionName, *FString::Join(PathStrings, TEXT(", "))));
	}

	UInputAction* Action = Cast<UInputAction>(Effective[0].GetAsset());
	if (!Action)
	{
		return FMCPToolResult::Error(FString::Printf(
			TEXT("Failed to load InputAction asset: %s"), *Effective[0].GetObjectPathString()));
	}

	TSharedPtr<FJsonObject> ResultData = InputActionToJson(Action);
	return FMCPToolResult::Success(
		FString::Printf(TEXT("Resolved InputAction '%s'"), *Action->GetName()),
		ResultData);
}

// ============================================================================
// Helper Methods
// ============================================================================

UInputAction* FMCPTool_EnhancedInput::LoadInputAction(const FString& Path, FString& OutError)
{
	if (!FMCPParamValidator::ValidateBlueprintPath(Path, OutError))
	{
		return nullptr;
	}

	// LoadObject needs ".AssetName" suffix; append it when caller passed bare package path
	FString AdjustedPath = Path;
	if (!AdjustedPath.EndsWith(TEXT(".")) && !AdjustedPath.Contains(TEXT(".")))
	{
		AdjustedPath += TEXT(".") + FPaths::GetBaseFilename(Path);
	}

	UInputAction* Action = LoadObject<UInputAction>(nullptr, *AdjustedPath);
	if (!Action)
	{
		Action = LoadObject<UInputAction>(nullptr, *Path);
	}

	if (!Action)
	{
		OutError = FString::Printf(TEXT("Failed to load InputAction: %s"), *Path);
		return nullptr;
	}

	return Action;
}

UInputMappingContext* FMCPTool_EnhancedInput::LoadMappingContext(const FString& Path, FString& OutError)
{
	if (!FMCPParamValidator::ValidateBlueprintPath(Path, OutError))
	{
		return nullptr;
	}

	// LoadObject needs ".AssetName" suffix; append it when caller passed bare package path
	FString AdjustedPath = Path;
	if (!AdjustedPath.EndsWith(TEXT(".")) && !AdjustedPath.Contains(TEXT(".")))
	{
		AdjustedPath += TEXT(".") + FPaths::GetBaseFilename(Path);
	}

	UInputMappingContext* Context = LoadObject<UInputMappingContext>(nullptr, *AdjustedPath);
	if (!Context)
	{
		Context = LoadObject<UInputMappingContext>(nullptr, *Path);
	}

	if (!Context)
	{
		OutError = FString::Printf(TEXT("Failed to load InputMappingContext: %s"), *Path);
		return nullptr;
	}

	return Context;
}

bool FMCPTool_EnhancedInput::SaveAsset(UObject* Asset, FString& OutError)
{
	if (!Asset)
	{
		OutError = TEXT("Cannot save null asset");
		return false;
	}

	UPackage* Package = Asset->GetOutermost();
	if (!Package)
	{
		OutError = TEXT("Asset has no package");
		return false;
	}

	FString PackagePath = Package->GetPathName();
	if (!UEditorAssetLibrary::SaveAsset(PackagePath, false))
	{
		OutError = FString::Printf(TEXT("Failed to save asset: %s"), *PackagePath);
		return false;
	}

	return true;
}

FKey FMCPTool_EnhancedInput::ParseKey(const FString& KeyName, FString& OutError)
{
	FKey ParsedKey = FKey(*KeyName);

	if (!ParsedKey.IsValid())
	{
		OutError = FString::Printf(
			TEXT("Invalid key name: %s. Use standard UE key names like 'SpaceBar', 'W', 'LeftMouseButton', 'Gamepad_FaceButton_Bottom'"),
			*KeyName);
		return FKey();
	}

	return ParsedKey;
}

int32 FMCPTool_EnhancedInput::FindMappingIndex(
	UInputMappingContext* Context,
	UInputAction* Action,
	const TSharedRef<FJsonObject>& Params,
	FString& OutError)
{
	if (!Context || !Action)
	{
		OutError = TEXT("Invalid context or action");
		return -1;
	}

	const TArray<FEnhancedActionKeyMapping>& Mappings = Context->GetMappings();
	int32 MappingIndex = ExtractOptionalNumber<int32>(Params, TEXT("mapping_index"), -1);

	if (MappingIndex >= 0)
	{
		if (MappingIndex >= Mappings.Num())
		{
			OutError = FString::Printf(
				TEXT("Invalid mapping_index %d. Context has %d mappings."),
				MappingIndex, Mappings.Num());
			return -1;
		}
		// Caller passed both index AND action — guard against accidental mismatch
		if (Mappings[MappingIndex].Action != Action)
		{
			OutError = FString::Printf(
				TEXT("Mapping at index %d is for action '%s', not '%s'"),
				MappingIndex,
				Mappings[MappingIndex].Action ? *Mappings[MappingIndex].Action->GetName() : TEXT("None"),
				*Action->GetName());
			return -1;
		}
		return MappingIndex;
	}

	for (int32 i = 0; i < Mappings.Num(); ++i)
	{
		if (Mappings[i].Action == Action)
		{
			return i;
		}
	}

	OutError = FString::Printf(
		TEXT("No mapping found for action '%s' in context '%s'. Use query_context to see available mappings."),
		*Action->GetName(), *Context->GetName());
	return -1;
}

UInputTrigger* FMCPTool_EnhancedInput::CreateTrigger(const FString& TriggerType, const TSharedRef<FJsonObject>& Params, FString& OutError)
{
	UInputTrigger* Trigger = nullptr;

	if (TriggerType == TEXT("Pressed"))
	{
		Trigger = NewObject<UInputTriggerPressed>();
	}
	else if (TriggerType == TEXT("Released"))
	{
		Trigger = NewObject<UInputTriggerReleased>();
	}
	else if (TriggerType == TEXT("Down"))
	{
		Trigger = NewObject<UInputTriggerDown>();
	}
	else if (TriggerType == TEXT("Hold"))
	{
		UInputTriggerHold* HoldTrigger = NewObject<UInputTriggerHold>();
		HoldTrigger->HoldTimeThreshold = ExtractOptionalNumber<float>(Params, TEXT("hold_time"), 0.5f);
		if (HoldTrigger->HoldTimeThreshold <= 0.0f || HoldTrigger->HoldTimeThreshold > 60.0f)
		{
			OutError = TEXT("hold_time must be between 0 and 60 seconds");
			return nullptr;
		}
		Trigger = HoldTrigger;
	}
	else if (TriggerType == TEXT("HoldAndRelease"))
	{
		UInputTriggerHoldAndRelease* HoldReleaseTrigger = NewObject<UInputTriggerHoldAndRelease>();
		HoldReleaseTrigger->HoldTimeThreshold = ExtractOptionalNumber<float>(Params, TEXT("hold_time"), 0.5f);
		if (HoldReleaseTrigger->HoldTimeThreshold <= 0.0f || HoldReleaseTrigger->HoldTimeThreshold > 60.0f)
		{
			OutError = TEXT("hold_time must be between 0 and 60 seconds");
			return nullptr;
		}
		Trigger = HoldReleaseTrigger;
	}
	else if (TriggerType == TEXT("Tap"))
	{
		UInputTriggerTap* TapTrigger = NewObject<UInputTriggerTap>();
		TapTrigger->TapReleaseTimeThreshold = ExtractOptionalNumber<float>(Params, TEXT("tap_release_time"), 0.2f);
		if (TapTrigger->TapReleaseTimeThreshold <= 0.0f || TapTrigger->TapReleaseTimeThreshold > 5.0f)
		{
			OutError = TEXT("tap_release_time must be between 0 and 5 seconds");
			return nullptr;
		}
		Trigger = TapTrigger;
	}
	else if (TriggerType == TEXT("Pulse"))
	{
		UInputTriggerPulse* PulseTrigger = NewObject<UInputTriggerPulse>();
		PulseTrigger->Interval = ExtractOptionalNumber<float>(Params, TEXT("pulse_interval"), 0.1f);
		if (PulseTrigger->Interval <= 0.01f || PulseTrigger->Interval > 10.0f)
		{
			OutError = TEXT("pulse_interval must be between 0.01 and 10 seconds");
			return nullptr;
		}
		Trigger = PulseTrigger;
	}
	else if (TriggerType == TEXT("ChordAction"))
	{
		FString ChordActionPath = ExtractOptionalString(Params, TEXT("chord_action_path"), TEXT(""));
		if (ChordActionPath.IsEmpty())
		{
			OutError = TEXT("ChordAction trigger requires 'chord_action_path' parameter");
			return nullptr;
		}

		FString LoadError;
		UInputAction* ChordAction = LoadInputAction(ChordActionPath, LoadError);
		if (!ChordAction)
		{
			OutError = LoadError;
			return nullptr;
		}

		UInputTriggerChordAction* ChordTrigger = NewObject<UInputTriggerChordAction>();
		ChordTrigger->ChordAction = ChordAction;
		Trigger = ChordTrigger;
	}
	else
	{
		OutError = FString::Printf(
			TEXT("Invalid trigger_type: %s. Valid types: Pressed, Released, Down, Hold, HoldAndRelease, Tap, Pulse, ChordAction"),
			*TriggerType);
		return nullptr;
	}

	return Trigger;
}

UInputModifier* FMCPTool_EnhancedInput::CreateModifier(const FString& ModifierType, const TSharedRef<FJsonObject>& Params, FString& OutError)
{
	UInputModifier* Modifier = nullptr;

	if (ModifierType == TEXT("Negate"))
	{
		Modifier = NewObject<UInputModifierNegate>();
	}
	else if (ModifierType == TEXT("Swizzle"))
	{
		UInputModifierSwizzleAxis* SwizzleModifier = NewObject<UInputModifierSwizzleAxis>();
		FString SwizzleOrder = ExtractOptionalString(Params, TEXT("swizzle_order"), TEXT("YXZ"));

		if (SwizzleOrder == TEXT("YXZ"))
		{
			SwizzleModifier->Order = EInputAxisSwizzle::YXZ;
		}
		else if (SwizzleOrder == TEXT("ZYX"))
		{
			SwizzleModifier->Order = EInputAxisSwizzle::ZYX;
		}
		else if (SwizzleOrder == TEXT("XZY"))
		{
			SwizzleModifier->Order = EInputAxisSwizzle::XZY;
		}
		else if (SwizzleOrder == TEXT("YZX"))
		{
			SwizzleModifier->Order = EInputAxisSwizzle::YZX;
		}
		else if (SwizzleOrder == TEXT("ZXY"))
		{
			SwizzleModifier->Order = EInputAxisSwizzle::ZXY;
		}
		else
		{
			OutError = FString::Printf(
				TEXT("Invalid swizzle_order: %s. Valid orders: YXZ, ZYX, XZY, YZX, ZXY"),
				*SwizzleOrder);
			return nullptr;
		}

		Modifier = SwizzleModifier;
	}
	else if (ModifierType == TEXT("Scalar"))
	{
		UInputModifierScalar* ScalarModifier = NewObject<UInputModifierScalar>();
		ScalarModifier->Scalar = ExtractVectorParam(Params, TEXT("scalar"), FVector(1.0f, 1.0f, 1.0f));
		Modifier = ScalarModifier;
	}
	else if (ModifierType == TEXT("DeadZone"))
	{
		UInputModifierDeadZone* DeadZoneModifier = NewObject<UInputModifierDeadZone>();
		DeadZoneModifier->LowerThreshold = ExtractOptionalNumber<float>(Params, TEXT("dead_zone_lower"), 0.2f);
		DeadZoneModifier->UpperThreshold = ExtractOptionalNumber<float>(Params, TEXT("dead_zone_upper"), 1.0f);

		if (DeadZoneModifier->LowerThreshold < 0.0f || DeadZoneModifier->LowerThreshold > 1.0f)
		{
			OutError = TEXT("dead_zone_lower must be between 0.0 and 1.0");
			return nullptr;
		}
		if (DeadZoneModifier->UpperThreshold < 0.0f || DeadZoneModifier->UpperThreshold > 1.0f)
		{
			OutError = TEXT("dead_zone_upper must be between 0.0 and 1.0");
			return nullptr;
		}
		if (DeadZoneModifier->LowerThreshold >= DeadZoneModifier->UpperThreshold)
		{
			OutError = TEXT("dead_zone_lower must be less than dead_zone_upper");
			return nullptr;
		}

		FString DeadZoneType = ExtractOptionalString(Params, TEXT("dead_zone_type"), TEXT("Axial"));
		if (DeadZoneType == TEXT("Radial"))
		{
			DeadZoneModifier->Type = EDeadZoneType::Radial;
		}
		else
		{
			DeadZoneModifier->Type = EDeadZoneType::Axial;
		}

		Modifier = DeadZoneModifier;
	}
	else
	{
		OutError = FString::Printf(
			TEXT("Invalid modifier_type: %s. Valid types: Negate, Swizzle, Scalar, DeadZone"),
			*ModifierType);
		return nullptr;
	}

	return Modifier;
}

// ============================================================================
// JSON Conversion Helpers
// ============================================================================

TSharedPtr<FJsonObject> FMCPTool_EnhancedInput::InputActionToJson(UInputAction* Action)
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();

	if (!Action)
	{
		return Json;
	}

	Json->SetStringField(TEXT("name"), Action->GetName());
	Json->SetStringField(TEXT("path"), Action->GetPathName());

	FString ValueTypeStr;
	switch (Action->ValueType)
	{
	case EInputActionValueType::Boolean:
		ValueTypeStr = TEXT("Digital");
		break;
	case EInputActionValueType::Axis1D:
		ValueTypeStr = TEXT("Axis1D");
		break;
	case EInputActionValueType::Axis2D:
		ValueTypeStr = TEXT("Axis2D");
		break;
	case EInputActionValueType::Axis3D:
		ValueTypeStr = TEXT("Axis3D");
		break;
	default:
		ValueTypeStr = TEXT("Unknown");
		break;
	}
	Json->SetStringField(TEXT("value_type"), ValueTypeStr);

	TArray<TSharedPtr<FJsonValue>> TriggersArray;
	for (UInputTrigger* Trigger : Action->Triggers)
	{
		if (Trigger)
		{
			TSharedPtr<FJsonObject> TriggerJson = MakeShared<FJsonObject>();
			TriggerJson->SetStringField(TEXT("type"), Trigger->GetClass()->GetName());
			TriggersArray.Add(MakeShared<FJsonValueObject>(TriggerJson));
		}
	}
	Json->SetArrayField(TEXT("triggers"), TriggersArray);

	TArray<TSharedPtr<FJsonValue>> ModifiersArray;
	for (UInputModifier* Modifier : Action->Modifiers)
	{
		if (Modifier)
		{
			TSharedPtr<FJsonObject> ModifierJson = MakeShared<FJsonObject>();
			ModifierJson->SetStringField(TEXT("type"), Modifier->GetClass()->GetName());
			ModifiersArray.Add(MakeShared<FJsonValueObject>(ModifierJson));
		}
	}
	Json->SetArrayField(TEXT("modifiers"), ModifiersArray);

	return Json;
}

TSharedPtr<FJsonObject> FMCPTool_EnhancedInput::MappingContextToJson(UInputMappingContext* Context)
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();

	if (!Context)
	{
		return Json;
	}

	Json->SetStringField(TEXT("name"), Context->GetName());
	Json->SetStringField(TEXT("path"), Context->GetPathName());

	TArray<TSharedPtr<FJsonValue>> MappingsArray;
	const TArray<FEnhancedActionKeyMapping>& Mappings = Context->GetMappings();
	for (int32 i = 0; i < Mappings.Num(); ++i)
	{
		MappingsArray.Add(MakeShared<FJsonValueObject>(MappingToJson(Mappings[i], i)));
	}
	Json->SetArrayField(TEXT("mappings"), MappingsArray);
	Json->SetNumberField(TEXT("mapping_count"), Mappings.Num());

	return Json;
}

TSharedPtr<FJsonObject> FMCPTool_EnhancedInput::MappingToJson(const FEnhancedActionKeyMapping& Mapping, int32 Index)
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();

	Json->SetNumberField(TEXT("index"), Index);
	Json->SetStringField(TEXT("key"), Mapping.Key.GetFName().ToString());

	if (Mapping.Action)
	{
		Json->SetStringField(TEXT("action"), Mapping.Action->GetName());
		Json->SetStringField(TEXT("action_path"), Mapping.Action->GetPathName());
	}
	else
	{
		Json->SetStringField(TEXT("action"), TEXT("None"));
	}

	TArray<TSharedPtr<FJsonValue>> TriggersArray;
	for (UInputTrigger* Trigger : Mapping.Triggers)
	{
		if (Trigger)
		{
			TSharedPtr<FJsonObject> TriggerJson = MakeShared<FJsonObject>();
			TriggerJson->SetStringField(TEXT("type"), Trigger->GetClass()->GetName());
			TriggersArray.Add(MakeShared<FJsonValueObject>(TriggerJson));
		}
	}
	Json->SetArrayField(TEXT("triggers"), TriggersArray);

	TArray<TSharedPtr<FJsonValue>> ModifiersArray;
	for (UInputModifier* Modifier : Mapping.Modifiers)
	{
		if (Modifier)
		{
			TSharedPtr<FJsonObject> ModifierJson = MakeShared<FJsonObject>();
			ModifierJson->SetStringField(TEXT("type"), Modifier->GetClass()->GetName());
			ModifiersArray.Add(MakeShared<FJsonValueObject>(ModifierJson));
		}
	}
	Json->SetArrayField(TEXT("modifiers"), ModifiersArray);

	return Json;
}
