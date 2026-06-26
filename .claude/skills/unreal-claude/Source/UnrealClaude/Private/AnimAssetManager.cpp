// Copyright Natali Caggiano. All Rights Reserved.

#include "AnimAssetManager.h"
#include "AnimStateMachineEditor.h"
#include "AnimGraphEditor.h"
#include "AnimGraphNode_StateMachine.h"
#include "AnimGraphNode_Slot.h"
#include "AnimGraphNode_IdentityPose.h"
#include "AnimStateNode.h"
#include "Animation/AnimSequence.h"
#include "Animation/BlendSpace.h"
#include "Animation/BlendSpace1D.h"
#include "Animation/AnimMontage.h"
#include "Animation/Skeleton.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "EdGraph/EdGraph.h"
#include "EdGraph/EdGraphPin.h"
#include "EdGraphSchema_K2.h"
#include "K2Node_VariableGet.h"
#include "UObject/UObjectGlobals.h"

namespace
{
	/**
	 * Resolve a Blueprint variable by name across the generated and skeleton classes.
	 * Returns nullptr if not found; callers use this for both pre-flight checks and
	 * inside BindBlendSpaceAxisToVariable so the lookup is consistent.
	 */
	FProperty* FindAnimBlueprintVariable(UAnimBlueprint* AnimBP, const FString& VariableName)
	{
		if (!AnimBP || VariableName.IsEmpty())
		{
			return nullptr;
		}
		FProperty* Property = FindFProperty<FProperty>(AnimBP->GeneratedClass, *VariableName);
		if (!Property)
		{
			Property = FindFProperty<FProperty>(AnimBP->SkeletonGeneratedClass, *VariableName);
		}
		return Property;
	}

	/**
	 * Confirm every non-empty binding value resolves to a real Blueprint variable
	 * before any destructive graph edits. Stops at the first failure so the user
	 * sees the offending name in the error.
	 */
	template<typename TBindings>
	bool ValidateBindingVariables(UAnimBlueprint* AnimBP, const TBindings& Bindings, FString& OutError)
	{
		for (const auto& Pair : Bindings)
		{
			const FString& VarName = Pair.Value;
			if (VarName.IsEmpty())
			{
				continue;
			}
			if (!FindAnimBlueprintVariable(AnimBP, VarName))
			{
				OutError = FString::Printf(
					TEXT("Variable '%s' not found in AnimBlueprint"), *VarName);
				return false;
			}
		}
		return true;
	}

	/**
	 * Create a Get-Variable node for the given AnimBP variable and connect its
	 * output to the named input pin on an existing BlendSpace player node.
	 */
	bool BindBlendSpaceAxisToVariable(
		UAnimBlueprint* AnimBP,
		UEdGraph* StateGraph,
		UEdGraphNode* BSNode,
		const FName& AxisPinName,
		const FString& VariableName,
		FString& OutError)
	{
		if (!AnimBP || !StateGraph || !BSNode)
		{
			OutError = TEXT("Invalid AnimBlueprint, state graph, or BlendSpace node");
			return false;
		}

		if (VariableName.IsEmpty())
		{
			OutError = TEXT("Variable name is empty");
			return false;
		}

		if (!FindAnimBlueprintVariable(AnimBP, VariableName))
		{
			OutError = FString::Printf(
				TEXT("Variable '%s' not found in AnimBlueprint"), *VariableName);
			return false;
		}

		UEdGraphPin* AxisPin = FAnimGraphEditor::FindPinByName(BSNode, AxisPinName.ToString(), EGPD_Input);
		if (!AxisPin)
		{
			OutError = FString::Printf(
				TEXT("BlendSpace input pin '%s' not found (BlendSpace asset may not expose this axis)"),
				*AxisPinName.ToString());
			return false;
		}

		UK2Node_VariableGet* VarNode = NewObject<UK2Node_VariableGet>(StateGraph);
		if (!VarNode)
		{
			OutError = TEXT("Failed to create variable get node");
			return false;
		}

		VarNode->VariableReference.SetSelfMember(FName(*VariableName));
		VarNode->NodePosX = BSNode->NodePosX - 200;
		VarNode->NodePosY = BSNode->NodePosY + (AxisPinName == FName(TEXT("Y")) ? 80 : 0);

		StateGraph->AddNode(VarNode, false, false);
		VarNode->CreateNewGuid();
		VarNode->ReconstructNode();

		FString GetVarNodeId = FAnimGraphEditor::GenerateAnimNodeId(TEXT("GetVar"), VariableName, StateGraph);
		FAnimGraphEditor::SetNodeId(VarNode, GetVarNodeId);

		UEdGraphPin* VarOutputPin = nullptr;
		for (UEdGraphPin* Pin : VarNode->Pins)
		{
			if (Pin && Pin->Direction == EGPD_Output && Pin->PinName != UEdGraphSchema_K2::PN_Self)
			{
				VarOutputPin = Pin;
				break;
			}
		}

		if (!VarOutputPin)
		{
			OutError = FString::Printf(
				TEXT("Variable get node for '%s' has no output pin"), *VariableName);
			return false;
		}

		VarOutputPin->MakeLinkTo(AxisPin);
		return true;
	}
}

// ===== Asset Loading =====

UAnimSequence* FAnimAssetManager::LoadAnimSequence(const FString& AssetPath, FString& OutError)
{
	return LoadAnimAssetInternal<UAnimSequence>(AssetPath, TEXT("AnimSequence"), OutError);
}

UBlendSpace* FAnimAssetManager::LoadBlendSpace(const FString& AssetPath, FString& OutError)
{
	return LoadAnimAssetInternal<UBlendSpace>(AssetPath, TEXT("BlendSpace"), OutError);
}

UBlendSpace1D* FAnimAssetManager::LoadBlendSpace1D(const FString& AssetPath, FString& OutError)
{
	return LoadAnimAssetInternal<UBlendSpace1D>(AssetPath, TEXT("BlendSpace1D"), OutError);
}

UAnimMontage* FAnimAssetManager::LoadMontage(const FString& AssetPath, FString& OutError)
{
	return LoadAnimAssetInternal<UAnimMontage>(AssetPath, TEXT("AnimMontage"), OutError);
}

UAnimationAsset* FAnimAssetManager::LoadAnimationAsset(const FString& AssetPath, FString& OutError)
{
	return LoadAnimAssetInternal<UAnimationAsset>(AssetPath, TEXT("AnimationAsset"), OutError);
}

// ===== Asset Validation =====

bool FAnimAssetManager::ValidateAnimationCompatibility(
	UAnimBlueprint* AnimBP,
	UAnimationAsset* AnimAsset,
	FString& OutError)
{
	if (!AnimBP)
	{
		OutError = TEXT("Invalid Animation Blueprint");
		return false;
	}

	if (!AnimAsset)
	{
		OutError = TEXT("Invalid animation asset");
		return false;
	}

	USkeleton* BPSkeleton = GetTargetSkeleton(AnimBP);
	USkeleton* AssetSkeleton = AnimAsset->GetSkeleton();

	if (!BPSkeleton)
	{
		OutError = TEXT("Animation Blueprint has no target skeleton");
		return false;
	}

	if (!AssetSkeleton)
	{
		OutError = TEXT("Animation asset has no skeleton");
		return false;
	}

	if (!BPSkeleton->IsCompatibleForEditor(AssetSkeleton))
	{
		OutError = FString::Printf(
			TEXT("Skeleton mismatch: AnimBlueprint uses '%s', but asset uses '%s'"),
			*BPSkeleton->GetName(),
			*AssetSkeleton->GetName()
		);
		return false;
	}

	return true;
}

USkeleton* FAnimAssetManager::GetTargetSkeleton(UAnimBlueprint* AnimBP)
{
	if (!AnimBP) return nullptr;
	return AnimBP->TargetSkeleton.Get();
}

// ===== State Animation Assignment =====

bool FAnimAssetManager::SetStateAnimSequence(
	UAnimBlueprint* AnimBP,
	const FString& StateMachineName,
	const FString& StateName,
	UAnimSequence* AnimSequence,
	FString& OutError)
{
	if (!ValidateAnimationCompatibility(AnimBP, AnimSequence, OutError))
	{
		return false;
	}

	UEdGraph* StateGraph = FAnimGraphEditor::FindStateBoundGraph(AnimBP, StateMachineName, StateName, OutError);
	if (!StateGraph)
	{
		return false;
	}

	if (!FAnimGraphEditor::ClearStateGraph(StateGraph, OutError))
	{
		return false;
	}

	FString NodeId;
	UEdGraphNode* SeqNode = FAnimGraphEditor::CreateAnimSequenceNode(
		StateGraph,
		AnimSequence,
		FVector2D(200, 100),
		NodeId,
		OutError
	);

	if (!SeqNode)
	{
		return false;
	}

	return FAnimGraphEditor::ConnectToOutputPose(StateGraph, NodeId, OutError);
}

bool FAnimAssetManager::SetStateBlendSpace(
	UAnimBlueprint* AnimBP,
	const FString& StateMachineName,
	const FString& StateName,
	UBlendSpace* BlendSpace,
	const TMap<FString, FString>& ParameterBindings,
	FString& OutError)
{
	if (!ValidateAnimationCompatibility(AnimBP, BlendSpace, OutError))
	{
		return false;
	}

	if (!ValidateBindingVariables(AnimBP, ParameterBindings, OutError))
	{
		return false;
	}

	UEdGraph* StateGraph = FAnimGraphEditor::FindStateBoundGraph(AnimBP, StateMachineName, StateName, OutError);
	if (!StateGraph)
	{
		return false;
	}

	if (!FAnimGraphEditor::ClearStateGraph(StateGraph, OutError))
	{
		return false;
	}

	FString NodeId;
	UEdGraphNode* BSNode = FAnimGraphEditor::CreateBlendSpaceNode(
		StateGraph,
		BlendSpace,
		FVector2D(200, 100),
		NodeId,
		OutError
	);

	if (!BSNode)
	{
		return false;
	}

	for (const TPair<FString, FString>& Binding : ParameterBindings)
	{
		if (Binding.Value.IsEmpty())
		{
			continue;
		}
		if (!BindBlendSpaceAxisToVariable(AnimBP, StateGraph, BSNode, FName(*Binding.Key), Binding.Value, OutError))
		{
			return false;
		}
	}

	return FAnimGraphEditor::ConnectToOutputPose(StateGraph, NodeId, OutError);
}

bool FAnimAssetManager::SetStateBlendSpace1D(
	UAnimBlueprint* AnimBP,
	const FString& StateMachineName,
	const FString& StateName,
	UBlendSpace1D* BlendSpace,
	const FString& ParameterBinding,
	FString& OutError)
{
	if (!ValidateAnimationCompatibility(AnimBP, BlendSpace, OutError))
	{
		return false;
	}

	if (!ParameterBinding.IsEmpty() && !FindAnimBlueprintVariable(AnimBP, ParameterBinding))
	{
		OutError = FString::Printf(
			TEXT("Variable '%s' not found in AnimBlueprint"), *ParameterBinding);
		return false;
	}

	UEdGraph* StateGraph = FAnimGraphEditor::FindStateBoundGraph(AnimBP, StateMachineName, StateName, OutError);
	if (!StateGraph)
	{
		return false;
	}

	if (!FAnimGraphEditor::ClearStateGraph(StateGraph, OutError))
	{
		return false;
	}

	FString NodeId;
	UEdGraphNode* BSNode = FAnimGraphEditor::CreateBlendSpace1DNode(
		StateGraph,
		BlendSpace,
		FVector2D(200, 100),
		NodeId,
		OutError
	);

	if (!BSNode)
	{
		return false;
	}

	if (!ParameterBinding.IsEmpty())
	{
		if (!BindBlendSpaceAxisToVariable(AnimBP, StateGraph, BSNode, FName(TEXT("X")), ParameterBinding, OutError))
		{
			return false;
		}
	}

	return FAnimGraphEditor::ConnectToOutputPose(StateGraph, NodeId, OutError);
}

bool FAnimAssetManager::SetStateMontage(
	UAnimBlueprint* AnimBP,
	const FString& StateMachineName,
	const FString& StateName,
	UAnimMontage* Montage,
	FString& OutError)
{
	if (!ValidateAnimationCompatibility(AnimBP, Montage, OutError))
	{
		return false;
	}

	UEdGraph* StateGraph = FAnimGraphEditor::FindStateBoundGraph(AnimBP, StateMachineName, StateName, OutError);
	if (!StateGraph)
	{
		return false;
	}

	// State graphs play montages through a Slot node — the slot acts as a passthru of the Source
	// pose until a Montage_Play targets this slot, at which point the slot's contribution overrides
	// the source. We feed Source from an Identity Pose so the state has a stable base when idle.
	FName SlotName = (Montage->SlotAnimTracks.Num() > 0)
		? Montage->SlotAnimTracks[0].SlotName
		: FAnimSlotGroup::DefaultSlotName;

	if (!FAnimGraphEditor::ClearStateGraph(StateGraph, OutError))
	{
		return false;
	}

	FGraphNodeCreator<UAnimGraphNode_IdentityPose> IdentityCreator(*StateGraph);
	UAnimGraphNode_IdentityPose* IdentityNode = IdentityCreator.CreateNode();
	if (!IdentityNode)
	{
		OutError = TEXT("Failed to create identity pose node");
		return false;
	}
	IdentityNode->NodePosX = 0;
	IdentityNode->NodePosY = 100;
	IdentityCreator.Finalize();
	FString IdentityNodeId = FAnimGraphEditor::GenerateAnimNodeId(TEXT("Identity"), Montage->GetName(), StateGraph);
	FAnimGraphEditor::SetNodeId(IdentityNode, IdentityNodeId);

	FGraphNodeCreator<UAnimGraphNode_Slot> SlotCreator(*StateGraph);
	UAnimGraphNode_Slot* SlotNode = SlotCreator.CreateNode();
	if (!SlotNode)
	{
		OutError = TEXT("Failed to create slot node");
		return false;
	}
	SlotNode->NodePosX = 200;
	SlotNode->NodePosY = 100;
	SlotNode->Node.SlotName = SlotName;
	SlotCreator.Finalize();
	FString SlotNodeId = FAnimGraphEditor::GenerateAnimNodeId(TEXT("Slot"), SlotName.ToString(), StateGraph);
	FAnimGraphEditor::SetNodeId(SlotNode, SlotNodeId);

	UEdGraphPin* IdentityOutPin = nullptr;
	for (UEdGraphPin* Pin : IdentityNode->Pins)
	{
		if (Pin && Pin->Direction == EGPD_Output)
		{
			IdentityOutPin = Pin;
			break;
		}
	}

	UEdGraphPin* SlotSourcePin = FAnimGraphEditor::FindPinByName(SlotNode, TEXT("Source"), EGPD_Input);
	if (IdentityOutPin && SlotSourcePin)
	{
		IdentityOutPin->MakeLinkTo(SlotSourcePin);
	}

	StateGraph->Modify();

	return FAnimGraphEditor::ConnectToOutputPose(StateGraph, SlotNodeId, OutError);
}

// ===== Asset Discovery =====

TArray<FString> FAnimAssetManager::FindAnimationAssets(
	const FString& SearchPattern,
	const FString& AssetType,
	USkeleton* TargetSkeleton)
{
	TArray<FString> Results;

	FAssetRegistryModule& AssetRegistryModule = FModuleManager::LoadModuleChecked<FAssetRegistryModule>("AssetRegistry");
	IAssetRegistry& AssetRegistry = AssetRegistryModule.Get();

	TArray<FTopLevelAssetPath> ClassPaths;
	if (AssetType.Equals(TEXT("AnimSequence"), ESearchCase::IgnoreCase))
	{
		ClassPaths.Add(UAnimSequence::StaticClass()->GetClassPathName());
	}
	else if (AssetType.Equals(TEXT("BlendSpace"), ESearchCase::IgnoreCase))
	{
		ClassPaths.Add(UBlendSpace::StaticClass()->GetClassPathName());
	}
	else if (AssetType.Equals(TEXT("BlendSpace1D"), ESearchCase::IgnoreCase))
	{
		ClassPaths.Add(UBlendSpace1D::StaticClass()->GetClassPathName());
	}
	else if (AssetType.Equals(TEXT("Montage"), ESearchCase::IgnoreCase))
	{
		ClassPaths.Add(UAnimMontage::StaticClass()->GetClassPathName());
	}
	else // All
	{
		ClassPaths.Add(UAnimSequence::StaticClass()->GetClassPathName());
		ClassPaths.Add(UBlendSpace::StaticClass()->GetClassPathName());
		ClassPaths.Add(UBlendSpace1D::StaticClass()->GetClassPathName());
		ClassPaths.Add(UAnimMontage::StaticClass()->GetClassPathName());
	}

	FARFilter Filter;
	Filter.ClassPaths = ClassPaths;
	Filter.bRecursiveClasses = true;
	Filter.bRecursivePaths = true;
	Filter.PackagePaths.Add(FName(TEXT("/Game")));

	TArray<FAssetData> AssetDataList;
	AssetRegistry.GetAssets(Filter, AssetDataList);

	for (const FAssetData& AssetData : AssetDataList)
	{
		FString AssetName = AssetData.AssetName.ToString();

		if (!SearchPattern.IsEmpty() && !AssetName.Contains(SearchPattern))
		{
			continue;
		}

		if (TargetSkeleton)
		{
			UAnimationAsset* Asset = Cast<UAnimationAsset>(AssetData.GetAsset());
			if (Asset && Asset->GetSkeleton() != TargetSkeleton)
			{
				continue;
			}
		}

		Results.Add(AssetData.GetObjectPathString());
	}

	return Results;
}

// ===== Serialization =====

TSharedPtr<FJsonObject> FAnimAssetManager::SerializeAnimAssetInfo(UAnimationAsset* Asset)
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();

	if (!Asset) return Json;

	Json->SetStringField(TEXT("name"), Asset->GetName());
	Json->SetStringField(TEXT("path"), Asset->GetPathName());
	Json->SetStringField(TEXT("class"), Asset->GetClass()->GetName());

	if (USkeleton* Skeleton = Asset->GetSkeleton())
	{
		Json->SetStringField(TEXT("skeleton"), Skeleton->GetName());
	}

	if (UAnimSequence* Sequence = Cast<UAnimSequence>(Asset))
	{
		Json->SetNumberField(TEXT("length"), Sequence->GetPlayLength());
		Json->SetNumberField(TEXT("num_frames"), Sequence->GetNumberOfSampledKeys());
	}
	else if (UBlendSpace* BS = Cast<UBlendSpace>(Asset))
	{
		Json = SerializeBlendSpaceInfo(BS);
	}

	return Json;
}

TSharedPtr<FJsonObject> FAnimAssetManager::SerializeBlendSpaceInfo(UBlendSpace* BlendSpace)
{
	TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();

	if (!BlendSpace) return Json;

	Json->SetStringField(TEXT("name"), BlendSpace->GetName());
	Json->SetStringField(TEXT("path"), BlendSpace->GetPathName());
	Json->SetStringField(TEXT("class"), BlendSpace->GetClass()->GetName());

	TSharedPtr<FJsonObject> AxisXJson = MakeShared<FJsonObject>();
	AxisXJson->SetStringField(TEXT("name"), BlendSpace->GetBlendParameter(0).DisplayName);
	AxisXJson->SetNumberField(TEXT("min"), BlendSpace->GetBlendParameter(0).Min);
	AxisXJson->SetNumberField(TEXT("max"), BlendSpace->GetBlendParameter(0).Max);
	Json->SetObjectField(TEXT("axis_x"), AxisXJson);

	if (!BlendSpace->IsA<UBlendSpace1D>())
	{
		TSharedPtr<FJsonObject> AxisYJson = MakeShared<FJsonObject>();
		AxisYJson->SetStringField(TEXT("name"), BlendSpace->GetBlendParameter(1).DisplayName);
		AxisYJson->SetNumberField(TEXT("min"), BlendSpace->GetBlendParameter(1).Min);
		AxisYJson->SetNumberField(TEXT("max"), BlendSpace->GetBlendParameter(1).Max);
		Json->SetObjectField(TEXT("axis_y"), AxisYJson);
	}

	return Json;
}

// ===== Private Helpers =====

FString FAnimAssetManager::ResolveAnimAssetPath(const FString& AssetPath)
{
	if (AssetPath.StartsWith(TEXT("/Game/")) || AssetPath.StartsWith(TEXT("/Script/")))
	{
		return AssetPath;
	}

	FString FullPath = TEXT("/Game/Animations/") + AssetPath;

	// Ensure proper asset reference format (Path.AssetName)
	if (!FullPath.Contains(TEXT(".")))
	{
		FullPath += TEXT(".") + FPaths::GetBaseFilename(AssetPath);
	}

	return FullPath;
}

TArray<FString> FAnimAssetManager::GetCommonSearchPaths()
{
	return TArray<FString>{
		TEXT("/Game/Animations"),
		TEXT("/Game/Characters"),
		TEXT("/Game/Characters/Animations"),
		TEXT("/Game/Assets/Animations"),
		TEXT("/Game")
	};
}

bool FAnimAssetManager::ClearAndSetupStateGraph(UEdGraph* StateGraph, FString& OutError)
{
	return FAnimGraphEditor::ClearStateGraph(StateGraph, OutError);
}
