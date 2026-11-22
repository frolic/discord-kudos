import { describe, expect, it } from "vitest";
import { parseMentions, stripMentions } from "./mentions.ts";

describe("parseMentions", () => {
  it("finds nothing in plain text", () => {
    expect(parseMentions("thanks everyone")).toEqual([]);
    expect(parseMentions("")).toEqual([]);
  });

  it("finds one or many, in the order they appear", () => {
    expect(parseMentions("<@102> shipped it")).toEqual(["102"]);
    expect(parseMentions("<@103> <@102> both of you")).toEqual(["103", "102"]);
  });

  it("accepts the nicknamed form", () => {
    expect(parseMentions("<@!102> hi")).toEqual(["102"]);
  });

  it("deduplicates, keeping first appearance", () => {
    expect(parseMentions("<@102> and <@102> again")).toEqual(["102"]);
    expect(parseMentions("<@103> <@102> <@103>")).toEqual(["103", "102"]);
  });

  it("does not treat a role or channel mention as a user", () => {
    expect(parseMentions("<@&102> <#103>")).toEqual([]);
  });
});

describe("stripMentions", () => {
  it("removes mentions and collapses the whitespace they leave", () => {
    expect(stripMentions("<@102> shipped it")).toBe("shipped it");
    expect(stripMentions("<@102> <@103> thanks")).toBe("thanks");
    expect(stripMentions("thanks <@102>")).toBe("thanks");
    expect(stripMentions("thanks <@102> for the review")).toBe("thanks for the review");
  });

  it("is empty when the text was only mentions", () => {
    expect(stripMentions("<@102>")).toBe("");
    expect(stripMentions(" <@102> <@!103> ")).toBe("");
  });

  it("keeps role and channel mentions, which are part of the reason", () => {
    expect(stripMentions("<@102> for <#103>")).toBe("for <#103>");
  });
});
