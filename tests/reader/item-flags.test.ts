// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { itemFlagKey, loadItemFlags, saveItemFlags } from "../../src/reader/item-flags";
import { parseGoldenDigest } from "../helpers";

const digest = parseGoldenDigest();
const item = digest.items[0]!;
beforeEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("local reading marks", () => {
  it("survives reopening without storing any email title or text", async () => {
    const key = itemFlagKey(digest, item);
    await saveItemFlags(key, { saved: true, read: false });
    expect(await loadItemFlags()).toEqual({ [key]: { saved: true, read: false } });
    expect(key + localStorage.getItem(key)).not.toContain(item.title);
    expect(key + localStorage.getItem(key)).not.toContain(item.originalBody);
    await saveItemFlags(key, { saved: false, read: true });
    expect((await loadItemFlags())[key]).toEqual({ saved: false, read: true });
  });
  it("keeps identity when order changes and separates newsletters or changed content", () => {
    const key = itemFlagKey(digest, item);
    expect(itemFlagKey(digest, { ...item, originalIndex: 40, id: "changed" })).toBe(key);
    expect(itemFlagKey({ ...digest, newsletterName: "Another newsletter" }, item)).not.toBe(key);
    expect(itemFlagKey(digest, { ...item, originalBody: item.originalBody + " updated" })).not.toBe(key);
  });
  it("ignores damaged records without resetting unrelated settings", async () => {
    localStorage.setItem("displayMode", "dark");
    localStorage.setItem("reader.flags.v1.broken", "{bad json");
    localStorage.setItem("reader.flags.v1.wrong", JSON.stringify({ saved: "true", read: 1 }));
    expect(await loadItemFlags()).toEqual({});
    expect(localStorage.getItem("displayMode")).toBe("dark");
  });
  it("uses per-item Chrome records and propagates write failures", async () => {
    const set = vi.fn().mockRejectedValue(new Error("quota"));
    vi.stubGlobal("chrome", { storage: { local: { set, get: vi.fn(async () => ({})) } } });
    const key = itemFlagKey(digest, item);
    await expect(saveItemFlags(key, { saved: true, read: false })).rejects.toThrow("quota");
    expect(set).toHaveBeenCalledWith({ [key]: { saved: true, read: false } });
  });
});
