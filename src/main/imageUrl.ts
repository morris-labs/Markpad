/**
 * Decodes the file path from an image scheme URL.
 *
 * @returns The decoded path, or `null` when the URL has a malformed percent escape.
 */
export function imagePathFromUrl(requestUrl: string): string | null {
  try {
    return decodeURIComponent(new URL(requestUrl).pathname.slice(1));
  } catch {
    return null;
  }
}
