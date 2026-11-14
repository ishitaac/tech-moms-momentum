/**
 * Isolated Gemini access for the Outreach Assistant. Server-only: the key never leaves the server.
 * Reads exactly two env vars and does not touch the global provider in ./provider.ts.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export type GeminiConfig = { ok: true; model: LanguageModel; modelId: string } | { ok: false };

export function getGeminiModel(): GeminiConfig {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  const modelId = process.env.AI_MODEL_EXPLAIN?.trim();
  if (!apiKey || !modelId) return { ok: false };
  const google = createGoogleGenerativeAI({ apiKey });
  return { ok: true, model: google(modelId), modelId };
}
