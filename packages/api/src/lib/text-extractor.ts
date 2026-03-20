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

  // HTML — strip tags (check before generic text/ mime)
  if (mimeType === 'text/html' || fileName.endsWith('.html') || fileName.endsWith('.htm')) {
    return stripHtml(text);
  }

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

  // PDF — extract raw text strings from binary (basic extraction)
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return extractPdfText(typeof content === 'string' ? content : new TextDecoder('latin1').decode(content));
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
  const textMimes = ['text/', 'application/json', 'application/xml', 'application/pdf'];
  if (textMimes.some((m) => mimeType.startsWith(m))) return true;

  const textExts = [
    '.txt', '.md', '.csv', '.tsv', '.log', '.html', '.htm',
    '.json', '.xml', '.yaml', '.yml', '.toml',
    '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
    '.c', '.cpp', '.rb', '.php', '.sh', '.pdf',
  ];
  return textExts.some((ext) => fileName.endsWith(ext));
}

/**
 * Basic PDF text extraction — extracts readable text strings from raw PDF binary.
 * This is a simple approach that works for text-heavy PDFs (not scanned images).
 * For production, use a proper PDF parsing service.
 */
function extractPdfText(raw: string): string {
  const texts: string[] = [];

  // Extract text between BT and ET operators (PDF text objects)
  const textObjRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = textObjRegex.exec(raw)) !== null) {
    const block = match[1];
    // Extract strings in parentheses: (text) Tj or (text) TJ
    const strRegex = /\(([^)]*)\)/g;
    let strMatch;
    while ((strMatch = strRegex.exec(block)) !== null) {
      const decoded = strMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, ' ')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      if (decoded.trim()) texts.push(decoded);
    }
  }

  // Also try to extract from stream content (for simpler PDFs)
  if (texts.length === 0) {
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    while ((match = streamRegex.exec(raw)) !== null) {
      // Look for readable ASCII text sequences
      const readable = match[1].replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').trim();
      if (readable.length > 20) texts.push(readable);
    }
  }

  const result = texts.join(' ').replace(/\s+/g, ' ').trim();
  return result || '[PDF text extraction found no readable text — file may contain images only]';
}
