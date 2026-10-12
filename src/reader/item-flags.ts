import type { Digest } from "../domain/digest";
import type { DigestItem } from "../domain/item";
import { stableHash } from "../utils/text";

export interface ItemFlags { saved: boolean; read: boolean }
export type ItemFlagMap = Record<string, ItemFlags>;
import { FLAGS_PREFIX as PREFIX, isReadingFlags, readReadingData, writeReadingData } from "./reading-storage";
export const EMPTY_FLAGS: ItemFlags = { saved: false, read: false };

/** Scope by newsletter and content, rather than ordinal or parser-generated ID. */
export function itemFlagKey(digest: Digest, item: DigestItem): string {
  const identity = JSON.stringify([digest.newsletterName, digest.volume, digest.issue,
    digest.publicationDate?.iso, item.title, item.originalBody]);
  return PREFIX + stableHash(identity) + stableHash([...identity].reverse().join("")) + `-${identity.length}`;
}

export async function loadItemFlags(): Promise<ItemFlagMap> {
  const entries = await readReadingData();
  return Object.fromEntries(Object.entries(entries).filter(([key, value]) => key.startsWith(PREFIX) && isReadingFlags(value))) as ItemFlagMap;
}

// Separate item records keep updates to different newsletters independent.
export async function saveItemFlags(key: string, flags: ItemFlags): Promise<void> {
  if (!key.startsWith(PREFIX) || !isReadingFlags(flags)) throw new Error("Invalid reading-state record.");
  await writeReadingData(key, flags);
}
