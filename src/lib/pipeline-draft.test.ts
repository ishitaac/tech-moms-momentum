import { describe, expect, test } from "vitest";
import {
  buildMailtoHref,
  buildPipelineSystemPrompt,
  buildPipelineUserPrompt,
  draftTypeForStage,
  pipelineDraftInputSchema,
  pipelineDraftSchema,
} from "./pipeline-draft";

describe("draftTypeForStage", () => {
  test("prospect cards draft an outreach email", () => {
    expect(draftTypeForStage("prospect")).toBe("outreach_email");
  });

  test("LOI cards draft a letter of intent", () => {
    expect(draftTypeForStage("loi")).toBe("loi");
  });

  test("submitted, awarded and declined cards get no Gemini action", () => {
    expect(draftTypeForStage("submitted")).toBeNull();
    expect(draftTypeForStage("awarded")).toBeNull();
    expect(draftTypeForStage("declined")).toBeNull();
  });
});

describe("schemas", () => {
  test("funding purpose is required; amount and notes are optional", () => {
    expect(pipelineDraftInputSchema.safeParse({ purpose: " " }).success).toBe(false);
    const r = pipelineDraftInputSchema.safeParse({ purpose: "Trainers" });
    expect(r.success && r.data).toEqual({ purpose: "Trainers", amount: "", notes: "" });
  });

  test("draft output only allows the two pipeline draft types", () => {
    const base = { subject: "s", body: "b", factsUsed: [], factsToVerify: [] };
    expect(pipelineDraftSchema.safeParse({ ...base, draftType: "loi" }).success).toBe(true);
    expect(pipelineDraftSchema.safeParse({ ...base, draftType: "intro_email" }).success).toBe(false);
  });
});

describe("prompts", () => {
  test("email prompt caps length and forbids promises of funding", () => {
    const p = buildPipelineSystemPrompt("outreach_email");
    expect(p).toContain("Maximum 180 words");
    expect(p).toContain("Never present a fit score or match as a promise");
  });

  test("LOI prompt sets length and required sections", () => {
    const p = buildPipelineSystemPrompt("loi");
    expect(p).toContain("between 300 and 450 words");
    expect(p).toContain('"[Date]"');
    expect(p).toContain("[amount requested]");
  });

  test("user prompt falls back to the card amount, then a placeholder", () => {
    const base = { orgFacts: [], funderFacts: [], pastSupport: [], sourceUrls: [], stageName: "LOI", input: { purpose: "P", amount: "", notes: "" } };
    expect(buildPipelineUserPrompt({ ...base, amountAskedOnCard: "$15,000" })).toContain("Amount requested: $15,000");
    expect(buildPipelineUserPrompt({ ...base, amountAskedOnCard: null })).toContain("Amount requested: [amount requested]");
    expect(buildPipelineUserPrompt({ ...base, amountAskedOnCard: null })).toContain("PROVEN PAST SUPPORT:\n- None on record.");
  });
});

test("mailto link has no recipient", () => {
  expect(buildMailtoHref("A & B", "x\ny")).toBe("mailto:?subject=A%20%26%20B&body=x%0Ay");
});
