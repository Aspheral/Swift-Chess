# Swift Chess: standing instructions for AI agents

These project rules are owner-directed as of **2026-11-17** and supersede any
older statement that maximizing Elo is Swift's primary objective.

## Non-negotiable priority

**Human-like chess intelligence is Swift's highest goal.** Elo matters, but only
after the engine has credible human-like move selection, ongoing plans, context
sensitivity, and actual opponent-aware decision-making. A version that gains Elo
by becoming more like a deterministic calculation engine is not automatically
an improvement. Do not maximize engine agreement or add artificial blunders to
make moves look "human." Swift grows alongside its creator; freeze the live
strength if it becomes consistently stronger than the creator.

The 2500 Stockfish UCI-Elo-equivalent goal is a *secondary laboratory target*.
The separate Chess.com Rapid goal must not be conflated with Stockfish's
strength-limited setting.

## Mandatory >90% humanity quality gate (owner requirement, 2026-11-17)

**A changed Swift playing model must earn a manually reviewed human-likeness
score STRICTLY ABOVE 90/100 both in the across-game average and in every
individual reviewed test game.** A low-scoring game is a release blocker that
requires diagnosis and a new verified candidate; do not erase it from the
sample, quietly reclassify it, or inflate its rubric. This percentage is a
transparent, subjective human-chess plausibility audit, **not** a validated
probability that a person played the moves. Include rated-human reference
games and blinded judgments wherever possible.

As an independent cross-check, consult
<https://chesscheatdetector.com/how-it-works/> and analyze the completed
games with that detector when its submission facility is available.
Its Stockfish agreement, critical-decision agreement, average centipawn loss,
rating-conditioned human prediction and final anomaly classification are
research evidence. Record each analyzed game's exact input, date, score and
original results, and explicitly label results that the owner supplied rather
than pretending the assistant independently submitted them. Any
**strong/elevated engine-like flag must HOLD the release** until investigated
with full move/clock/plan traces; do not game the classifier or merely lower
engine accuracy to evade detection. A quiet detector is not sufficient for
release approval.

The November 17 SwiftChessTV vs mishacorn959a 65-move game is a **known
humanization regression fixture**, reviewed in
`docs/humanity-reviews/2026-11-17-swiftchesstv-vs-mishacorn959a.md`. The owner
reports detector concerns (49% top-1 agreement, 83% best-of-clear-gap decisions,
31cp average centipawn loss) and this sample is not approval evidence.

**Fair play:** All engine testing against humans must take place with clear
disclosure and platform authorization (or on Swift's own controlled site).
Do not use external detector metrics to conceal engine use in rated human
games.

## HARD RELEASE HOLD: all model versions, including previews

**Do not push, merge, promote, or intentionally deploy a changed Swift playing
model to ANY Vercel environment (preview, staging or production) unless all of
the following have been completed for that exact commit/profile:**

1. **Completed full games:** A documented, reproducible match suite covering
   multiple openings, both colors, varied opponent levels and relevant human
   positional scenarios. Retain ALL game records, including smoke tests,
   self-play, defeats, aborted/unresolved games, and any cherry-picked fixtures.
   Unresolved games cannot be reported as draws.
2. **Manual inspection of EVERY recorded game by ChatGPT:** The assistant must
   actually read the full move sequence and inspect Swift's decisions and the
   relevant opponent responses. For EVERY game record move-by-move judgments,
   tactical blunders and forced alternatives, strategic plan formation and
   continuation, deviations from natural play, and any suspicious engine-like
   or mechanical repetition. Automated PGN/engine audits may *support* this
   work, but cannot replace an individual game examination. Never describe
   an automated report as personally reviewed.
3. **An honest Elo estimate for the exact candidate:** Include the testing
   protocol, full W/D/L and game counts, methods, an appropriate uncertainty
   interval or explicit reason it cannot be estimated reliably, time-control
   limitations, and a clear distinction between internal UCI-limited-Stockfish
   equivalents and platform Rapid Elo. A score without an adequately
   grounded estimate does NOT pass the gate.
4. **A manual human-likeness percentage:** Publish one transparent 0–100 score
   PER GAME and a clearly described aggregate (game-weighted average) with
   supporting move-level evidence and a disclosed rubric. Suggested rubric:
   natural, purposeful move choice (25 points); coherent multi-move planning
   (25); opponent/threat awareness (20); human-like adaptation and practical
   decisions (20); realistic pace/decision process (10). The reviewer must
   explain exceptional/unusual moves and tactical losses and compare relevant
   cases with authentic human games when possible. This is a *subjective
   reviewer score*, NOT a statistically validated probability of being human.
   Never use search disagreement as a substitute for manual humanization.
5. **Baseline comparison and safety:** Report candidate vs currently deployed
   model, the human-likeness change, score/Elo change, tactical regressions,
   and any unresolved risks. Human-likeness takes priority over Elo, but safety
   losses, unverified tactics, or a fabricated score are not acceptable.
6. **Explicit release record and sign-off:** Save the complete per-game manual
   review, Elo report, humanity rubric/scores, artifacts, tested commit SHA,
   and an unequivocal release verdict (APPROVED / REJECTED / INCOMPLETE) in
   the repository or durable release artifacts. No evidence, no deployment.
   Deployment requires explicit owner approval, in addition to the report.

The assistant may prepare local branches, patches, or test-run experiments
without shipping a new playing model. GitHub Actions test execution is not a
Vercel model deployment. Do not use automatic preview deployments to bypass
the release hold. If auto-deployment is enabled, first address the release
control itself before pushing model-altering commits.

**Important practical limit:** These written instructions are a policy, not
a technical guarantee. Branch protection and Vercel deployment controls must
be separately configured to make unauthorized deployments impossible. AI
assistants cannot promise to continuously monitor every future game
independently of an active session; for each requested release they must read
and manually review the archived games in that session before proceeding.

## Current release inventory

- Production: `adaptive-human-v16` (latest observed stable live engine).
- Internal UCI-Elo-equivalent benchmark for v16: ~2385 across 120 games,
  conditional benchmark interval 2354–2422; not verified Chess.com Rapid Elo.
- v17 humanization candidate: draft PR #58, **not release-approved**.
  Existing preview URLs are historical automatic deployments, not evidence
  that its games passed manual review.
- Old v16 and v17 testing work is not retrospectively certified as manually
  reviewed merely because GitHub checks succeeded.

If in doubt, retain the currently deployed model and mark the candidate
INCOMPLETE. Humanization over Elo. Evidence over claims. Manual review before
model deployment.
