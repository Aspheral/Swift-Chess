import { describe, expect, it } from "vitest";
import { Board, swiftPlayProfile } from "../src";

describe("Swift browser play timing", () => {
  it("plays familiar opening positions quickly", () => {
    const profile = swiftPlayProfile(Board.start(), []);

    expect(profile.kind).toBe("opening");
    expect(profile.options.timeMs).toBeLessThan(400);
    expect(profile.minimumThinkMs).toBeLessThan(250);
  });

  it("spends more time when the king is under tactical pressure", () => {
    const calm = swiftPlayProfile(Board.start(), []);
    const tacticalBoard = Board.fromFEN("k3r3/8/8/8/8/8/8/4K3 w - - 0 1");
    const tactical = swiftPlayProfile(tacticalBoard, Array(16).fill("a2a3"));

    expect(tactical.kind).toBe("tactical");
    expect(tactical.options.timeMs ?? 0).toBeGreaterThan(calm.options.timeMs ?? 0);
    expect(tactical.minimumThinkMs).toBeGreaterThan(calm.minimumThinkMs);
  });

  it("uses an endgame budget instead of the full tactical budget in quiet endings", () => {
    const board = Board.fromFEN("4k3/8/8/8/8/8/8/4K1N1 w - - 0 1");
    const profile = swiftPlayProfile(board, Array(30).fill("h1h2"));

    expect(profile.kind).toBe("endgame");
    expect(profile.options.timeMs).toBeLessThan(760);
    expect(profile.options.safetyDepth).toBe(4);
  });
});
