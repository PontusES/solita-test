import { describe, expect, it } from "vitest";
import { fakeEmbed, FakeEmbeddingProvider } from "@/knowledge/fakeEmbeddings";

describe("FakeEmbeddingProvider", () => {
  it("returns the same vector for the same text", async () => {
    const provider = new FakeEmbeddingProvider();
    const [first, second] = await provider.embed(["VPN is down", "VPN is down"]);

    expect(first).toEqual(second);
  });

  it("ignores case and punctuation", () => {
    expect(fakeEmbed("VPN, is down!")).toEqual(fakeEmbed("vpn is down"));
  });

  it("always returns the same dimension", () => {
    expect(fakeEmbed("short")).toHaveLength(256);
    expect(fakeEmbed("a much longer sentence with many more words in it")).toHaveLength(256);
  });

  it("returns a zero vector for empty text", () => {
    expect(fakeEmbed("").every((value) => value === 0)).toBe(true);
  });
});
