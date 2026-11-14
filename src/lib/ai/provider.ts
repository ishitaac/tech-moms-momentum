/**
 * Single place that knows which AI provider/model we use. Swap providers here or via env:
 *   AI_PROVIDER=anthropic AI_MODEL_EXTRACT=... AI_MODEL_EXPLAIN=...
 * To add OpenAI: `npm i @ai-sdk/openai`, add it to PROVIDERS, set AI_PROVIDER=openai.
 */
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export type ModelRole = "extract" | "explain";

const PROVIDERS: Record<string, (modelId: string) => LanguageModel> = {
  anthropic: (id) => anthropic(id),
};

const DEFAULT_MODELS: Record<ModelRole, string> = {
  extract: "claude-haiku-5-5",
  explain: "claude-sonnet-5-5",
};

/** USD per million tokens. Illustrative — check current prices before the demo (PRD §Cost). */
const PRICES_PER_MTOK: Record<ModelRole, { input: number; output: number }> = {
  extract: { input: 1, output: 5 },
  explain: { input: 3, output: 15 },
};

export function modelId(role: ModelRole): string {
  const env = role === "extract" ? process.env.AI_MODEL_EXTRACT : process.env.AI_MODEL_EXPLAIN;
  return env || DEFAULT_MODELS[role];
}

export function getModel(role: ModelRole): LanguageModel {
  const providerName = process.env.AI_PROVIDER || "anthropic";
  const factory = PROVIDERS[providerName];
  if (!factory) throw new Error(`Unknown AI_PROVIDER "${providerName}". Known: ${Object.keys(PROVIDERS).join(", ")}`);
  return factory(modelId(role));
}

/**
 * AI runs only with an explicit opt-in (AI_ENABLED=true). A provider key alone is not enough,
 * because an OS-level key (e.g. a personal ANTHROPIC_API_KEY) overrides .env files and would
 * otherwise spend on someone's account without them choosing to.
 */
export function isAiConfigured(): boolean {
  if (process.env.AI_ENABLED !== "true") return false;
  const providerName = process.env.AI_PROVIDER || "anthropic";
  if (providerName === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  return true;
}

export function estimateCostUsd(role: ModelRole, inputTokens: number, outputTokens: number): number {
  const p = PRICES_PER_MTOK[role];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** Accumulates token usage across a refresh and enforces the per-refresh cap. */
export class UsageMeter {
  tokensIn = 0;
  tokensOut = 0;
  costUsd = 0;
  calls = 0;

  constructor(private readonly cap: number) {}

  record(role: ModelRole, usage: { inputTokens?: number; outputTokens?: number } | undefined): void {
    const i = usage?.inputTokens ?? 0;
    const o = usage?.outputTokens ?? 0;
    this.tokensIn += i;
    this.tokensOut += o;
    this.costUsd += estimateCostUsd(role, i, o);
    this.calls += 1;
  }

  get exhausted(): boolean {
    return this.tokensIn + this.tokensOut >= this.cap;
  }
}
