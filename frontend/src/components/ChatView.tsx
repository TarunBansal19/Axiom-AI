import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, BookmarkCheck } from "lucide-react";
import { QueryMessage, Citation } from "./types";
import { NotebookOverviewCard } from "./NotebookOverviewCard";

interface ChatViewProps {
  notebookId: string;
  notebookName?: string;
  messages: QueryMessage[];
  onSendMessage: (question: string) => Promise<void>;
  onCitationClick: (chunkId: string) => void;
  isLoading: boolean;
  sourceCount: number;
}

export const ChatView: React.FC<ChatViewProps> = ({
  notebookId,
  notebookName,
  messages,
  onSendMessage,
  onCitationClick,
  isLoading,
  sourceCount,
}) => {
  const [inputQuery, setInputQuery] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isLoading) return;
    const q = inputQuery.trim();
    setInputQuery("");
    await onSendMessage(q);
  };

  const parseCitations = (citationsRaw: any): Citation[] => {
    if (!citationsRaw) return [];
    if (Array.isArray(citationsRaw)) return citationsRaw;
    try {
      return JSON.parse(citationsRaw);
    } catch (err) {
      return [];
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border bg-card/50 backdrop-blur flex items-center justify-between shrink-0 z-10">
        <span className="text-sm font-semibold text-foreground">
          {notebookName || "Untitled Document"}
        </span>
      </div>

      {/* Message List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 pt-6 pb-32 space-y-6">
          {/* Overview card (shows when sources exist) */}
          {sourceCount > 0 && (
            <NotebookOverviewCard
              notebookId={notebookId}
              sourceCount={sourceCount}
              onQuestionSelect={async (q) => {
                if (isLoading) return;
                await onSendMessage(q);
              }}
              hasMessages={messages.length > 0}
            />
          )}

          {/* Empty state — no sources */}
          {sourceCount === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto pt-20">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">No sources yet</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Upload a document, paste a link, or add a YouTube video to begin.
              </p>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg) => {
            const citations = parseCitations(msg.answer?.citations);

            return (
              <div key={msg.id} className="space-y-4 max-w-3xl mx-auto">
                {/* User Question */}
                <div className="flex items-start gap-3 justify-end">
                  <div className="bg-secondary border border-border rounded-2xl px-4 py-2.5 text-sm text-foreground max-w-lg">
                    {msg.question}
                  </div>
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* AI Answer */}
                {msg.answer && (
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                        {msg.answer.text}
                      </div>

                      {/* Citations */}
                      {citations.length > 0 && (
                        <div className="pt-3 border-t border-border">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <BookmarkCheck className="w-3.5 h-3.5 text-primary" />
                            Grounded Sources ({citations.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {citations.map((cit, idx) => (
                              <button
                                key={`${cit.chunkId}-${idx}`}
                                onClick={() => onCitationClick(cit.chunkId)}
                                className="group flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background hover:bg-primary/10 border border-border hover:border-primary/40 text-sm text-muted-foreground hover:text-primary transition"
                                title={cit.snippet}
                              >
                                <span className="font-semibold text-primary">[{idx + 1}]</span>
                                <span className="truncate max-w-[160px]">
                                  {cit.snippet}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-3 max-w-3xl mx-auto">
              <div className="w-7 h-7 rounded-full bg-primary/20 animate-pulse flex items-center justify-center text-primary">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="text-sm text-muted-foreground animate-pulse">
                Synthesizing response & verifying citations...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Floating Query Bar */}
      <div className="absolute bottom-6 left-0 right-0 px-6 z-20 pointer-events-none">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-center relative pointer-events-auto">
          <input
            type="text"
            placeholder="Start typing..."
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={isLoading}
            className="w-full text-base px-5 py-3.5 bg-card border border-border rounded-3xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition shadow-lg"
          />
          <div className="absolute right-3 flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {sourceCount} source{sourceCount === 1 ? "" : "s"}
            </Badge>
            <Button
              type="submit"
              size="sm"
              disabled={!inputQuery.trim() || isLoading}
              className="h-8 w-8 p-0 rounded-full"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </div>

      {/* Bottom disclaimer */}
      <div className="absolute bottom-1 left-0 right-0 text-center pointer-events-none">
        <span className="text-[10px] text-muted-foreground/50">
          AxiomAI can be inaccurate, please double-check its responses.
        </span>
      </div>
    </div>
  );
};
