// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLAGS_PREFIX, observeReadingData, readReadingData, readingStorageNotice, writeReadingData } from "../../src/reader/reading-storage";

function storage(local: Record<string, unknown> = {}, remote: Record<string, unknown> = {}) {
  const localSet = vi.fn(async (entries: Record<string, unknown>) => { Object.assign(local, entries); });
  const syncSet = vi.fn(async (entries: Record<string, unknown>) => { Object.assign(remote, entries); });
  const addListener = vi.fn();
  const removeListener = vi.fn();
  vi.stubGlobal("chrome", { storage: {
    local: { get: vi.fn(async () => ({ ...local })), set: localSet },
    sync: { get: vi.fn(async () => ({ ...remote })), set: syncSet },
    onChanged: { addListener, removeListener },
  } });
  return { local, remote, localSet, syncSet, addListener, removeListener };
}

afterEach(() => vi.unstubAllGlobals());

describe("Chrome Sync reading preferences", () => {
  it("migrates only reading flags and theme, preserves originals and prefers existing cloud data", async () => {
    const key = FLAGS_PREFIX + "one";
    const second = FLAGS_PREFIX + "two";
    const env = storage({
      [key]: { saved: true, read: true },
      [second]: { saved: true, read: false, body: "PRIVATE EMAIL" },
      displayMode: "dark", emailBody: "PRIVATE EMAIL", tokens: "not for sync",
    }, { [key]: { saved: false, read: false }, displayMode: "light" });
    expect(await readReadingData()).toEqual({
      [key]: { saved: false, read: false }, [second]: { saved: true, read: false }, displayMode: "light",
    });
    expect(env.syncSet).toHaveBeenCalledExactlyOnceWith({ [second]: { saved: true, read: false } });
    expect(JSON.stringify(env.remote)).not.toContain("PRIVATE EMAIL");
    expect(env.local[key]).toEqual({ saved: true, read: true });
    expect(env.local["reader.syncMigration.v1"]).toBe(true);
  });

  it("does not mark a failed migration complete and can retry without losing local data", async () => {
    const key = FLAGS_PREFIX + "one";
    const env = storage({ [key]: { saved: true, read: false } });
    env.syncSet.mockRejectedValueOnce(new Error("sync quota"));
    await expect(readReadingData()).rejects.toThrow("sync quota");
    expect(env.local["reader.syncMigration.v1"]).toBeUndefined();
    expect(env.local[key]).toEqual({ saved: true, read: false });
    expect((await readReadingData())[key]).toEqual({ saved: true, read: false });
  });

  it("never resurrects old local marks after a completed migration", async () => {
    const key = FLAGS_PREFIX + "removed";
    const env = storage({ [key]: { saved: true, read: true }, "reader.syncMigration.v1": true });
    expect(await readReadingData()).toEqual({});
    expect(env.syncSet).not.toHaveBeenCalled();
  });

  it("writes only to sync, strips extra fields and exposes quota failures", async () => {
    const env = storage();
    const key = FLAGS_PREFIX + "one";
    await writeReadingData(key, { saved: true, read: false, title: "PRIVATE" });
    expect(env.syncSet).toHaveBeenLastCalledWith({ [key]: { saved: true, read: false } });
    expect(env.localSet).not.toHaveBeenCalled();
    env.syncSet.mockRejectedValueOnce(new Error("MAX_ITEMS"));
    await expect(writeReadingData("displayMode", "dark")).rejects.toThrow("MAX_ITEMS");
    expect(env.localSet).not.toHaveBeenCalled();
    await expect(writeReadingData("emailBody", "PRIVATE")).rejects.toThrow("Invalid reading preference");
  });

  it("subscribes to sync changes only and supports cleanup", () => {
    const env = storage();
    const callback = vi.fn();
    const stop = observeReadingData(callback);
    const listener = env.addListener.mock.calls[0]![0];
    const changes = { displayMode: { newValue: "dark" } };
    listener(changes, "local");
    expect(callback).not.toHaveBeenCalled();
    listener(changes, "sync");
    expect(callback).toHaveBeenCalledWith(changes);
    expect(readingStorageNotice()).toContain("same extension ID");
    stop();
    expect(env.removeListener).toHaveBeenCalledWith(listener);
  });

  it("keeps the browser preview local and never labels it as synced", async () => {
    localStorage.clear();
    await writeReadingData("displayMode", "dark");
    expect((await readReadingData()).displayMode).toBe("dark");
    expect(readingStorageNotice()).toContain("Local preview");
  });
});
