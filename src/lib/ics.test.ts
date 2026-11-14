import { describe, expect, test } from "vitest";
import { buildIcs } from "./ics";

describe("buildIcs", () => {
  const ics = buildIcs(
    [{ uid: "p1", date: "2026-12-15", title: "Sorenson, Legacy; LOI due", description: "Line one\nLine two", url: "https://example.org" }],
    new Date("2026-11-13T12:00:00Z"),
  );

  test("produces a valid all-day VEVENT with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261215\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261216\r\n");
    expect(ics).toContain("DTSTAMP:20261113T120000Z\r\n");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  test("escapes commas, semicolons and newlines per RFC 5545", () => {
    expect(ics).toContain("SUMMARY:Sorenson\\, Legacy\\; LOI due");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  });

  test("includes a reminder alarm a week before", () => {
    expect(ics).toContain("TRIGGER:-P7D");
  });
});
