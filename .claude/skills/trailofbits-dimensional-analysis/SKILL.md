# Dimensional Analysis Plugin

Add dimensional annotations to codebases and detect dimensional bugs. Uses an annotation format inspired by Reserve Protocol's Solidity conventions, but applicable to any language or protocol performing numeric arithmetic with mixed units, precisions, or scaling factors.

## Overview

This plugin runs one automatic workflow:
1. **Discover** the dimensional vocabulary in your codebase (tokens, shares, prices, etc.)
2. **Annotate** your code with dimensional comments like `D18{tok}`, `D27{UoA/tok}`
3. **Propagate** dimensions through arithmetic and call paths
4. **Validate** dimensional consistency and detect bugs

## Annotation Format

Based on Reserve Protocol's format (shown here in Solidity, but adaptable to any language):

```solidity
// State variables
uint256 public tvlFee; // D18{1/s} demurrage fee on AUM
uint256 public lastPoke; // {s}

// Struct fields
struct RebalanceLimits {
    uint256 low;  // D18{BU/share} (0, 1e27]
    uint256 spot; // D18{BU/share} (0, 1e27]
    uint256 high; // D18{BU/share} (0, 1e27]
}

// Function parameters (NatSpec)
/// @param weights D27{tok/BU} Basket weight ranges
/// @param prices D27{UoA/tok} Prices for each token
/// @return price D27{buyTok/sellTok}

// Inline arithmetic
// D27{buyTok/sellTok} = D27{UoA/sellTok} * D27 / D27{UoA/buyTok}
uint256 startPrice = Math.mulDiv(sellPrices.high, D27, buyPrices.low);
```

## Usage

The skill always executes in `full-auto` mode. Any supplied mode argument is ignored.

Workflow orchestration for all four phases lives in `skills/dimensional-analysis/SKILL.md`.

## Automatic Behavior

- Uses existing `DIMENSIONAL_UNITS.md` if present; otherwise auto-generates and saves it
- Persists `DIMENSIONAL_SCOPE.json` as a source-of-truth manifest for large repos
- Applies annotations directly without approval gates
- Uses best-guess inference for uncertainties and flags them in output
- Reports results in a single summary at the end

## Coverage Guarantees

- All in-scope arithmetic files from scanner output are required scope (CRITICAL/HIGH/MEDIUM/LOW)
- Discoverer narrowing (for vocabulary speed) does not reduce annotation or validation scope
- Each in-scope file must be marked as completed in Phase 2, Phase 3, and Phase 4 before finalization

## Agents

| Agent | Purpose |
|------MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 43 MINUTES 31 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE