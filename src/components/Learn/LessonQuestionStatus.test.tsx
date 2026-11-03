import { describe, it, expect } from "vitest";
import { deriveQuestionStatus } from "./LessonQuestionStatus";

describe("deriveQuestionStatus", () => {
  it("returns none when unhydrated or total is 0", () => {
    expect(
      deriveQuestionStatus(
        { attempts: [{ questionIndex: 0 }], bestScore: 0, attemptCount: 0 },
        3,
        false
      )
    ).toEqual({ state: "none", answered: 0, total: 3 });

    expect(
      deriveQuestionStatus(
        { attempts: [], bestScore: 0, attemptCount: 0 },
        0,
        true
      )
    ).toEqual({ state: "none", answered: 0, total: 0 });
  });

  it("returns partial when some questions answered", () => {
    expect(
      deriveQuestionStatus(
        { attempts: [{ questionIndex: 0 }, { questionIndex: 0 }], bestScore: 0, attemptCount: 0 },
        3,
        true
      )
    ).toEqual({ state: "partial", answered: 1, total: 3 });
  });

  it("returns done when all unique questions are answered", () => {
    expect(
      deriveQuestionStatus(
        {
          attempts: [
            { questionIndex: 0 },
            { questionIndex: 1 },
            { questionIndex: 2 },
          ],
          bestScore: 100,
          attemptCount: 0,
        },
        3,
        true
      )
    ).toEqual({ state: "done", answered: 3, total: 3 });
  });

  it("returns done when attemptCount > 0 even if attempts array was reset on retake", () => {
    expect(
      deriveQuestionStatus(
        { attempts: [], bestScore: 85, attemptCount: 1 },
        4,
        true
      )
    ).toEqual({ state: "done", answered: 4, total: 4, bestScore: 85 });
  });
});
