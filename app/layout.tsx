import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OAuth Pathfinder",
  description: "How long will it take to get an OAuth app approved? Step-by-step, evidence-labelled guides for AI agent builders.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              OAuth <span className="text-indigo-600 dark:text-indigo-400">Pathfinder</span>
            </Link>
            <div className="flex gap-5 text-sm text-zinc-600 dark:text-zinc-400">
              <Link href="/" className="hover:text-zinc-900 dark:hover:text-white">Guides</Link>
              <Link href="/verification" className="hover:text-zinc-900 dark:hover:text-white">Verification</Link>
              <Link href="/eval" className="hover:text-zinc-900 dark:hover:text-white">Eval</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-zinc-200 py-4 text-center text-xs text-zinc-500 dark:border-zinc-800">
          Facts are labelled Tested, Docs, or Uncertain. Always confirm with the provider before you submit.
        </footer>
      </body>
    </html>
  );
}
