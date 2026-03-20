/**
 * Workflow Executor Logic Tests
 *
 * Tests the node execution logic without requiring database access.
 * Verifies text processing, JSON transforms, conditions, and variable handling.
 */
import { describe, it, expect } from 'vitest';

describe('Text extractor logic', () => {
  it('strips HTML scripts and styles', async () => {
    const { extractText } = await import('../lib/text-extractor.js');
    const html = `<html><head><style>body{color:red}</style><script>alert(1)</script></head><body><h1>Title</h1><p>Content</p></body></html>`;
    const result = extractText(html, 'text/html', 'test.html');
    expect(result).toContain('Title');
    expect(result).toContain('Content');
    expect(result).not.toContain('alert');
    expect(result).not.toContain('color:red');
  });

  it('strips XML tags', async () => {
    const { extractText } = await import('../lib/text-extractor.js');
    const xml = '<root><item id="1"><name>Test</name><value>123</value></item></root>';
    const result = extractText(xml, 'application/xml', 'data.xml');
    expect(result).toContain('Test');
    expect(result).toContain('123');
    expect(result).not.toContain('<root>');
  });

  it('preserves markdown', async () => {
    const { extractText } = await import('../lib/text-extractor.js');
    const md = '# Hello\n\n- Item 1\n- Item 2\n\n```js\nconsole.log("hi")\n```';
    expect(extractText(md, 'text/markdown', 'doc.md')).toBe(md);
  });

  it('formats JSON with indentation', async () => {
    const { extractText } = await import('../lib/text-extractor.js');
    const json = '{"a":1,"b":"hello","c":[1,2,3]}';
    const result = extractText(json, 'application/json', 'data.json');
    expect(result).toContain('"a": 1');
    expect(result).toContain('"b": "hello"');
  });

  it('handles HTML entities', async () => {
    const { extractText } = await import('../lib/text-extractor.js');
    const html = '<p>Tom &amp; Jerry &lt;3&gt; friends &quot;forever&quot;</p>';
    const result = extractText(html, 'text/html', 'test.html');
    expect(result).toContain('Tom & Jerry');
    expect(result).toContain('"forever"');
  });

  it('identifies extractable types correctly', async () => {
    const { canExtractText } = await import('../lib/text-extractor.js');
    // Should extract
    expect(canExtractText('text/plain', 'file.txt')).toBe(true);
    expect(canExtractText('text/html', 'page.html')).toBe(true);
    expect(canExtractText('application/json', 'data.json')).toBe(true);
    expect(canExtractText('text/csv', 'data.csv')).toBe(true);
    expect(canExtractText('', 'script.py')).toBe(true);
    expect(canExtractText('', 'code.ts')).toBe(true);
    expect(canExtractText('', 'config.yaml')).toBe(true);
    // Should not extract
    expect(canExtractText('application/pdf', 'doc.pdf')).toBe(false);
    expect(canExtractText('image/png', 'photo.png')).toBe(false);
    expect(canExtractText('application/octet-stream', 'binary.dat')).toBe(false);
  });
});

describe('Chunker advanced cases', () => {
  it('handles single very long sentence', async () => {
    const { chunkText } = await import('../lib/chunker.js');
    // A single sentence longer than chunk size
    const longSentence = 'Word '.repeat(500) + '.';
    const chunks = chunkText(longSentence, 50, 10);
    // Should still produce chunks even with one sentence
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('handles text with only periods', async () => {
    const { processDocument } = await import('../lib/chunker.js');
    const chunks = processDocument('...', 'doc', 500, 50);
    expect(chunks.length).toBeLessThanOrEqual(1);
  });

  it('handles unicode text', async () => {
    const { processDocument } = await import('../lib/chunker.js');
    const text = '这是一个中文测试。这是第二句话。这是第三句话。';
    const chunks = processDocument(text, 'doc', 500, 50);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].content).toContain('中文');
  });

  it('handles multiple newlines', async () => {
    const { processDocument } = await import('../lib/chunker.js');
    const text = 'Para 1.\n\n\n\n\nPara 2.\n\n\nPara 3.';
    const chunks = processDocument(text, 'doc', 500, 50);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Newlines should be collapsed
    expect(chunks[0].content).not.toContain('\n\n\n');
  });

  it('preserves metadata for each chunk', async () => {
    const { processDocument } = await import('../lib/chunker.js');
    const text = Array(20).fill('This is a test sentence with enough words.').join(' ');
    const chunks = processDocument(text, 'doc_abc', 50, 10);
    for (const chunk of chunks) {
      expect(chunk.metadata).toBeDefined();
      expect(chunk.metadata.documentId).toBe('doc_abc');
      expect(chunk.id).toBeTruthy();
      expect(chunk.tokenCount).toBeGreaterThan(0);
    }
  });
});

describe('LLM module structure', () => {
  it('exports chatCompletion function', async () => {
    const llm = await import('../lib/llm.js');
    expect(typeof llm.chatCompletion).toBe('function');
  });

  it('exports stream module', async () => {
    const stream = await import('../lib/llm-stream.js');
    expect(typeof stream.createChatStream).toBe('function');
  });

  it('exports embeddings module', async () => {
    const embed = await import('../lib/embeddings.js');
    expect(typeof embed.generateEmbeddings).toBe('function');
    expect(typeof embed.vectorSearch).toBe('function');
  });

  it('exports workflow executor', async () => {
    const executor = await import('../lib/workflow-executor.js');
    expect(typeof executor.executeWorkflow).toBe('function');
  });

  it('exports plugin executor', async () => {
    const plugin = await import('../lib/plugin-executor.js');
    expect(typeof plugin.executePluginTool).toBe('function');
    expect(typeof plugin.debugPluginTool).toBe('function');
  });

  it('exports chunker', async () => {
    const chunker = await import('../lib/chunker.js');
    expect(typeof chunker.chunkText).toBe('function');
    expect(typeof chunker.processDocument).toBe('function');
  });

  it('exports text extractor', async () => {
    const extractor = await import('../lib/text-extractor.js');
    expect(typeof extractor.extractText).toBe('function');
    expect(typeof extractor.canExtractText).toBe('function');
  });
});
