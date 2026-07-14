"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield, ArrowLeft, MessageSquare, Send, Loader2,
  BookOpen, HelpCircle, FileText, CheckCircle2
} from "lucide-react";
import { documentsApi, type Document } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ text: string; page_number: number }>;
}

export default function ContractChatPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { error: toastError } = useToast();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    const fetchDocs = async () => {
      if (!isAuthenticated) return;
      try {
        const list = await documentsApi.list();
        const completed = list.filter((d) => d.status === "COMPLETED");
        setDocuments(completed);
        if (completed.length > 0) {
          setSelectedDocId(String(completed[0].id));
        }
      } catch (e: any) {
        toastError("Failed to load documents", e?.message || "Check API connection.");
      } finally {
        setLoadingDocs(false);
      }
    };
    fetchDocs();
  }, [isAuthenticated, toastError]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId) {
      toastError("Selection Required", "Please select a contract to converse with.");
      return;
    }
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    try {
      // Map message history (strip citations for the API payload)
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await documentsApi.chat(Number(selectedDocId), userMessage.content, historyPayload);
      
      const assistantMessage: Message = {
        role: "assistant",
        content: res.answer,
        citations: res.citations
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (e: any) {
      toastError("Message Failed", e?.message || "Chat helper is offline.");
    } finally {
      setSending(false);
    }
  };

  const activeDoc = documents.find((d) => String(d.id) === selectedDocId);

  if (authLoading || loadingDocs) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  // Get citations from the last assistant message
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const activeCitations = lastAssistantMsg?.citations || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top nav */}
      <header className="flex items-center gap-4 border-b border-slate-900 bg-slate-950/80 backdrop-blur-xl px-6 py-4 shrink-0">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <div className="h-4 w-px bg-slate-800" />
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600/20 border border-indigo-900/40">
            <MessageSquare className="h-4 w-4 text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">
            Conversational RAG Chat
          </span>
        </div>
      </header>

      {/* Main chat workspace split layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Side: Chat Panel */}
        <main className="flex-1 flex flex-col bg-slate-950/40 border-r border-slate-900 min-w-0">
          {/* Contract Selector Header */}
          <div className="border-b border-slate-900 bg-slate-950/40 p-4 shrink-0">
            <div className="max-w-3xl mx-auto flex items-center gap-4 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Document:</span>
              <select
                value={selectedDocId}
                onChange={(e) => {
                  setSelectedDocId(e.target.value);
                  setMessages([]); // Clear chat history on document switch
                }}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">— Select Contract —</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.length === 0 ? (
                <div className="text-center py-20 space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/10 border border-indigo-900/30 mx-auto">
                    <MessageSquare className="h-6 w-6 text-indigo-400" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Chat with {activeDoc?.name || "your contract"}</h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto leading-normal">
                    Ask questions about service levels, liabilities, warranties, or specific policy rules.
                  </p>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isUser = m.role === "user";
                  return (
                    <div
                      key={idx}
                      className={`flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      {!isUser && (
                        <div className="h-8 w-8 rounded-lg bg-indigo-600/20 border border-indigo-900/30 shrink-0 flex items-center justify-center">
                          <Shield className="h-4 w-4 text-indigo-400" />
                        </div>
                      )}
                      <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                        isUser
                          ? "bg-indigo-600 text-white font-medium"
                          : "bg-slate-900 border border-slate-800 text-slate-200"
                      }`}>
                        {m.content}
                      </div>
                    </div>
                  );
                })
              )}

              {sending && (
                <div className="flex gap-4 justify-start">
                  <div className="h-8 w-8 rounded-lg bg-indigo-600/20 border border-indigo-900/30 shrink-0 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                  </div>
                  <div className="rounded-xl px-4 py-3 bg-slate-900 border border-slate-800 text-slate-400 text-sm flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                    Auditing context...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Chat input footer */}
          <div className="border-t border-slate-900 bg-slate-950/40 p-4 shrink-0">
            <form onSubmit={handleSend} className="max-w-3xl mx-auto flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={selectedDocId ? "Ask a question about the contract clauses..." : "Select a contract above to start chatting"}
                disabled={!selectedDocId || sending}
                className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!selectedDocId || sending || !input.trim()}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white px-4 flex items-center justify-center transition-colors shadow-lg"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </main>

        {/* Right Side: Citations sidebar panel */}
        <aside className="w-80 bg-slate-950/20 border-l border-slate-900 hidden lg:flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-900 shrink-0">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" /> Grounding Citations
            </h3>
            <p className="text-[10px] text-slate-500 mt-1 leading-normal">
              Direct verbatim proofs matched from the contract to answer the query.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeCitations.length === 0 ? (
              <div className="text-center py-20 space-y-2">
                <FileText className="h-8 w-8 text-slate-800 mx-auto" />
                <p className="text-[10px] text-slate-600 font-medium">No citations loaded yet</p>
              </div>
            ) : (
              activeCitations.map((c, index) => (
                <div key={index} className="rounded-lg border border-slate-900 bg-slate-900/20 p-3.5 space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-indigo-400 font-bold">Citation #{index + 1}</span>
                    <span className="text-slate-500">Page {c.page_number}</span>
                  </div>
                  <blockquote className="border-l border-indigo-600/30 pl-2 text-xs text-slate-400 leading-relaxed italic">
                    "{c.text}"
                  </blockquote>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
