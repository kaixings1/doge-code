// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_AssetDependencies.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetRegistry/IAssetRegistry.h"

FMCPToolResult FMCPTool_AssetDependencies::Execute(const TSharedRef<FJsonObject>& Params)
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

	TArray<FName> Dependencies;

	// Default FDependencyQuery() returns hard+soft; passing Hard flag restricts to hard only
	UE::AssetRegistry::FDependencyQuery QueryFlags;
	if (!bIncludeSoft)
	{
		QueryFlags = UE::AssetRegistry::FDependencyQuery(UE::AssetRegistry::EDependencyQuery::Hard);
	}

	AssetRegistry.GetDependencies(
		FName(*PackagePath),
		Dependencies,
		UE::AssetRegistry::EDependencyCategory::Package,
		QueryFlags
	);

	TArray<FName> FilteredDeps;
	for (const FName& DepPath : Dependencies)
	{
		FString PathStr = DepPath.ToString();
		if (!PathStr.StartsWith(TEXT("/Script/")) && !PathStr.StartsWith(TEXT("/Engine/")))
		{
			FilteredDeps.Add(DepPath);
		}
	}

	int32 Total = FilteredDeps.Num();
	int32 StartIndex = FMath::Min(Offset, Total);
	int32 EndIndex = FMath::Min(StartIndex + Limit, Total);
	int32 Count = EndIndex - StartIndex;
	bool bHasMore = EndIndex < Total;

	TArray<TSharedPtr<FJsonValue>> DependencyArray;
	for (int32 i = StartIndex; i < EndIndex; ++i)
	{
		const FName& DepPath = FilteredDeps[i];
		FString PathStr = DepPath.ToString();

		TSharedPtr<FJsonObject> DepJson = MakeShared<FJsonObject>();
		DepJson->SetStringField(TEXT("path"), PathStr);

		TArray<FAssetData> DepAssets;
		AssetRegistry.GetAssetsByPackageName(DepPath, DepAssets);
		if (DepAssets.Num() > 0)
		{
			DepJson->SetStringField(TEXT("class"), DepAssets[0].AssetClassPath.GetAssetName().ToString());
			DepJson->SetStringField(TEXT("name"), DepAssets[0].AssetName.ToString());
		}

		DependencyArray.Add(MakeShared<FJsonValueObject>(DepJson));
	}

	TSharedPtr<FJsonObject> ResultData = MakeShared<FJsonObject>();
	ResultData->SetStringField(TEXT("asset_path"), AssetPath);
	ResultData->SetArrayField(TEXT("dependencies"), DependencyArray);
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
	if (Count == Total)
	{
		Message = FString::Printf(TEXT("Found %d dependenc%s for '%s'"),
			Total, Total == 1 ? TEXT("y") : TEXT("ies"),
			*AssetData.AssetName.ToString());
	}
	else
	{
		Message = FString::Printf(TEXT("Found %d dependencies (showing %d-%d of %d total) for '%s'"),
			Count, StartIndex + 1, EndIndex, Total,
			*AssetData.AssetName.ToString());
	}

	return FMCPToolResult::Success(Message, ResultData);
}
