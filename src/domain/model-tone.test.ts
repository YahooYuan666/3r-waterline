import { describe, expect, it } from "vitest";

import { modelToneFor } from "./model-tone";

describe("modelToneFor", () => {
  it("maps each model family to its own tone", () => {
    expect(modelToneFor("GPT 4x")).toBe("gpt");
    expect(modelToneFor("Claude Max")).toBe("claude");
    expect(modelToneFor("Gemini")).toBe("gemini");
    expect(modelToneFor("Grok 直充")).toBe("grok");
  });

  it("matches case-insensitively and by provider aliases", () => {
    expect(modelToneFor("openai 额度")).toBe("gpt");
    expect(modelToneFor("ANTHROPIC 订阅")).toBe("claude");
    expect(modelToneFor("xAI")).toBe("grok");
  });

  it("falls back to the GPT family for unknown or missing names", () => {
    expect(modelToneFor("小加油包")).toBe("gpt");
    expect(modelToneFor(undefined)).toBe("gpt");
    expect(modelToneFor(null)).toBe("gpt");
  });
});