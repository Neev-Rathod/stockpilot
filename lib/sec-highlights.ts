// Pure text-analysis for SEC filing highlighting: split a document into
// sentences and pick the ones that carry real investor signal (a figure plus
// a financial cue, or several strong cues). Whole important sentences are
// returned so the viewer can highlight them — not scattered keywords.

const FIGURE = /\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?%|\b\d{4,}\b/;

const CUES = [
  "revenue", "net income", "net loss", "earnings", "eps", "gross margin",
  "operating margin", "operating income", "net sales", "guidance", "outlook",
  "we expect", "we anticipate", "we believe", "we estimate", "compared to",
  "year-over-year", "year over year", "increased", "decreased", "declined",
  "grew", "growth", "dividend", "repurchas", "buyback", "acquisition",
  "impairment", "material adverse", "litigation", "goodwill", "cash flow",
  "free cash flow", "liquidity", "indebtedness", "backlog", "gross profit",
  "operating expenses", "restructuring", "guidance range", "record",
];

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z("“$'])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Importance score for a single sentence (0 = skip).
export function scoreSentence(sentence: string): number {
  if (sentence.length < 25 || sentence.length > 400) return 0;
  const lower = sentence.toLowerCase();
  const hasFigure = FIGURE.test(sentence);
  const cues = CUES.filter((c) => lower.includes(c)).length;
  if (hasFigure && cues >= 1) return 2 + cues;
  if (cues >= 2) return cues;
  if (hasFigure && /\bwe (expect|anticipate|believe|estimate|project)\b/.test(lower)) return 2;
  return 0;
}

// The most investor-relevant sentences, capped, returned in reading order.
export function importantSentences(text: string, cap = 12): string[] {
  const sentences = splitSentences(text);
  const scored = sentences
    .map((s, i) => ({ s, i, score: scoreSentence(s) }))
    .filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const keep = new Set(scored.slice(0, cap).map((x) => x.i));
  return sentences.filter((_, i) => keep.has(i));
}
