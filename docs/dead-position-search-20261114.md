# Swift endgame draw awareness, November 14, 2026

## Problem

Swift's `Game.result()` previously adjudicated common insufficient-material positions as draws, while both its main negamax search and quiescence search continued valuing the last bishop or knight as material with winning potential. A player should not treat a bare king-plus-bishop as a theoretical win. This can distort how Swift compares defensive continuations and offers draws.

## Fix

- `Board` now tracks its **non-king piece count** incrementally. This takes a constant amount of work on each move and allows the engine to skip any detailed dead-material scan when more than two non-king pieces remain.
- The conservative dead-position rules apply to bare kings, a single bishop or knight against a bare king, and two bishops confined to one square color. They match Swift's previous game adjudication in the supported cases.
- `Game.isInsufficientMaterial()` now delegates to `Board.isInsufficientMaterial()`. Both the main search and quiescence search return a drawn score for those positions.
- No extra search depth, arbitrary waiting, random material penalties, opening-book overrides, or changes to human-plan preference were added.

## Safety

Cases with a queen, rook or pawn, two knights, opposite-color bishops, and bishop-versus-knight are **not** classified as dead on material alone. Tests cover these controls plus a legal capture that removes the last enemy piece, material tracking through null moves and promotions, normal opening search, and human-style search.

The release tests include normal chess results and do not claim every technically drawn position is recognizable by this rule. This specifically fixes common *dead positions*, not perpetual check, positional fortress, or difficult theoretical endgame drawing technique.

## Elo and evidence

The user recently shared a screenshot showing **2061 Chess.com Rapid** on November 14. That is the latest reported account rating, **not** an independently measured rating of this new source change. Our next target remains 2100. Correct recognition of dead endgames is worthwhile, but a larger controlled match is still necessary to establish whether the change improves Elo.

[Development pull request](https://github.com/Aspheral/Swift-Chess/pull/55) contains the regression tests and full CI results.
