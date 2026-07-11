/**
 * Skeleton loading components for AegisPact.AI.
 * Use these instead of spinners for layout-preserving loading states.
 */

import React from "react";

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-800/60 ${className}`}
      aria-hidden="true"
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-900 bg-slate-900/30 p-6 space-y-3">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-2.5 w-20" />
    </div>
  );
}

export function DocumentRowSkeleton() {
  return (
    <div className="flex justify-between items-center p-4 border border-slate-900 rounded-xl bg-slate-950/20">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-2.5 w-36" />
        </div>
      </div>
      <Skeleton className="h-5 w-20 rounded-full" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <Skeleton className="h-4 w-full max-w-[120px]" />
        </td>
      ))}
    </tr>
  );
}

export function FindingCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-5 space-y-3">
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-24 rounded-full" />
        <Skeleton className="h-5 w-28 rounded-full" />
      </div>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

export function AuditHeaderSkeleton() {
  return (
    <div className="rounded-xl border border-slate-900 bg-slate-900/20 p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-4 gap-4 pt-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
