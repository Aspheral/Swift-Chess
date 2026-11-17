# Swift humanity-first release gate: design specification

**Date:** 2026-11-17
**Status:** Owner's release criteria are binding; technical deployment-gate design awaits review.
**Scope:** All Swift engine/model revisions whose playing strength, move choice,
human-likeness, time use, learning, candidate generation, or planning behavior
could change in any Vercel environment. Historical URLs are not endorsements.

## Intent and priority

Swift's primary goal is to **play and reason like a human chess player**.
Elo is useful as a supporting benchmark, not the optimization target. A
human-like 2200 model may be preferable to a robotic 2500 model. Strategic
continuity, threat recognition, practical decisions, opponent awareness and
natural game flow are central. Higher Elo cannot compensate for losing these.
Strength should continue to grow alongside the creator, not outrun them.

Do not add artificial blunders, arbitrary waiting, or meaningless randomness
to game the humanization metric. Do not claim that engine disagreement alone
demonstrates human decision-making. Actual human game comparisons and blinded
ratings are desired additional evidence.

## Immediate operating rule

Before *any* new model is deployed, require:

- Full games in multiple openings and both colors, with complete scores and
  artifacts for *every* game including self-play, smoke games, aborted and
  unresolved tests.
- ChatGPT's **actual manual, move-by-move review of all those games**, with
  meaningful notes on every move, critical alternatives, why any move looked
  human or artificial, plan consistency, tactical losses, opponent replies,
  and whether the explanation matched actual selection.
- An Elo estimate **for the exact candidate commit** with sample size,
  W/D/L, score, estimation method, conditional confidence interval (or
  transparent unavailability), test time conditions, and explicit distinction
  between Stockfish UCI equivalents and Chess.com Rapid Elo.
- A **human-likeness percentage for every game and in aggregate**, obtained
  from the manually reviewed evidence and accompanied by the rubric and
  reviewer uncertainty. This is a *subjective 0–100 score*, never an
  objectively measured probability of being human.
- An honest v16-or-current-baseline comparison: human-likeness comes first,
  tactical reliability second, Elo third; regressions and tradeoffs disclosed.
- A release report with the exact commit hash, all verified artifacts and
  verdict: APPROVED, REJECTED or INCOMPLETE, and explicit owner approval.

**No completed manual report = no approval.** Automated analysis and CI alone
cannot approve a release, even when all games finished successfully.

## Manual review rubric (100 points per game)

| Dimension | Points | What a reviewer must inspect |
| --- | ---: | --- |
| Natural purposeful moves | 25 | Development, prophylaxis, exchanges, king activity, plausible move selection |
| Multi-move planning | 25 | Plan creation, execution, adaptation and abandonment when needed |
| Threat and tactical awareness | 20 | Checks, exchanges, tactical defense, sensible sacrifices, no mechanical oversight |
| Practical and opponent-aware adaptation | 20 | Opponent style, initiative, risk choices, position changes without arbitrary jumps |
| Plausible thinking rhythm | 10 | Position-dependent time, human-feasible choices rather than fixed/idle delays |

Give a score and rationale to **each game**, whether Swift won or lost.
Aggregate with an explicitly described arithmetic game average; include full
distribution, critical moves and common failure themes. Ideally use genuine
human Rapid game traces at a comparable skill and time control as a blinded
reference set; until that is implemented, call the percentage a *subjective
humanization audit*, not a validated classifier.

### Review workflow

1. Freeze commit SHA, engine profile, opening seeds, opponent versions and
   clocks. Do not allow a later commit to reuse the report.
2. Run an adequately sized paired, multi-opponent ladder with balanced colors;
   retain complete PGN plus per-ply engine decision trace in raw JSON.
3. Independently verify all legal move sequences, outcomes, missing/unresolved
   matches and record hashes. Automated engine analysis identifies forcing
   lines, potential tactical losses and ambiguous positions.
4. **Open and personally read every complete game.** For every ply, record
   the chosen move and its contextual explanation; for suspicious moves
   include opponent best reply, human plausibility, plans, tactics and
   alternative choices. Audit automated "human" labels for misleading cases.
   Not reviewing a game means the release report remains INCOMPLETE.
5. Make a signed-off per-game scorecard with all five rubric dimensions,
   prominent failed examples and full move coverage, then calculate a manual
   aggregate. Independently estimate Elo and conditional uncertainty.
6. Compare directly with the currently deployed candidate on controlled test
   positions. Present both strength and humanity changes with tradeoffs.
7. After the owner approves the complete report, authorize a model deployment.
   Retain the report in the repository for future sessions.

The assistant cannot autonomously work between conversations without an
explicitly scheduled tool workflow. "Manual review by ChatGPT" means an active
session really reads the games; a bot-created JSON file is insufficient.

## Release-gate approaches

**A. Instructions alone:** A README or agent guide promises review.
It is quick and preserves workflow, but has no technical barrier against
unreviewed Git-to-Vercel auto deployments. **Rejected as insufficient alone.**

**B. GitHub evidence checks:** CI requires complete game artifacts, a
per-commit release report and manual-review approval, protected branch and
mandatory review. This helps prevent unreviewed merges but automatic Vercel
previews can appear as soon as a branch is pushed unless separately disabled.

**C. Deploy only after manual promotion (recommended):** Maintain GitHub CI
for tests; disable automatic previews while evaluating candidates; require
signed release evidence and owner approval; prevent Git-based automatic
production promotion, then deploy exactly the approved commit through a
protected release workflow. This is the most faithful approach, but adds
administration and some manual release operations. Build and deployment
checks must reject mismatched SHAs and missing review documentation.

**Current execution:** The root `AGENTS.md` policy was committed to `main`.
Vercel accepted the setting `previewDeploymentsDisabled=true` (a subsequent
candidate push is needed to confirm operational behavior). The existing
Git-linked production branch still auto-deploys; a mandatory protected
release environment / production source restriction has NOT been configured,
so do not claim a complete hard technical gate yet.

## Current candidate disposition

- Production v16 remains the last measured release: internal Stockfish UCI
  equivalent 2385 from 120 games, conditional 95% band 2354–2422. This is
  *not* a Chess.com rating.
- Draft PR #58 v17 contains changes to human-like planning and passed CI and
  a 12-game smoke workflow. **It has NOT had every game manually reviewed
  against the above rubric, does NOT have a sufficiently grounded new Elo
  estimate, and has NO valid human-likeness percentage for release.**
- Therefore **PR #58 is NOT APPROVED for deployment**, regardless of CI status.
- Previous automatic preview builds predate this rule and do not certify a
  release.

## Implementation work after design approval

1. Add a deterministic, testable release-evidence validator in GitHub Actions:
   require complete per-game records, 100% matching SHA/game count, score
   dimensions 0–100, a nonempty manual review entry per played move, an Elo
   report with limitations, and explicit independent owner sign-off. Disallow
   synthetic reviews or copied aggregate engine metrics.
2. Require protected `main` branch and required checks/manual reviewers
   using repository administration where available. Do not assume current
   GitHub app access can edit branch protection.
3. Complete Vercel production release protection (manual promotion or
   Deployment Checks) without interrupting the currently live v16 site.
4. Validate by submitting a fake candidate with missing games or signatures
   and confirming that it cannot deploy. Validate a complete, approved
   fixture against the same release rule in a safe test environment.
