 

set ANTHROPIC_BASE_URL="http://127.0.0.1:8080"
set DOGE_API_KEY="sk-123456"
set ANTHROPIC_MODEL="qwen9b"
set CLAUDE_CODE_COMPATIBLE_API_PROVIDER="openai"

"e:\llama.cpp\build\bin\release\llama-server.exe" --model "D:\\LLM\\lmstudio-community\\Qwen3.5-9B-GGUF\\Qwen3.5-9B-Q4_K_M.gguf" --ctx-size 65536 --batch-size 2048 --ubatch-size 512 --n-gpu-layers 99 --cache-type-k q4_0 --cache-type-v q4_0 --temperature 0.7 --top-k 20 --top-p 0.8 --min-p 0 --repeat-penalty 1.05 --reasoning off --alias qwen9b --port 8080
&&
bun run dev

 
