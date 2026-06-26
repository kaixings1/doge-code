// Copyright Natali Caggiano. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "MCP/MCPToolBase.h"

/**
 * MCP Tool: Query Blueprint information (read-only operations)
 *
 * Operations:
 *   - list: List all Blueprints in project (with optional filters)
 *   - inspect: Get detailed Blueprint info (variables, functions, parent class)
 *   - get_graph: Get graph information (node count, events)
 *   - get_nodes: Get all nodes in a specific graph
 *   - get_variables: Get all Blueprint variables (standalone)
 *   - get_functions: Get all Blueprint functions (standalone)
 *   - get_node_pins: Get detailed pin info for a specific node
 *   - search_nodes: Search nodes by name/class substring
 *   - find_references: Find references to a variable or function
 */
class FMCPTool_BlueprintQuery : public FMCPToolBase
{
public:
	virtual FMCPToolInfo GetInfo() const override
	{
		FMCPToolInfo Info;
		Info.Name = TEXT("blueprint_query");
		Info.Description = TEXT(
			"Query Blueprint information (read-only).\n\n"
			"Operations:\n"
			"- 'list': Find Blueprints in project with optional filters\n"
			"- 'inspect': Get detailed Blueprint info (variables, functions, parent class)\n"
			"- 'get_graph': Get graph structure (node count, events, connections)\n"
			"- 'get_nodes': Get all nodes in a specific graph\n"
			"- 'get_variables': Get all Blueprint variables (standalone, no inspect overhead)\n"
			"- 'get_functions': Get all Blueprint functions (standalone, no inspect overhead)\n"
			"- 'get_node_pins': Get detailed pin info for a specific node\n"
			"- 'search_nodes': Search nodes by name/class substring\n"
			"- 'find_references': Find references to a variable or function\n\n"
			"Use 'list' first to discover Blueprints, then other ops for details.\n\n"
			"Example paths:\n"
			"- '/Game/Blueprints/BP_Character'\n"
			"- '/Game/UI/WBP_MainMenu'\n"
			"- '/Game/Characters/ABP_Hero' (Animation Blueprint)\n\n"
			"Returns: Blueprint metadata, variables, functions, and/or graph structure."
		);
		Info.Parameters = {
			FMCPToolParameter(TEXT("operation"), TEXT("string"),
				TEXT("Operation: 'list', 'inspect', 'get_graph', 'get_nodes', 'get_variables', 'get_functions', 'get_node_pins', 'search_nodes', 'find_references'"), true),
			FMCPToolParameter(TEXT("path_filter"), TEXT("string"),
				TEXT("Path prefix filter (e.g., '/Game/Blueprints/')"), false, TEXT("/Game/")),
			FMCPToolParameter(TEXT("type_filter"), TEXT("string"),
				TEXT("Blueprint type filter: 'Actor', 'Object', 'Widget', 'AnimBlueprint', etc."), false),
			FMCPToolParameter(TEXT("name_filter"), TEXT("string"),
				TEXT("Name substring filter"), false),
			FMCPToolParameter(TEXT("limit"), TEXT("number"),
				TEXT("Maximum results to return (1-1000, default: 25)"), false, TEXT("25")),
			FMCPToolParameter(TEXT("blueprint_path"), TEXT("string"),
				TEXT("Full Blueprint asset path (required for inspect/get_graph)"), false),
			FMCPToolParameter(TEXT("include_variables"), TEXT("boolean"),
				TEXT("Include variable list in inspect result (default: false)"), false, TEXT("false")),
			FMCPToolParameter(TEXT("include_functions"), TEXT("boolean"),
				TEXT("Include function list in inspect result (default: false)"), false, TEXT("false")),
			FMCPToolParameter(TEXT("include_graphs"), TEXT("boolean"),
				TEXT("Include graph info in inspect result"), false, TEXT("false")),
			FMCPToolParameter(TEXT("graph_name"), TEXT("string"),
				TEXT("Graph name (for get_nodes/get_node_pins/search_nodes). Empty = all graphs or default EventGraph."), false),
			FMCPToolParameter(TEXT("node_id"), TEXT("string"),
				TEXT("Node ID or NodeGuid (required for get_node_pins)"), false),
			FMCPToolParameter(TEXT("query"), TEXT("string"),
				TEXT("Search query for search_nodes (matches node title and class, case-insensitive)"), false),
			FMCPToolParameter(TEXT("ref_name"), TEXT("string"),
				TEXT("Variable or function name (required for find_references)"), false),
			FMCPToolParameter(TEXT("ref_type"), TEXT("string"),
				TEXT("Reference type filter for find_references: 'variable', 'function', or empty for both"), false)
		};
		Info.Annotations = FMCPToolAnnotations::ReadOnly();
		return Info;
	}

	virtual FMCPToolResult Execute(const TSharedRef<FJsonObject>& Params) override;

private:
	/** List Blueprints matching filters */
	FMCPToolResult ExecuteList(const TSharedRef<FJsonObject>& Params);

	/** Get detailed Blueprint info */
	FMCPToolResult ExecuteInspect(const TSharedRef<FJsonObject>& Params);

	/** Get graph information */
	FMCPToolResult ExecuteGetGraph(const TSharedRef<FJsonObject>& Params);

	/** Get all nodes in a specific graph */
	FMCPToolResult ExecuteGetNodes(const TSharedRef<FJsonObject>& Params);

	/** Get all Blueprint variables (standalone) */
	FMCPToolResult ExecuteGetVariables(const TSharedRef<FJsonObject>& Params);

	/** Get all Blueprint functions (standalone) */
	FMCPToolResult ExecuteGetFunctions(const TSharedRef<FJsonObject>& Params);

	/** Get detailed pin info for a specific node */
	FMCPToolResult ExecuteGetNodePins(const TSharedRef<FJsonObject>& Params);

	/** Search nodes by name/class substring */
	FMCPToolResult ExecuteSearchNodes(const TSharedRef<FJsonObject>& Params);

	/** Find references to a variable or function */
	FMCPToolResult ExecuteFindReferences(const TSharedRef<FJsonObject>& Params);

	// --- Shared helpers ---

	/** Cached error from LoadAndValidateBlueprint */
	FMCPToolResult LastError;

	/** Load and validate a blueprint from Params["blueprint_path"]. Returns nullptr on failure (sets LastError). */
	UBlueprint* LoadAndValidateBlueprint(const TSharedRef<FJsonObject>& Params);

	/** Collect graphs to search. If GraphName is non-empty, finds that specific graph. Otherwise returns UbergraphPages + FunctionGraphs + MacroGraphs. */
	static TArray<UEdGraph*> CollectGraphs(UBlueprint* Blueprint, const FString& GraphName);

	/** Find a node by MCP ID or NodeGuid fallback. */
	static UEdGraphNode* FindNodeInGraphs(const TArray<UEdGraph*>& Graphs, const FString& NodeId, FString& OutGraphName);
};
