"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
  Shield, Upload, FileText, CheckCircle2, AlertTriangle, 
  Clock, Database, ArrowRight, BookOpen, BarChart3, HelpCircle,
  Activity, Play, Search, PlusCircle, UserCheck, Trash2
} from "lucide-react";

// Mock Database Initial State
const MOCK_DOCUMENTS = [
  { id: 1, name: "vendor_master_agreement_v4.pdf", size: "1.4 MB", type: ".pdf", status: "COMPLETED", date: "2026-06-28 10:15" },
  { id: 2, name: "gdpr_data_processing_addendum.pdf", size: "820 KB", type: ".pdf", status: "COMPLETED", date: "2026-06-27 14:32" },
  { id: 3, name: "bailey_construction_contract.docx", size: "2.1 MB", type: ".docx", status: "FAILED", date: "2026-06-25 09:12" }
];

const MOCK_FRAMEWORKS = [
  { 
    id: 1, 
    name: "GDPR Compliance Audit", 
    description: "General Data Protection Regulation Articles 6, 9, 13, 28, and 32", 
    rules: [
      { rule_id: "GDPR-Art6", title: "Lawfulness of Processing", description: "Requires explicit consent or legitimate interest for processing telemetry data." },
      { rule_id: "GDPR-Art13", title: "Subprocessor Transparency", description: "Requires contract to detail the list of external data recipients." },
      { rule_id: "GDPR-Art32", title: "Security of Processing", description: "Requires automated encryption key rotations and access control measures." }
    ]
  },
  { 
    id: 2, 
    name: "SOC2 Trust Criteria", 
    description: "Security, Confidentiality, and Processing Integrity checklist", 
    rules: [
      { rule_id: "SOC2-CC6.1", title: "Access Control Safeguards", description: "Verify that credentials, API keys, and database passwords are rotated every 90 days." },
      { rule_id: "SOC2-CC7.3", title: "Vulnerability Management", description: "Requires weekly scans of public network interfaces." }
    ]
  },
  { 
    id: 3, 
    name: "HIPAA Privacy Rule", 
    description: "Protected Health Information (PHI) storage, disclosure, and business associate contracts", 
    rules: [
      { rule_id: "HIPAA-164.504", title: "Business Associate Agreements", description: "Verify explicit clauses safeguarding PHI disclosure." }
    ]
  }
];

const MOCK_JOBS = [
  { id: 101, docName: "gdpr_data_processing_addendum.pdf", frameworkName: "GDPR Compliance Audit", status: "COMPLETED", score: 66.7, date: "2026-06-28 10:45", eval: { faithfulness: 0.94, relevance: 0.91, recall: 0.89 } },
  { id: 102, docName: "vendor_master_agreement_v4.pdf", frameworkName: "SOC2 Trust Criteria", status: "COMPLETED", score: 78, date: "2026-06-28 10:20", eval: { faithfulness: 0.88, relevance: 0.85, recall: 0.92 } }
];

export default function Dashboard() {
  // Navigation View State
  const [currentView, setCurrentView] = useState<"dashboard" | "contracts" | "frameworks" | "ragas">("dashboard");

  const [documents, setDocuments] = useState(MOCK_DOCUMENTS);
  const [frameworks, setFrameworks] = useState(MOCK_FRAMEWORKS);
  const [jobs, setJobs] = useState(MOCK_JOBS);
  const [selectedDocId, setSelectedDocId] = useState<number | "">("");
  const [selectedFwId, setSelectedFwId] = useState<number | "">("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [newDocName, setNewDocName] = useState("");
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditStep, setAuditStep] = useState("");

  // Simulated File Upload
  const handleFileUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocName) return;
    setIsUploading(true);
    setUploadProgress(10);
    
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsUploading(false);
            const newDoc = {
              id: documents.length + 1,
              name: newDocName.endsWith(".pdf") ? newDocName : `${newDocName}.pdf`,
              size: "1.2 MB",
              type: ".pdf",
              status: "COMPLETED" as const,
              date: new Date().toISOString().replace('T', ' ').substring(0, 16)
            };
            setDocuments([newDoc, ...documents]);
            setSelectedDocId(newDoc.id);
            setNewDocName("");
          }, 300);
          return 100;
        }
        return prev + 15;
      });
    }, 150);
  };

  // Simulated Audit Job Execution (Celery Loop)
  const handleTriggerAudit = () => {
    if (!selectedDocId || !selectedFwId) return;
    const doc = documents.find(d => d.id === Number(selectedDocId));
    const fw = frameworks.find(f => f.id === Number(selectedFwId));
    if (!doc || !fw) return;

    setIsAuditing(true);
    setAuditStep("Initializing Celery Asynchronous Job worker...");

    const steps = [
      "Stage A: Parsing layout hierarchy (pdfplumber)...",
      "Extracting contract tables & structure coordinates...",
      "Stage B: Generating semantic vector embeddings (bge-large)...",
      "Executing Hybrid retrieval (Dense RAG + Sparse BM25)...",
      "Running constrained JSON LLM Auditing parser...",
      "Executing Ragas quality evaluation suite..."
    ];

    let currentStepIndex = 0;
    const interval = setInterval(() => {
      if (currentStepIndex < steps.length) {
        setAuditStep(steps[currentStepIndex]);
        currentStepIndex++;
      } else {
        clearInterval(interval);
        setIsAuditing(false);
        const newJob = {
          id: 100 + jobs.length + 1,
          docName: doc.name,
          frameworkName: fw.name,
          status: "COMPLETED",
          score: Math.floor(Math.random() * 25) + 75,
          date: new Date().toISOString().replace('T', ' ').substring(0, 16),
          eval: {
            faithfulness: Number((0.85 + Math.random() * 0.14).toFixed(2)),
            relevance: Number((0.82 + Math.random() * 0.17).toFixed(2)),
            recall: Number((0.87 + Math.random() * 0.12).toFixed(2))
          }
        };
        setJobs([newJob, ...jobs]);
      }
    }, 1200);
  };

  // Delete Document helper
  const handleDeleteDoc = (id: number) => {
    setDocuments(documents.filter(d => d.id !== id));
    if (selectedDocId === id) setSelectedDocId("");
  };

  return (
    <div className="flex min-h-screen bg-slate-950 font-sans text-slate-100">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-900 bg-slate-950/80 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-600/30">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">AEGISPACT</span>
            <span className="text-xs block text-indigo-500 font-semibold tracking-widest uppercase">AUDITOR</span>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5 flex-1">
          <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-2">Workspace</p>
          
          <button 
            onClick={() => setCurrentView("dashboard")}
            className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all text-left ${
              currentView === "dashboard" 
                ? "bg-indigo-950/40 border border-indigo-900/30 text-indigo-200" 
                : "text-slate-400 hover:bg-slate-900/50 hover:text-white"
            }`}
          >
            <Database className="h-4.5 w-4.5 text-indigo-400" />
            Dashboard
          </button>
          
          <button 
            onClick={() => setCurrentView("contracts")}
            className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all text-left ${
              currentView === "contracts" 
                ? "bg-indigo-950/40 border border-indigo-900/30 text-indigo-200" 
                : "text-slate-400 hover:bg-slate-900/50 hover:text-white"
            }`}
          >
            <FileText className="h-4.5 w-4.5 text-indigo-450" />
            Legal Contracts
          </button>
          
          <button 
            onClick={() => setCurrentView("frameworks")}
            className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all text-left ${
              currentView === "frameworks" 
                ? "bg-indigo-950/40 border border-indigo-900/30 text-indigo-200" 
                : "text-slate-400 hover:bg-slate-900/50 hover:text-white"
            }`}
          >
            <BookOpen className="h-4.5 w-4.5" />
            Frameworks
          </button>
          
          <button 
            onClick={() => setCurrentView("ragas")}
            className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all text-left ${
              currentView === "ragas" 
                ? "bg-indigo-950/40 border border-indigo-900/30 text-indigo-200" 
                : "text-slate-400 hover:bg-slate-900/50 hover:text-white"
            }`}
          >
            <BarChart3 className="h-4.5 w-4.5" />
            MLOps Quality Ragas
          </button>
        </nav>

        <div className="rounded-xl border border-indigo-900/30 bg-indigo-950/20 p-4">
          <div className="flex items-center gap-2 mb-2 text-indigo-400 text-xs font-semibold">
            <Activity className="h-4 w-4" />
            System Metrics
          </div>
          <p className="text-[10px] text-slate-400">Ragas Faithfulness Avg</p>
          <p className="text-lg font-bold text-indigo-200">91.0%</p>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        
        {/* Workspace Header */}
        <header className="flex items-center justify-between border-b border-slate-900 px-8 py-6 shrink-0 bg-slate-950/40">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white capitalize">
              {currentView === "dashboard" && "Compliance Workspace"}
              {currentView === "contracts" && "Ingested Legal Agreements"}
              {currentView === "frameworks" && "Audit Policy Frameworks"}
              {currentView === "ragas" && "MLOps Ragas Quality Monitor"}
            </h1>
            <p className="text-xs text-slate-400">
              {currentView === "dashboard" && "Perform RAG compliance audits and view the Celery execution status queue."}
              {currentView === "contracts" && "Manage uploaded documents, verify parsed structure manifests, and download records."}
              {currentView === "frameworks" && "Manage policy control checklists and verify rules configuration details."}
              {currentView === "ragas" && "Grounded factual indexing scores, answer relevance, and context precision analysis."}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3.5 py-1.5 text-xs text-slate-300">
            <UserCheck className="h-4 w-4 text-emerald-500" />
            Jane Doe (Acme Corp)
          </div>
        </header>

        {/* Content Pane */}
        <div className="flex-1 overflow-y-auto p-8 lg:p-10">

          {/* VIEW 1: DASHBOARD VIEW */}
          {currentView === "dashboard" && (
            <div className="space-y-8">
              {/* Top Cards Row */}
              <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="glass-card rounded-xl p-6">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Contracts Ingested</p>
                  <h3 className="text-3xl font-bold text-white mt-2">{documents.length}</h3>
                  <span className="text-[10px] text-slate-500 block mt-1">Multi-page parsed</span>
                </div>
                <div className="glass-card rounded-xl p-6">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Compliance Scores Avg</p>
                  <h3 className="text-3xl font-bold text-emerald-500 mt-2">85%</h3>
                  <span className="text-[10px] text-slate-500 block mt-1">GDPR & SOC2 metrics</span>
                </div>
                <div className="glass-card rounded-xl p-6">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Celery Workers</p>
                  <h3 className="text-3xl font-bold text-indigo-400 mt-2">2 Online</h3>
                  <span className="text-[10px] text-slate-500 block mt-1">Redis queue active</span>
                </div>
                <div className="glass-card rounded-xl p-6">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Faithfulness Index</p>
                  <h3 className="text-3xl font-bold text-white mt-2">91%</h3>
                  <span className="text-[10px] text-emerald-400 block mt-1 font-semibold">Zero hallucinations</span>
                </div>
              </section>

              {/* Ingestion and launch split grid */}
              <div className="grid gap-8 lg:grid-cols-12">
                {/* Upload panel */}
                <div className="glass-panel rounded-xl p-6 lg:col-span-5 flex flex-col justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                      <Upload className="h-5 w-5 text-indigo-400" />
                      Ingest New Contract
                    </h2>
                    <p className="text-xs text-slate-400 mb-6">Upload agreement files (PDF, Docx, TXT) to parse text layouts and visual tables.</p>

                    <form onSubmit={handleFileUpload} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-2">Contract File Name</label>
                        <input 
                          type="text" 
                          placeholder="e.g. vendor_sla_agreement.pdf"
                          value={newDocName}
                          onChange={(e) => setNewDocName(e.target.value)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <button 
                        type="submit" 
                        disabled={isUploading || !newDocName}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 transition-colors"
                      >
                        <PlusCircle className="h-4.5 w-4.5" />
                        Register & Parse PDF
                      </button>
                    </form>
                  </div>

                  {isUploading && (
                    <div className="mt-6 border border-slate-800 bg-slate-900/40 rounded-lg p-4">
                      <div className="flex justify-between text-xs text-slate-400 mb-2">
                        <span>Parsing layout structures...</span>
                        <span className="font-semibold">{uploadProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-150" style={{ width: `${uploadProgress}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Audit trigger panel */}
                <div className="glass-panel rounded-xl p-6 lg:col-span-7">
                  <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                    <Play className="h-5 w-5 text-emerald-400" />
                    Initiate Policy Compliance Audit
                  </h2>
                  <p className="text-xs text-slate-400 mb-6">Select an uploaded legal document and choose a regulatory criteria framework to verify compliance.</p>

                  <div className="grid gap-5 sm:grid-cols-2 mb-6">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-2">1. Select Contract Document</label>
                      <select 
                        value={selectedDocId} 
                        onChange={(e) => setSelectedDocId(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Choose Contract --</option>
                        {documents.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-2">2. Compliance Policy Framework</label>
                      <select 
                        value={selectedFwId} 
                        onChange={(e) => setSelectedFwId(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Choose Framework --</option>
                        {frameworks.map(f => (
                          <option key={f.id} value={f.id}>{f.name} ({f.rules.length} Rules)</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={handleTriggerAudit}
                    disabled={isAuditing || !selectedDocId || !selectedFwId}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 transition-colors shadow-lg shadow-emerald-950/20"
                  >
                    <Shield className="h-4.5 w-4.5" />
                    Trigger Asynchronous Audit Job
                  </button>

                  {isAuditing && (
                    <div className="mt-5 rounded-lg border border-slate-800/80 bg-slate-900/20 p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
                        <div>
                          <p className="text-xs font-semibold text-slate-200">{auditStep}</p>
                          <p className="text-[10px] text-slate-500">Task queued in Celery worker</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Jobs Queue Table */}
              <section className="glass-panel rounded-xl p-6">
                <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-400" />
                  Audit Jobs Queue & Results
                </h2>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-900/60 text-xs font-bold text-slate-300 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5 rounded-l-lg">Job ID</th>
                        <th className="px-6 py-3.5">Contract Name</th>
                        <th className="px-6 py-3.5">Framework Policy</th>
                        <th className="px-6 py-3.5 text-center">Audit Score</th>
                        <th className="px-6 py-3.5 text-center">Quality (Ragas)</th>
                        <th className="px-6 py-3.5">Execution Status</th>
                        <th className="px-6 py-3.5 rounded-r-lg text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="px-6 py-4 font-mono text-xs text-slate-500">#{job.id}</td>
                          <td className="px-6 py-4 font-medium text-slate-200">{job.docName}</td>
                          <td className="px-6 py-4 text-slate-400">{job.frameworkName}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              job.score >= 85 ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/40' : 'bg-amber-950/50 text-amber-400 border border-amber-900/40'
                            }`}>
                              {job.score.toFixed(1)}% Compliant
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-0.5 text-[10px] text-slate-500">
                              <span>Faithfulness: <b className="text-slate-300 font-semibold">{Math.round(job.eval.faithfulness * 100)}%</b></span>
                              <span>Recall: <b className="text-slate-300 font-semibold">{Math.round(job.eval.recall * 100)}%</b></span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                              <CheckCircle2 className="h-4 w-4" />
                              COMPLETED
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link 
                              href={`/audit/${job.id}`}
                              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300"
                            >
                              Verify Findings
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* VIEW 2: CONTRACTS MANAGER VIEW */}
          {currentView === "contracts" && (
            <div className="glass-panel rounded-xl p-6 space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-slate-900">
                <h3 className="text-base font-bold text-white">Repository Files</h3>
                <span className="text-xs text-slate-400">{documents.length} Agreements Registered</span>
              </div>
              
              <div className="grid gap-4">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex justify-between items-center p-4 border border-slate-900 rounded-xl bg-slate-950/20 hover:border-slate-800 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-950/50 border border-indigo-900/30 text-indigo-400">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-200 text-sm">{doc.name}</h4>
                        <p className="text-[10px] text-slate-500">Size: {doc.size} | Registered: {doc.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        doc.status === "COMPLETED" ? 'bg-emerald-950/40 text-emerald-400' : 'bg-rose-950/40 text-rose-450'
                      }`}>
                        {doc.status}
                      </span>
                      <button 
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="p-1.5 border border-slate-800 rounded-lg hover:border-rose-900 hover:text-rose-400 text-slate-500 transition-all"
                        title="Delete Document"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 3: FRAMEWORKS VIEW */}
          {currentView === "frameworks" && (
            <div className="space-y-6">
              {frameworks.map((fw) => (
                <div key={fw.id} className="glass-panel rounded-xl p-6 space-y-4">
                  <div className="pb-3 border-b border-slate-900 flex justify-between items-center">
                    <div>
                      <h3 className="text-base font-bold text-white">{fw.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{fw.description}</p>
                    </div>
                    <span className="text-[10px] font-mono font-bold bg-indigo-950/50 text-indigo-400 border border-indigo-900/30 rounded-full px-3 py-1">
                      {fw.rules.length} Rules Active
                    </span>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Compliance Criteria:</p>
                    {fw.rules.map((rule) => (
                      <div key={rule.rule_id} className="p-4 border border-slate-900 bg-slate-950/40 rounded-lg space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs font-bold text-indigo-400">{rule.rule_id}</span>
                          <span className="text-xs font-semibold text-slate-200">{rule.title}</span>
                        </div>
                        <p className="text-xs text-slate-400 pl-4 border-l border-slate-800 italic font-light">{rule.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VIEW 4: RAGAS MLOps VIEW */}
          {currentView === "ragas" && (
            <div className="space-y-8">
              {/* Avg chart mock card */}
              <div className="glass-panel rounded-xl p-6 space-y-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-400" />
                  Ragas Evaluation Averages
                </h3>
                <p className="text-xs text-slate-400">Average quality metrics logged over the last 15 audit jobs across API and Celery workers.</p>

                <div className="grid gap-6 sm:grid-cols-3">
                  <div className="p-4 border border-slate-900 rounded-lg bg-slate-950/20 text-center">
                    <p className="text-xs text-slate-400">Faithfulness</p>
                    <h4 className="text-2xl font-bold text-emerald-400 mt-1">91%</h4>
                    <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-3">
                      <div className="h-full bg-emerald-500" style={{ width: "91%" }}></div>
                    </div>
                  </div>
                  <div className="p-4 border border-slate-900 rounded-lg bg-slate-950/20 text-center">
                    <p className="text-xs text-slate-400">Answer Relevance</p>
                    <h4 className="text-2xl font-bold text-indigo-400 mt-1">88%</h4>
                    <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-3">
                      <div className="h-full bg-indigo-500" style={{ width: "88%" }}></div>
                    </div>
                  </div>
                  <div className="p-4 border border-slate-900 rounded-lg bg-slate-950/20 text-center">
                    <p className="text-xs text-slate-400">Context Recall</p>
                    <h4 className="text-2xl font-bold text-amber-500 mt-1">90%</h4>
                    <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden mt-3">
                      <div className="h-full bg-amber-500" style={{ width: "90%" }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Logger feed panel */}
              <div className="glass-panel rounded-xl p-6 space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="h-4.5 w-4.5 text-indigo-400" />
                    Structured structlog JSON Traces
                  </h3>
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Live Feed</span>
                </div>

                <div className="bg-black/40 border border-slate-900 rounded-xl p-4 font-mono text-[10px] text-slate-400 space-y-2 overflow-y-auto max-h-60 leading-relaxed">
                  <p><span className="text-indigo-400">{"[2026-06-28T08:12:40Z]"}</span> <span className="text-emerald-500">INFO</span>: audit_job_trace: stage="evaluation_completed" job_id=1 faithfulness=0.76 relevance=0.78 recall=0.82</p>
                  <p><span className="text-indigo-400">{"[2026-06-28T08:11:12Z]"}</span> <span className="text-amber-500">WARN</span>: ragas_library_fallback: job_id=1 reason="No module named 'ragas'"</p>
                  <p><span className="text-indigo-400">{"[2026-06-28T08:10:31Z]"}</span> <span className="text-indigo-400">INFO</span>: evaluation_started: job_id=1 size=2</p>
                  <p><span className="text-indigo-400">{"[2026-06-28T08:08:59Z]"}</span> <span className="text-emerald-500">INFO</span>: worker_task_completed: document_id=1 status="COMPLETED"</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
