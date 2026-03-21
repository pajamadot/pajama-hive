'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://hive-api.pajamadot.com';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  totalChunks: number;
  chunkSize: number;
  chunkOverlap: number;
  status: string;
}

interface Document {
  id: string;
  name: string;
  sourceType: string;
  mimeType: string | null;
  fileSize: number | null;
  chunkCount: number;
  status: string;
  error: string | null;
  createdAt: string;
}

type Tab = 'documents' | 'search' | 'settings';

export default function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { getToken } = useAuth();
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('documents');
  const [uploadName, setUploadName] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'text' | 'url'>('text');
  const [uploadUrl, setUploadUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<unknown[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      if (!token) return;
      try {
        const data = await api.getKnowledgeBase(token, id);
        setKb(data.knowledgeBase);
        setDocuments(data.documents ?? []);
      } catch { /* */ }
      setLoading(false);
    }
    load();
  }, [getToken, id]);

  async function handleUploadText() {
    if (!uploadName.trim() || !uploadContent.trim()) return;
    setUploading(true);
    const token = await getToken();
    if (token) {
      await fetch(`${API_URL}/v1/knowledge/${id}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: uploadName, sourceType: 'text', content: uploadContent }),
      });
      // Reload
      const data = await api.getKnowledgeBase(token, id);
      setKb(data.knowledgeBase);
      setDocuments(data.documents ?? []);
      setUploadName('');
      setUploadContent('');
    }
    setUploading(false);
  }

  async function handleDeleteDoc(docId: string) {
    if (!confirm('Delete this document?')) return;
    const token = await getToken();
    if (token) {
      await fetch(`${API_URL}/v1/knowledge/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await api.getKnowledgeBase(token, id);
      setKb(data.knowledgeBase);
      setDocuments(data.documents ?? []);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const token = await getToken();
    if (token) {
      const res = await fetch(`${API_URL}/v1/knowledge/${id}/search`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results ?? []);
      }
    }
    setSearching(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!kb) return <div className="p-8">Knowledge base not found</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'documents', label: `Documents (${documents.length})` },
    { key: 'search', label: 'Search Test' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/knowledge" className="text-xs text-muted-foreground hover:text-foreground">←</Link>
          <h1 className="text-sm font-medium">{kb.name}</h1>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            kb.status === 'active' ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
          }`}>{kb.status}</span>
          <span className="text-xs text-muted-foreground">{kb.documentCount} docs · {kb.totalChunks} chunks</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b px-6 flex gap-0 shrink-0">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'documents' && (
          <div className="max-w-4xl">
            {/* Upload form */}
            <div className="border rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-medium">Add Document</h3>
                <div className="flex border rounded overflow-hidden text-xs">
                  <button onClick={() => setUploadMode('text')}
                    className={`px-2.5 py-1 ${uploadMode === 'text' ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>
                    Text
                  </button>
                  <button onClick={() => setUploadMode('url')}
                    className={`px-2.5 py-1 ${uploadMode === 'url' ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>
                    URL
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <input type="text" value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Document name"
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20" />

                {uploadMode === 'text' ? (
                  <>
                    <textarea value={uploadContent}
                      onChange={(e) => setUploadContent(e.target.value)}
                      placeholder="Paste document content..."
                      rows={6}
                      className="w-full px-3 py-2 border rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-foreground/20 resize-y" />
                    <button onClick={handleUploadText} disabled={uploading || !uploadName.trim() || !uploadContent.trim()}
                      className="px-3 py-1.5 bg-foreground text-background text-xs rounded hover:opacity-90 disabled:opacity-30">
                      {uploading ? '...' : 'Upload Text'}
                    </button>
                  </>
                ) : (
                  <>
                    <input type="url" value={uploadUrl}
                      onChange={(e) => setUploadUrl(e.target.value)}
                      placeholder="https://docs.example.com/guide"
                      className="w-full px-3 py-2 border rounded-lg bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-foreground/20" />
                    <button onClick={async () => {
                      if (!uploadName.trim() || !uploadUrl.trim()) return;
                      setUploading(true);
                      const token = await getToken();
                      if (token) {
                        await fetch(`${API_URL}/v1/knowledge/${id}/documents`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: uploadName, sourceType: 'url', sourceUrl: uploadUrl }),
                        });
                        const data = await api.getKnowledgeBase(token, id);
                        setKb(data.knowledgeBase);
                        setDocuments(data.documents ?? []);
                        setUploadName('');
                        setUploadUrl('');
                      }
                      setUploading(false);
                    }} disabled={uploading || !uploadName.trim() || !uploadUrl.trim()}
                      className="px-3 py-1.5 bg-foreground text-background text-xs rounded hover:opacity-90 disabled:opacity-30">
                      {uploading ? '...' : 'Import URL'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Document list */}
            {documents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No documents yet. Upload your first document above.
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{doc.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {doc.sourceType} · {doc.chunkCount} chunks · {doc.status}
                        {doc.error && <span className="text-red-400 ml-2">{doc.error}</span>}
                      </div>
                    </div>
                    <button onClick={() => handleDeleteDoc(doc.id)}
                      className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'search' && (
          <div className="max-w-3xl">
            <h3 className="text-lg font-medium mb-4">Search Test</h3>
            <div className="flex gap-2 mb-4">
              <input type="text" value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Enter search query..."
                className="flex-1 px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <button onClick={handleSearch} disabled={searching}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map((result: any, i: number) => (
                  <div key={result.id ?? i} className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground mb-1">Chunk #{result.chunkIndex ?? i + 1}</div>
                    <p className="text-sm whitespace-pre-wrap">{result.content ?? JSON.stringify(result)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-xl space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Chunk Size</label>
              <div className="text-sm text-muted-foreground">{kb.chunkSize} tokens</div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Chunk Overlap</label>
              <div className="text-sm text-muted-foreground">{kb.chunkOverlap} tokens</div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <div className="text-sm text-muted-foreground">{kb.description || 'No description'}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
