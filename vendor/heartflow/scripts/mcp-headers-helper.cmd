@echo off
rem HeartFlow MCP auth header helper (doge-code integration)
rem Reads MCP_HEARTFLOW_KEY from vendor\heartflow\.env and outputs Bearer token JSON
@node "%~dp0mcp-headers-helper.cjs"