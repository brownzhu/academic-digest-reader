import { escapeRegExp } from "../utils/text";

/** Text nodes only: email and search text are never interpreted as HTML/regex. */
export function highlightText(container: HTMLElement, text: string, query: string): HTMLElement[] {
  const marks: HTMLElement[] = [];
  container.replaceChildren();
  const trimmed = query.trim();
  if (!trimmed) { container.textContent = text; return marks; }
  let offset = 0;
  for (const match of text.matchAll(new RegExp(escapeRegExp(trimmed), "giu"))) {
    if (marks.length >= 1000) break;
    container.append(document.createTextNode(text.slice(offset, match.index)));
    const mark = document.createElement("mark");
    mark.textContent = match[0];
    container.append(mark);
    marks.push(mark);
    offset = match.index + match[0].length;
  }
  container.append(document.createTextNode(text.slice(offset)));
  return marks;
}
