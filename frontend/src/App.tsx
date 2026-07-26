import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/react";
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
import { Notebook, QueryMessage } from "./components/types";

export function App() {
  const { getToken } = useAuth();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [activeCitationChunkId, setActiveCitationChunkId] = useState<string | null>(null);
  const [isLoadingQuery, setIsLoadingQuery] = useState(false);

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
            Authorization: `Bearer ${token}`
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
    try {
      const res = await fetch("/api/notebooks");
      if (!res.ok) return;
      const data: Notebook[] = await res.json();
      setNotebooks(data);

      if (data.length > 0 && !activeNotebookId) {
        setActiveNotebookId(data[0].id);
      } else if (data.length === 0) {
        // Auto-create initial default notebook
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
  }, [activeNotebookId]);

  useEffect(() => {
    fetchNotebooks();
  }, []);

  // Fetch active notebook details
  const fetchNotebookDetails = useCallback(async (id: string) => {
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
  }, []);

  useEffect(() => {
    if (activeNotebookId) {
      fetchNotebookDetails(activeNotebookId);
    }
  }, [activeNotebookId, fetchNotebookDetails]);

  const handleCreateNotebook = async (name?: string) => {
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

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground antialiased dark">
        <TopBar
          notebookName={activeNotebook?.name || "Notebook"}
          onCreateNotebook={() => handleCreateNotebook()}
          onNotebookNameChange={(newName) => activeNotebookId && handleRenameNotebook(activeNotebookId, newName)}
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
                onOpenAddSource={() => setIsAddSourceOpen(true)}
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
      </div>
    </TooltipProvider>
  );
}

export default App;
