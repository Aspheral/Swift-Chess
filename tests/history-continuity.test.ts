import { describe, expect, it } from "vitest";
import { historyContinuity } from "../src/chess/history-continuity";

describe("Swift plan memory continuity", () => {
  const initial = "start w KQkq -";
  const after = "some other legal position";
  it("retains plans on repeated inspection and on append-only play", () => {
    expect(historyContinuity([], [], initial, initial)).toBe("same");
    expect(historyContinuity(["e2e4", "e7e5"], ["e2e4", "e7e5"], initial, initial)).toBe("same");
    expect(historyContinuity(["e2e4", "e7e5"], ["e2e4", "e7e5", "g1f3"], initial, after)).toBe("advanced");
  });
  it("rejects same-length alternative opponent replies and later forks", () => {
    expect(historyContinuity(["e2e4", "e7e5"], ["e2e4", "c7c5"], initial, after)).toBe("forked");
    expect(historyContinuity(["e2e4", "e7e5", "g1f3"], ["e2e4", "e7e5", "b1c3", "b8c6"], initial, after)).toBe("forked");
  });
  it("recognizes undo and a new board without matching history", () => {
    expect(historyContinuity(["e2e4", "e7e5"], ["e2e4"], initial, after)).toBe("forked");
    expect(historyContinuity([], [], initial, after)).toBe("forked");
    expect(historyContinuity([], [], "", initial)).toBe("same");
  });
});
