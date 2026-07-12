"use client";

import React, { Suspense } from "react";
import AuditDetailClient from "./AuditDetailClient";

export default function AuditFindingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-sm text-slate-400">Loading audit scorecard...</div>
      </div>
    }>
      <AuditDetailClient />
    </Suspense>
  );
}
