/**
 * Text Extraction from Various File Formats
 * Extracts plain text from uploaded documents for chunking/embedding.
 *
 * Supported formats:
 * - .txt, .md, .csv — pass-through
 * - .html — strip HTML tags
 * - .json — stringify with formatting
 * - .xml — strip XML tags
 *
 * Future: PDF and DOCX require external parsing services or Workers for Platforms.
 */

/**
 * Extract text content from a file based on its MIME type.
 */
export function extractText(content: string | ArrayBuffer, mimeType: string, fileName: string): string {
  const text = typeof content === 'string' ? content : new TextDecoder().decode(content);

  // Plain text formats — pass through
  if (
    mimeType.startsWith('text/') ||
    fileName.endsWith('.txt') ||
    fileName.endsWith('.md') ||
    fileName.endsWith('.csv') ||
    fileName.endsWith('.tsv') ||
    fileName.endsWith('.log')
  ) {
    return text;
  }

  // HTML — strip tags
  if (mimeType === 'text/html' || fileName.endsWith('.html') || fileName.endsWith('.htm')) {
    return stripHtml(text);
  }

  // JSON — pretty format
  if (mimeType === 'application/json' || fileName.endsWith('.json')) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }

  // XML — strip tags
  if (mimeType.includes('xml') || fileName.endsWith('.xml')) {
    return stripXml(text);
  }

  // Source code — pass through
  if (
    fileName.endsWith('.ts') || fileName.endsWith('.tsx') ||
    fileName.endsWith('.js') || fileName.endsWith('.jsx') ||
    fileName.endsWith('.py') || fileName.endsWith('.go') ||
    fileName.endsWith('.rs') || fileName.endsWith('.java') ||
    fileName.endsWith('.c') || fileName.endsWith('.cpp') ||
    fileName.endsWith('.rb') || fileName.endsWith('.php') ||
    fileName.endsWith('.sh') || fileName.endsWith('.yaml') ||
    fileName.endsWith('.yml') || fileName.endsWith('.toml')
  ) {
    return text;
  }

  // PDF — we can't parse binary PDF in a Worker without external help
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return '[PDF file — text extraction requires external parsing service. Upload as text instead.]';
  }

  // DOCX — same limitation
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileName.endsWith('.docx')
  ) {
    return '[DOCX file — text extraction requires external parsing service. Upload as text instead.]';
  }

  // Unknown format — try as text
  return text;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // remove scripts
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // remove styles
    .replace(/<[^>]+>/g, ' ')                           // strip tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')                               // collapse whitespace
    .trim();
}

function stripXml(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect if a file can be text-extracted.
 */
export function canExtractText(mimeType: string, fileName: string): boolean {
  const textMimes = ['text/', 'application/json', 'application/xml'];
  if (textMimes.some((m) => mimeType.startsWith(m))) return true;

  const textExts = [
    '.txt', '.md', '.csv', '.tsv', '.log', '.html', '.htm',
    '.json', '.xml', '.yaml', '.yml', '.toml',
    '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
    '.c', '.cpp', '.rb', '.php', '.sh',
  ];
  return textExts.some((ext) => fileName.endsWith(ext));
}
