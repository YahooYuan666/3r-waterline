export type ModelTone = "gpt" | "claude" | "gemini" | "grok";

const TONE_PATTERNS: Array<{ tone: ModelTone; pattern: RegExp }> = [
  { tone: "claude", pattern: /claude|anthropic|米黄/i },
  { tone: "gemini", pattern: /gemini|google|pa ?consumers/i },
  { tone: "grok", pattern: /grok|xai|埃隆/i },
  { tone: "gpt", pattern: /gpt|openai|codex|chatgpt/i }
];

/**
 * Picks the colour family for a subscription or overlay page from its display
 * name. Names that match nothing fall back to the GPT family, which keeps the
 * default look stable for ordinary 3R subscriptions.
 */
export function modelToneFor(name: string | undefined | null): ModelTone {
  if (name == null) {
    return "gpt";
  }

  for (const { tone, pattern } of TONE_PATTERNS) {
    if (pattern.test(name)) {
      return tone;
    }
  }

  return "gpt";
}