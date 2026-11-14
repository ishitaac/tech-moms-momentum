import { describe, expect, test } from "vitest";
import { quoteAppears } from "./extract";

describe("quoteAppears", () => {
  const page = "Our Community Grants   program accepts\nletters of inquiry until March 1, 2027.";

  test("matches ignoring case and whitespace", () => {
    expect(quoteAppears("accepts letters of inquiry until March 1, 2027", page)).toBe(true);
  });

  test("rejects invented or empty quotes", () => {
    expect(quoteAppears("applications due December 15", page)).toBe(false);
    expect(quoteAppears("", page)).toBe(false);
  });
});
