import { describe, expect, it } from "vitest";
import { can, isPublicPath, primaryRole, rolesOf, safeRedirectPath } from "./roles";

describe("role permissions", () => {
  it("admin can decide, manage users and do everything staff can", () => {
    for (const p of ["app:use", "draft:generate", "draft:edit", "review:submit", "review:view", "review:decide", "users:manage"] as const) {
      expect(can("admin", p)).toBe(true);
    }
  });

  it("staff can draft, edit and submit but not approve or manage users", () => {
    expect(can("staff", "draft:generate")).toBe(true);
    expect(can("staff", "draft:edit")).toBe(true);
    expect(can("staff", "review:submit")).toBe(true);
    expect(can("staff", "review:view")).toBe(true);
    expect(can("staff", "review:decide")).toBe(false);
    expect(can("staff", "review:edit-as-reviewer")).toBe(false);
    expect(can("staff", "users:manage")).toBe(false);
  });

  it("fails closed for missing or unknown roles", () => {
    expect(can(null, "app:use")).toBe(false);
    expect(can("", "app:use")).toBe(false);
    expect(can("user", "app:use")).toBe(false);
    expect(can("superadmin", "review:decide")).toBe(false);
  });

  it("handles Better Auth's comma-separated multi-role strings", () => {
    expect(rolesOf("staff, admin")).toEqual(["staff", "admin"]);
    expect(primaryRole("staff,admin")).toBe("admin");
    expect(can("staff,admin", "review:decide")).toBe(true);
  });
});

describe("safeRedirectPath (post-login redirect)", () => {
  it("keeps same-origin relative paths with query", () => {
    expect(safeRedirectPath("/pipeline")).toBe("/pipeline");
    expect(safeRedirectPath("/approvals?status=all")).toBe("/approvals?status=all");
  });
  it("blocks open redirects and odd input", () => {
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", "/login?next=/x", "/api/auth/x", "/ok\r\nSet-Cookie: x", "", null, undefined]) {
      expect(safeRedirectPath(bad as string)).toBe("/");
    }
  });
});

describe("isPublicPath (sign-in gate)", () => {
  it("only auth pages, the auth API and cron are public", () => {
    for (const p of ["/login", "/forgot-password", "/reset-password", "/api/auth/sign-in/email", "/api/cron/refresh"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/", "/pipeline", "/approvals", "/approvals/3", "/team", "/settings", "/api/calendar/all", "/login-help", "/api/authx"]) expect(isPublicPath(p)).toBe(false);
  });
});
