import { describe, expect, test } from "vitest";
import {
  buildMailtoHref,
  buildSystemPrompt,
  buildUserPrompt,
  outreachDraftSchema,
  outreachInputSchema,
  pickDraftType,
} from "./outreach";

describe("pickDraftType", () => {
  test("verified past funder gets a reconnect email, whatever the route", () => {
    expect(pickDraftType({ isVerifiedPastFunder: true, route: "loi", acceptsUnsolicited: false })).toBe("reconnect_email");
  });

  test("new funder with LOI route gets an LOI", () => {
    expect(pickDraftType({ isVerifiedPastFunder: false, route: "loi", acceptsUnsolicited: null })).toBe("loi");
  });

  test("new funder with direct route gets an intro email", () => {
    expect(pickDraftType({ isVerifiedPastFunder: false, route: "direct", acceptsUnsolicited: true })).toBe("intro_email");
  });

  test("unknown or missing route gets a warm-introduction request", () => {
    expect(pickDraftType({ isVerifiedPastFunder: false, route: "unknown", acceptsUnsolicited: null })).toBe("warm_intro_request");
    expect(pickDraftType({ isVerifiedPastFunder: false, route: null, acceptsUnsolicited: true })).toBe("warm_intro_request");
  });

  test("no unsolicited requests gets a warm-introduction request even with a route", () => {
    expect(pickDraftType({ isVerifiedPastFunder: false, route: "direct", acceptsUnsolicited: false })).toBe("warm_intro_request");
  });
});

describe("outreachInputSchema", () => {
  test("requires a funding purpose", () => {
    expect(outreachInputSchema.safeParse({ purpose: "   " }).success).toBe(false);
  });

  test("amount and notes are optional", () => {
    const r = outreachInputSchema.safeParse({ purpose: "Trainers" });
    expect(r.success && r.data).toEqual({ purpose: "Trainers", amount: "", notes: "" });
  });

  test("rejects an overlong purpose", () => {
    expect(outreachInputSchema.safeParse({ purpose: "x".repeat(501) }).success).toBe(false);
  });
});

describe("outreachDraftSchema", () => {
  test("rejects an unknown draft type", () => {
    const r = outreachDraftSchema.safeParse({ draftType: "sms", subject: "", body: "", factsUsed: [], factsToVerify: [] });
    expect(r.success).toBe(false);
  });
});

describe("prompts", () => {
  test("system prompt forbids invented prior support and sets LOI length", () => {
    const p = buildSystemPrompt("loi");
    expect(p).toContain("Never say or imply the funder previously supported Tech-Moms");
    expect(p).toContain("between 300 and 450 words");
  });

  test("email prompts are capped at 180 words", () => {
    expect(buildSystemPrompt("intro_email")).toContain("under 180 words");
  });

  test("user prompt says no past support when none is on record", () => {
    const p = buildUserPrompt(["Mission: x"], ["Funder name: Y"], [], { purpose: "Trainers", amount: "", notes: "" });
    expect(p).toContain("PROVEN PAST SUPPORT:\n- None on record.");
    expect(p).toContain("Amount requested: [not specified]");
  });
});

describe("buildMailtoHref", () => {
  test("has no recipient and encodes subject and body", () => {
    const href = buildMailtoHref("Hi & thanks", "Line 1\nLine 2");
    expect(href).toBe("mailto:?subject=Hi%20%26%20thanks&body=Line%201%0ALine%202");
  });
});
