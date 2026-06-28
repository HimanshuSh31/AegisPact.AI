import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AegisPact.AI | Enterprise Legal Compliance Auditor",
  description: "Automated Multi-Modal legal document layout parser, Hybrid RAG compliance scoring, and MLOps scorecard validator.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen text-slate-100 antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
