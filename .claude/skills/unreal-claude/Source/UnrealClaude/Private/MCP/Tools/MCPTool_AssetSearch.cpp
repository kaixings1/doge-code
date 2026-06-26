// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_AssetSearch.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/IAssetRegistry.h"

FMCPToolResult FMCPTool_AssetSearch::Execute(const TSharedRef<FJsonObject>& Params)
{
	FAssetRegistryModule& AssetRegistryModule = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");
	IAssetRegistry& AssetRegistry = AssetRegistryModule.Get();

	FString ClassFilter = ExtractOptionalString(Params, TEXT("class_filter"));
	FString PathFilter = ExtractOptionalString(Params, TEXT("path_filter"), TEXT("/Game/"));
	FString NamePattern = ExtractOptionalString(Params, TEXT("name_pattern"));
	int32 Limit = FMath::Clamp(ExtractOptionalNumber<int32>(Params, TEXT("limit"), 25), 1, 1000);
	int32 Offset = FMath::Max(0, ExtractOptionalNumber<int32>(Params, TEXT("offset"), 0));

	// Accept deprecated aliases so LLMs reaching for the "obvious" names still work,
	// but warn so the model learns the canonical parameter names.
	TArray<FString> Warnings;
	TArray<FString> AliasKeysUsed;

	auto ApplyAlias = [&](const TCHAR* AliasName, const TCHAR* CanonicalName, FString& OutCanonical)
	{
		FString AliasValue;
		if (Params->TryGetStringField(AliasName, AliasValue) && !AliasValue.IsEmpty())
		{
			AliasKeysUsed.Add(AliasName);
			if (OutCanonical.IsEmpty())
			{
				OutCanonical = AliasValue;
			}
			Warnings.Add(FString::Printf(
				TEXT("Parameter '%s' is not recognized — use '%s' instead. Treating as alias for this call."),
				AliasName, CanonicalName));
		}
	};

	ApplyAlias(TEXT("asset_type"), TEXT("class_filter"), ClassFilter);
	ApplyAlias(TEXT("search_term"), TEXT("name_pattern"), NamePattern);

	// Flag any remaining unknown keys (typos, wrong names) so the LLM can self-correct.
	for (const FString& UnknownKey : CollectUnknownParamKeys(Params, AliasKeysUsed))
	{
		Warnings.Add(FString::Printf(
			TEXT("Unknown parameter '%s' was ignored. Valid parameters: class_filter, path_filter, name_pattern, limit, offset."),
			*UnknownKey));
	}

	FARFilter Filter;
	Filter.bRecursivePaths = true;
	Filter.bRecursiveClasses = true;

	if (!PathFilter.IsEmpty())
	{
		Filter.PackagePaths.Add(FName(*PathFilter));
	}

	if (!ClassFilter.IsEmpty())
	{
		// Accept both full class paths (/Script/Engine.StaticMesh) and short names (StaticMesh) — resolve via common module prefixes
		FString ClassPath = ClassFilter;

		if (!ClassPath.StartsWith(TEXT("/")))
		{
			UClass* FoundClass = FindObject<UClass>(nullptr, *FString::Printf(TEXT("/Script/Engine.%s"), *ClassFilter));

			if (!FoundClass)
			{
				FoundClass = FindObject<UClass>(nullptr, *FString::Printf(TEXT("/Script/CoreUObject.%s"), *ClassFilter));
			}

			if (!FoundClass)
			{
				FoundClass = FindObject<UClass>(nullptr, *FString::Printf(TEXT("/Script/Niagara.%s"), *ClassFilter));
			}

			if (!FoundClass)
			{
				FoundClass = FindObject<UClass>(nullptr, *ClassFilter);
			}

			if (FoundClass)
			{
				ClassPath = FoundClass->GetClassPathName().ToString();
			}
			else
			{
				// Last-resort fallback — registry will return empty if path is bogus, which is the right behavior
				ClassPath = FString::Printf(TEXT("/Script/Engine.%s"), *ClassFilter);
			}
		}

		Filter.ClassPaths.Add(FTopLevelAssetPath(ClassPath));
	}

	TArray<FAssetData> AllAssets;
	AssetRegistry.GetAssets(Filter, AllAssets);

	// Name pattern is applied post-query because FARFilter has no substring-match field
	TArray<FAssetData> FilteredAssets;
	if (!NamePattern.IsEmpty())
	{
		for (const FAssetData& Asset : AllAssets)
		{
			if (Asset.AssetName.ToString().Contains(NamePattern, ESearchCase::IgnoreCase))
			{
				FilteredAssets.Add(Asset);
			}
		}
	}
	else
	{
		FilteredAssets = MoveTemp(AllAssets);
	}

	int32 Total = FilteredAssets.Num();
	int32 StartIndex = FMath::Min(Offset, Total);
	int32 EndIndex = FMath::Min(StartIndex + Limit, Total);
	int32 Count = EndIndex - StartIndex;
	bool bHasMore = EndIndex < Total;

	TArray<TSharedPtr<FJsonValue>> AssetsArray;
	for (int32 i = StartIndex; i < EndIndex; ++i)
	{
		AssetsArray.Add(MakeShared<FJsonValueObject>(AssetDataToJson(FilteredAssets[i])));
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetArrayField(TEXT("assets"), AssetsArray);
	ResultData->SetNumberField(TEXT("count"), Count);
	ResultData->SetNumberField(TEXT("total"), Total);
	ResultData->SetNumberField(TEXT("offset"), StartIndex);
	ResultData->SetNumberField(TEXT("limit"), Limit);
	ResultData->SetBoolField(TEXT("hasMore"), bHasMore);
	if (bHasMore)
	{
		ResultData->SetNumberField(TEXT("nextOffset"), EndIndex);
	}

	FString Message;
	if (Total == 0)
	{
		Message = TEXT("No assets found matching the search criteria");
	}
	else if (Count == Total)
	{
		Message = FString::Printf(TEXT("Found %d asset%s"), Total, Total == 1 ? TEXT("") : TEXT("s"));
	}
	else
	{
		Message = FString::Printf(TEXT("Found %d assets (showing %d-%d of %d total)"),
			Count, StartIndex + 1, EndIndex, Total);
	}

	FMCPToolResult Result = FMCPToolResult::Success(Message, ResultData);
	Result.Warnings = MoveTemp(Warnings);
	return Result;
}

TSharedPtr<FJsonObject> FMCPTool_AssetSearch::AssetDataToJson(const FAssetData& AssetData) const
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();

	// Full object path (e.g., /Game/Characters/BP_Player.BP_Player)
	Json->SetStringField(TEXT("path"), AssetData.GetObjectPathString());

	// Asset name without path
	Json->SetStringField(TEXT("name"), AssetData.AssetName.ToString());

	// Class name (short form)
	Json->SetStringField(TEXT("class"), AssetData.AssetClassPath.GetAssetName().ToString());

	// Package path (folder containing the asset)
	Json->SetStringField(TEXT("package_path"), AssetData.PackagePath.ToString());

	return Json;
}
