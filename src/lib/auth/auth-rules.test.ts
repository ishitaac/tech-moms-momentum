import { describe, expect, it } from "vitest";
import { canAuthor, canReview, normalizeRole } from "./roles";
import { loginHref, safeReturnTo } from "./return-to";

describe("roles", () => {
  it("only admins review; both roles author", () => {
    expect(canReview("admin")).toBe(true);
    expect(canReview("staff")).toBe(false);
    expect(canAuthor("admin")).toBe(true);
    expect(canAuthor("staff")).toBe(true);
  });
  it("unknown roles get least privilege", () => {
    expect(normalizeRole("superuser")).toBe("staff");
    expect(normalizeRole(undefined)).toBe("staff");
    expect(normalizeRole("admin")).toBe("admin");
  });
});

describe("safeReturnTo", () => {
  it("keeps same-site paths with query and hash", () => {
    expect(safeReturnTo("/pipeline")).toBe("/pipeline");
    expect(safeReturnTo("/?funder=12&band=Strong")).toBe("/?funder=12&band=Strong");
    expect(safeReturnTo("/approvals/4#history")).toBe("/approvals/4#history");
  });
  it("blocks open redirects", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/%0d%0aSet-Cookie:x", "\t/x"]) {
      const out = safeReturnTo(bad);
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
      expect(out).not.toContain("evil.example");
    }
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo(null)).toBe("/");
    expect(safeReturnTo("/" + "a".repeat(600))).toBe("/");
  });
  it("never loops back to auth pages or APIs", () => {
    expect(safeReturnTo("/login?next=/x")).toBe("/");
    expect(safeReturnTo("/reset-password")).toBe("/");
    expect(safeReturnTo("/api/calendar/all")).toBe("/");
  });
});

describe("loginHref", () => {
  it("builds the login link with next and reason", () => {
    expect(loginHref("/pipeline")).toBe("/login?next=%2Fpipeline");
    expect(loginHref("/", "expired")).toBe("/login?reason=expired");
    expect(loginHref("https://evil.example")).toBe("/login");
  });
});
