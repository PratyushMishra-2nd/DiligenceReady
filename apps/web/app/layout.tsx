import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DiligenceReady",
  description:
    "Continuous reconciliation of books, GST and bank data for Indian SMEs, built for the CA firms who do the work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen bg-paper font-sans text-[15px] leading-normal text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
