"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield, ArrowLeft, Search, FileText, Loader2,
  AlertCircle, HelpCircle, ArrowRight
} from "lucide-react";
import { documentsApi, type Document } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

export default function SearchExplorerPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { error: toastError } = useToast();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);
  const [searching, setSearching] = useState<boolean>(false);
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    const fetchDocs = async () => {
      if (!isAuthenticated) return;
      try {
        const list = await documentsApi.list();
        // Only allow searching completed documents
        const completed = list.filter((d) => d.status === "COMPLETED");
        setDocuments(completed);
        if (completed.length > 0) {
          setSelectedDocId(String(completed[0].id));
        }
      } catch (e: any) {
        toastError("Failed to load documents", e?.message || "Verify API server is online.");
      } finally {
        setLoadingDocs(false);
      }
    };
    fetchDocs();
  }, [isAuthenticated, toastError]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId) {
      toastError("Selection Required", "Please select a parsed contract to search.");
      return;
    }
    if (!query.trim()) {
      toastError("Query Required", "Please enter a semantic search term.");
      return;
    }
    setSearching(true);
    try {
      const searchResults = await documentsApi.search(Number(selectedDocId), query);
      setResults(searchResults);
    } catch (e: any) {
      toastError("Search Failed", e?.message || "Semantic search engine offline.");
    } finally {
      setSearching(false);
    }
  };

  if (authLoading || loadingDocs) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top nav */}
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-slate-900 bg-slate-950/80 backdrop-blur-xl px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <div className="h-4 w-px bg-slate-800" />
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600/20 border border-indigo-900/40">
            <Search className="h-4 w-4 text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">
            RAG Citations Explorer
          </span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Search controls */}
        <section className="rounded-xl border border-slate-900 bg-slate-900/20 p-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-400 mb-2">Select Contract</label>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">— Choose Contract —</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-400 mb-2">Semantic / Keyword Search Query</label>
                <div className="relative">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter compliance rules or contract queries (e.g. data security subprocessor)..."
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 pl-3 pr-10 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={searching}
                    className="absolute right-1.5 top-1.5 bottom-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-md px-3 flex items-center justify-center transition-colors"
                  >
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>

        {/* Results */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
            Search Matches {results.length > 0 && `(${results.length})`}
          </h2>

          {searching ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-20 rounded-xl border border-slate-900 bg-slate-900/20">
              <FileText className="h-10 w-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">
                Enter a query above to run dense similarity matches against document vector nodes.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((r, idx) => (
                <div key={idx} className="rounded-xl border border-slate-900 bg-slate-900/20 overflow-hidden hover:border-slate-800 transition-all p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-indigo-400 font-bold flex items-center gap-1.5">
                      <HelpCircle className="h-3.5 w-3.5" /> Node #{idx + 1}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">Page {r.page_number}</span>
                      <span className="text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded-full">
                        Similarity: {(r.score * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <blockquote className="border-l-2 border-indigo-600/50 bg-indigo-950/10 rounded-r-lg px-4 py-3 text-sm text-slate-300 italic leading-relaxed">
                    "{r.text}"
                  </blockquote>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
