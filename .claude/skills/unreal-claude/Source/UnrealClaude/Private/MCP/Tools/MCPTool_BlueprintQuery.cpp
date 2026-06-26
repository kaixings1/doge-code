// Copyright Natali Caggiano. All Rights Reserved.

#include "MCPTool_BlueprintQuery.h"
#include "BlueprintUtils.h"
#include "BlueprintGraphEditor.h"
#include "MCP/MCPParamValidator.h"
#include "UnrealClaudeModule.h"
#include "Engine/Blueprint.h"
#include "K2Node_Variable.h"
#include "K2Node_CallFunction.h"

FMCPToolResult FMCPTool_BlueprintQuery::Execute(const TSharedRef<FJsonObject>& Params)
{
	FString Operation;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("operation"), Operation, Error))
	{
		return Error.GetValue();
	}

	Operation = Operation.ToLower();

	if (Operation == TEXT("list"))
	{
		return ExecuteList(Params);
	}
	else if (Operation == TEXT("inspect"))
	{
		return ExecuteInspect(Params);
	}
	else if (Operation == TEXT("get_graph"))
	{
		return ExecuteGetGraph(Params);
	}
	else if (Operation == TEXT("get_nodes"))
	{
		return ExecuteGetNodes(Params);
	}
	else if (Operation == TEXT("get_variables"))
	{
		return ExecuteGetVariables(Params);
	}
	else if (Operation == TEXT("get_functions"))
	{
		return ExecuteGetFunctions(Params);
	}
	else if (Operation == TEXT("get_node_pins"))
	{
		return ExecuteGetNodePins(Params);
	}
	else if (Operation == TEXT("search_nodes"))
	{
		return ExecuteSearchNodes(Params);
	}
	else if (Operation == TEXT("find_references"))
	{
		return ExecuteFindReferences(Params);
	}

	return FMCPToolResult::Error(FString::Printf(
		TEXT("Unknown operation: '%s'. Valid operations: 'list', 'inspect', 'get_graph', 'get_nodes', 'get_variables', 'get_functions', 'get_node_pins', 'search_nodes', 'find_references'"), *Operation));
}

// --- Shared helpers ---

UBlueprint* FMCPTool_BlueprintQuery::LoadAndValidateBlueprint(const TSharedRef<FJsonObject>& Params)
{
	FString BlueprintPath;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("blueprint_path"), BlueprintPath, Error))
	{
		LastError = Error.GetValue();
		return nullptr;
	}

	FString ValidationError;
	if (!FMCPParamValidator::ValidateBlueprintPath(BlueprintPath, ValidationError))
	{
		LastError = FMCPToolResult::Error(ValidationError);
		return nullptr;
	}

	FString LoadError;
	UBlueprint* Blueprint = FBlueprintUtils::LoadBlueprint(BlueprintPath, LoadError);
	if (!Blueprint)
	{
		LastError = FMCPToolResult::Error(LoadError);
		return nullptr;
	}

	return Blueprint;
}

TArray<UEdGraph*> FMCPTool_BlueprintQuery::CollectGraphs(UBlueprint* Blueprint, const FString& GraphName)
{
	TArray<UEdGraph*> Graphs;
	if (!GraphName.IsEmpty())
	{
		FString FindError;
		UEdGraph* Graph = FBlueprintGraphEditor::FindGraph(Blueprint, GraphName, true, FindError);
		if (!Graph) Graph = FBlueprintGraphEditor::FindGraph(Blueprint, GraphName, false, FindError);
		if (Graph) Graphs.Add(Graph);
	}
	else
	{
		Graphs.Append(Blueprint->UbergraphPages);
		Graphs.Append(Blueprint->FunctionGraphs);
		Graphs.Append(Blueprint->MacroGraphs);
	}
	return Graphs;
}

UEdGraphNode* FMCPTool_BlueprintQuery::FindNodeInGraphs(
	const TArray<UEdGraph*>& Graphs, const FString& NodeId, FString& OutGraphName)
{
	for (UEdGraph* Graph : Graphs)
	{
		if (!Graph) continue;

		// Accept either MCP-assigned ID or raw NodeGuid — query responses expose both, callers commonly pass either
		UEdGraphNode* Node = FBlueprintGraphEditor::FindNodeById(Graph, NodeId);
		if (Node)
		{
			OutGraphName = Graph->GetName();
			return Node;
		}

		for (UEdGraphNode* N : Graph->Nodes)
		{
			if (N && N->NodeGuid.ToString() == NodeId)
			{
				OutGraphName = Graph->GetName();
				return N;
			}
		}
	}
	return nullptr;
}

// --- New operations (get_nodes, get_variables, get_functions, get_node_pins, search_nodes, find_references) ---

FMCPToolResult FMCPTool_BlueprintQuery::ExecuteGetNodes(const TSharedRef<FJsonObject>& Params)
{
	UBlueprint* Blueprint = LoadAndValidateBlueprint(Params);
	if (!Blueprint) return LastError;

	FString GraphName = ExtractOptionalString(Params, TEXT("graph_name"));
	int32 Limit = FMath::Clamp(ExtractOptionalNumber<int32>(Params, TEXT("limit"), 100), 1, 1000);

	TArray<UEdGraph*> TargetGraphs = CollectGraphs(Blueprint, GraphName);
	if (TargetGraphs.Num() == 0 && !GraphName.IsEmpty())
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Graph '%s' not found"), *GraphName));
	}

	TArray<TSharedPtr<FJsonValue>> NodesArray;
	int32 TotalNodes = 0;

	for (UEdGraph* Graph : TargetGraphs)
	{
		if (!Graph) continue;
		for (UEdGraphNode* Node : Graph->Nodes)
		{
			if (!Node) continue;
			TotalNodes++;
			if (NodesArray.Num() >= Limit) continue;

			TSharedPtr<FJsonObject> NodeObj = FBlueprintGraphEditor::SerializeNodeInfo(Node);
			NodeObj->SetStringField(TEXT("title"), Node->GetNodeTitle(ENodeTitleType::FullTitle).ToString());
			NodeObj->SetStringField(TEXT("node_guid"), Node->NodeGuid.ToString());
			NodeObj->SetStringField(TEXT("graph"), Graph->GetName());
			NodesArray.Add(MakeShared<FJsonValueObject>(NodeObj));
		}
	}

	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetArrayField(TEXT("nodes"), NodesArray);
	Result->SetNumberField(TEXT("count"), NodesArray.Num());
	Result->SetNumberField(TEXT("total"), TotalNodes);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d nodes (showing %d)"), TotalNodes, NodesArray.Num()), Result);
}

FMCPToolResult FMCPTool_BlueprintQuery::ExecuteGetVariables(const TSharedRef<FJsonObject>& Params)
{
	UBlueprint* Blueprint = LoadAndValidateBlueprint(Params);
	if (!Blueprint) return LastError;

	TArray<TSharedPtr<FJsonValue>> Variables = FBlueprintUtils::GetBlueprintVariables(Blueprint);

	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetArrayField(TEXT("variables"), Variables);
	Result->SetNumberField(TEXT("count"), Variables.Num());

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d variables"), Variables.Num()), Result);
}

FMCPToolResult FMCPTool_BlueprintQuery::ExecuteGetFunctions(const TSharedRef<FJsonObject>& Params)
{
	UBlueprint* Blueprint = LoadAndValidateBlueprint(Params);
	if (!Blueprint) return LastError;

	TArray<TSharedPtr<FJsonValue>> Functions = FBlueprintUtils::GetBlueprintFunctions(Blueprint);

	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetArrayField(TEXT("functions"), Functions);
	Result->SetNumberField(TEXT("count"), Functions.Num());

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d functions/events"), Functions.Num()), Result);
}

FMCPToolResult FMCPTool_BlueprintQuery::ExecuteGetNodePins(const TSharedRef<FJsonObject>& Params)
{
	UBlueprint* Blueprint = LoadAndValidateBlueprint(Params);
	if (!Blueprint) return LastError;

	FString NodeId;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("node_id"), NodeId, Error))
	{
		return Error.GetValue();
	}

	FString GraphName = ExtractOptionalString(Params, TEXT("graph_name"));
	TArray<UEdGraph*> SearchGraphs = CollectGraphs(Blueprint, GraphName);
	if (SearchGraphs.Num() == 0 && !GraphName.IsEmpty())
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Graph '%s' not found"), *GraphName));
	}

	FString FoundGraphName;
	UEdGraphNode* FoundNode = FindNodeInGraphs(SearchGraphs, NodeId, FoundGraphName);
	if (!FoundNode)
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Node '%s' not found"), *NodeId));
	}

	TArray<TSharedPtr<FJsonValue>> PinsArray;
	for (UEdGraphPin* Pin : FoundNode->Pins)
	{
		if (!Pin) continue;

		TSharedPtr<FJsonObject> PinObj = MakeShared<FJsonObject>();
		PinObj->SetStringField(TEXT("name"), Pin->PinName.ToString());
		PinObj->SetStringField(TEXT("direction"), Pin->Direction == EGPD_Input ? TEXT("Input") : TEXT("Output"));
		PinObj->SetStringField(TEXT("type"), FBlueprintEditor::PinTypeToString(Pin->PinType));

		if (!Pin->DefaultValue.IsEmpty())
		{
			PinObj->SetStringField(TEXT("default_value"), Pin->DefaultValue);
		}

		// Emit both MCP ID and GUID per connection so callers can use whichever they have on hand
		TArray<TSharedPtr<FJsonValue>> Connections;
		for (UEdGraphPin* LinkedPin : Pin->LinkedTo)
		{
			if (!LinkedPin || !LinkedPin->GetOwningNode()) continue;
			UEdGraphNode* LinkedNode = LinkedPin->GetOwningNode();

			TSharedPtr<FJsonObject> ConnObj = MakeShared<FJsonObject>();
			ConnObj->SetStringField(TEXT("node_id"), FBlueprintGraphEditor::GetNodeId(LinkedNode));
			ConnObj->SetStringField(TEXT("node_guid"), LinkedNode->NodeGuid.ToString());
			ConnObj->SetStringField(TEXT("pin_name"), LinkedPin->PinName.ToString());
			Connections.Add(MakeShared<FJsonValueObject>(ConnObj));
		}
		PinObj->SetArrayField(TEXT("connected_to"), Connections);

		PinsArray.Add(MakeShared<FJsonValueObject>(PinObj));
	}

	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetStringField(TEXT("node_id"), FBlueprintGraphEditor::GetNodeId(FoundNode));
	Result->SetStringField(TEXT("node_guid"), FoundNode->NodeGuid.ToString());
	Result->SetStringField(TEXT("node_class"), FoundNode->GetClass()->GetName());
	Result->SetStringField(TEXT("node_title"), FoundNode->GetNodeTitle(ENodeTitleType::FullTitle).ToString());
	Result->SetStringField(TEXT("graph"), FoundGraphName);
	Result->SetArrayField(TEXT("pins"), PinsArray);
	Result->SetNumberField(TEXT("pin_count"), PinsArray.Num());

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Node '%s' has %d pins"), *NodeId, PinsArray.Num()), Result);
}

FMCPToolResult FMCPTool_BlueprintQuery::ExecuteSearchNodes(const TSharedRef<FJsonObject>& Params)
{
	UBlueprint* Blueprint = LoadAndValidateBlueprint(Params);
	if (!Blueprint) return LastError;

	FString Query;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("query"), Query, Error))
	{
		return Error.GetValue();
	}

	FString GraphName = ExtractOptionalString(Params, TEXT("graph_name"));
	int32 Limit = FMath::Clamp(ExtractOptionalNumber<int32>(Params, TEXT("limit"), 50), 1, 500);

	TArray<UEdGraph*> SearchGraphs = CollectGraphs(Blueprint, GraphName);
	if (SearchGraphs.Num() == 0 && !GraphName.IsEmpty())
	{
		return FMCPToolResult::Error(FString::Printf(TEXT("Graph '%s' not found"), *GraphName));
	}

	TArray<TSharedPtr<FJsonValue>> Matches;
	int32 TotalMatches = 0;

	for (UEdGraph* Graph : SearchGraphs)
	{
		if (!Graph) continue;
		for (UEdGraphNode* Node : Graph->Nodes)
		{
			if (!Node) continue;

			FString Title = Node->GetNodeTitle(ENodeTitleType::FullTitle).ToString();
			FString ClassName = Node->GetClass()->GetName();

			if (!Title.Contains(Query, ESearchCase::IgnoreCase) &&
				!ClassName.Contains(Query, ESearchCase::IgnoreCase))
			{
				continue;
			}

			TotalMatches++;
			if (Matches.Num() >= Limit) continue;

			TSharedPtr<FJsonObject> NodeObj = FBlueprintGraphEditor::SerializeNodeInfo(Node);
			NodeObj->SetStringField(TEXT("title"), Title);
			NodeObj->SetStringField(TEXT("node_guid"), Node->NodeGuid.ToString());
			NodeObj->SetStringField(TEXT("graph"), Graph->GetName());
			Matches.Add(MakeShared<FJsonValueObject>(NodeObj));
		}
	}

	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetStringField(TEXT("query"), Query);
	Result->SetArrayField(TEXT("matches"), Matches);
	Result->SetNumberField(TEXT("count"), Matches.Num());
	Result->SetNumberField(TEXT("total_matches"), TotalMatches);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d nodes matching '%s' (showing %d)"), TotalMatches, *Query, Matches.Num()), Result);
}

FMCPToolResult FMCPTool_BlueprintQuery::ExecuteFindReferences(const TSharedRef<FJsonObject>& Params)
{
	UBlueprint* Blueprint = LoadAndValidateBlueprint(Params);
	if (!Blueprint) return LastError;

	FString RefName;
	TOptional<FMCPToolResult> Error;
	if (!ExtractRequiredString(Params, TEXT("ref_name"), RefName, Error))
	{
		return Error.GetValue();
	}

	FString RefType = ExtractOptionalString(Params, TEXT("ref_type")).ToLower();
	bool bSearchVariables = RefType.IsEmpty() || RefType == TEXT("variable");
	bool bSearchFunctions = RefType.IsEmpty() || RefType == TEXT("function");
	int32 Limit = FMath::Clamp(ExtractOptionalNumber<int32>(Params, TEXT("limit"), 100), 1, 1000);

	// FName comparison is case-insensitive — matches UE convention for blueprint variable/function lookups
	FName RefFName(*RefName);

	TArray<TSharedPtr<FJsonValue>> References;
	int32 TotalMatches = 0;

	TArray<UEdGraph*> AllGraphs = CollectGraphs(Blueprint, FString());

	for (UEdGraph* Graph : AllGraphs)
	{
		if (!Graph) continue;

		for (UEdGraphNode* Node : Graph->Nodes)
		{
			if (!Node) continue;
			bool bMatched = false;

			if (bSearchVariables)
			{
				if (UK2Node_Variable* VarNode = Cast<UK2Node_Variable>(Node))
				{
					if (VarNode->GetVarName() == RefFName)
					{
						bMatched = true;
					}
				}
			}

			if (!bMatched && bSearchFunctions)
			{
				if (UK2Node_CallFunction* CallNode = Cast<UK2Node_CallFunction>(Node))
				{
					if (CallNode->FunctionReference.GetMemberName() == RefFName)
					{
						bMatched = true;
					}
				}
			}

			if (bMatched)
			{
				TotalMatches++;
				if (References.Num() >= Limit) continue;

				TSharedPtr<FJsonObject> RefObj = MakeShared<FJsonObject>();
				RefObj->SetStringField(TEXT("node_id"), FBlueprintGraphEditor::GetNodeId(Node));
				RefObj->SetStringField(TEXT("node_guid"), Node->NodeGuid.ToString());
				RefObj->SetStringField(TEXT("node_class"), Node->GetClass()->GetName());
				RefObj->SetStringField(TEXT("node_title"), Node->GetNodeTitle(ENodeTitleType::FullTitle).ToString());
				RefObj->SetStringField(TEXT("graph"), Graph->GetName());
				RefObj->SetNumberField(TEXT("pos_x"), Node->NodePosX);
				RefObj->SetNumberField(TEXT("pos_y"), Node->NodePosY);
				References.Add(MakeShared<FJsonValueObject>(RefObj));
			}
		}
	}

	TSharedPtr<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetStringField(TEXT("ref_name"), RefName);
	Result->SetStringField(TEXT("ref_type"), RefType.IsEmpty() ? TEXT("any") : *RefType);
	Result->SetArrayField(TEXT("references"), References);
	Result->SetNumberField(TEXT("count"), References.Num());
	Result->SetNumberField(TEXT("total_matches"), TotalMatches);

	return FMCPToolResult::Success(
		FString::Printf(TEXT("Found %d references to '%s' (showing %d)"), TotalMatches, *RefName, References.Num()), Result);
}
