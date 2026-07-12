"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield, Upload, FileText, CheckCircle2,
  Clock, Database, ArrowRight, BookOpen, BarChart3,
  Activity, Play, UserCheck, LogOut, Menu, X,
  Loader2, AlertCircle, RefreshCw, UploadCloud, XCircle
} from "lucide-react";

import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { StatCardSkeleton, DocumentRowSkeleton, TableRowSkeleton } from "@/lib/skeletons";
import {
  documentsApi, frameworksApi, auditsApi,
  type Document, type Framework, type AuditJob
} from "@/lib/api";

// ─── Helpers ─────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

// ─── Status Badge ────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: "bg-emerald-950/50 text-emerald-400 border border-emerald-900/40",
    PENDING:   "bg-amber-950/40 text-amber-400 border border-amber-900/30",
    PROCESSING:"bg-indigo-950/40 text-indigo-400 border border-indigo-900/30",
    FAILED:    "bg-rose-950/40 text-rose-400 border border-rose-900/30",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${map[status] || map.PENDING}`}>
      {status}
    </span>
  );
}

// ─── Drag-and-Drop Upload Zone ────────────────────────────

function DropZone({
  onUpload,
  isUploading,
  uploadProgress,
}: {
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadProgress: number;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onUpload(file);
  }, [onUpload]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isUploading && inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
        isDragging
          ? "border-indigo-400 bg-indigo-950/20 scale-[1.01]"
          : "border-slate-800 bg-slate-900/20 hover:border-indigo-700 hover:bg-indigo-950/10"
      } ${isUploading ? "pointer-events-none" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={handleChange}
      />

      {isUploading ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          <div className="w-full max-w-xs">
            <div className="flex justify-between text-xs text-slate-400 mb-1.5">
              <span>Uploading & parsing layout...</span>
              <span className="font-semibold text-white">{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-950/50 border border-indigo-900/30">
            <UploadCloud className="h-7 w-7 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">
              Drop a contract file here
            </p>
            <p className="text-xs text-slate-500 mt-1">
              PDF, DOCX, or TXT — max 50 MB
            </p>
          </div>
          <span className="text-xs text-indigo-400 font-semibold border border-indigo-900/30 bg-indigo-950/20 rounded-lg px-3 py-1">
            Browse files
          </span>
        </>
      )}
    </div>
  );
}

// ─── Live Progress Steps ──────────────────────────────────

function ProgressStream({
  jobId,
  onComplete,
}: {
  jobId: number;
  onComplete: () => void;
}) {
  const [steps, setSteps] = useState<Array<{ message: string; step: number; total: number }>>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const es = auditsApi.streamProgress(
      jobId,
      (data) => {
        setSteps((prev) => [...prev.filter((s) => s.step !== data.step), data]);
        if (data.done) {
          setDone(true);
          onComplete();
        }
      },
      onComplete
    );
    return () => es.close();
  }, [jobId, onComplete]);

  if (steps.length === 0) return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
      Connecting to audit stream...
    </div>
  );

  return (
    <div className="space-y-1.5">
      {steps.map((s) => (
        <div key={s.step} className="flex items-center gap-2 text-xs">
          {done || s.step < steps.length ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400 shrink-0" />
          )}
          <span className={done || s.step < steps.length ? "text-slate-400" : "text-slate-200 font-medium"}>
            {s.message}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const [currentView, setCurrentView] = useState<"dashboard" | "contracts" | "frameworks" | "ragas">("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // API data
  const [documents, setDocuments] = useState<Document[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [jobs, setJobs] = useState<AuditJob[]>([]);
  const [apiLoading, setApiLoading] = useState(true);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Audit state
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [selectedFwId, setSelectedFwId] = useState<number | "">("");
  const [activeJobIds, setActiveJobIds] = useState<number[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Load API data
  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    setApiLoading(true);
    try {
      const [docs, fws] = await Promise.all([
        documentsApi.list(),
        frameworksApi.list(),
      ]);
      setDocuments(docs);
      setFrameworks(fws);
    } catch (e: any) {
      toastError("Failed to load data", e?.message || "Check your connection and try again.");
    } finally {
      setApiLoading(false);
    }
  }, [isAuthenticated, toastError]);

  useEffect(() => { loadData(); }, [loadData]);

  // Handle real file upload
  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadProgress(10);
    const interval = setInterval(() => {
      setUploadProgress((p) => Math.min(p + 12, 85));
    }, 300);
    try {
      const doc = await documentsApi.upload(file);
      clearInterval(interval);
      setUploadProgress(100);
      setTimeout(() => {
        setDocuments((prev) => [doc, ...prev]);
        setIsUploading(false);
        setUploadProgress(0);
        setSelectedDocIds((prev) => [...prev, doc.id]);
        toastSuccess("Document uploaded", `"${doc.name}" is being parsed.`);
      }, 400);
    } catch (e: any) {
      clearInterval(interval);
      setIsUploading(false);
      setUploadProgress(0);
      toastError("Upload failed", e?.message || "Only PDF, DOCX, TXT files up to 50 MB.");
    }
  }, [toastSuccess, toastError]);

  // Trigger batch or single audit
  const handleTriggerAudit = useCallback(async () => {
    if (selectedDocIds.length === 0 || !selectedFwId) return;
    setIsAuditing(true);
    try {
      if (selectedDocIds.length === 1) {
        const job = await auditsApi.run(selectedDocIds[0], Number(selectedFwId));
        setJobs((prev) => [job, ...prev]);
        setActiveJobIds((prev) => [...prev, job.id]);
        toastInfo("Audit dispatched", `Job #${job.id} is running in the background.`);
      } else {
        const scheduledJobs = await auditsApi.runBatch(selectedDocIds, Number(selectedFwId));
        setJobs((prev) => [...scheduledJobs, ...prev]);
        setActiveJobIds((prev) => [...prev, ...scheduledJobs.map((j) => j.id)]);
        toastSuccess("Batch audits dispatched", `Started ${scheduledJobs.length} parallel audits.`);
      }
    } catch (e: any) {
      setIsAuditing(false);
      toastError("Audit failed to start", e?.message || "Please try again.");
    }
  }, [selectedDocIds, selectedFwId, toastInfo, toastSuccess, toastError]);

  const handleAuditComplete = useCallback(async (completedJobId: number) => {
    try {
      const updated = await auditsApi.get(completedJobId);
      setJobs((prev) => prev.map((j) => j.id === updated.id ? updated : j));
      toastSuccess("Audit complete", updated.compliance_score != null ? `Compliance score: ${updated.compliance_score.toFixed(1)}%` : "View findings for details.");
    } catch {}
    
    setActiveJobIds((prev) => {
      const remaining = prev.filter((id) => id !== completedJobId);
      if (remaining.length === 0) {
        setIsAuditing(false);
      }
      return remaining;
    });
  }, [toastSuccess]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-950 font-sans text-slate-100">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile, slide-over when open */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 border-r border-slate-900 bg-slate-950 lg:bg-slate-950/80
        p-6 flex flex-col gap-8 shrink-0
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-600/30">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                AEGISPACT
              </span>
              <span className="text-xs block text-indigo-500 font-semibold tracking-widest uppercase">
                AUDITOR
              </span>
            </div>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-500 hover:text-white p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-1.5 flex-1">
          <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-2">Workspace</p>
          {[
            { id: "dashboard", icon: Database, label: "Dashboard" },
            { id: "contracts", icon: FileText, label: "Legal Contracts" },
            { id: "frameworks", icon: BookOpen, label: "Frameworks" },
            { id: "ragas", icon: BarChart3, label: "MLOps Quality Ragas" },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => { setCurrentView(id as any); setSidebarOpen(false); }}
              className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all text-left ${
                currentView === id
                  ? "bg-indigo-950/40 border border-indigo-900/30 text-indigo-200"
                  : "text-slate-400 hover:bg-slate-900/50 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="space-y-3">
          <div className="rounded-xl border border-indigo-900/30 bg-indigo-950/20 p-4">
            <div className="flex items-center gap-2 mb-2 text-indigo-400 text-xs font-semibold">
              <Activity className="h-4 w-4" /> System
            </div>
            <p className="text-[10px] text-slate-400">API Status</p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">● Online</p>
          </div>
          <button
            onClick={() => { logout(); router.push("/login"); }}
            className="flex w-full items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm text-slate-500 hover:text-rose-400 hover:bg-rose-950/20 transition-all"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">

        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-900 px-4 sm:px-8 py-4 sm:py-5 shrink-0 bg-slate-950/40">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white transition-all"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white capitalize">
                {currentView === "dashboard" && "Compliance Workspace"}
                {currentView === "contracts" && "Legal Contracts"}
                {currentView === "frameworks" && "Policy Frameworks"}
                {currentView === "ragas" && "Ragas Monitor"}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                {currentView === "dashboard" && "Upload contracts, trigger RAG audits, and track live Celery job progress."}
                {currentView === "contracts" && "Manage uploaded documents and parsed structure manifests."}
                {currentView === "frameworks" && "Manage policy control checklists and compliance rule configurations."}
                {currentView === "ragas" && "Faithfulness, answer relevance, and context precision analysis."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={loadData} className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all">
              <RefreshCw className="h-4 w-4" />
            </button>
            <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3.5 py-1.5 text-xs text-slate-300">
              <UserCheck className="h-4 w-4 text-emerald-500" />
              Authenticated
            </div>
          </div>
        </header>


        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-10">

          {/* ── DASHBOARD VIEW ── */}
          {currentView === "dashboard" && (
            <div className="space-y-8">
              {/* Stats Row */}
              <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {apiLoading
                  ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
                  : [
                  { label: "Contracts Ingested", value: String(documents.length), sub: "Files parsed" },
                  { label: "Active Audit Jobs", value: String(jobs.filter(j => j.status === "PROCESSING" || j.status === "PENDING").length), sub: "In Celery queue" },
                  { label: "Completed Audits", value: String(jobs.filter(j => j.status === "COMPLETED").length), sub: "Scorecards generated" },
                  { label: "Avg Compliance Score", value: jobs.filter(j => j.compliance_score).length ? `${Math.round(jobs.filter(j => j.compliance_score).reduce((a, j) => a + (j.compliance_score || 0), 0) / jobs.filter(j => j.compliance_score).length)}%` : "—", sub: "Across all audits" },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="rounded-xl border border-slate-900 bg-slate-900/30 p-6">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
                    <h3 className="text-3xl font-bold text-white mt-2">{value}</h3>
                    <span className="text-[10px] text-slate-500">{sub}</span>
                  </div>
                ))}
              </section>

              <div className="grid gap-8 lg:grid-cols-12">
                {/* Upload Panel */}
                <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-6 lg:col-span-5">
                  <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                    <Upload className="h-5 w-5 text-indigo-400" /> Ingest New Contract
                  </h2>
                  <p className="text-xs text-slate-400 mb-5">Upload legal agreements to parse text layouts and visual tables.</p>
                  <DropZone onUpload={handleFileUpload} isUploading={isUploading} uploadProgress={uploadProgress} />
                </div>

                {/* Audit Trigger Panel */}
                <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-6 lg:col-span-7">
                  <h2 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                    <Play className="h-5 w-5 text-emerald-400" /> Initiate Compliance Audit
                  </h2>
                  <p className="text-xs text-slate-400 mb-5">Select a document and a regulatory framework to run the Hybrid RAG audit pipeline.</p>

                  <div className="grid gap-4 sm:grid-cols-2 mb-5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-2">1. Select Contract(s)</label>
                      <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-3 max-h-[120px] overflow-y-auto space-y-2">
                        {documents.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">No contracts uploaded yet.</p>
                        ) : (
                          documents.map((d) => (
                            <label key={d.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-white transition-colors">
                              <input
                                type="checkbox"
                                checked={selectedDocIds.includes(d.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedDocIds((prev) => [...prev, d.id]);
                                  } else {
                                    setSelectedDocIds((prev) => prev.filter((id) => id !== d.id));
                                  }
                                }}
                                className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="truncate">{d.name}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-2">2. Policy Framework</label>
                      <select
                        value={selectedFwId}
                        onChange={(e) => setSelectedFwId(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">— Choose Framework —</option>
                        {frameworks.map((f) => (
                          <option key={f.id} value={f.id}>{f.name} ({f.rules.length} Rules)</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleTriggerAudit}
                    disabled={isAuditing || selectedDocIds.length === 0 || !selectedFwId}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 transition-colors"
                  >
                    {isAuditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                    {isAuditing ? `Auditing (${activeJobIds.length} running)...` : "Trigger Asynchronous Audit"}
                  </button>

                  {activeJobIds.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {activeJobIds.map((jobId) => (
                        <div key={jobId} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                          <p className="text-xs font-bold text-indigo-400 mb-3 uppercase tracking-wider flex justify-between">
                            <span>Live Progress — Job #{jobId}</span>
                            <span className="text-[10px] text-slate-500 font-normal">SSE Stream</span>
                          </p>
                          <ProgressStream jobId={jobId} onComplete={() => handleAuditComplete(jobId)} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Jobs Table */}
              <section className="rounded-xl border border-slate-900 bg-slate-900/20 p-6">
                <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-400" /> Audit Jobs Queue
                </h2>
                {apiLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>
                ) : jobs.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    No audit jobs yet. Upload a contract and trigger an audit above.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                      <thead className="bg-slate-900/60 text-xs font-bold text-slate-300 uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-3.5 rounded-l-lg">Job ID</th>
                          <th className="px-5 py-3.5">Document ID</th>
                          <th className="px-5 py-3.5">Framework ID</th>
                          <th className="px-5 py-3.5 text-center">Score</th>
                          <th className="px-5 py-3.5 text-center">Status</th>
                          <th className="px-5 py-3.5 rounded-r-lg text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {jobs.map((job) => (
                          <tr key={job.id} className="hover:bg-slate-900/30 transition-colors">
                            <td className="px-5 py-4 font-mono text-xs text-slate-500">#{job.id}</td>
                            <td className="px-5 py-4 text-slate-300">Doc #{job.document_id}</td>
                            <td className="px-5 py-4 text-slate-400">FW #{job.framework_id}</td>
                            <td className="px-5 py-4 text-center">
                              {job.compliance_score != null ? (
                                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                  job.compliance_score >= 80
                                    ? "bg-emerald-950/50 text-emerald-400 border border-emerald-900/40"
                                    : "bg-amber-950/50 text-amber-400 border border-amber-900/40"
                                }`}>
                                  {job.compliance_score.toFixed(1)}%
                                </span>
                              ) : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-5 py-4 text-center"><StatusBadge status={job.status} /></td>
                            <td className="px-5 py-4 text-right">
                              <Link
                                href={`/audit?id=${job.id}`}
                                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300"
                              >
                                Findings <ArrowRight className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ── CONTRACTS VIEW ── */}
          {currentView === "contracts" && (
            <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-6 space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-slate-900">
                <h3 className="text-base font-bold text-white">Repository Files</h3>
                <span className="text-xs text-slate-400">{documents.length} Agreements</span>
              </div>
              {apiLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">No contracts ingested yet.</div>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} className="flex justify-between items-center p-4 border border-slate-900 rounded-xl bg-slate-950/20 hover:border-slate-800 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-950/50 border border-indigo-900/30 text-indigo-400">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-200 text-sm">{doc.name}</h4>
                        <p className="text-[10px] text-slate-500">
                          {formatBytes(doc.size_bytes)} · {doc.file_type} · {formatDate(doc.created_at)}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={doc.status} />
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── FRAMEWORKS VIEW ── */}
          {currentView === "frameworks" && (
            <div className="space-y-5">
              {apiLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-indigo-400" /></div>
              ) : frameworks.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm rounded-xl border border-slate-900 bg-slate-900/20">No frameworks registered.</div>
              ) : (
                frameworks.map((fw) => (
                  <div key={fw.id} className="rounded-xl border border-slate-900 bg-slate-900/20 p-6 space-y-4">
                    <div className="pb-3 border-b border-slate-900 flex justify-between items-center">
                      <div>
                        <h3 className="text-base font-bold text-white">{fw.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{fw.description}</p>
                      </div>
                      <span className="text-[10px] font-mono font-bold bg-indigo-950/50 text-indigo-400 border border-indigo-900/30 rounded-full px-3 py-1">
                        {fw.rules.length} Rules
                      </span>
                    </div>
                    {fw.rules.map((rule) => (
                      <div key={rule.rule_id} className="p-4 border border-slate-900 bg-slate-950/40 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-mono text-xs font-bold text-indigo-400">{rule.rule_id}</span>
                          <span className="text-xs font-semibold text-slate-200">{rule.title}</span>
                        </div>
                        <p className="text-xs text-slate-400 pl-4 border-l border-slate-800 italic">{rule.description}</p>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── RAGAS VIEW ── */}
          {currentView === "ragas" && (
            <div className="space-y-8">
              <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-6 space-y-6">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-400" /> Ragas Evaluation Averages
                </h3>
                <div className="grid gap-6 sm:grid-cols-3">
                  {(() => {
                    const completed = jobs.filter((j) => j.ragas_faithfulness != null);
                    const avg = (key: keyof AuditJob) =>
                      completed.length
                        ? Math.round(completed.reduce((a, j) => a + (Number(j[key]) || 0), 0) / completed.length * 100)
                        : null;
                    return [
                      { label: "Faithfulness", val: avg("ragas_faithfulness"), color: "emerald" },
                      { label: "Answer Relevance", val: avg("ragas_relevance"), color: "indigo" },
                      { label: "Context Recall", val: avg("ragas_recall"), color: "amber" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="p-4 border border-slate-900 rounded-lg bg-slate-950/20 text-center">
                        <p className="text-xs text-slate-400">{label}</p>
                        <h4 className={`text-2xl font-bold text-${color}-400 mt-1`}>
                          {val != null ? `${val}%` : "—"}
                        </h4>
                        <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-3">
                          <div className={`h-full bg-${color}-500`} style={{ width: val ? `${val}%` : "0%" }} />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-6">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-900 mb-4">
                  <Activity className="h-4 w-4 text-indigo-400" /> Per-Job Ragas Breakdown
                </h3>
                {jobs.filter((j) => j.ragas_faithfulness != null).length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-8">No evaluated jobs yet.</p>
                ) : (
                  <div className="space-y-3">
                    {jobs.filter((j) => j.ragas_faithfulness != null).map((job) => (
                      <div key={job.id} className="flex items-center justify-between p-3 border border-slate-900 rounded-lg text-xs">
                        <span className="text-slate-400 font-mono">Job #{job.id}</span>
                        <div className="flex gap-4 text-slate-300">
                          <span>F: <b>{Math.round((job.ragas_faithfulness || 0) * 100)}%</b></span>
                          <span>R: <b>{Math.round((job.ragas_relevance || 0) * 100)}%</b></span>
                          <span>C: <b>{Math.round((job.ragas_recall || 0) * 100)}%</b></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
