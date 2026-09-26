import { describe, expect, it } from "vitest";
import { TONE_EXAMPLES } from "./chat-mock";
import {
  liveOpeningExamples,
  resolveLiveDraftSource,
  type LiveOpeningExample,
} from "./live-opening-examples";

describe("live opening examples", () => {
  it("shows three starter sentences and reorders them for perspective", () => {
    expect(liveOpeningExamples("listen").map((item) => item.id)).toEqual([
      "listen",
      "organize",
      "uncertain",
    ]);
    expect(liveOpeningExamples("perspective").map((item) => item.text)).toEqual(
      [
        TONE_EXAMPLES[2].user,
        TONE_EXAMPLES[1].user,
        TONE_EXAMPLES[0].user,
      ],
    );
    expect(liveOpeningExamples("unsure")).toHaveLength(3);
  });

  it("keeps fixture only when the draft still equals the filled sentence", () => {
    const filled: LiveOpeningExample = {
      id: "listen",
      text: TONE_EXAMPLES[0].user,
    };
    expect(resolveLiveDraftSource(filled.text, filled)).toEqual({
      source: "fixture",
      fixtureId: "listen",
    });
    expect(resolveLiveDraftSource(`${filled.text} `, filled)).toEqual({
      source: "typed",
      fixtureId: null,
    });
    expect(resolveLiveDraftSource(`${filled.text.slice(0, -1)}요`, filled)).toEqual(
      {
        source: "typed",
        fixtureId: null,
      },
    );
    expect(resolveLiveDraftSource(filled.text, null)).toEqual({
      source: "typed",
      fixtureId: null,
    });
    expect(
      resolveLiveDraftSource(TONE_EXAMPLES[1].user, filled),
    ).toEqual({
      source: "typed",
      fixtureId: null,
    });
  });
});
