import React, { useState, useEffect, useCallback } from "react";
import { useAuth, useUser } from "@clerk/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { AddSourceModal } from "./components/AddSourceModal";
import { ChatView } from "./components/ChatView";
import { SourceViewer } from "./components/SourceViewer";
import { StudioPanel } from "./components/studio/StudioPanel";
import { LandingPage } from "./components/LandingPage";
import { Notebook, QueryMessage } from "./components/types";
import { Upload } from "lucide-react";

// Pre-loaded high-quality demo notebook for unauthenticated / preview users
const DEMO_NOTEBOOK: Notebook = {
  id: "demo-notebook-quantum",
  name: "Quantum Computing & Quantum Algorithms",
  isPinned: true,
  createdAt: new Date().toISOString(),
  sources: [
    {
      id: "demo-src-pdf",
      notebookId: "demo-notebook-quantum",
      type: "PDF",
      originalUri: "Quantum_Algorithms_Review.pdf",
      title: "Quantum Algorithms & Shor's Factoring Review",
      status: "READY",
      createdAt: new Date().toISOString(),
    },
    {
      id: "demo-src-yt",
      notebookId: "demo-notebook-quantum",
      type: "YOUTUBE",
      originalUri: "https://www.youtube.com/watch?v=F_Riqjdh2oM",
      title: "MIT 6.046J Quantum Algorithms: Grover Search",
      status: "READY",
      createdAt: new Date().toISOString(),
    },
    {
      id: "demo-src-playlist",
      notebookId: "demo-notebook-quantum",
      type: "youtube_playlist",
      originalUri: "https://www.youtube.com/playlist?list=PL123456789",
      title: "Quantum Computation Lecture Series (8 Lectures)",
      status: "READY",
      createdAt: new Date().toISOString(),
    },
  ],
  queries: [
    {
      id: "demo-q1",
      notebookId: "demo-notebook-quantum",
      question: "How does Shor's algorithm achieve an exponential speedup?",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      answer: {
        id: "demo-ans-1",
        queryId: "demo-q1",
        createdAt: new Date().toISOString(),
        text: "Shor's algorithm achieves an exponential speedup over classical factoring methods by transforming the problem of factoring an integer N into finding the period (order) of a function f(x) = a^x mod N.\n\nWhile classical algorithms like the General Number Field Sieve (GNFS) require sub-exponential time O(exp(c * (log N)^(1/3))), Shor's algorithm leverages the Quantum Fourier Transform (QFT) to extract this periodicity in polynomial time O((log N)³).\n\nThis drastic reduction in complexity means a sufficiently large fault-tolerant quantum computer could break standard RSA encryption in seconds.",
        citations: JSON.stringify([
          {
            chunkId: "demo-chunk-shor",
            sourceTitle: "Quantum Algorithms & Shor's Factoring Review",
            location: { type: "text", page: 12, charStart: 120, charEnd: 480 },
            snippet: "Shor demonstrated that period finding on a superposition of states via the Quantum Fourier Transform computes the order r in polynomial time O((log N)³).",
          },
        ]),
      },
    },
  ],
};

export function App() {
  const { getToken } = useAuth();
  const { isSignedIn, isLoaded } = useUser();
  const [viewMode, setViewMode] = useState<"landing" | "workspace">("landing");
  const [hasUserChosenView, setHasUserChosenView] = useState(false);

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [activeCitationChunkId, setActiveCitationChunkId] = useState<string | null>(null);
  const [isLoadingQuery, setIsLoadingQuery] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingStatus, setUploadingStatus] = useState<string | null>(null);

  // Auto-switch to workspace when authenticated user signs in
  useEffect(() => {
    if (isLoaded && isSignedIn && !hasUserChosenView) {
      setViewMode("workspace");
    }
  }, [isLoaded, isSignedIn, hasUserChosenView]);

  // Global fetch interceptor to inject Clerk auth token
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      // Only attach token to our internal /api calls
      if (typeof input === "string" && input.startsWith("/api")) {
        const token = await getToken();
        if (token) {
          init = init || {};
          init.headers = {
            ...init.headers,
            Authorization: `Bearer ${token}`,
          };
        }
      }
      return originalFetch(input, init);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [getToken]);

  // Fetch all notebooks
  const fetchNotebooks = useCallback(async () => {
    if (!isSignedIn) {
      // Load demo notebook for preview users
      setNotebooks([DEMO_NOTEBOOK]);
      setActiveNotebookId(DEMO_NOTEBOOK.id);
      setActiveNotebook(DEMO_NOTEBOOK);
      return;
    }

    try {
      const res = await fetch("/api/notebooks");
      if (!res.ok) return;
      const data: Notebook[] = await res.json();
      setNotebooks(data);

      if (data.length > 0) {
        if (!activeNotebookId || !data.some((n) => n.id === activeNotebookId)) {
          setActiveNotebookId(data[0].id);
        }
      } else if (data.length === 0) {
        // Auto-create initial default notebook for new logged-in users
        const createRes = await fetch("/api/notebooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "My Research Notebook" }),
        });
        if (createRes.ok) {
          const newNb: Notebook = await createRes.json();
          setNotebooks([newNb]);
          setActiveNotebookId(newNb.id);
          setActiveNotebook(newNb);
        }
      }
    } catch (err) {
      console.error("Failed to fetch notebooks:", err);
    }
  }, [isSignedIn, activeNotebookId]);

  useEffect(() => {
    fetchNotebooks();
  }, [fetchNotebooks]);

  // Fetch active notebook details
  const fetchNotebookDetails = useCallback(async (id: string) => {
    if (!isSignedIn || id.startsWith("demo-")) {
      if (id === DEMO_NOTEBOOK.id) {
        setActiveNotebook(DEMO_NOTEBOOK);
      }
      return;
    }

    try {
      const res = await fetch(`/api/notebooks/${id}`);
      if (!res.ok) return;
      const data: Notebook = await res.json();
      setActiveNotebook(data);
      setNotebooks((prev) =>
        prev.map((nb) => (nb.id === id ? { ...nb, sources: data.sources } : nb))
      );
    } catch (err) {
      console.error("Failed to fetch notebook details:", err);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (activeNotebookId) {
      fetchNotebookDetails(activeNotebookId);
    }
  }, [activeNotebookId, fetchNotebookDetails]);

  const handleCreateNotebook = async (name?: string) => {
    if (!isSignedIn) {
      alert("Please sign in or create an account to create your own notebooks!");
      return;
    }

    const inputName = name || prompt("Enter notebook name:", `Notebook ${notebooks.length + 1}`);
    if (inputName === null) return; // User cancelled
    const notebookName = inputName.trim() || `Notebook ${notebooks.length + 1}`;

    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: notebookName }),
      });
      if (res.ok) {
        const newNb: Notebook = await res.json();
        setNotebooks((prev) => [newNb, ...prev]);
        setActiveNotebookId(newNb.id);
        setActiveNotebook(newNb);
      } else {
        alert("Failed to create notebook. Please try again.");
      }
    } catch (err) {
      alert("Failed to create notebook");
    }
  };

  const handleRenameNotebook = async (id: string, newName: string) => {
    if (!isSignedIn || id.startsWith("demo-")) {
      setActiveNotebook((prev) => (prev ? { ...prev, name: newName } : null));
      setNotebooks((prev) => prev.map((nb) => (nb.id === id ? { ...nb, name: newName } : nb)));
      return;
    }

    try {
      await fetch(`/api/notebooks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (activeNotebookId === id) {
        setActiveNotebook((prev) => (prev ? { ...prev, name: newName } : null));
      }
      setNotebooks((prev) =>
        prev.map((nb) => (nb.id === id ? { ...nb, name: newName } : nb))
      );
    } catch (err) {
      console.error("Failed to rename notebook:", err);
    }
  };

  const handleDeleteNotebook = async (id: string) => {
    if (!confirm("Are you sure you want to delete this notebook?")) return;

    if (!isSignedIn || id.startsWith("demo-")) {
      setNotebooks((prev) => prev.filter((nb) => nb.id !== id));
      if (activeNotebookId === id) {
        setActiveNotebookId(notebooks.find((nb) => nb.id !== id)?.id || null);
      }
      return;
    }

    try {
      await fetch(`/api/notebooks/${id}`, { method: "DELETE" });
      setNotebooks((prev) => prev.filter((nb) => nb.id !== id));
      if (activeNotebookId === id) {
        setActiveNotebookId(notebooks.find((nb) => nb.id !== id)?.id || null);
      }
    } catch (err) {
      console.error("Failed to delete notebook:", err);
    }
  };

  const handlePinNotebook = async (id: string, isPinned: boolean) => {
    if (!isSignedIn || id.startsWith("demo-")) {
      setNotebooks((prev) => prev.map((nb) => (nb.id === id ? { ...nb, isPinned } : nb)));
      if (activeNotebookId === id) {
        setActiveNotebook((prev) => (prev ? { ...prev, isPinned } : null));
      }
      return;
    }

    try {
      await fetch(`/api/notebooks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned }),
      });
      setNotebooks((prev) =>
        prev.map((nb) => (nb.id === id ? { ...nb, isPinned } : nb))
      );
      if (activeNotebookId === id) {
        setActiveNotebook((prev) => (prev ? { ...prev, isPinned } : null));
      }
    } catch (err) {
      console.error("Failed to pin notebook:", err);
    }
  };

  const sortedNotebooks = [...notebooks].sort((a, b) => {
    if (a.isPinned === b.isPinned) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return a.isPinned ? -1 : 1;
  });

  const handleSendMessage = async (question: string) => {
    if (!activeNotebookId) return;
    setIsLoadingQuery(true);

    // Optimistically push user message
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: QueryMessage = {
      id: tempId,
      notebookId: activeNotebookId,
      question,
      createdAt: new Date().toISOString(),
    };

    setActiveNotebook((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        queries: [...(prev.queries || []), optimisticMsg],
      };
    });

    // If demo mode (unauthenticated), synthesize a realistic grounded response
    if (!isSignedIn || activeNotebookId.startsWith("demo-")) {
      setTimeout(() => {
        const demoResponse: QueryMessage = {
          id: `demo-msg-${Date.now()}`,
          notebookId: activeNotebookId,
          question,
          createdAt: new Date().toISOString(),
          answer: {
            id: `demo-ans-${Date.now()}`,
            queryId: tempId,
            createdAt: new Date().toISOString(),
            text: `Based on your quantum computing sources, "${question}" addresses core principles of quantum acceleration:\n\n1. **State Space Complexity**: In an n-qubit system, the state exists in a 2^n dimensional Hilbert space. Quantum algorithms utilize constructive and destructive interference to amplify the probability of measuring correct computational outcomes.\n\n2. **Grounded Algorithmic Bounds**: Grover's algorithm rotates state vectors with quadratic speedup O(√N), while Shor's algorithm utilizes the Quantum Fourier Transform for exponential period-finding.\n\n*Note: You are currently viewing AxiomAI in demo mode. Sign in to upload custom research PDFs, YouTube lectures, and web articles!*`,
            citations: JSON.stringify([
              {
                chunkId: "demo-chunk-shor",
                sourceTitle: "Quantum Algorithms & Shor's Factoring Review",
                location: { type: "text", page: 12, charStart: 120, charEnd: 480 },
                snippet: "Quantum amplitude amplification and phase estimation form the core building blocks for polynomial quantum acceleration.",
              },
            ]),
          },
        };

        setActiveNotebook((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            queries: [...(prev.queries || []).filter((q) => q.id !== tempId), demoResponse],
          };
        });
        setIsLoadingQuery(false);
      }, 900);
      return;
    }

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebookId: activeNotebookId, question }),
      });

      if (!res.ok) throw new Error(await res.text());

      // Refresh full notebook to get persisted answer and citations
      await fetchNotebookDetails(activeNotebookId);
    } catch (err) {
      alert(`Query failed: ${(err as Error).message}`);
    } finally {
      setIsLoadingQuery(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!isSignedIn) {
      alert("Please sign in or create an account to upload your own knowledge sources!");
      return;
    }

    if (!activeNotebookId) {
      alert("Please select or create a notebook first!");
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      setUploadingStatus(`Ingesting ${file.name}...`);
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (ext === "txt" || ext === "md") {
          const textContent = await file.text();
          const res = await fetch("/api/sources", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              notebookId: activeNotebookId,
              type: "TEXT",
              textContent,
              title: file.name,
            }),
          });
          if (!res.ok) throw new Error(await res.text());
        } else {
          const formData = new FormData();
          formData.append("notebookId", activeNotebookId);
          formData.append("type", ext === "vtt" ? "VTT" : "PDF");
          formData.append("file", file);
          formData.append("title", file.name);

          const res = await fetch("/api/sources", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error(await res.text());
        }
      } catch (err) {
        alert(`Failed to ingest ${file.name}: ${(err as Error).message}`);
      }
    }

    setUploadingStatus(null);
    fetchNotebookDetails(activeNotebookId);
    fetchNotebooks();
  };

  // If user is on the Landing Page, render the premier Landing Page
  if (viewMode === "landing") {
    return (
      <TooltipProvider>
        <LandingPage
          isSignedIn={isSignedIn}
          onEnterWorkspace={() => {
            setHasUserChosenView(true);
            setViewMode("workspace");
          }}
        />
      </TooltipProvider>
    );
  }

  // Workspace View
  return (
    <TooltipProvider>
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative flex flex-col h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100 antialiased dark"
      >
        <TopBar
          notebookName={activeNotebook?.name || "Notebook"}
          onCreateNotebook={() => handleCreateNotebook()}
          onNotebookNameChange={(newName) => activeNotebookId && handleRenameNotebook(activeNotebookId, newName)}
          onGoToLanding={() => {
            setHasUserChosenView(true);
            setViewMode("landing");
          }}
        />

        {/* Main Content Area with Resizable Panels */}
        <div className="flex-1 min-h-0 relative">
          <ResizablePanelGroup id="axiom-workspace-v4" direction="horizontal" className="h-full w-full">
            {/* Left Panel: Sources (~22%) */}
            <ResizablePanel id="sources-panel" defaultSize="22%" minSize="15%" maxSize="40%">
              <Sidebar
                notebooks={sortedNotebooks}
                activeNotebookId={activeNotebookId}
                sources={activeNotebook?.sources || []}
                onSelectNotebook={(id) => {
                  if (id !== activeNotebookId) {
                    setActiveNotebookId(id);
                    setActiveNotebook(null);
                    setActiveCitationChunkId(null);
                  }
                }}
                onCreateNotebook={handleCreateNotebook}
                onDeleteNotebook={handleDeleteNotebook}
                onRenameNotebook={handleRenameNotebook}
                onPinNotebook={handlePinNotebook}
                onOpenAddSource={() => {
                  if (!isSignedIn) {
                    alert("Please sign in or create an account to upload your own knowledge sources!");
                    return;
                  }
                  setIsAddSourceOpen(true);
                }}
                onRefreshNotebook={fetchNotebookDetails}
              />
            </ResizablePanel>

            <ResizableHandle id="handle-1" withHandle />

            {/* Center Panel: Chat (~46%) */}
            <ResizablePanel id="chat-panel" defaultSize="46%" minSize="25%">
              <ChatView
                notebookId={activeNotebookId || ""}
                notebookName={activeNotebook?.name}
                messages={activeNotebook?.queries || []}
                onSendMessage={handleSendMessage}
                onCitationClick={(chunkId) => setActiveCitationChunkId(chunkId)}
                isLoading={isLoadingQuery}
                sourceCount={activeNotebook?.sources?.length || 0}
                onOpenAddSource={() => {
                  if (!isSignedIn) {
                    alert("Please sign in or create an account to upload your own knowledge sources!");
                    return;
                  }
                  setIsAddSourceOpen(true);
                }}
              />
            </ResizablePanel>

            <ResizableHandle id="handle-2" withHandle />

            {/* Right Panel: Studio (~32%) */}
            <ResizablePanel id="studio-panel" defaultSize="32%" minSize="20%" maxSize="50%">
              <StudioPanel
                notebookId={activeNotebookId || ""}
                notebookName={activeNotebook?.name || "Notebook"}
                sources={activeNotebook?.sources || []}
              />
            </ResizablePanel>
          </ResizablePanelGroup>

          {/* Citation source viewer — fixed overlay on the right */}
          <SourceViewer
            chunkId={activeCitationChunkId}
            onClose={() => setActiveCitationChunkId(null)}
          />
        </div>

        {/* Add Source Modal */}
        {activeNotebookId && (
          <AddSourceModal
            notebookId={activeNotebookId}
            isOpen={isAddSourceOpen}
            onClose={() => setIsAddSourceOpen(false)}
            onSourceAdded={() => {
              fetchNotebookDetails(activeNotebookId);
              fetchNotebooks();
            }}
          />
        )}
        {/* Full-Window Drag-and-Drop Ingestion Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-sm m-3 rounded-2xl border-2 border-dashed border-zinc-600 flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white mb-2 shadow-2xl">
              <Upload className="w-6 h-6 animate-pulse" />
            </div>
            <div className="text-sm font-semibold text-white">
              Drop to ingest into {activeNotebook?.name || "notebook"}
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              Supports PDF documents, text notes (.txt, .md), and VTT subtitles
            </div>
          </div>
        )}

        {/* Uploading Status Toast */}
        {uploadingStatus && (
          <div className="fixed bottom-4 right-4 z-50 bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-2">
            <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
            <span>{uploadingStatus}</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default App;
