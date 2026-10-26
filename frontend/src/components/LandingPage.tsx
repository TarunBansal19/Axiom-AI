import React from "react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  FileText,
  Youtube,
  Globe,
  BookmarkCheck,
  RotateCcw,
  Layers,
  FileQuestion,
  Network,
  ShieldCheck,
  Check,
} from "lucide-react";

interface LandingPageProps {
  onEnterWorkspace: () => void;
  isSignedIn?: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterWorkspace,
  isSignedIn = false,
}) => {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-zinc-800 selection:text-white antialiased font-sans">
      {/* ─── NAVIGATION ─── */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#09090b]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
              <img src="/favicon.png" alt="AxiomAI Logo" className="w-4 h-4 object-contain" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-white">AxiomAI</span>
              <span className="text-[10px] text-zinc-500 font-mono">v2.0</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm" className="text-xs h-8 text-zinc-400 hover:text-white hover:bg-zinc-800">
                  Sign in
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button
                  size="sm"
                  className="text-xs h-8 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-medium px-3"
                >
                  Get Started
                </Button>
              </SignUpButton>
            </Show>

            <Show when="signed-in">
              <Button
                size="sm"
                onClick={onEnterWorkspace}
                className="text-xs h-8 bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-medium gap-1.5"
              >
                Open Workspace
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
              <UserButton />
            </Show>

            <Button
              variant="outline"
              size="sm"
              onClick={onEnterWorkspace}
              className="text-xs h-8 border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-300"
            >
              Open Workspace
            </Button>
          </div>
        </div>
      </header>

      {/* ─── HERO SECTION ─── */}
      <section className="pt-20 pb-16 px-4 sm:px-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/80 text-[11px] text-zinc-400 mb-6 font-mono">
          <span>Multimodal Research & Active Study Workspace</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-[1.15] mb-6">
          Research with precision. <br />
          <span className="text-zinc-400">Grounded by design.</span>
        </h1>

        <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed mb-8">
          Organize documents and lectures into isolated workspaces. Ingest PDFs, web links, or YouTube videos to chat with exact line citations, and generate flashcards, quizzes, and mind maps in seconds.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={onEnterWorkspace}
            className="w-full sm:w-auto h-11 px-6 bg-white hover:bg-zinc-200 text-zinc-950 font-medium text-sm gap-2"
          >
            Launch Research Workspace
            <ArrowRight className="w-4 h-4" />
          </Button>

          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto h-11 px-6 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-sm font-medium"
              >
                Sign In
              </Button>
            </SignInButton>
          </Show>
        </div>
      </section>

      {/* ─── CLEAN PRODUCT PREVIEW ─── */}
      <section className="pb-24 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
          {/* Mock App Window Header */}
          <div className="h-10 border-b border-zinc-800 bg-zinc-900/60 px-4 flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <span className="ml-2 font-mono text-[11px] text-zinc-400">workspace / Quantum Computing & Algorithms</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Qdrant Vector DB Connected
            </div>
          </div>

          {/* 3-Column Workspace Preview */}
          <div className="grid grid-cols-1 md:grid-cols-12 min-h-[460px]">
            {/* Col 1: Sources (3 cols) */}
            <div className="md:col-span-3 border-r border-zinc-800/80 p-4 bg-zinc-900/30 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Knowledge Sources
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 p-2 rounded-lg bg-zinc-800/60 border border-zinc-700/60 text-xs text-zinc-200">
                    <FileText className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="truncate font-medium">Shor_Algorithm_Review.pdf</span>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-zinc-800/40 text-xs text-zinc-400">
                    <Youtube className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="truncate">MIT 6.046J Lecture 18</span>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-zinc-800/40 text-xs text-zinc-400">
                    <Globe className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="truncate">Quantum Decoherence Nature</span>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-zinc-800/60 text-[11px] text-zinc-500 font-mono">
                3 sources indexed · 142 chunks
              </div>
            </div>

            {/* Col 2: Chat with Grounded Citations (6 cols) */}
            <div className="md:col-span-6 p-6 flex flex-col justify-between bg-zinc-950">
              <div className="space-y-4">
                {/* User Prompt */}
                <div className="flex justify-end">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-200 max-w-md">
                    How does Shor's algorithm achieve an exponential speedup?
                  </div>
                </div>

                {/* AI Grounded Response */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5">
                    A
                  </div>
                  <div className="flex-1 space-y-3 text-xs leading-relaxed text-zinc-300">
                    <p>
                      Shor's algorithm achieves an exponential speedup by converting integer factorization into period-finding of the function <code className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-200">f(x) = a^x mod N</code>.
                    </p>
                    <p>
                      Using the Quantum Fourier Transform (QFT), the period is extracted in polynomial time <code className="bg-zinc-900 px-1 py-0.5 rounded text-zinc-200">O((log N)³)</code>, compared to classical sub-exponential methods.
                    </p>

                    {/* Clean Citation Chip */}
                    <div className="pt-2 border-t border-zinc-800/80">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer">
                        <BookmarkCheck className="w-3 h-3 text-zinc-400" />
                        <span>Shor_Algorithm_Review.pdf · p. 12</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input Box Mock */}
              <div className="pt-4">
                <div className="h-10 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 flex items-center justify-between text-xs text-zinc-500">
                  <span>Ask a grounded question about your sources...</span>
                  <span className="text-[10px] font-mono border border-zinc-800 px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400">
                    Return ↵
                  </span>
                </div>
              </div>
            </div>

            {/* Col 3: Axiom Studio (3 cols) */}
            <div className="md:col-span-3 border-l border-zinc-800/80 p-4 bg-zinc-900/30 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Axiom Studio
                </div>
                <div className="space-y-2">
                  <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between text-xs font-medium text-white mb-1">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Flashcards</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">15 cards</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">Spaced repetition review deck</p>
                  </div>

                  <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between text-xs font-medium text-white mb-1">
                      <div className="flex items-center gap-2">
                        <FileQuestion className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Practice Quiz</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">10 questions</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">Multiple choice with rationales</p>
                  </div>

                  <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:border-zinc-700 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between text-xs font-medium text-white mb-1">
                      <div className="flex items-center gap-2">
                        <Network className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Mind Map</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">Tree</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">Interactive concept hierarchy</p>
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={onEnterWorkspace}
                className="w-full text-xs h-8 border-zinc-800 hover:bg-zinc-800 text-zinc-300 mt-4"
              >
                Open Studio
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3 CORE CAPABILITY PILLARS ─── */}
      <section className="py-16 border-t border-zinc-800/80 bg-zinc-950 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
              Built for serious research
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              No hallucinations, no fluff. Just structured recall and grounded answers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">Multimodal Ingestion</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Ingest PDFs, web articles, text notes, and YouTube playlists. Transcripts are automatically extracted with millisecond timestamp markers.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                <BookmarkCheck className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">Grounded Citations</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                RAG pipeline utilizes Qdrant vector search and step-back query expansion. Every claim references verbatim source chunks and video timestamps.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                <RotateCcw className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-white">Active Studio</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Transform material into spaced-repetition flashcards, multiple-choice quizzes with detailed rationales, and hierarchical D3 mind maps.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-zinc-800/80 py-8 px-4 sm:px-6 text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-300">AxiomAI</span>
            <span>· Research Workspace</span>
          </div>

          <div className="flex items-center gap-4 text-zinc-400">
            <button onClick={onEnterWorkspace} className="hover:text-white transition-colors">
              Workspace
            </button>
            <span className="text-zinc-700">·</span>
            <span>Neon + Qdrant + S3</span>
          </div>

          <div>© {new Date().getFullYear()} AxiomAI</div>
        </div>
      </footer>
    </div>
  );
};
