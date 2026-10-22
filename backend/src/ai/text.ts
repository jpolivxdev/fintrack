import { createHash } from 'node:crypto';

/** Collapses whitespace and removes control characters (defense in depth: DTOs already reject them). */
export function cleanText(value: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Lowercase, no accents, no digits: "Uber *Trip 4821" and "uber *trip 9934" share a cache entry. */
export function normalizeForMatch(value: string): string {
  return cleanText(value, 200)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cacheKey(type: string, description: string): string {
  return createHash('sha256').update(`${type}:${normalizeForMatch(description)}`).digest('hex');
}

/**
 * Wraps untrusted data so the model can tell it apart from instructions. The
 * system prompt says that anything inside <dados> is data, never instructions.
 * JSON escaping keeps the data from closing the tag.
 */
export function asData(payload: unknown): string {
  return `<dados>\n${JSON.stringify(payload).replace(/</g, '\\u003c')}\n</dados>`;
}

/** Inverse of asData (for the fake provider and tests). */
export function fromData(text: string): unknown {
  return JSON.parse(text.replace(/^<dados>\n|\n<\/dados>$/g, ''));
}
