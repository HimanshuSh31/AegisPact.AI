"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { 
  ArrowLeft, Shield, AlertCircle, AlertTriangle, CheckCircle2, 
  HelpCircle, Scale, FileText, ChevronRight, CornerDownRight, 
  Bookmark, BarChart3, Star, Layers, ScrollText
} from "lucide-react";

// Mock Detailed Audit Result Data for simulated fetch
const MOCK_AUDIT_REPORT = {
  id: 101,
  document: {
    id: 2,
    name: "gdpr_data_processing_addendum.pdf",
    size: "820 KB",
    type: "PDF",
    text_content: [
      {
        page: 1,
        content: `ACME CORPORATION - DATA PROCESSING ADDENDUM
Effective Date: March 15, 2026

This Data Processing Addendum ("DPA") supplements the Master Services Agreement ("Agreement") between Acme Corporation ("Acme") and the customer party ("Customer").

1. DEFINITIONS AND APPLICABILITY
"GDPR" means the General Data Protection Regulation (Regulation (EU) 2016/679).
"Personal Data" means any information relating to an identified or identifiable natural person processed under the Agreement.

2. DATA PROCESSING LAWFULNESS (GDPR Art. 6)
Acme processes Personal Data solely to perform the services detailed in Section 3 of this agreement. 
[CITATION_1]: Acme does not obtain user consent explicitly before tracking user geolocation data, relying solely on corporate system configuration default settings. Users may configure location tracking status on their device settings.`
      },
      {
        page: 2,
        content: `3. TRANFERS TO THIRD PARTIES (GDPR Art. 13)
[CITATION_2]: Personal Data processed under this agreement may be shared with the following subprocessors:
- Analytics Inc. (Telemetry Processing, Delaware, USA)
- Marketing LLC. (Targeted Email Infrastructure, California, USA)

4. TECHNICAL AND ORGANIZATIONAL MEASURES (GDPR Art. 32)
Acme shall implement administrative, physical, and technical safeguards. All storage servers are hosted in public cloud facilities. Backups are performed periodically, though encryption key rotation is scheduled manually once every eighteen months.

5. RETENTION AND DELETION
Upon termination, Acme will delete customer personal data within 180 days, unless statutory preservation requirements prevent deletion.`
      }
    ]
  },
  framework: {
    name: "GDPR Compliance Framework",
    description: "General Data Protection Regulation audit checks for corporate vendor agreements."
  },
  score: 66.7, // 2 out of 3 rules compliant/warning
  eval: {
    faithfulness: 0.94,
    relevance: 0.91,
    recall: 0.89
  },
  findings: [
    {
      id: "f1",
      rule_id: "GDPR-Art6",
      title: "Lawfulness of Processing (Consent)",
      status: "NON_COMPLIANT",
      severity: "HIGH",
      page: 1,
      clause: "Acme does not obtain user consent explicitly before tracking user geolocation data, relying solely on corporate system configuration default settings.",
      explanation: "GDPR Article 6 requires explicit consent or a documented legitimate interest prior to processing sensitive telemetry/location data. Defaulting tracking configuration without consent is non-compliant."
    },
    {
      id: "f2",
      rule_id: "GDPR-Art13",
      title: "Provision of Subprocessor Records",
      status: "COMPLIANT",
      severity: "INFO",
      page: 2,
      clause: "Personal Data processed under this agreement may be shared with the following subprocessors:\n- Analytics Inc. (Telemetry Processing, Delaware, USA)\n- Marketing LLC. (Targeted Email Infrastructure, California, USA)",
      explanation: "GDPR Article 13 requires transparency regarding the recipients of personal data. The contract clearly lists the subprocessors, their purpose, and geolocation."
    },
    {
      id: "f3",
      rule_id: "GDPR-Art32",
      title: "Security of Processing (Encryption Key Rotation)",
      status: "WARNING",
      severity: "MEDIUM",
      page: 2,
      clause: "Backups are performed periodically, though encryption key rotation is scheduled manually once every eighteen months.",
      explanation: "Manual key rotation scheduled at an interval of 18 months represents a safety risk. Best practices suggest automated rotation cycles at least once every 12 months."
    }
  ]
};

export default function AuditReportView({ params }: { params: { id: string } }) {
  const report = MOCK_AUDIT_REPORT; // Simulate fetching by params.id
  const [activeTab, setActiveTab] = useState<"findings" | "scorecard">("findings");
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [highlightedText, setHighlightedText] = useState<string | null>(null);
  const pageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const handleFindingClick = (finding: typeof report.findings[0]) => {
    setSelectedFindingId(finding.id);
    setHighlightedText(finding.clause);
    
    // Smooth scroll to the corresponding page in the left pane
    const element = pageRefs.current[finding.page];
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Helper function to render text content and highlight active citations
  const renderPageText = (text: string) => {
    if (!highlightedText) return text;
    
    // Check if the current paragraph contains the citation snippet
    const parts = text.split(highlightedText);
    if (parts.length > 1) {
      return (
        <>
          {parts[0]}
          <span className="bg-indigo-900/60 border border-indigo-500 text-indigo-100 rounded px-1 font-medium transition-all duration-300 shadow-sm shadow-indigo-500/20">
            {highlightedText}
          </span>
          {parts[1]}
        </>
      );
    }
    return text;
  };

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Top Header */}
      <header className="flex h-16 items-center justify-between border-b border-slate-900 bg-slate-950/70 px-6 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link 
            href="/" 
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/40 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div className="h-4 w-px bg-slate-800"></div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-200 text-sm">{report.document.name}</span>
              <span className="rounded-full bg-slate-900 border border-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                {report.document.type}
              </span>
            </div>
            <p className="text-[10px] text-slate-500">Framework: {report.framework.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Compliance Score:</span>
            <span className="rounded bg-indigo-950/80 border border-indigo-900/40 px-2.5 py-1 font-bold text-indigo-400">
              {report.score}%
            </span>
          </div>
        </div>
      </header>

      {/* Main Split Screen */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Panel: Legal Document Viewer (6 Columns) */}
        <main className="w-[50%] overflow-y-auto p-8 border-r border-slate-900 bg-[#06090f]/70">
          <div className="max-w-2xl mx-auto flex flex-col gap-8">
            <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-widest font-semibold pb-2 border-b border-slate-900">
              <span>Document Text Manifest</span>
              <span className="flex items-center gap-1.5"><ScrollText className="h-4 w-4" /> Layout Coordinates Active</span>
            </div>

            {report.document.text_content.map((pageData) => (
              <div 
                key={pageData.page}
                ref={(el) => { pageRefs.current[pageData.page] = el; }}
                className="relative rounded-xl border border-slate-900 bg-slate-950/40 p-8 shadow-sm transition-all duration-300"
              >
                {/* Page Number Badge */}
                <div className="absolute top-4 right-4 flex h-6 w-12 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono font-bold text-slate-500">
                  PAGE {pageData.page}
                </div>

                {/* Page Content */}
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300 font-light select-text">
                  {renderPageText(pageData.content)}
                </pre>
              </div>
            ))}
          </div>
        </main>

        {/* Right Panel: Audit Scorecard & Findings (6 Columns) */}
        <section className="w-[50%] flex flex-col overflow-hidden bg-slate-950">
          {/* Tabs */}
          <div className="flex border-b border-slate-900 bg-slate-950/50">
            <button 
              onClick={() => setActiveTab("findings")}
              className={`flex-1 py-4 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all ${
                activeTab === "findings" 
                  ? "border-indigo-500 text-indigo-400 bg-indigo-950/5" 
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Shield className="h-4.5 w-4.5" />
              Compliance Findings ({report.findings.length})
            </button>
            <button 
              onClick={() => setActiveTab("scorecard")}
              className={`flex-1 py-4 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 border-b-2 transition-all ${
                activeTab === "scorecard" 
                  ? "border-indigo-500 text-indigo-400 bg-indigo-950/5" 
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart3 className="h-4.5 w-4.5" />
              MLOps Ragas Scorecard
            </button>
          </div>

          {/* Tab Contents */}
          <div className="flex-1 overflow-y-auto p-6 lg:p-8">
            
            {/* Findings Tab */}
            {activeTab === "findings" && (
              <div className="flex flex-col gap-6">
                <div className="rounded-xl border border-slate-900 bg-slate-950/60 p-4 text-xs text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-200 block mb-1">Interactive Verification:</span>
                  Click on any non-compliance finding below to automatically highlight the corresponding contract clause citation and scroll the document viewer.
                </div>

                {report.findings.map((finding) => (
                  <div 
                    key={finding.id}
                    onClick={() => handleFindingClick(finding)}
                    className={`rounded-xl border p-5 text-left transition-all cursor-pointer glass-card ${
                      selectedFindingId === finding.id 
                        ? "border-indigo-500/50 bg-indigo-950/15" 
                        : "border-slate-900 bg-slate-950/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span className="font-mono text-[10px] text-slate-500 uppercase block mb-1 font-bold">{finding.rule_id}</span>
                        <h3 className="font-bold text-slate-200 text-sm">{finding.title}</h3>
                      </div>
                      
                      {/* Status Tag */}
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        finding.status === "COMPLIANT" 
                          ? "bg-emerald-950/50 text-emerald-400 border border-emerald-900/40" 
                          : finding.status === "WARNING"
                          ? "bg-amber-950/50 text-amber-400 border border-amber-900/40"
                          : "bg-rose-950/50 text-rose-400 border border-rose-900/40"
                      }`}>
                        {finding.status === "COMPLIANT" && <CheckCircle2 className="h-3 w-3" />}
                        {finding.status === "WARNING" && <AlertTriangle className="h-3 w-3" />}
                        {finding.status === "NON_COMPLIANT" && <AlertCircle className="h-3 w-3" />}
                        {finding.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed mb-4">{finding.explanation}</p>

                    {/* Citation block */}
                    <div className="rounded-lg border border-slate-900 bg-slate-950/80 p-3.5 flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                        <Bookmark className="h-3.5 w-3.5 text-indigo-400" />
                        Verbatim Citation (Page {finding.page})
                      </div>
                      <blockquote className="text-xs italic text-indigo-300 font-light pl-3.5 border-l border-slate-800">
                        "{finding.clause}"
                      </blockquote>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scorecard Tab */}
            {activeTab === "scorecard" && (
              <div className="flex flex-col gap-8">
                
                {/* Score Summary Gauge */}
                <div className="rounded-xl border border-slate-900 bg-slate-900/10 p-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-200 mb-1">Contract Health Score</h3>
                    <p className="text-xs text-slate-400 pr-4">Derived from total criteria compliance status. 100% compliance is optimal.</p>
                  </div>
                  <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 border-indigo-600/40 bg-indigo-950/20 shadow-lg shadow-indigo-950/30">
                    <span className="text-xl font-bold text-white">{report.score}%</span>
                    <span className="text-[9px] font-semibold text-indigo-400 tracking-wider">HEALTH</span>
                  </div>
                </div>

                {/* Ragas Metrics */}
                <div>
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Scale className="h-4.5 w-4.5 text-indigo-400" />
                    Ragas Hallucination & Quality Metrics
                  </h3>

                  <div className="grid gap-6">
                    {/* Faithfulness */}
                    <div className="rounded-xl border border-slate-900 bg-slate-950/20 p-5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-slate-200">Faithfulness Index</span>
                        <span className="text-sm font-bold text-emerald-400">{Math.round(report.eval.faithfulness * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden mb-3">
                        <div className="h-full bg-emerald-500" style={{ width: `${report.eval.faithfulness * 100}%` }}></div>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Measures whether the compliance findings explanations are grounded *only* in the retrieved contract clauses. A score of 94% indicates high factual fidelity.
                      </p>
                    </div>

                    {/* Answer Relevance */}
                    <div className="rounded-xl border border-slate-900 bg-slate-950/20 p-5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-slate-200">Answer Relevance</span>
                        <span className="text-sm font-bold text-indigo-400">{Math.round(report.eval.relevance * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden mb-3">
                        <div className="h-full bg-indigo-500" style={{ width: `${report.eval.relevance * 100}%` }}></div>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Measures whether the auditing explanations directly address the framework rule criteria. A score of 91% guarantees focus.
                      </p>
                    </div>

                    {/* Context Recall */}
                    <div className="rounded-xl border border-slate-900 bg-slate-950/20 p-5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-slate-200">Context Recall</span>
                        <span className="text-sm font-bold text-amber-400">{Math.round(report.eval.recall * 100)}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden mb-3">
                        <div className="h-full bg-amber-500" style={{ width: `${report.eval.recall * 100}%` }}></div>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Measures if the Hybrid retrieval engine successfully fetched all correct contract clauses to audit the specific framework rules.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </section>

      </div>
    </div>
  );
}
