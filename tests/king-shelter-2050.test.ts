import { describe, expect, it } from "vitest";
import { Board, SwiftEngine } from "../src";

interface ShelterInspector {
  kingSafetyFromSquare(
    board: Board, square: number, color: "w" | "b",
    rights: string, pieces: number, queensPresent: boolean,
  ): number;
}
const shelter = new SwiftEngine() as unknown as ShelterInspector;

describe("middlegame king pawn shelter", () => {
  it("values complete, advanced and missing shelter in that order for White", () => {
    const intact = Board.fromFEN("6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1");
    const advanced = Board.fromFEN("6k1/8/8/8/8/6P1/5P1P/6K1 w - - 0 1");
    const missing = Board.fromFEN("6k1/8/8/8/8/8/5P1P/6K1 w - - 0 1");
    // The last two inputs simulate a middlegame via pieces/queens parameters.
    // This isolates king shelter from unrelated pawn material/PST scores.
    const measure = (board: Board) => shelter.kingSafetyFromSquare(board, 6, "w", "-", 20, true);
    expect(measure(intact)).toBeGreaterThan(measure(advanced));
    expect(measure(advanced)).toBeGreaterThan(measure(missing));
    expect(measure(intact) - measure(missing)).toBe(20);
  });

  it("is perfectly symmetric for Black's eighth-rank king", () => {
    const intact = Board.fromFEN("6k1/5ppp/8/8/8/8/8/6K1 b - - 0 1");
    const advanced = Board.fromFEN("6k1/5p1p/6p1/8/8/8/8/6K1 b - - 0 1");
    const missing = Board.fromFEN("6k1/5p1p/8/8/8/8/8/6K1 b - - 0 1");
    const measure = (board: Board) => shelter.kingSafetyFromSquare(board, 62, "b", "-", 20, true);
    expect(measure(intact)).toBeLessThan(measure(advanced));
    expect(measure(advanced)).toBeLessThan(measure(missing));
    expect(measure(missing) - measure(intact)).toBe(20);
  });

  it("does not apply opening-style shelter penalties in queenless technical endings", () => {
    const intact = Board.fromFEN("6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1");
    const missing = Board.fromFEN("6k1/8/8/8/8/8/5P1P/6K1 w - - 0 1");
    expect(shelter.kingSafetyFromSquare(intact, 6, "w", "-", 10, false))
      .toBe(shelter.kingSafetyFromSquare(missing, 6, "w", "-", 10, false));
  });

  it("still accepts advanced fianchetto shelter as useful partial protection", () => {
    const advanced = Board.fromFEN("6k1/8/8/8/8/6P1/5P1P/6K1 w - - 0 1");
    const missing = Board.fromFEN("6k1/8/8/8/8/8/5P1P/6K1 w - - 0 1");
    const advancedSafety = shelter.kingSafetyFromSquare(advanced, 6, "w", "-", 20, true);
    const missingSafety = shelter.kingSafetyFromSquare(missing, 6, "w", "-", 20, true);
    expect(advancedSafety - missingSafety).toBe(14);
  });
});
