# zeroize-audit 零化审计技能

Audits C/C++/Rust code for missing zeroization and compiler-removed wipes.
Pipeline: source scan → MCP/LSP semantic context → IR diff → assembly/MIR checks.

## Findings

- `MISSING_SOURCE_ZEROIZE`, `PARTIAL_WIPE`, `NOT_ON_ALL_PATHS`
- `OPTIMIZED_AWAY_ZEROIZE` (IR evidence required)
- `REGISTER_SPILL`, `STACK_RETENTION` (assembly evidence required for C/C++; LLVM IR evidence for Rust + optional assembly corroboration)
- `SECRET_COPY`, `INSECURE_HEAP_ALLOC`
- `MISSING_ON_ERROR_PATH`, `NOT_DOMINATING_EXITS`, `LOOP_UNROLLED_INCOMPLETE`

## 前提条件

### C/C++

- `compile_commands.json` is required (`compile_db` input field).
- Codebase must be buildable with commands from the compile DB.
- 必需 tools: `clang`, `uvx` (for Serena MCP server), `python3`.

```bash
which clang uvx python3
```

### Rust

- `Cargo.toml` path is required (`cargo_manifest` input field).
- Crate must be buildable (`cargo check` passes).
- 必需 tools: `cargo +nightly` toolchain, `uv`.

```bash
# Quick check
cargo +nightly --version
uv --version

# Full preflight validation (checks all tools, scripts, and optionally crate build)
tools/validate_rust_toolchain.sh --manifest path/to/Cargo.toml
tools/validate_rust_toolchain.sh --manifest path/to/Cargo.toml --json  # machine-readable
```

## Generate compile_commands.json (C/C++)

**CMake**
```bash
cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
```

**Make/Bear**
```bash
bear -- make -j$(nproc)
```

## 用法

**C/C++ only:**
```json
{ "path": ".", "compile_db": "compile_commands.json" }
```

**Rust only:**
```json
{ "path": ".", "cargo_manifest": "Cargo.toml" }
```

**Mixed C/C++ + Rust:**
```json
{
  "path": ".",
  "compile_db": "compile_commands.json",
  "cargo_manifest": "Cargo.toml",
  "opt_levels": ["O0", "O1", "O2"],
  "mcp_mode": "prefer"
}
```

**Full C/C++ input:**
```json
{
  "path": ".",
  "compile_db": "compile_commands.json",
  "opt_levels": ["O0", "O1", "O2"],
  "languages": ["c", "cpp"],
  "config": "skills/zeroize-audit/configs/default.yaml",
  "max_tus": 50,
  "mcp_mode": "prefer",
  "mcp_required_for_advanced": true,
  "mcp_timeout_ms": 10000
}
```

## Agent 架构

The analysis pipeline uses 10 agents across 8 phases, enabling parallel source analysis (C/C++ and Rust simultaneously), per-TU compiler analysis, mandatory PoC validation with verification, and protection against context pressure:

```
Phase 0: Orchestrator — Preflight + config + create workdir + enumerate TUs
Phase 1: Wave 1:  1-mcp-resolver              (skip if mcp_mode=off OR language_mode=rust)
         Wave 2a: 2-source-analyzer           (C/C++ only; skip if no compile_db)  ─┐ parallel
         Wave 2b: 2b-rust-source-analyzer     (Rust only; skip if no cargo_manifest) ─┘
Phase 2: Wave 3:  3-tu-compiler-analyzer x N  (C/C++ only; parallel, one per TU)
         Wave 3R: 3b-rust-compiler-analyzer   (Rust only; single agent, crate-level)
Phase 3: Wave 4:  4-report-assembler          (mode=interim → findings.json only)
Phase 4: Wave 5:  5-poc-generator             (mandatory; Rust findings marked poc_supported=false)
Phase 5: PoC Validation & Verification
         5a: 5b-poc-validator                 (compile and run all PoCs)
         5b: 5c-poc-verifier                  (verify each PoC proves its claimed finding)
         5c: Orchestrator presents verification failures to user
         5d: Orchestrator merges all results into poc_final_results.json
Phase 6: Wave 6:  4-report-assembler          (mode=final → merge PoC results, report)
Phase 7: Wave 7:  6-test-generator            (optional)
Phase 8: Orchestrator — Return final-report.md
```

| Agent | Phase | 目的 | Output Directory |