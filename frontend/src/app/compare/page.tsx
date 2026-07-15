"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield, ArrowLeft, GitCompare, Loader2,
  CheckCircle2, XCircle, AlertTriangle, MinusCircle, ArrowRight
} from "lucide-react";
import { auditsApi, type AuditJob } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

const VERDICTS: Record<string, { label: string; pill: string; icon: any }> = {
  COMPLIANT: {
    label: "Compliant",
    pill: "bg-emerald-950/50 text-emerald-400 border-emerald-900/40",
    icon: <CheckCircle2 className="h-3 w-3 inline" />
  },
  NON_COMPLIANT: {
    label: "Non-Compliant",
    pill: "bg-rose-950/50 text-rose-400 border-rose-900/40",
    icon: <XCircle className="h-3 w-3 inline" />
  },
  NEEDS_REVIEW: {
    label: "Needs Review",
    pill: "bg-amber-950/50 text-amber-400 border-amber-900/40",
    icon: <AlertTriangle className="h-3 w-3 inline" />
  },
  NOT_APPLICABLE: {
    label: "N/A",
    pill: "bg-slate-900 text-slate-400 border-slate-800",
    icon: <MinusCircle className="h-3 w-3 inline" />
  }
};

export default function CompareAuditsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { error: toastError } = useToast();

  const [auditJobs, setAuditJobs] = useState<AuditJob[]>([]);
  const [jobAId, setJobAId] = useState<string>("");
  const [jobBId, setJobBId] = useState<string>("");
  const [loadingJobs, setLoadingJobs] = useState<boolean>(true);
  const [comparing, setComparing] = useState<boolean>(false);
  const [comparison, setComparison] = useState<any>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  // Load audit jobs for selection dropdown
  useEffect(() => {
    const fetchJobs = async () => {
      if (!isAuthenticated) return;
      try {
        // Query recent completed audits from api
        const res = await fetch("http://localhost:8000/api/v1/audits", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("aegispact_token")}`
          }
        });
        if (res.ok) {
          const list = await res.json();
          const completed = list.filter((j: any) => j.status === "COMPLETED");
          setAuditJobs(completed);
          if (completed.length > 1) {
            setJobAId(String(completed[0].id));
            setJobBId(String(completed[1].id));
          }
        }
      } catch (e: any) {
        toastError("Failed to load audit list", e?.message);
      } finally {
        setLoadingJobs(false);
      }
    };
    fetchJobs();
  }, [isAuthenticated, toastError]);

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobAId || !jobBId) {
      toastError("Selection Required", "Please select two audit jobs to compare.");
      return;
    }
    if (jobAId === jobBId) {
      toastError("Invalid Selection", "Please select two different audit jobs.");
      return;
    }
    setComparing(true);
    try {
      const res = await auditsApi.compare(Number(jobAId), Number(jobBId));
      setComparison(res);
    } catch (e: any) {
      toastError("Comparison Failed", e?.message || "Verify connection to the API server.");
    } finally {
      setComparing(false);
    }
  };

  if (authLoading || loadingJobs) {
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
            <GitCompare className="h-4 w-4 text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">
            Audit Version Comparison
          </span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Selection panel */}
        <section className="rounded-xl border border-slate-900 bg-slate-900/20 p-6">
          <form onSubmit={handleCompare} className="grid gap-4 sm:grid-cols-5 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-2">Audit Job A (Original)</label>
              <select
                value={jobAId}
                onChange={(e) => setJobAId(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">— Choose Audit A —</option>
                {auditJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    Job #{j.id} — Doc #{j.document_id} ({j.compliance_score}%)
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-400 mb-2">Audit Job B (Comparison)</label>
              <select
                value={jobBId}
                onChange={(e) => setJobBId(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">— Choose Audit B —</option>
                {auditJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    Job #{j.id} — Doc #{j.document_id} ({j.compliance_score}%)
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-1">
              <button
                type="submit"
                disabled={comparing}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white px-4 py-2.5 text-sm font-semibold transition-colors"
              >
                {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompare className="h-4 w-4" />}
                Compare
              </button>
            </div>
          </form>
        </section>

        {/* Comparison Dashboard */}
        {comparing ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          </div>
        ) : !comparison ? (
          <div className="text-center py-24 rounded-xl border border-slate-900 bg-slate-900/20">
            <GitCompare className="h-12 w-12 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">
              Select two completed compliance audits above to compare verdicts and score improvements.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-900 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Comparison Overview</h3>
              </div>
              <a
                href={`http://localhost:8000/api/v1/audits/compare/pdf?id_a=${jobAId}&id_b=${jobBId}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900 text-xs font-semibold px-3 py-2 text-indigo-400 hover:text-indigo-300 transition-all flex items-center gap-1.5"
              >
                Download Comparison PDF
              </a>
            </div>

            {/* Scorecard side by side */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Job A summary card */}
              <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Audit Job A (Original)</span>
                    <h3 className="text-base font-bold text-white truncate max-w-[220px]">{comparison.job_a.document_name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{comparison.job_a.framework_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-rose-400">{comparison.job_a.score.toFixed(1)}%</p>
                    <p className="text-[9px] text-slate-500 uppercase font-semibold">Compliance Score</p>
                  </div>
                </div>
              </div>

              {/* Job B summary card */}
              <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Audit Job B (Revised)</span>
                    <h3 className="text-base font-bold text-white truncate max-w-[220px]">{comparison.job_b.document_name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{comparison.job_b.framework_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-emerald-400">{comparison.job_b.score.toFixed(1)}%</p>
                    <p className="text-[9px] text-slate-500 uppercase font-semibold">Compliance Score</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Side-by-Side rules comparison list */}
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
                Policy Controls Verdict Alignment
              </h2>

              <div className="space-y-3">
                {comparison.findings_comparison.map((rule: any, idx: number) => {
                  const changed = rule.verdict_a !== rule.verdict_b;
                  const improved = rule.verdict_a === "NON_COMPLIANT" && rule.verdict_b === "COMPLIANT";
                  const bad_a = VERDICTS[rule.verdict_a] ?? VERDICTS.NOT_APPLICABLE;
                  const bad_b = VERDICTS[rule.verdict_b] ?? VERDICTS.NOT_APPLICABLE;

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border bg-slate-900/20 p-5 space-y-4 transition-all
                        ${changed ? (improved ? "border-emerald-900/40 shadow-emerald-950/5" : "border-amber-900/30") : "border-slate-900"}`}
                    >
                      {/* Title & tags */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-indigo-400">{rule.rule_id}</span>
                          <h4 className="text-sm font-semibold text-slate-200">{rule.rule_title}</h4>
                        </div>
                        {changed && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            improved ? "bg-emerald-950 text-emerald-400 border border-emerald-900/40" : "bg-orange-950 text-orange-400 border border-orange-900/30"
                          }`}>
                            {improved ? "Improved!" : "Verdict Changed"}
                          </span>
                        )}
                      </div>

                      {/* Side by side blocks */}
                      <div className="grid gap-6 md:grid-cols-2">
                        {/* Job A details */}
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 uppercase font-semibold">Job A Verdict:</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${bad_a.pill}`}>
                              {bad_a.icon} {bad_a.label}
                            </span>
                          </div>
                          {rule.clause_a && (
                            <p className="text-xs text-slate-400 font-mono italic bg-slate-950/40 border border-slate-900/60 p-2 rounded">
                              "{rule.clause_a}"
                            </p>
                          )}
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {rule.explanation_a || "No citation or reasoning reported."}
                          </p>
                        </div>

                        {/* Job B details */}
                        <div className="space-y-2.5 border-t border-slate-800/40 pt-4 md:border-t-0 md:pt-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 uppercase font-semibold">Job B Verdict:</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${bad_b.pill}`}>
                              {bad_b.icon} {bad_b.label}
                            </span>
                          </div>
                          {rule.clause_b && (
                            <p className="text-xs text-slate-400 font-mono italic bg-slate-950/40 border border-slate-900/60 p-2 rounded">
                              "{rule.clause_b}"
                            </p>
                          )}
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {rule.explanation_b || "No citation or reasoning reported."}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
