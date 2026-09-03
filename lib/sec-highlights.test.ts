import { describe, it, expect } from "vitest";
import { splitSentences, scoreSentence, importantSentences } from "./sec-highlights";

describe("splitSentences", () => {
  it("splits on sentence boundaries", () => {
    const out = splitSentences("Revenue grew. We expect more. Thanks!");
    expect(out).toEqual(["Revenue grew.", "We expect more.", "Thanks!"]);
  });
});

describe("scoreSentence", () => {
  it("scores figure + cue sentences above fluff", () => {
    const important = scoreSentence("Net revenue increased 8% to $94.9 billion compared to the prior year.");
    const fluff = scoreSentence("The company is headquartered in Cupertino, California.");
    expect(important).toBeGreaterThan(0);
    expect(fluff).toBe(0);
  });
  it("ignores sentences that are too short or too long", () => {
    expect(scoreSentence("Revenue $5.")).toBe(0);
    expect(scoreSentence("revenue ".repeat(80))).toBe(0);
  });
});

describe("importantSentences", () => {
  it("keeps investor-relevant sentences, drops filler, and caps", () => {
    const text = [
      "Net revenue increased 12% to $50.1 billion driven by services.",
      "Our headquarters are in California.",
      "We expect operating margin to expand in fiscal 2027.",
      "The weather was pleasant that quarter.",
      "Gross margin was 46.2%, up from 44.1% year over year.",
    ].join(" ");
    const out = importantSentences(text, 12);
    expect(out).toContain("Net revenue increased 12% to $50.1 billion driven by services.");
    expect(out.some((s) => s.includes("Gross margin"))).toBe(true);
    expect(out).not.toContain("Our headquarters are in California.");
    expect(out.length).toBeLessThanOrEqual(12);
  });
});
