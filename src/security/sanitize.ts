import sanitizeHtml from 'sanitize-html';

/** Allowlist ketat: tanpa script/style/iframe/form, tanpa event handler, tanpa javascript:/data: URI. */
export function cleanRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'code', 'pre', 'span',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'figure', 'figcaption',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer nofollow',
          ...(attribs.target ? { target: '_blank' } : {}),
        },
      }),
    },
  });
}

/** Hapus null byte & karakter kontrol (kecuali tab/newline). */
export function stripControl(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** Nama file asli hanya untuk tampilan: buang path, karakter kontrol, dan batasi panjang. */
export function safeDisplayName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const clean = stripControl(base).replace(/[<>:"|?*]/g, '_').trim().slice(0, 120);
  return clean || 'file';
}
