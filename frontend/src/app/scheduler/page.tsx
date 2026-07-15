"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield, ArrowLeft, Clock, Calendar, Trash2, Plus, Loader2,
  FileText, CheckCircle2, Play, BookOpen, AlertTriangle
} from "lucide-react";
import {
  schedulesApi, documentsApi, frameworksApi,
  type AuditSchedule, type Document, type Framework
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

export default function SchedulerPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form State
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [selectedFwId, setSelectedFwId] = useState<string>("");
  const [cronExpression, setCronExpression] = useState<string>("daily");
  const [creating, setCreating] = useState<boolean>(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const loadData = async () => {
    try {
      const [schedList, docList, fwList] = await Promise.all([
        schedulesApi.list(),
        documentsApi.list(),
        frameworksApi.list()
      ]);
      setSchedules(schedList);
      setDocuments(docList.filter((d) => d.status === "COMPLETED"));
      setFrameworks(fwList);
    } catch (e: any) {
      toastError("Load Failed", e?.message || "Failed to load scheduling parameters.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) loadData();
  }, [isAuthenticated]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId || !selectedFwId) {
      toastError("Selection Required", "Please select both a contract and policy framework.");
      return;
    }
    setCreating(true);
    try {
      const cronStr = cronExpression === "hourly" ? "hourly" : cronExpression === "weekly" ? "weekly" : "daily";
      await schedulesApi.create({
        document_id: Number(selectedDocId),
        framework_id: Number(selectedFwId),
        cron_expression: cronStr
      });
      toastSuccess("Schedule Created", "Recurring audit schedule registered successfully.");
      
      // Reset Form & Reload
      setSelectedDocId("");
      setSelectedFwId("");
      setCronExpression("daily");
      await loadData();
    } catch (e: any) {
      toastError("Create Failed", e?.message || "Failed to schedule recurring audit.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this recurring audit schedule?")) return;
    try {
      await schedulesApi.delete(id);
      toastSuccess("Schedule Deleted", "Schedule removed from background monitor.");
      await loadData();
    } catch (e: any) {
      toastError("Delete Failed", e?.message || "Failed to remove schedule.");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  // Maps for display names
  const docMap = new Map(documents.map((d) => [d.id, d.name]));
  const fwMap = new Map(frameworks.map((f) => [f.id, f.name]));

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
            <Clock className="h-4 w-4 text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">
            Audit Cron Scheduler
          </span>
        </div>
      </header>

      {/* Main Container Split View */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 overflow-y-auto">
        
        {/* Left Side: Schedule Creator Form */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-900 bg-slate-950/40 p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="h-4 w-4 text-indigo-400" /> Schedule Recurring Audit
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-normal">
                Establish automated periodic compliance scans for contracts to catch version discrepancies or regressions.
              </p>
            </div>

            <form onSubmit={handleCreate} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Contract</label>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full rounded-lg border border-slate-850 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                  required
                >
                  <option value="">— Select Document —</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Policy Framework</label>
                <select
                  value={selectedFwId}
                  onChange={(e) => setSelectedFwId(e.target.value)}
                  className="w-full rounded-lg border border-slate-850 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                  required
                >
                  <option value="">— Select Framework —</option>
                  {frameworks.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Audit Frequency</label>
                <select
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  className="w-full rounded-lg border border-slate-850 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="hourly">Hourly (Every 60 minutes)</option>
                  <option value="daily">Daily (At 12:00 AM UTC)</option>
                  <option value="weekly">Weekly (Sunday at 12:00 AM UTC)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Establish Schedule
              </button>
            </form>
          </div>
        </div>

        {/* Right Side: Active Schedules list */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-900 bg-slate-950/40 p-6 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-indigo-400" /> Active Recurring Schedules
              </h3>
              <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                Periodic audits currently monitored by the background cron executor.
              </p>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {schedules.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-xs font-medium">
                  No active cron schedules registered.
                </div>
              ) : (
                schedules.map((s) => {
                  const docName = docMap.get(s.document_id) || `Contract #${s.document_id}`;
                  const fwName = fwMap.get(s.framework_id) || `Framework #${s.framework_id}`;
                  const nextRun = new Date(s.next_run_at).toLocaleString();
                  
                  return (
                    <div key={s.id} className="rounded-lg border border-slate-900 bg-slate-900/10 p-4 space-y-3 relative group">
                      <div className="pr-12 space-y-1">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider font-mono">
                          Schedule #{s.id} — Frequency: {s.cron_expression.toUpperCase()}
                        </span>
                        <h4 className="text-sm font-bold text-white leading-normal">{docName}</h4>
                        <p className="text-xs text-slate-400 leading-normal">Policy framework: <span className="font-semibold">{fwName}</span></p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-900/60 text-[10px] text-slate-500">
                        <span>Next Run: <span className="text-slate-300 font-semibold">{nextRun}</span></span>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete Schedule"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
