# AfLingga 2026-11-09: when queen-for-rook is the least bad defense

## Evidence

Source: user-provided Chess.com 10+0 rapid PGN, SwiftChessTV (White, reported 2027) versus AfLingga (Black, reported 2051), 0-1 in 31 moves. Recorded game analysis link: https://www.chess.com/analysis/game/live/186828050378/analysis

The full game was replayed legally from its SAN score with Swift's own Board rules. The supplied final move is 31...Qd2#, checkmate. This documents the recorded position; no independent Chess.com engine evaluation was retrieved.

## Tactical failure point

After 27...Nxe4+ the exact legal position is:

    4kb2/p4p2/2p1p3/3p4/2pPnq2/2N5/PPP1K2r/1R2R1Q1 w - - 0 28

Black's knight vacates f2, uncovering the rook's second-rank check on the White king on e2. The rook on h2 is defended by Black's queen on f4.

**All four legal White replies, established by Swift's board generator and tests:**

- 28.Qxh2 Qxh2+ (g1h2 f4h2): queen for rook, a net material loss of 400 centipawns by independent static exchange.
- 28.Qf2 (g1f2): queen is exposed to an immediate 900-centipawn loss by legal capture.
- 28.Qg2 (g1g2): queen is exposed to an immediate 900-centipawn loss by legal capture.
- 28.Kd1 (e2d1) Qd2# (f4d2): **immediate legal checkmate**, verified by Board.isCheckmate.

This does **not** show a voluntary queen-for-rook blunder at move 28. Losing a queen is a defensive necessity in this concrete position, unless a line with even larger immediate loss is intended. The position is already critically lost.

A sampled new search on the exact position selected g1h2 at completed depth 4 (raw engine) and completed depth 4–5 (human player). The independent `immediateMaterialLoss` detector returned +400cp against the queen capture, and `staticExchange` returned -400cp. The current player therefore does not simply confuse queen and rook valuations.

A sampled depth-5 human trace returned a near-mate score; search depth and time-dependent outputs are diagnostic rather than stable correctness assertions.

## Correct training target

**The issue is earlier threat prevention.** The king became vulnerable to a coordinated queen, rook, and knight attack, ultimately allowing ...Rh2 and the discovered check ...Nxe4+. Future research should check White's earlier choices and Black's preparation before move 27, not install a rule that categorically rejects a queen-for-rook trade. Such a rule could choose 28.Kd1?? Qd2# and lose faster.

Potential future checks:

- Inspect strategic/king-safety alerts before ...Rh2 and the discovered rook check; distinguish actual check from a prepared discovery.
- When considering a queen sacrifice, compare legal opponent replies and mate threats, not only immediate material.
- Test the decision after 26...Rh2 and 27...Nxe4+, and evaluate whether Swift could play differently earlier at a matched completed search depth.
- Use paired full-game evidence before claiming better playing strength or human-likeness.

## Regression coverage

- `tests/fixtures/af-lingga.ts`: exact user game replay, 62 plies.
- `tests/af-lingga-queen-trap.test.ts`: checkmate final, legal queen recapture, all four legal defenses, +400cp net loss, and mate after 28.Kd1.
- Also records a bounded engine decision trace and confirms the emergency provisional guard does not blindly offer 28.Qxh2.

**No engine algorithm was changed in this diagnostic PR.** The newest user-provided rating was 2027, not a freshly calibrated rating for a changed build.
