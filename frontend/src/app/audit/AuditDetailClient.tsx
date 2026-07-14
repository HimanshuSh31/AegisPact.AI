"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Shield, ArrowLeft, CheckCircle2, XCircle, AlertTriangle,
  MinusCircle, BarChart3, FileText, Clock, Loader2,
  Activity, BookOpen, ChevronDown, ChevronUp
} from "lucide-react";
import { auditsApi, documentsApi, frameworksApi, TokenStore, type AuditJob, type AuditFinding, type Document, type Framework } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AuditHeaderSkeleton, FindingCardSkeleton } from "@/lib/skeletons";
import { useToast } from "@/lib/toast";

// ─── Verdict config ───────────────────────────────────────

const VERDICT = {
  COMPLIANT: {
    label: "Compliant",
    icon: <CheckCircle2 className="h-4 w-4" />,
    pill: "bg-emerald-950/50 text-emerald-400 border-emerald-900/40",
    bar:  "bg-emerald-500",
    text: "text-emerald-400",
  },
  NON_COMPLIANT: {
    label: "Non-Compliant",
    icon: <XCircle className="h-4 w-4" />,
    pill: "bg-rose-950/50 text-rose-400 border-rose-900/40",
    bar:  "bg-rose-500",
    text: "text-rose-400",
  },
  NEEDS_REVIEW: {
    label: "Needs Review",
    icon: <AlertTriangle className="h-4 w-4" />,
    pill: "bg-amber-950/50 text-amber-400 border-amber-900/40",
    bar:  "bg-amber-500",
    text: "text-amber-400",
  },
  NOT_APPLICABLE: {
    label: "N/A",
    icon: <MinusCircle className="h-4 w-4" />,
    pill: "bg-slate-900 text-slate-400 border-slate-800",
    bar:  "bg-slate-600",
    text: "text-slate-400",
  },
};

// ─── Finding Card ─────────────────────────────────────────

function FindingCard({ finding, onOverride }: { finding: AuditFinding; onOverride: (f: AuditFinding) => void }) {
  const [expanded, setExpanded] = useState(false);
  const v = VERDICT[finding.verdict] ?? VERDICT.NOT_APPLICABLE;

  return (
    <div className="rounded-xl border border-slate-900 bg-slate-900/20 overflow-hidden transition-all hover:border-slate-800">
      {/* Header row */}
      <button
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-900/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold shrink-0 ${v.pill}`}>
            {v.icon}{v.label}
          </span>
          <span className="font-mono text-[11px] font-bold text-indigo-400 shrink-0 hidden sm:block">
            {finding.rule_id}
          </span>
          <span className="text-sm font-semibold text-slate-200 truncate">{finding.rule_title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {finding.page_number != null && (
            <span className="text-[10px] text-slate-500 hidden md:block">Page {finding.page_number}</span>
          )}
          {expanded
            ? <ChevronUp className="h-4 w-4 text-slate-500" />
            : <ChevronDown className="h-4 w-4 text-slate-500" />
          }
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-900/60 pt-4">
          {finding.clause_text && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                📋 Cited Contract Clause
              </p>
              <blockquote className="border-l-2 border-indigo-600/50 bg-indigo-950/10 rounded-r-lg px-4 py-3 text-sm text-slate-300 italic leading-relaxed">
                "{finding.clause_text}"
              </blockquote>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              🤖 AI Compliance Reasoning
            </p>
            <p className="text-sm text-slate-300 leading-relaxed">{finding.explanation}</p>
          </div>
          
          {finding.is_overridden && (
            <div className="rounded-lg bg-orange-950/20 border border-orange-900/30 p-4 text-xs text-orange-300 leading-relaxed">
              <span className="font-bold">⚠️ Human Auditor Override Applied:</span> Verdict manually updated to <b>{finding.overridden_status}</b>.
              {finding.overridden_explanation && (
                <p className="mt-1 text-slate-400 font-sans italic">"Justification: {finding.overridden_explanation}"</p>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={() => onOverride(finding)}
              className="text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1 border border-orange-900/30 rounded-lg px-2.5 py-1 bg-orange-950/10"
            >
              Override Verdict
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Score Ring ───────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} stroke="#1e293b" strokeWidth="8" fill="none" />
        <circle
          cx="50" cy="50" r={r}
          stroke={color} strokeWidth="8" fill="none"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-xl font-bold text-white">{score.toFixed(0)}%</p>
        <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Score</p>
      </div>
    </div>
  );
}

// ─── Ragas Bar ────────────────────────────────────────────

function RagasBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold text-white">{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export default function AuditDetailClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();

  const jobId = Number(searchParams.get("id"));

  const [job, setJob]           = useState<AuditJob | null>(null);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [document, setDocument] = useState<Document | null>(null);
  const [framework, setFramework] = useState<Framework | null>(null);
  const [loading, setLoading]   = useState(true);

  const [filter, setFilter] = useState<"ALL" | "COMPLIANT" | "NON_COMPLIANT" | "NEEDS_REVIEW">("ALL");

  // Override State
  const [activeOverrideFinding, setActiveOverrideFinding] = useState<AuditFinding | null>(null);
  const [overrideVerdict, setOverrideVerdict] = useState<string>("COMPLIANT");
  const [overrideExplanation, setOverrideExplanation] = useState<string>("");
  const [savingOverride, setSavingOverride] = useState<boolean>(false);
  const [downloadingPDF, setDownloadingPDF] = useState<boolean>(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [j, f] = await Promise.all([
        auditsApi.get(jobId),
        auditsApi.findings(jobId),
      ]);
      setJob(j);
      setFindings(f);

      const [doc, fw] = await Promise.all([
        documentsApi.get(j.document_id).catch(() => null),
        frameworksApi.list().then(list => list.find(x => x.id === j.framework_id) ?? null),
      ]);
      setDocument(doc);
      setFramework(fw ?? null);
    } catch (e: any) {
      toastError("Failed to load audit", e?.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [jobId, isAuthenticated, toastError]);

  useEffect(() => { load(); }, [load]);

  const handleDownloadPDF = async () => {
    setDownloadingPDF(true);
    try {
      const token = TokenStore.get();
      const res = await fetch(`http://localhost:8000/api/v1/audits/${jobId}/pdf`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : ""
        }
      });
      if (!res.ok) throw new Error("Failed to download PDF report.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `aegispact-scorecard-${jobId}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      toastSuccess("Report Downloaded", "PDF compliance scorecard report downloaded successfully.");
    } catch (e: any) {
      toastError("Download Failed", e?.message || "Check server connectivity.");
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!activeOverrideFinding) return;
    if (!overrideExplanation.trim()) {
      toastError("Justification Required", "Please provide audit override justification.");
      return;
    }
    setSavingOverride(true);
    try {
      await auditsApi.overrideFinding(
        jobId,
        activeOverrideFinding.id,
        overrideVerdict,
        overrideExplanation
      );
      toastSuccess("Verdict Overridden", "Finding verdict updated successfully.");
      setActiveOverrideFinding(null);
      setOverrideExplanation("");
      await load();
    } catch (e: any) {
      toastError("Override Failed", e?.message || "Verify permissions.");
    } finally {
      setSavingOverride(false);
    }
  };

  const filtered = findings.filter(f => filter === "ALL" || f.verdict === filter);

  const counts = {
    COMPLIANT:      findings.filter(f => f.verdict === "COMPLIANT").length,
    NON_COMPLIANT:  findings.filter(f => f.verdict === "NON_COMPLIANT").length,
    NEEDS_REVIEW:   findings.filter(f => f.verdict === "NEEDS_REVIEW").length,
    NOT_APPLICABLE: findings.filter(f => f.verdict === "NOT_APPLICABLE").length,
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
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
            <Shield className="h-4 w-4 text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">
            Audit Job #{jobId}
          </span>
          {job && (
            <span className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
              job.status === "COMPLETED"
                ? "border-emerald-900/40 bg-emerald-950/40 text-emerald-400"
                : "border-amber-900/30 bg-amber-950/30 text-amber-400"
            }`}>
              {job.status}
            </span>
          )}
        </div>
        
        {job && job.status === "COMPLETED" && (
          <button
            onClick={handleDownloadPDF}
            disabled={downloadingPDF}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white px-3.5 py-2 text-xs font-bold transition-colors shadow-lg"
          >
            {downloadingPDF ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Download PDF Report
          </button>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {loading ? (
          <AuditHeaderSkeleton />
        ) : job ? (
          <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-6">
              {job.compliance_score != null && (
                <div className="shrink-0">
                  <ScoreRing score={job.compliance_score} />
                </div>
              )}

              <div className="flex-1 space-y-4">
                <div>
                  <h1 className="text-lg font-bold text-white">
                    {document?.name ?? `Document #${job.document_id}`}
                  </h1>
                  <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" />
                    {framework?.name ?? `Framework #${job.framework_id}`}
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Compliant",     val: counts.COMPLIANT,      color: "text-emerald-400" },
                    { label: "Non-Compliant", val: counts.NON_COMPLIANT,  color: "text-rose-400" },
                    { label: "Needs Review",  val: counts.NEEDS_REVIEW,   color: "text-amber-400" },
                    { label: "N/A",           val: counts.NOT_APPLICABLE, color: "text-slate-400" },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="rounded-lg border border-slate-900 bg-slate-950/40 px-3 py-2.5 text-center">
                      <p className={`text-xl font-bold ${color}`}>{val}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {job.ragas_faithfulness != null && (
                <div className="shrink-0 w-full sm:w-52 space-y-3 p-4 rounded-lg border border-slate-900 bg-slate-950/20">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <BarChart3 className="h-3 w-3" /> Ragas Quality
                  </p>
                  <RagasBar label="Faithfulness"     value={job.ragas_faithfulness ?? 0} />
                  <RagasBar label="Answer Relevance" value={job.ragas_relevance ?? 0} />
                  <RagasBar label="Context Recall"   value={job.ragas_recall ?? 0} />
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2">Filter:</p>
          {(["ALL", "NON_COMPLIANT", "NEEDS_REVIEW", "COMPLIANT"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                filter === f
                  ? "border-indigo-600 bg-indigo-950/40 text-indigo-300"
                  : "border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white"
              }`}
            >
              {f === "ALL" ? `All (${findings.length})` : f.replace("_", " ")}
              {f !== "ALL" && ` (${counts[f] ?? 0})`}
            </button>
          ))}
        </div>

        <section className="space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <FindingCardSkeleton key={i} />)
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 rounded-xl border border-slate-900 bg-slate-900/20">
              <FileText className="h-10 w-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">
                {findings.length === 0
                  ? "No findings yet — audit may still be running."
                  : `No findings matching "${filter}"`}
              </p>
            </div>
          ) : (
            filtered.map((f) => (
              <FindingCard key={f.id} finding={f} onOverride={(f) => {
                setActiveOverrideFinding(f);
                setOverrideVerdict(f.verdict);
              }} />
            ))
          )}
        </section>

        {document && (
          <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-950/50 border border-indigo-900/30 shrink-0">
              <FileText className="h-5 w-5 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-200 truncate">{document.name}</p>
              <p className="text-xs text-slate-500">
                {document.file_type} · {(document.size_bytes / 1024).toFixed(1)} KB ·{" "}
                <span className={document.status === "COMPLETED" ? "text-emerald-400" : "text-amber-400"}>
                  {document.status}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
              <Clock className="h-3.5 w-3.5" />
              {new Date(job?.created_at ?? "").toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      {/* Override Modal */}
      {activeOverrideFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-orange-400" /> Human Override Justification
            </h3>
            <p className="text-xs text-slate-400 leading-snug">
              Modify the compliance verdict for rule <span className="font-mono text-orange-300 font-bold">{activeOverrideFinding.rule_id}</span>.
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">New Verdict</label>
                <select
                  value={overrideVerdict}
                  onChange={(e) => setOverrideVerdict(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="COMPLIANT">Compliant</option>
                  <option value="NON_COMPLIANT">Non-Compliant</option>
                  <option value="NEEDS_REVIEW">Needs Review</option>
                  <option value="NOT_APPLICABLE">Not Applicable</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Auditor Reason / Justification</label>
                <textarea
                  value={overrideExplanation}
                  onChange={(e) => setOverrideExplanation(e.target.value)}
                  placeholder="State the exception justification or redline revision..."
                  rows={4}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setActiveOverrideFinding(null);
                  setOverrideExplanation("");
                }}
                className="rounded-lg border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-950 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOverride}
                disabled={savingOverride}
                className="flex items-center gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 text-white px-4 py-2 text-xs font-bold transition-all shadow-md"
              >
                {savingOverride && <Loader2 className="h-3 w-3 animate-spin" />}
                Save Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
