export function escapeHtml(text: string): string {
  if (!text) return '';
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  return text.replace(/[&<>"'`=/]/g, (char) => htmlEscapes[char]);
}

export function escapeHtmlObject<T extends Record<string, unknown>>(obj: T, keys: (keyof T)[]): T {
  const escaped = { ...obj };
  for (const key of keys) {
    if (typeof escaped[key] === 'string') {
      (escaped as Record<string, unknown>)[key as string] = escapeHtml(escaped[key] as string);
    }
  }
  return escaped;
}
