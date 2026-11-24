export function resolveAssetUrl(src: string, baseUrl: string = './'): string {
  if (!src) return src;
  if (/^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:') || src.startsWith('blob:')) {
    return src;
  }
  if (!src.startsWith('/')) {
    return src;
  }
  const cleanPath = src.replace(/^\/+/, '');
  const normalizedBase =
    !baseUrl || baseUrl === '/' ? './' : baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${cleanPath}`;
}
