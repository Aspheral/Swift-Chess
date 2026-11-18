# Lichess Human Policy Neural Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) for tracking.

**Goal:** Train a real, independently evaluated human-move policy on rated 1850–2550 Lichess game archives, ready to supplement but not replace Swift's tactical safety.
**Architecture:** Stream/filter PGN into split game JSONL; train a compact neural legal-move scorer; export weights/metrics; integrate optional preference on vetted candidate moves.
**Tech Stack:** Python 3.11, python-chess, zstandard, NumPy/PyTorch for training; TypeScript for Swift/browser; GitHub Actions.
**Spec:** `docs/superpowers/specs/2026-11-17-lichess-human-policy.md`.

## Global constraints
No production or Vercel preview deployment; no owner approval bypass. Rating range 1850–2550 both players. Use bulk official CC0 PGN. Game-level holdout. No fictitious model, accuracy, Elo or humanity percentage. Safe candidates only and feature default disabled.

### Task 1: Collector and quality manifest
- [ ] Write tests with PGN fixtures for rating, rated, bot, variant, time control, deterministic splits, malformed data and duplicates
- [ ] Verify tests fail against missing collector
- [ ] Implement streaming filtered PGN, emitting JSONL and manifest
- [ ] Run tests and show real data selection

### Task 2: Neural supervised learner and heldout evaluation
- [ ] Write tests for legal move candidates, perspective normalization, stable split and train/eval independence
- [ ] Verify tests fail
- [ ] Implement board and candidate features plus small PyTorch model, train/evaluate, export versioned weights
- [ ] Run short training on authentic Lichess archived games; record game count, accuracy, confidence, artifact hash

### Task 3: Optional Swift integration
- [ ] Write TypeScript regression tests for legal candidate human score bounded and disabled by default, no tactical override
- [ ] Verify expected failure
- [ ] Add typed model validator and inference in TypeScript, parity against Python vectors
- [ ] Wire preference only to already verified safe candidates with strict max bonus
- [ ] Run CI, full tests and build

### Task 4: Human-like behavior gate
- [ ] Run complete multi-opening games for exact commit and trained checkpoint
- [ ] Manually review every game move-by-move, publish 0–100 scores and independent detector context
- [ ] Estimate calibrated lab Elo and uncertainty, compare to v16
- [ ] Do not deploy without above-90 in each game, overall, and owner approval

**Gate:** If any training source is unavailable or testing is incomplete, report incomplete, not approved.
