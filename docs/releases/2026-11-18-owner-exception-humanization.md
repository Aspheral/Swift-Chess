# One-time owner-authorized humanization release exception

**Release:** Swift v17 verified-plan-choice + experimental humanization passes 1–4.
**Requested:** 2026-11-18, in this chat, by the repository owner: "I'm allowing an exception this one time. Release the current version."
**Target:** GitHub `main`, Vercel production `swift-chess.vercel.app`.
**Starting candidate:** `608f21e41062ba43940f25a14e72e949c54e0e63` (draft v17 PR #58).
**Prior main:** `874ca5f30d3b33bc83937b1c7d6ad257fb196d89`.
**Release disposition:** OWNER-EXCEPTION / NOT HUMANITY-CERTIFIED.

## Evidence at release

- All three experimental patch stages were applied to the actual v17 checkout. The Pass 4 human.ts hunk required a context correction; the intended logic was applied manually and validated.
- Local full repository run: 391 Vitest tests passed, 1 skipped, in 76 passing files and 1 skipped file.
- TypeScript `pnpm typecheck`: PASS.
- Next.js `pnpm build`: PASS.
- Recent main changes merged without code conflicts.
- All four humanization passes are experimental. The full candidate-specific repeated-game suite, per-game manual move-by-move scores, human-control comparison, independent detector audits and calibrated Elo estimate are **NOT COMPLETE**.
- No evidence establishes a humanity score strictly greater than 90%, either individually or on average. The previously documented 61/100 is from an older single game of unknown model attribution, **not** this release.
- A passing unit suite does not prove tactical or competitive safety across full games.

## One-time exception and limitations

The owner explicitly requested a one-time exception to the normal humanization release gate and authorized immediate production deployment. This document records that exception rather than claiming the gate was satisfied. The standing policy in AGENTS.md and the future >90% per-game requirement are **not modified**. For every later playing-model release, normal conditions apply unless the owner independently grants a new explicit exception.

## Rollback

Previous production release on main: `874ca5f30d3b33bc83937b1c7d6ad257fb196d89`. If the site regresses, restore or promote the previously working production deployment; do not assume this candidate has proven Elo, manual humanization review or real-world reliability.
