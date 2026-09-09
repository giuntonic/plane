// Issue descriptions/comments come back as HTML from the Plane editor.
// This is a plain-text fallback for display; it is not meant to sanitize
// untrusted HTML for rendering — only to strip tags for a text preview.
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
