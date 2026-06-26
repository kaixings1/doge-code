// Copyright Natali Caggiano. All Rights Reserved.

#include "AnimTransitionConditionFactory.h"
#include "AnimNodePinUtils.h"
#include "AnimGraphEditor.h"
#include "Animation/AnimBlueprint.h"
#include "AnimationTransitionGraph.h"
#include "AnimStateTransitionNode.h"
#include "AnimStateNodeBase.h"
#include "AnimGraphNode_Base.h"
#include "AnimGraphNode_SequencePlayer.h"
#include "AnimGraphNode_BlendSpacePlayer.h"
#include "AnimGraphNode_TransitionResult.h"
#include "K2Node_CallFunction.h"
#include "K2Node_VariableGet.h"
#include "K2Node_TransitionRuleGetter.h"
#include "EdGraph/EdGraph.h"
#include "EdGraphSchema_K2.h"
#include "Kismet/KismetMathLibrary.h"

UEdGraphNode* FAnimTransitionConditionFactory::CreateTransitionConditionNode(
	UEdGraph* TransitionGraph,
	const FString& NodeType,
	const TSharedPtr<FJsonObject>& Params,
	int32 PosX,
	int32 PosY,
	FString& OutNodeId,
	FString& OutError)
{
	if (!TransitionGraph)
	{
		OutError = TEXT("Invalid transition graph");
		return nullptr;
	}

	FVector2D Position(PosX, PosY);
	UEdGraphNode* Node = nullptr;

	FString NormalizedType = NodeType.ToLower();

	if (NormalizedType == TEXT("timeremaining"))
	{
		Node = CreateTimeRemainingNode(TransitionGraph, Params, Position, OutError);
	}
	else if (NormalizedType == TEXT("comparefloat") || NormalizedType == TEXT("compare_float"))
	{
		FString ComparisonOp = TEXT("Less");
		if (Params.IsValid() && Params->HasField(TEXT("comparison")))
		{
			ComparisonOp = Params->GetStringField(TEXT("comparison"));
		}
		Node = CreateComparisonNode(TransitionGraph, ComparisonOp, Params, Position, OutError);
	}
	else if (NormalizedType == TEXT("comparebool") || NormalizedType == TEXT("compare_bool"))
	{
		Node = CreateComparisonNode(TransitionGraph, TEXT("Equal"), Params, Position, OutError, true);
	}
	else if (NormalizedType == TEXT("and"))
	{
		Node = CreateLogicNode(TransitionGraph, TEXT("And"), Position, OutError);
	}
	else if (NormalizedType == TEXT("or"))
	{
		Node = CreateLogicNode(TransitionGraph, TEXT("Or"), Position, OutError);
	}
	else if (NormalizedType == TEXT("not"))
	{
		Node = CreateLogicNode(TransitionGraph, TEXT("Not"), Position, OutError);
	}
	else if (NormalizedType == TEXT("greater"))
	{
		Node = CreateComparisonNode(TransitionGraph, TEXT("Greater"), Params, Position, OutError);
	}
	else if (NormalizedType == TEXT("less"))
	{
		Node = CreateComparisonNode(TransitionGraph, TEXT("Less"), Params, Position, OutError);
	}
	else if (NormalizedType == TEXT("greaterequal") || NormalizedType == TEXT("greater_equal"))
	{
		Node = CreateComparisonNode(TransitionGraph, TEXT("GreaterEqual"), Params, Position, OutError);
	}
	else if (NormalizedType == TEXT("lessequal") || NormalizedType == TEXT("less_equal"))
	{
		Node = CreateComparisonNode(TransitionGraph, TEXT("LessEqual"), Params, Position, OutError);
	}
	else if (NormalizedType == TEXT("equal"))
	{
		Node = CreateComparisonNode(TransitionGraph, TEXT("Equal"), Params, Position, OutError);
	}
	else if (NormalizedType == TEXT("notequal") || NormalizedType == TEXT("not_equal"))
	{
		Node = CreateComparisonNode(TransitionGraph, TEXT("NotEqual"), Params, Position, OutError);
	}
	else
	{
		OutError = FString::Printf(TEXT("Unknown condition node type: %s. Supported: TimeRemaining, CompareFloat, CompareBool, Greater, Less, GreaterEqual, LessEqual, Equal, NotEqual, And, Or, Not"), *NodeType);
		return nullptr;
	}

	if (Node)
	{
		OutNodeId = FAnimGraphEditor::GenerateAnimNodeId(TEXT("Cond"), NodeType, TransitionGraph);
		FAnimGraphEditor::SetNodeId(Node, OutNodeId);
		TransitionGraph->Modify();
	}

	return Node;
}

bool FAnimTransitionConditionFactory::ConnectTransitionNodes(
	UEdGraph* TransitionGraph,
	const FString& SourceNodeId,
	const FString& SourcePinName,
	const FString& TargetNodeId,
	const FString& TargetPinName,
	FString& OutError)
{
	if (!TransitionGraph)
	{
		OutError = TEXT("Invalid transition graph");
		return false;
	}

	UEdGraphNode* SourceNode = FAnimGraphEditor::FindNodeById(TransitionGraph, SourceNodeId);
	if (!SourceNode)
	{
		OutError = FString::Printf(TEXT("Source node not found: %s"), *SourceNodeId);
		return false;
	}

	UEdGraphNode* TargetNode = FAnimGraphEditor::FindNodeById(TransitionGraph, TargetNodeId);
	if (!TargetNode)
	{
		OutError = FString::Printf(TEXT("Target node not found: %s"), *TargetNodeId);
		return false;
	}

	// Output pin name fallback: explicit name, then ReturnValue (CallFunction nodes), then Result
	UEdGraphPin* SourcePin = FAnimNodePinUtils::FindPinByName(SourceNode, SourcePinName, EGPD_Output);
	if (!SourcePin)
	{
		SourcePin = FAnimNodePinUtils::FindPinByName(SourceNode, TEXT("ReturnValue"), EGPD_Output);
	}
	if (!SourcePin)
	{
		SourcePin = FAnimNodePinUtils::FindPinByName(SourceNode, TEXT("Result"), EGPD_Output);
	}
	if (!SourcePin)
	{
		OutError = FAnimNodePinUtils::BuildAvailablePinsError(SourceNode, EGPD_Output, SourcePinName);
		return false;
	}

	UEdGraphPin* TargetPin = FAnimNodePinUtils::FindPinByName(TargetNode, TargetPinName, EGPD_Input);
	if (!TargetPin)
	{
		OutError = FAnimNodePinUtils::BuildAvailablePinsError(TargetNode, EGPD_Input, TargetPinName);
		return false;
	}

	// ===== Smart Type Detection and Auto-Fix =====
	// Check if target node is a comparison node and if there's a type mismatch
	FString TargetComparisonType;
	EComparisonPinType TargetPinType;

	if (IsComparisonNode(TargetNode, TargetComparisonType, TargetPinType))
	{
		// Detect source pin type
		EComparisonPinType SourcePinType = DetectComparisonTypeFromPin(SourcePin);

		// Check for type mismatch (ignoring Float since it's the default and may be intentional)
		// We fix cases where: Int -> Float, Byte -> Float, Bool -> Float, Enum -> Float
		bool bTypeMismatch = (SourcePinType != TargetPinType);

		// Don't "fix" if source is Float and target is already Float (normal case)
		// Only fix when source is a specific type (Int, Bool, Byte, Enum) and target doesn't match
		if (bTypeMismatch && SourcePinType != EComparisonPinType::Float)
		{
			// Recreate comparison node with correct type
			FString RecreateError;
			UEdGraphNode* NewTargetNode = RecreateComparisonNodeWithType(
				TransitionGraph, TargetNode, TargetComparisonType, SourcePinType, RecreateError);

			if (NewTargetNode)
			{
				// Update target node reference and find new target pin
				TargetNode = NewTargetNode;
				TargetPin = FAnimNodePinUtils::FindPinByName(TargetNode, TargetPinName, EGPD_Input);
				if (!TargetPin)
				{
					// Try pin A as fallback
					TargetPin = FAnimNodePinUtils::FindPinByName(TargetNode, TEXT("A"), EGPD_Input);
				}

				if (!TargetPin)
				{
					OutError = TEXT("Failed to find target pin after recreating comparison node");
					return false;
				}

				UE_LOG(LogTemp, Log, TEXT("Auto-fixed comparison node type mismatch: %s -> %s"),
					*FString::Printf(TEXT("%d"), (int32)TargetPinType),
					*FString::Printf(TEXT("%d"), (int32)SourcePinType));
			}
			else
			{
				UE_LOG(LogTemp, Warning, TEXT("Failed to auto-fix comparison node type: %s"), *RecreateError);
				// Continue with connection anyway - let it fail naturally if incompatible
			}
		}
	}

	SourcePin->MakeLinkTo(TargetPin);
	TransitionGraph->Modify();

	return true;
}

bool FAnimTransitionConditionFactory::ConnectToTransitionResult(
	UEdGraph* TransitionGraph,
	const FString& ConditionNodeId,
	const FString& ConditionPinName,
	FString& OutError)
{
	if (!TransitionGraph)
	{
		OutError = TEXT("Invalid transition graph");
		return false;
	}

	UEdGraphNode* ConditionNode = FAnimGraphEditor::FindNodeById(TransitionGraph, ConditionNodeId);
	if (!ConditionNode)
	{
		OutError = FString::Printf(TEXT("Condition node not found: %s"), *ConditionNodeId);
		return false;
	}

	TArray<FName> ConditionPinNames;
	if (!ConditionPinName.IsEmpty())
	{
		ConditionPinNames.Add(FName(*ConditionPinName));
	}
	ConditionPinNames.Append({ FName("ReturnValue"), FName("Result"), FName("Output") });

	FPinSearchConfig ConditionConfig;
	ConditionConfig.PreferredNames = ConditionPinNames;
	ConditionConfig.Direction = EGPD_Output;
	ConditionConfig.FallbackCategory = UEdGraphSchema_K2::PC_Boolean;

	UEdGraphPin* ConditionPin = FAnimNodePinUtils::FindPinWithFallbacks(ConditionNode, ConditionConfig, &OutError);
	if (!ConditionPin)
	{
		return false;
	}

	UEdGraphNode* ResultNode = FAnimNodePinUtils::FindResultNode(TransitionGraph);
	if (!ResultNode)
	{
		OutError = TEXT("Transition result node not found");
		return false;
	}

	auto ResultConfig = FPinSearchConfig::Input({
		FName("bCanEnterTransition"),
		FName("CanEnterTransition"),
		FName("Result")
	}).WithCategory(UEdGraphSchema_K2::PC_Boolean).AcceptAny();

	UEdGraphPin* ResultPin = FAnimNodePinUtils::FindPinWithFallbacks(ResultNode, ResultConfig, &OutError);
	if (!ResultPin)
	{
		return false;
	}

	ConditionPin->MakeLinkTo(ResultPin);
	TransitionGraph->Modify();

	return true;
}

TSharedPtr<FJsonObject> FAnimTransitionConditionFactory::CreateComparisonChain(
	UAnimBlueprint* AnimBP,
	UEdGraph* TransitionGraph,
	const FString& VariableName,
	const FString& ComparisonType,
	const FString& CompareValue,
	FVector2D Position,
	FString& OutError)
{
	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();

	auto MakeErrorResult = [&Result](const FString& Error) -> TSharedPtr<FJsonObject> {
		Result->SetBoolField(TEXT("success"), false);
		Result->SetStringField(TEXT("error"), Error);
		return Result;
	};

	if (!AnimBP || !TransitionGraph)
	{
		OutError = TEXT("Invalid AnimBlueprint or transition graph");
		return MakeErrorResult(OutError);
	}

	// Step 1: Create GetVariable node
	UEdGraphNode* GetVarNode = CreateVariableGetNode(TransitionGraph, AnimBP, VariableName, Position, OutError);
	if (!GetVarNode)
	{
		return MakeErrorResult(OutError);
	}
	FString GetVarNodeId = FAnimGraphEditor::GenerateAnimNodeId(TEXT("GetVar"), VariableName, TransitionGraph);
	FAnimGraphEditor::SetNodeId(GetVarNode, GetVarNodeId);
	GetVarNode->AllocateDefaultPins();

	auto VarOutputConfig = FPinSearchConfig::Output({}).AcceptAny();
	UEdGraphPin* VarOutputPin = FAnimNodePinUtils::FindPinWithFallbacks(GetVarNode, VarOutputConfig);

	// Detect pin type so the comparison node is created with the right function signature
	bool bIsBooleanVariable = false;
	EComparisonPinType PinType = EComparisonPinType::Float;

	if (VarOutputPin)
	{
		if (VarOutputPin->PinType.PinCategory == UEdGraphSchema_K2::PC_Boolean)
		{
			bIsBooleanVariable = true;
			PinType = EComparisonPinType::Boolean;
		}
		else if (VarOutputPin->PinType.PinCategory == UEdGraphSchema_K2::PC_Int)
		{
			PinType = EComparisonPinType::Integer;
		}
		else if (VarOutputPin->PinType.PinCategory == UEdGraphSchema_K2::PC_Byte)
		{
			// Byte with a PinSubCategoryObject is actually an enum-backed UENUM variable
			if (VarOutputPin->PinType.PinSubCategoryObject.IsValid())
			{
				PinType = EComparisonPinType::Enum;
			}
			else
			{
				PinType = EComparisonPinType::Byte;
			}
		}
		else if (VarOutputPin->PinType.PinCategory == UEdGraphSchema_K2::PC_Enum)
		{
			PinType = EComparisonPinType::Enum;
		}
	}

	// Step 2: Create Comparison node with appropriate type
	FVector2D CompPos(Position.X + 200, Position.Y);
	TSharedPtr<FJsonObject> CompParams = MakeShared<FJsonObject>();
	UEdGraphNode* CompNode = CreateComparisonNode(TransitionGraph, ComparisonType, CompParams, CompPos, OutError, bIsBooleanVariable, PinType);
	if (!CompNode)
	{
		return MakeErrorResult(OutError);
	}
	FString CompNodeId = FAnimGraphEditor::GenerateAnimNodeId(TEXT("Comp"), ComparisonType, TransitionGraph);
	FAnimGraphEditor::SetNodeId(CompNode, CompNodeId);

	auto CompInputConfig = FPinSearchConfig::Input({ FName("A") }).AcceptAny();
	UEdGraphPin* CompInputA = FAnimNodePinUtils::FindPinWithFallbacks(CompNode, CompInputConfig);
	if (VarOutputPin && CompInputA)
	{
		VarOutputPin->MakeLinkTo(CompInputA);
	}

	UEdGraphPin* CompInputB = FAnimNodePinUtils::FindPinByName(CompNode, TEXT("B"), EGPD_Input);
	if (CompInputB && !CompareValue.IsEmpty())
	{
		const UEdGraphSchema* Schema = TransitionGraph->GetSchema();
		if (Schema)
		{
			Schema->TrySetDefaultValue(*CompInputB, CompareValue);
		}
		else
		{
			CompInputB->DefaultValue = CompareValue;
		}
	}

	UEdGraphNode* ResultNode = FAnimNodePinUtils::FindResultNode(TransitionGraph);
	UEdGraphPin* ResultInputPin = nullptr;
	UEdGraphPin* ExistingConnection = nullptr;

	if (ResultNode)
	{
		auto ResultConfig = FPinSearchConfig::Input({
			FName("bCanEnterTransition"),
			FName("CanEnterTransition")
		}).WithCategory(UEdGraphSchema_K2::PC_Boolean);

		ResultInputPin = FAnimNodePinUtils::FindPinWithFallbacks(ResultNode, ResultConfig);

		if (ResultInputPin && ResultInputPin->LinkedTo.Num() > 0)
		{
			ExistingConnection = ResultInputPin->LinkedTo[0];
		}
	}

	auto CompOutputConfig = FPinSearchConfig::Output({
		FName("ReturnValue")
	}).WithCategory(UEdGraphSchema_K2::PC_Boolean);
	UEdGraphPin* CompOutputPin = FAnimNodePinUtils::FindPinWithFallbacks(CompNode, CompOutputConfig);

	// If the result pin already has a condition wired in, splice an AND node between them
	FString AndNodeId;
	if (ExistingConnection && CompOutputPin && ResultInputPin)
	{
		FVector2D AndPos(Position.X + 400, Position.Y);
		UEdGraphNode* AndNode = CreateLogicNode(TransitionGraph, TEXT("And"), AndPos, OutError);
		if (AndNode)
		{
			AndNodeId = FAnimGraphEditor::GenerateAnimNodeId(TEXT("And"), TEXT("Chain"), TransitionGraph);
			FAnimGraphEditor::SetNodeId(AndNode, AndNodeId);

			ResultInputPin->BreakAllPinLinks();

			UEdGraphPin* AndInputA = FAnimNodePinUtils::FindPinByName(AndNode, TEXT("A"), EGPD_Input);
			UEdGraphPin* AndInputB = FAnimNodePinUtils::FindPinByName(AndNode, TEXT("B"), EGPD_Input);
			auto AndOutputConfig = FPinSearchConfig::Output({
				FName("ReturnValue")
			}).WithCategory(UEdGraphSchema_K2::PC_Boolean);
			UEdGraphPin* AndOutput = FAnimNodePinUtils::FindPinWithFallbacks(AndNode, AndOutputConfig);

			if (AndInputA) ExistingConnection->MakeLinkTo(AndInputA);
			if (AndInputB) CompOutputPin->MakeLinkTo(AndInputB);
			if (AndOutput) AndOutput->MakeLinkTo(ResultInputPin);
		}
	}
	else if (CompOutputPin && ResultInputPin)
	{
		ResultInputPin->BreakAllPinLinks();
		CompOutputPin->MakeLinkTo(ResultInputPin);
	}

	TransitionGraph->Modify();

	Result->SetBoolField(TEXT("success"), true);
	Result->SetStringField(TEXT("variable_node_id"), GetVarNodeId);
	Result->SetStringField(TEXT("comparison_node_id"), CompNodeId);
	Result->SetBoolField(TEXT("chained_with_existing"), !AndNodeId.IsEmpty());
	if (!AndNodeId.IsEmpty())
	{
		Result->SetStringField(TEXT("and_node_id"), AndNodeId);
	}
	Result->SetStringField(TEXT("variable"), VariableName);
	Result->SetStringField(TEXT("comparison"), ComparisonType);
	Result->SetStringField(TEXT("value"), CompareValue);

	return Result;
}

// ===== Private Helpers =====

UEdGraphNode* FAnimTransitionConditionFactory::CreateTimeRemainingNode(
	UEdGraph* Graph,
	const TSharedPtr<FJsonObject>& Params,
	FVector2D Position,
	FString& OutError)
{
	if (!Graph)
	{
		OutError = TEXT("Invalid graph");
		return nullptr;
	}

	FGraphNodeCreator<UK2Node_TransitionRuleGetter> NodeCreator(*Graph);
	UK2Node_TransitionRuleGetter* GetterNode = NodeCreator.CreateNode();

	if (!GetterNode)
	{
		OutError = TEXT("Failed to create TimeRemaining getter node");
		return nullptr;
	}

	GetterNode->NodePosX = static_cast<int32>(Position.X);
	GetterNode->NodePosY = static_cast<int32>(Position.Y);
	GetterNode->GetterType = ETransitionGetter::AnimationAsset_GetTimeFromEnd;

	// Try to find an associated animation player node in the source state
	UAnimationTransitionGraph* TransitionGraph = Cast<UAnimationTransitionGraph>(Graph);
	if (TransitionGraph)
	{
		UAnimStateTransitionNode* TransitionNode = Cast<UAnimStateTransitionNode>(TransitionGraph->GetOuter());
		if (TransitionNode)
		{
			UAnimStateNodeBase* PreviousState = TransitionNode->GetPreviousState();
			UEdGraph* StateGraph = PreviousState ? PreviousState->GetBoundGraph() : nullptr;
			if (StateGraph)
			{
				for (UEdGraphNode* Node : StateGraph->Nodes)
				{
					if (UAnimGraphNode_Base* AnimNode = Cast<UAnimGraphNode_Base>(Node))
					{
						if (AnimNode->IsA<UAnimGraphNode_SequencePlayer>() ||
							AnimNode->IsA<UAnimGraphNode_BlendSpacePlayer>())
						{
							GetterNode->AssociatedAnimAssetPlayerNode = AnimNode;
							break;
						}
					}
				}
			}
		}
	}

	NodeCreator.Finalize();
	GetterNode->AllocateDefaultPins();

	return GetterNode;
}

UEdGraphNode* FAnimTransitionConditionFactory::CreateComparisonNode(
	UEdGraph* Graph,
	const FString& ComparisonType,
	const TSharedPtr<FJsonObject>& Params,
	FVector2D Position,
	FString& OutError,
	bool bIsBooleanType,
	EComparisonPinType PinType)
{
	if (!Graph)
	{
		OutError = TEXT("Invalid graph");
		return nullptr;
	}

	FName FunctionName;

	if (bIsBooleanType || PinType == EComparisonPinType::Boolean)
	{
		if (ComparisonType.Equals(TEXT("Equal"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, EqualEqual_BoolBool);
		}
		else if (ComparisonType.Equals(TEXT("NotEqual"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, NotEqual_BoolBool);
		}
		else
		{
			OutError = FString::Printf(TEXT("Boolean variables only support Equal/NotEqual comparisons, not '%s'."), *ComparisonType);
			return nullptr;
		}
	}
	else if (PinType == EComparisonPinType::Integer)
	{
		if (ComparisonType.Equals(TEXT("Greater"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, Greater_IntInt);
		}
		else if (ComparisonType.Equals(TEXT("Less"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, Less_IntInt);
		}
		else if (ComparisonType.Equals(TEXT("GreaterEqual"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, GreaterEqual_IntInt);
		}
		else if (ComparisonType.Equals(TEXT("LessEqual"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, LessEqual_IntInt);
		}
		else if (ComparisonType.Equals(TEXT("Equal"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, EqualEqual_IntInt);
		}
		else if (ComparisonType.Equals(TEXT("NotEqual"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, NotEqual_IntInt);
		}
		else
		{
			OutError = FString::Printf(TEXT("Unknown comparison type: %s"), *ComparisonType);
			return nullptr;
		}
	}
	else if (PinType == EComparisonPinType::Byte || PinType == EComparisonPinType::Enum)
	{
		// Enums are stored as bytes in UE, so both share the ByteByte comparison functions
		if (ComparisonType.Equals(TEXT("Equal"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, EqualEqual_ByteByte);
		}
		else if (ComparisonType.Equals(TEXT("NotEqual"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, NotEqual_ByteByte);
		}
		else if (ComparisonType.Equals(TEXT("Greater"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, Greater_ByteByte);
		}
		else if (ComparisonType.Equals(TEXT("Less"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, Less_ByteByte);
		}
		else if (ComparisonType.Equals(TEXT("GreaterEqual"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, GreaterEqual_ByteByte);
		}
		else if (ComparisonType.Equals(TEXT("LessEqual"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, LessEqual_ByteByte);
		}
		else
		{
			OutError = FString::Printf(TEXT("Unknown comparison type for enum/byte: %s"), *ComparisonType);
			return nullptr;
		}
	}
	else
	{
		if (ComparisonType.Equals(TEXT("Greater"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, Greater_DoubleDouble);
		}
		else if (ComparisonType.Equals(TEXT("Less"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, Less_DoubleDouble);
		}
		else if (ComparisonType.Equals(TEXT("GreaterEqual"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, GreaterEqual_DoubleDouble);
		}
		else if (ComparisonType.Equals(TEXT("LessEqual"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, LessEqual_DoubleDouble);
		}
		else if (ComparisonType.Equals(TEXT("Equal"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, EqualEqual_DoubleDouble);
		}
		else if (ComparisonType.Equals(TEXT("NotEqual"), ESearchCase::IgnoreCase))
		{
			FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, NotEqual_DoubleDouble);
		}
		else
		{
			OutError = FString::Printf(TEXT("Unknown comparison type: %s"), *ComparisonType);
			return nullptr;
		}
	}

	UK2Node_CallFunction* CallNode = NewObject<UK2Node_CallFunction>(Graph);
	if (!CallNode)
	{
		OutError = TEXT("Failed to create comparison call function node");
		return nullptr;
	}

	CallNode->FunctionReference.SetExternalMember(FunctionName, UKismetMathLibrary::StaticClass());
	CallNode->NodePosX = static_cast<int32>(Position.X);
	CallNode->NodePosY = static_cast<int32>(Position.Y);

	Graph->AddNode(CallNode, false, false);
	CallNode->ReconstructNode();

	return CallNode;
}

UEdGraphNode* FAnimTransitionConditionFactory::CreateLogicNode(
	UEdGraph* Graph,
	const FString& LogicType,
	FVector2D Position,
	FString& OutError)
{
	if (!Graph)
	{
		OutError = TEXT("Invalid graph");
		return nullptr;
	}

	FName FunctionName;
	if (LogicType.Equals(TEXT("And"), ESearchCase::IgnoreCase))
	{
		FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, BooleanAND);
	}
	else if (LogicType.Equals(TEXT("Or"), ESearchCase::IgnoreCase))
	{
		FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, BooleanOR);
	}
	else if (LogicType.Equals(TEXT("Not"), ESearchCase::IgnoreCase))
	{
		FunctionName = GET_FUNCTION_NAME_CHECKED(UKismetMathLibrary, Not_PreBool);
	}
	else
	{
		OutError = FString::Printf(TEXT("Unknown logic type: %s"), *LogicType);
		return nullptr;
	}

	UK2Node_CallFunction* CallNode = NewObject<UK2Node_CallFunction>(Graph);
	if (!CallNode)
	{
		OutError = TEXT("Failed to create logic call function node");
		return nullptr;
	}

	CallNode->FunctionReference.SetExternalMember(FunctionName, UKismetMathLibrary::StaticClass());
	CallNode->NodePosX = static_cast<int32>(Position.X);
	CallNode->NodePosY = static_cast<int32>(Position.Y);

	Graph->AddNode(CallNode, false, false);
	CallNode->ReconstructNode();

	return CallNode;
}

UEdGraphNode* FAnimTransitionConditionFactory::CreateVariableGetNode(
	UEdGraph* Graph,
	UAnimBlueprint* AnimBP,
	const FString& VariableName,
	FVector2D Position,
	FString& OutError)
{
	if (!Graph || !AnimBP)
	{
		OutError = TEXT("Invalid graph or AnimBlueprint");
		return nullptr;
	}

	FProperty* Property = FindFProperty<FProperty>(AnimBP->GeneratedClass, *VariableName);
	if (!Property)
	{
		Property = FindFProperty<FProperty>(AnimBP->SkeletonGeneratedClass, *VariableName);
	}

	if (!Property)
	{
		OutError = FString::Printf(TEXT("Variable '%s' not found in AnimBlueprint"), *VariableName);
		return nullptr;
	}

	UK2Node_VariableGet* VarNode = NewObject<UK2Node_VariableGet>(Graph);
	if (!VarNode)
	{
		OutError = TEXT("Failed to create variable get node");
		return nullptr;
	}

	VarNode->VariableReference.SetSelfMember(FName(*VariableName));
	VarNode->NodePosX = static_cast<int32>(Position.X);
	VarNode->NodePosY = static_cast<int32>(Position.Y);

	Graph->AddNode(VarNode, false, false);
	VarNode->ReconstructNode();

	return VarNode;
}

// ===== Pin Type Auto-Detection Helpers =====

EComparisonPinType FAnimTransitionConditionFactory::DetectComparisonTypeFromPin(const UEdGraphPin* Pin)
{
	if (!Pin)
	{
		return EComparisonPinType::Float; // Default
	}

	const FName& Category = Pin->PinType.PinCategory;

	if (Category == UEdGraphSchema_K2::PC_Boolean)
	{
		return EComparisonPinType::Boolean;
	}
	else if (Category == UEdGraphSchema_K2::PC_Int)
	{
		return EComparisonPinType::Integer;
	}
	else if (Category == UEdGraphSchema_K2::PC_Byte)
	{
		// Check if it's an enum (has PinSubCategoryObject)
		if (Pin->PinType.PinSubCategoryObject.IsValid())
		{
			return EComparisonPinType::Enum;
		}
		return EComparisonPinType::Byte;
	}
	else if (Category == UEdGraphSchema_K2::PC_Enum)
	{
		return EComparisonPinType::Enum;
	}

	// Float/Double/Real are all handled as Float
	return EComparisonPinType::Float;
}

bool FAnimTransitionConditionFactory::IsComparisonNode(
	const UEdGraphNode* Node,
	FString& OutComparisonType,
	EComparisonPinType& OutPinType)
{
	const UK2Node_CallFunction* CallNode = Cast<UK2Node_CallFunction>(Node);
	if (!CallNode)
	{
		return false;
	}

	FName FunctionName = CallNode->FunctionReference.GetMemberName();
	FString FuncStr = FunctionName.ToString();

	if (FuncStr == TEXT("Greater_DoubleDouble"))
	{
		OutComparisonType = TEXT("Greater");
		OutPinType = EComparisonPinType::Float;
		return true;
	}
	else if (FuncStr == TEXT("Less_DoubleDouble"))
	{
		OutComparisonType = TEXT("Less");
		OutPinType = EComparisonPinType::Float;
		return true;
	}
	else if (FuncStr == TEXT("GreaterEqual_DoubleDouble"))
	{
		OutComparisonType = TEXT("GreaterEqual");
		OutPinType = EComparisonPinType::Float;
		return true;
	}
	else if (FuncStr == TEXT("LessEqual_DoubleDouble"))
	{
		OutComparisonType = TEXT("LessEqual");
		OutPinType = EComparisonPinType::Float;
		return true;
	}
	else if (FuncStr == TEXT("EqualEqual_DoubleDouble"))
	{
		OutComparisonType = TEXT("Equal");
		OutPinType = EComparisonPinType::Float;
		return true;
	}
	else if (FuncStr == TEXT("NotEqual_DoubleDouble"))
	{
		OutComparisonType = TEXT("NotEqual");
		OutPinType = EComparisonPinType::Float;
		return true;
	}
	else if (FuncStr == TEXT("Greater_IntInt"))
	{
		OutComparisonType = TEXT("Greater");
		OutPinType = EComparisonPinType::Integer;
		return true;
	}
	else if (FuncStr == TEXT("Less_IntInt"))
	{
		OutComparisonType = TEXT("Less");
		OutPinType = EComparisonPinType::Integer;
		return true;
	}
	else if (FuncStr == TEXT("GreaterEqual_IntInt"))
	{
		OutComparisonType = TEXT("GreaterEqual");
		OutPinType = EComparisonPinType::Integer;
		return true;
	}
	else if (FuncStr == TEXT("LessEqual_IntInt"))
	{
		OutComparisonType = TEXT("LessEqual");
		OutPinType = EComparisonPinType::Integer;
		return true;
	}
	else if (FuncStr == TEXT("EqualEqual_IntInt"))
	{
		OutComparisonType = TEXT("Equal");
		OutPinType = EComparisonPinType::Integer;
		return true;
	}
	else if (FuncStr == TEXT("NotEqual_IntInt"))
	{
		OutComparisonType = TEXT("NotEqual");
		OutPinType = EComparisonPinType::Integer;
		return true;
	}
	else if (FuncStr == TEXT("Greater_ByteByte"))
	{
		OutComparisonType = TEXT("Greater");
		OutPinType = EComparisonPinType::Byte;
		return true;
	}
	else if (FuncStr == TEXT("Less_ByteByte"))
	{
		OutComparisonType = TEXT("Less");
		OutPinType = EComparisonPinType::Byte;
		return true;
	}
	else if (FuncStr == TEXT("GreaterEqual_ByteByte"))
	{
		OutComparisonType = TEXT("GreaterEqual");
		OutPinType = EComparisonPinType::Byte;
		return true;
	}
	else if (FuncStr == TEXT("LessEqual_ByteByte"))
	{
		OutComparisonType = TEXT("LessEqual");
		OutPinType = EComparisonPinType::Byte;
		return true;
	}
	else if (FuncStr == TEXT("EqualEqual_ByteByte"))
	{
		OutComparisonType = TEXT("Equal");
		OutPinType = EComparisonPinType::Byte;
		return true;
	}
	else if (FuncStr == TEXT("NotEqual_ByteByte"))
	{
		OutComparisonType = TEXT("NotEqual");
		OutPinType = EComparisonPinType::Byte;
		return true;
	}
	else if (FuncStr == TEXT("EqualEqual_BoolBool"))
	{
		OutComparisonType = TEXT("Equal");
		OutPinType = EComparisonPinType::Boolean;
		return true;
	}
	else if (FuncStr == TEXT("NotEqual_BoolBool"))
	{
		OutComparisonType = TEXT("NotEqual");
		OutPinType = EComparisonPinType::Boolean;
		return true;
	}

	return false;
}

UEdGraphNode* FAnimTransitionConditionFactory::RecreateComparisonNodeWithType(
	UEdGraph* Graph,
	UEdGraphNode* ExistingNode,
	const FString& ComparisonType,
	EComparisonPinType NewPinType,
	FString& OutError)
{
	if (!Graph || !ExistingNode)
	{
		OutError = TEXT("Invalid graph or existing node");
		return nullptr;
	}

	int32 PosX = ExistingNode->NodePosX;
	int32 PosY = ExistingNode->NodePosY;

	FString ExistingNodeId;
	if (ExistingNode->NodeComment.StartsWith(TEXT("NodeId:")))
	{
		ExistingNodeId = ExistingNode->NodeComment.Mid(7);
	}

	// Snapshot pin B default and output connections so they can be restored on the new node
	FString PinBDefaultValue;
	UEdGraphPin* OldPinB = FAnimNodePinUtils::FindPinByName(ExistingNode, TEXT("B"), EGPD_Input);
	if (OldPinB)
	{
		PinBDefaultValue = OldPinB->DefaultValue;
	}

	TArray<UEdGraphPin*> OutputConnections;
	UEdGraphPin* OldOutput = FAnimNodePinUtils::FindPinByName(ExistingNode, TEXT("ReturnValue"), EGPD_Output);
	if (OldOutput)
	{
		OutputConnections = OldOutput->LinkedTo;
	}

	// Break links before removing to keep transition graph in valid state
	ExistingNode->BreakAllNodeLinks();
	Graph->RemoveNode(ExistingNode);

	bool bIsBooleanType = (NewPinType == EComparisonPinType::Boolean);
	TSharedPtr<FJsonObject> Params = MakeShared<FJsonObject>();
	UEdGraphNode* NewNode = CreateComparisonNode(
		Graph, ComparisonType, Params, FVector2D(PosX, PosY), OutError, bIsBooleanType, NewPinType);

	if (!NewNode)
	{
		return nullptr;
	}

	if (!ExistingNodeId.IsEmpty())
	{
		FAnimGraphEditor::SetNodeId(NewNode, ExistingNodeId);
	}

	if (!PinBDefaultValue.IsEmpty())
	{
		UEdGraphPin* NewPinB = FAnimNodePinUtils::FindPinByName(NewNode, TEXT("B"), EGPD_Input);
		if (NewPinB)
		{
			const UEdGraphSchema* Schema = Graph->GetSchema();
			if (Schema)
			{
				Schema->TrySetDefaultValue(*NewPinB, PinBDefaultValue);
			}
			else
			{
				NewPinB->DefaultValue = PinBDefaultValue;
			}
		}
	}

	UEdGraphPin* NewOutput = FAnimNodePinUtils::FindPinByName(NewNode, TEXT("ReturnValue"), EGPD_Output);
	if (NewOutput)
	{
		for (UEdGraphPin* ConnectedPin : OutputConnections)
		{
			if (ConnectedPin)
			{
				NewOutput->MakeLinkTo(ConnectedPin);
			}
		}
	}

	Graph->Modify();
	return NewNode;
}
