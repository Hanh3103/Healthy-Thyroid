/**
 * Shared text-to-chip behavior for the pantry card and the plan questions.
 * Framework-free so the rules stay identical in both places.
 */
export const PANTRY_SEPARATOR = /[,\n\r]+/;

/** Trims, collapses whitespace and caps a single pantry chip label. */
export function cleanPantryItem(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Splits one pasted/typed value into cleaned names. */
export function splitPantryText(value: string): string[] {
  return value.split(PANTRY_SEPARATOR).map(cleanPantryItem).filter(Boolean);
}

/** Appends new names to a string list, ignoring case-insensitive duplicates. */
export function addPantryNames(items: string[], value: string): string[] {
  const next = [...items];
  const seen = new Set(next.map((item) => item.toLowerCase()));
  splitPantryText(value).forEach((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    next.push(name);
  });
  return next;
}

/** Backspace removes the last chip only when the text field is empty. */
export function backspacePantry(items: string[], draft: string): string[] {
  return draft ? items : items.slice(0, -1);
}
