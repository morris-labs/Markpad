import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, parse } from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { ASSETS_DIR } from './drafts';
import { imagePathFromUrl } from './imageUrl';

export const IMAGE_SCHEME = 'mdimg';

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(IMAGE_TYPES).map(([ext, type]) => [type, ext]),
);

/** Registers the image scheme's privileges. Call this before the app is ready. */
export function registerImageSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: IMAGE_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ]);
}

/**
 * Serves local image files to the renderer.
 *
 * A URL has the form `mdimg://local/ENCODED_PATH`, where `ENCODED_PATH` is
 * the file's absolute path encoded with `encodeURIComponent`. Only files with
 * an image extension are served.
 */
export function handleImageScheme(): void {
  protocol.handle(IMAGE_SCHEME, async (request) => {
    const path = imagePathFromUrl(request.url);
    if (path === null) return new Response('Bad request', { status: 400 });
    const type = IMAGE_TYPES[extname(path).toLowerCase()];
    if (!type) return new Response('Not an image', { status: 403 });
    const response = await net.fetch(pathToFileURL(path).toString()).catch(() => null);
    if (!response?.ok) return new Response('Not found', { status: 404 });
    // The renderer page has a file: origin, so export reads images through CORS.
    return new Response(response.body, {
      headers: { 'content-type': type, 'access-control-allow-origin': '*' },
    });
  });
}

/** Image bytes to copy into a document's assets folder. */
export interface ImageImport {
  readonly name: string;
  readonly type: string;
  readonly bytes: Uint8Array;
}

/**
 * Copies an image into the `assets` folder next to a document.
 *
 * The file name keeps the original name and adds a short content hash, so the
 * same image pasted twice is stored once and different images never collide.
 *
 * @returns The image's path relative to the document, with forward slashes.
 */
export async function importImage(documentPath: string, image: ImageImport): Promise<string> {
  const parsed = parse(image.name);
  const ext =
    (IMAGE_TYPES[parsed.ext.toLowerCase()] ? parsed.ext : EXTENSION_BY_TYPE[image.type]) ?? '';
  if (!ext) throw new Error(`${image.name} isn't a supported image type.`);
  const stem =
    parsed.name
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'image';
  const hash = createHash('sha256').update(image.bytes).digest('hex').slice(0, 8);
  const fileName = `${stem}-${hash}${ext.toLowerCase()}`;
  const folder = join(dirname(documentPath), ASSETS_DIR);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, fileName), image.bytes);
  return `${ASSETS_DIR}/${fileName}`;
}

export const IMAGE_EXTENSIONS = Object.keys(IMAGE_TYPES).map((ext) => ext.slice(1));
