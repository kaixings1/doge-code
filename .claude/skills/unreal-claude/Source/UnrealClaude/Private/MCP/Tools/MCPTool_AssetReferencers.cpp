// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_AssetReferencers.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/IAssetRegistry.h"

FMCPToolResult FMCPTool_AssetReferencers::Execute(const TSharedRef<FJsonObject>& Params)
{
	FString AssetPath;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("asset_path"), AssetPath, Error))
	{
		return Error.GetValue();
	}

	bool bIncludeSoft = ExtractOptionalBool(Params, TEXT("include_soft"), true);
	int32 Limit = FMath::Clamp(ExtractOptionalNumber<int32>(Params, TEXT("limit"), 25), 1, 1000);
	int32 Offset = FMath::Max(0, ExtractOptionalNumber<int32>(Params, TEXT("offset"), 0));

	FAssetRegistryModule& AssetRegistryModule = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");
	IAssetRegistry& AssetRegistry = AssetRegistryModule.Get();

	// Accept both full object path (/Game/BP.BP_C) and package path (/Game/BP) — normalize to package path
	FString PackagePath = AssetPath;
	if (PackagePath.Contains(TEXT(".")))
	{
		PackagePath = FPackageName::ObjectPathToPackageName(AssetPath);
	}

	FAssetData AssetData = AssetRegistry.GetAssetByObjectPath(FSoftObjectPath(AssetPath));
	if (!AssetData.IsValid())
	{
		TArray<FAssetData> AssetsInPackage;
		AssetRegistry.GetAssetsByPackageName(FName(*PackagePath), AssetsInPackage);
		if (AssetsInPackage.Num() == 0)
		{
			return FMCPToolResult::Error(FString::Printf(TEXT("Asset not found: %s"), *AssetPath));
		}
		AssetData = AssetsInPackage[0];
	}

	TArray<FName> Referencers;

	// Default FDependencyQuery() returns hard+soft; passing Hard flag restricts to hard only
	UE::AssetRegistry::FDependencyQuery QueryFlags;
	if (!bIncludeSoft)
	{
		QueryFlags = UE::AssetRegistry::FDependencyQuery(UE::AssetRegistry::EDependencyQuery::Hard);
	}

	AssetRegistry.GetReferencers(
		FName(*PackagePath),
		Referencers,
		UE::AssetRegistry::EDependencyCategory::Package,
		QueryFlags
	);

	TArray<FName> FilteredRefs;
	for (const FName& RefPath : Referencers)
	{
		FString PathStr = RefPath.ToString();
		if (!PathStr.StartsWith(TEXT("/Script/")) && !PathStr.StartsWith(TEXT("/Engine/")))
		{
			FilteredRefs.Add(RefPath);
		}
	}

	int32 Total = FilteredRefs.Num();
	int32 StartIndex = FMath::Min(Offset, Total);
	int32 EndIndex = FMath::Min(StartIndex + Limit, Total);
	int32 Count = EndIndex - StartIndex;
	bool bHasMore = EndIndex < Total;

	TArray<TSharedPtr<FJsonValue>> ReferencerArray;
	for (int32 i = StartIndex; i < EndIndex; ++i)
	{
		const FName& RefPath = FilteredRefs[i];
		FString PathStr = RefPath.ToString();

		TSharedPtr<FJsonObject> RefJson = MakeShared<FJsonObject>();
		RefJson->SetStringField(TEXT("path"), PathStr);

		TArray<FAssetData> RefAssets;
		AssetRegistry.GetAssetsByPackageName(RefPath, RefAssets);
		if (RefAssets.Num() > 0)
		{
			RefJson->SetStringField(TEXT("class"), RefAssets[0].AssetClassPath.GetAssetName().ToString());
			RefJson->SetStringField(TEXT("name"), RefAssets[0].AssetName.ToString());
		}

		ReferencerArray.Add(MakeShared<FJsonValueObject>(RefJson));
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("asset_path"), AssetPath);
	ResultData->SetArrayField(TEXT("referencers"), ReferencerArray);
	ResultData->SetNumberField(TEXT("count"), Count);
	ResultData->SetNumberField(TEXT("total"), Total);
	ResultData->SetNumberField(TEXT("offset"), StartIndex);
	ResultData->SetNumberField(TEXT("limit"), Limit);
	ResultData->SetBoolField(TEXT("hasMore"), bHasMore);
	if (bHasMore)
	{
		ResultData->SetNumberField(TEXT("nextOffset"), EndIndex);
	}
	ResultData->SetBoolField(TEXT("include_soft"), bIncludeSoft);

	FString Message;
	if (Total == 0)
	{
		Message = FString::Printf(TEXT("No referencers found for '%s' - this asset appears unused"),
			*AssetData.AssetName.ToString());
	}
	else if (Count == Total)
	{
		Message = FString::Printf(TEXT("Found %d referencer%s for '%s'"),
			Total, Total == 1 ? TEXT("") : TEXT("s"),
			*AssetData.AssetName.ToString());
	}
	else
	{
		Message = FString::Printf(TEXT("Found %d referencers (showing %d-%d of %d total) for '%s'"),
			Count, StartIndex + 1, EndIndex, Total,
			*AssetData.AssetName.ToString());
	}

	return FMCPToolResult::Success(Message, ResultData);
}
