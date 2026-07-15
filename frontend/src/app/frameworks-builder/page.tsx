"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield, ArrowLeft, Plus, Trash2, Edit3, Save, Loader2,
  CheckCircle2, AlertTriangle, FileText, Info
} from "lucide-react";
import { frameworksApi, type Framework, type ComplianceRule } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

export default function PolicyBuilderPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Editor State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [rules, setRules] = useState<ComplianceRule[]>([
    { rule_id: "RULE_01", title: "New Requirement Rule", description: "Verifies standard compliance conditions...", severity: "MEDIUM" }
  ]);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/login");
  }, [authLoading, isAuthenticated, router]);

  const loadFrameworks = async () => {
    try {
      const list = await frameworksApi.list();
      setFrameworks(list);
    } catch (e: any) {
      toastError("Load Failed", e?.message || "Failed to load policy frameworks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) loadFrameworks();
  }, [isAuthenticated]);

  const handleAddRule = () => {
    const nextIdx = rules.length + 1;
    setRules((prev) => [
      ...prev,
      {
        rule_id: `RULE_${String(nextIdx).padStart(2, "0")}`,
        title: "Policy Control Title",
        description: "Specify audit verification criteria text here...",
        severity: "MEDIUM"
      }
    ]);
  };

  const handleRemoveRule = (index: number) => {
    if (rules.length <= 1) {
      toastError("Rule Required", "Each framework must contain at least 1 audit rule.");
      return;
    }
    setRules((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleRuleChange = (index: number, key: keyof ComplianceRule, value: string) => {
    setRules((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: value };
      return updated;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      toastError("Fields Required", "Please provide a name and description.");
      return;
    }
    
    setSaving(true);
    try {
      if (editingId) {
        await frameworksApi.update(editingId, { name, description, rules });
        toastSuccess("Framework Updated", `Successfully modified Policy Framework #${editingId}`);
      } else {
        const fw = await frameworksApi.create({ name, description, rules });
        toastSuccess("Framework Created", `Created new Policy Framework: ${fw.name}`);
      }
      
      // Reset Form
      setName("");
      setDescription("");
      setRules([{ rule_id: "RULE_01", title: "New Requirement Rule", description: "Verifies standard compliance conditions...", severity: "MEDIUM" }]);
      setEditingId(null);
      await loadFrameworks();
    } catch (e: any) {
      toastError("Save Failed", e?.message || "Failed to submit framework policy.");
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (fw: Framework) => {
    setEditingId(fw.id);
    setName(fw.name);
    setDescription(fw.description);
    setRules(fw.rules);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Are you sure you want to permanently delete Policy Framework #${id}?`)) return;
    try {
      await frameworksApi.delete(id);
      toastSuccess("Framework Deleted", "Policy configuration deleted successfully.");
      await loadFrameworks();
    } catch (e: any) {
      toastError("Delete Failed", e?.message || "Failed to remove framework.");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

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
            <Shield className="h-4 w-4 text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">
            Policy Framework Builder
          </span>
        </div>
      </header>

      {/* Main Container Split View */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 overflow-y-auto">
        
        {/* Left Side: Creator Form */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-900 bg-slate-950/40 p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {editingId ? <Edit3 className="h-4 w-4 text-amber-400" /> : <Plus className="h-4 w-4 text-indigo-400" />}
                {editingId ? `Edit Policy Framework #${editingId}` : "Create Compliance Policy Framework"}
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-normal">
                Define the ruleset checklist and compliance bounds that AegisPact.AI will audit documents against.
              </p>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Framework Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. EU-GDPR Compliance Checklist"
                  className="w-full rounded-lg border border-slate-850 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Compliance audits for third party processor agreements evaluating security controls and subprocessor conditions."
                  rows={2}
                  className="w-full rounded-lg border border-slate-850 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              {/* Dynamic Rules Segment */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Audit Rules ({rules.length})</label>
                  <button
                    type="button"
                    onClick={handleAddRule}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add Rule
                  </button>
                </div>

                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                  {rules.map((rule, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-900 bg-slate-900/10 p-4 space-y-3 relative">
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(idx)}
                        className="absolute top-4 right-4 text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-4 space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">RULE ID</label>
                          <input
                            type="text"
                            value={rule.rule_id}
                            onChange={(e) => handleRuleChange(idx, "rule_id", e.target.value)}
                            placeholder="GDPR_01"
                            className="w-full rounded-md border border-slate-850 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none font-mono"
                            required
                          />
                        </div>
                        <div className="col-span-8 space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">RULE TITLE</label>
                          <input
                            type="text"
                            value={rule.title}
                            onChange={(e) => handleRuleChange(idx, "title", e.target.value)}
                            placeholder="Subprocessor Notification"
                            className="w-full rounded-md border border-slate-850 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500">COMPLIANCE CRITERIA DESCRIPTION</label>
                        <textarea
                          value={rule.description}
                          onChange={(e) => handleRuleChange(idx, "description", e.target.value)}
                          placeholder="Verifies that the processor must notify the controller of any updates..."
                          rows={2}
                          className="w-full rounded-md border border-slate-850 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500">SEVERITY IMPACT</label>
                          <select
                            value={rule.severity}
                            onChange={(e) => handleRuleChange(idx, "severity", e.target.value)}
                            className="w-full rounded-md border border-slate-850 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="HIGH">High</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="LOW">Low</option>
                            <option value="INFO">Info</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-900">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setName("");
                      setDescription("");
                      setRules([{ rule_id: "RULE_01", title: "New Requirement Rule", description: "Verifies standard compliance conditions...", severity: "MEDIUM" }]);
                    }}
                    className="rounded-lg border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white px-4 py-2.5 text-xs font-semibold transition-colors"
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white px-4 py-2.5 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {editingId ? "Save Changes" : "Create Framework"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Side: Active Frameworks list */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-900 bg-slate-950/40 p-6 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-indigo-400" /> Loaded Policy Frameworks
              </h3>
              <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                Active policies configured for document auditing.
              </p>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {frameworks.length === 0 ? (
                <div className="text-center py-10 text-slate-600 text-xs font-medium">
                  No policy frameworks registered yet.
                </div>
              ) : (
                frameworks.map((fw) => (
                  <div key={fw.id} className="rounded-lg border border-slate-900 bg-slate-900/10 p-4 space-y-3 relative group">
                    <div className="pr-12">
                      <h4 className="text-sm font-bold text-white leading-normal">{fw.name}</h4>
                      <p className="text-xs text-slate-400 leading-normal mt-1">{fw.description}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-900/60 text-[10px] text-slate-500">
                      <span className="font-mono text-indigo-400 font-bold">{fw.rules.length} Rules Configured</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleStartEdit(fw)}
                          className="text-slate-400 hover:text-white transition-colors"
                          title="Edit Policy"
                        >
                          <Edit3 className="h-4.5 w-4.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(fw.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete Policy"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
