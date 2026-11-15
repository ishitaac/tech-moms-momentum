import { describe, expect, it } from "vitest";
import { allowedFrom, canSend, contentHash, contentTypeOf, isMaterialChange, nextStatus, noteRequired, REVIEW_STATUSES, titleFor } from "./model";

describe("approval transitions", () => {
  it("follows draft → pending → approved / changes requested / rejected", () => {
    expect(nextStatus("submit", "draft")).toBe("pending_approval");
    expect(nextStatus("approve", "pending_approval")).toBe("approved");
    expect(nextStatus("request_changes", "pending_approval")).toBe("changes_requested");
    expect(nextStatus("reject", "pending_approval")).toBe("rejected");
    expect(nextStatus("submit", "changes_requested")).toBe("pending_approval");
  });

  it("refuses duplicate submissions and decisions outside pending", () => {
    expect(nextStatus("submit", "pending_approval")).toBeNull();
    expect(nextStatus("submit", "approved")).toBeNull();
    expect(nextStatus("submit", "rejected")).toBeNull();
    for (const s of REVIEW_STATUSES.filter((x) => x !== "pending_approval")) {
      expect(nextStatus("approve", s)).toBeNull();
      expect(nextStatus("reject", s)).toBeNull();
      expect(nextStatus("request_changes", s)).toBeNull();
    }
  });

  it("invalidates pending or approved content back to draft", () => {
    expect(nextStatus("invalidate", "approved")).toBe("draft");
    expect(nextStatus("invalidate", "pending_approval")).toBe("draft");
    expect(nextStatus("invalidate", "rejected")).toBeNull();
    expect(allowedFrom("approve")).toEqual(["pending_approval"]);
  });

  it("needs a note to reject or request changes, not to approve", () => {
    expect(noteRequired("reject")).toBe(true);
    expect(noteRequired("request_changes")).toBe(true);
    expect(noteRequired("approve")).toBe(false);
  });
});

describe("content hash / material change", () => {
  it("ignores whitespace-only edits", () => {
    expect(contentHash("Hello  world\r\n\nThanks ")).toBe(contentHash("Hello world\n\nThanks"));
    expect(isMaterialChange("Dear A,\nWe ask $5,000.", "Dear A,\n  We ask $5,000.  ")).toBe(false);
  });
  it("treats word or number changes as material", () => {
    expect(isMaterialChange("We ask $5,000.", "We ask $50,000.")).toBe(true);
    expect(contentHash("a")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("canSend (no unapproved external sending)", () => {
  const body = "Approved text";
  const h = contentHash(body);
  it("only approved content with a matching hash can be sent", () => {
    expect(canSend("approved", h, body)).toBe(true);
    expect(canSend("approved", h, body + " edited")).toBe(false);
    expect(canSend("pending_approval", h, body)).toBe(false);
    expect(canSend("draft", h, body)).toBe(false);
    expect(canSend("rejected", h, body)).toBe(false);
    expect(canSend(null, null, body)).toBe(false);
    expect(canSend("approved", null, body)).toBe(false);
  });
});

describe("content type and title from existing draft records", () => {
  it("recognises outreach vs grant drafts", () => {
    expect(contentTypeOf({ kind: "outreach" })).toBe("outreach");
    expect(contentTypeOf({ kind: "pipeline", pipelineItemId: 3 })).toBe("pipeline");
    expect(contentTypeOf({ orgFacts: {}, funderFacts: [] })).toBe("grant_draft");
    expect(contentTypeOf(null)).toBe("grant_draft");
  });
  it("uses the outreach subject when present", () => {
    expect(titleFor("outreach", "Acme Fdn", { subject: "Hello" })).toBe("Hello — Acme Fdn");
    expect(titleFor("pipeline", "Acme Fdn", { subject: "LOI" })).toBe("LOI — Acme Fdn");
    expect(titleFor("grant_draft", "Acme Fdn", {})).toBe("Grant proposal draft — Acme Fdn");
  });
});
