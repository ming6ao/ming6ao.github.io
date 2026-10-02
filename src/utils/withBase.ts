const base = import.meta.env.BASE_URL.replace(/\/+$/, "");

/**
 * Prefix an asset or file path with the configured Astro `base`.
 * The site is served from the domain root, so `base` is empty and this is a
 * pass-through that keeps the call sites explicit.
 */
export function getAssetPath(path: string): string {
  const normalizedPath = path.replace(/^\/+/, "");

  if (!normalizedPath) {
    return base === "" ? "/" : base;
  }
  return `${base}/${normalizedPath}`;
}
