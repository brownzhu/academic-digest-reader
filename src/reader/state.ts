import type { DigestItem } from "../domain/item";

export type FilterValue =
  | "all"
  | "relevant"
  | "other"
  | "Conference"
  | "Postdoc"
  | "PhD"
  | "Faculty"
  | "Call for Papers"
  | "Software";

export type SortMode = "original" | "relevance" | "deadline" | "date";
export type DisplayMode = "system" | "light" | "dark";

export interface ReaderState {
  query: string;
  filter: FilterValue;
  sort: SortMode;
}

const PRIMARY_CATEGORIES = new Set([
  "Conference",
  "Postdoc",
  "PhD",
  "Faculty",
  "Call for Papers",
  "Software",
]);

function searchText(item: DigestItem): string {
  return [
    item.title,
    item.category,
    item.organization,
    item.location,
    item.sender,
    item.originalBody,
    ...item.tags,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLocaleLowerCase();
}

function matchesFilter(item: DigestItem, filter: FilterValue): boolean {
  if (filter === "all") return true;
  if (filter === "relevant") return item.relevance.score > 0;
  if (filter === "other") return !PRIMARY_CATEGORIES.has(item.category);
  return item.category === filter;
}

function sortDate(item: DigestItem): string | null {
  const meaningful = item.dates.find((date) =>
    ["event-start", "start-date", "application-open"].includes(date.kind),
  );
  return meaningful?.iso ?? item.messageDate?.iso ?? null;
}

function compareNullableDates(left: string | null, right: string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right);
}

export function selectItems(items: readonly DigestItem[], state: ReaderState): DigestItem[] {
  const query = state.query.trim().toLocaleLowerCase();
  const selected = items.filter(
    (item) => matchesFilter(item, state.filter) && (!query || searchText(item).includes(query)),
  );

  return selected.sort((left, right) => {
    if (state.sort === "relevance") {
      return right.relevance.score - left.relevance.score || left.originalIndex - right.originalIndex;
    }
    if (state.sort === "deadline") {
      return (
        compareNullableDates(left.deadline?.iso ?? null, right.deadline?.iso ?? null) ||
        left.originalIndex - right.originalIndex
      );
    }
    if (state.sort === "date") {
      return compareNullableDates(sortDate(left), sortDate(right)) || left.originalIndex - right.originalIndex;
    }
    return left.originalIndex - right.originalIndex;
  });
}

export interface DeadlineStatus {
  label: string;
  state: "normal" | "soon" | "expired" | "today";
  daysRemaining: number;
}

function localDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function deadlineStatus(iso: string, now = new Date()): DeadlineStatus {
  const [year, month, day] = iso.split("-").map(Number);
  const deadline = new Date(year!, month! - 1, day!);
  const millisecondsPerDay = 86_400_000;
  const daysRemaining = Math.round(
    (localDateOnly(deadline).getTime() - localDateOnly(now).getTime()) / millisecondsPerDay,
  );
  if (daysRemaining < 0) return { label: "Expired", state: "expired", daysRemaining };
  if (daysRemaining === 0) return { label: "Due today", state: "today", daysRemaining };
  if (daysRemaining <= 30) {
    return { label: `${daysRemaining} days remaining`, state: "soon", daysRemaining };
  }
  return { label: `${daysRemaining} days remaining`, state: "normal", daysRemaining };
}
