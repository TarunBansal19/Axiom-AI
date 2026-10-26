import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Bot,
  User,
  BookmarkCheck,
  Plus,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { QueryMessage, Citation } from "./types";
import { NotebookOverviewCard } from "./NotebookOverviewCard";
import { cleanTextForSpeech } from "../lib/speechUtils";

interface ChatViewProps {
  notebookId: string;
  notebookName?: string;
  messages: QueryMessage[];
  onSendMessage: (question: string) => Promise<void>;
  onCitationClick: (chunkId: string) => void;
  isLoading: boolean;
  sourceCount: number;
  onOpenAddSource?: () => void;
}

const QUICK_PROMPTS = [
  "Summarize core thesis & findings",
  "Key definitions & formulas",
  "Explain for beginners (ELI5)",
  "Critical limitations & caveats",
];

export const ChatView: React.FC<ChatViewProps> = ({
  notebookId,
  notebookName,
  messages,
  onSendMessage,
  onCitationClick,
  isLoading,
  sourceCount,
  onOpenAddSource,
}) => {
  const [inputQuery, setInputQuery] = useState("");
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Clean up speech synthesis on component unmount
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isLoading) return;
    const q = inputQuery.trim();
    setInputQuery("");
    await onSendMessage(q);
  };

  const handleQuickPromptClick = async (prompt: string) => {
    if (isLoading) return;
    await onSendMessage(prompt);
  };

  const handleToggleSpeech = (msgId: string, text: string) => {
    if (!("speechSynthesis" in window)) {
      alert("Speech synthesis is not supported in this browser.");
      return;
    }

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const spokenText = cleanTextForSpeech(text);
    if (!spokenText) return;

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const renderFormattedAnswer = (text: string, citations: Citation[]) => {
    const regex = /\[CID:([a-zA-Z0-9_-]+)\]|\[(\d+)\]/g;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.substring(lastIndex, match.index));
      }

      if (match[1]) {
        const cid = match[1];
        const citIdx = citations.findIndex((c) => c.chunkId === cid);
        const displayNum = citIdx !== -1 ? citIdx + 1 : 1;
        nodes.push(
          <button
            key={`inline-cit-${match.index}`}
            onClick={() => onCitationClick(cid)}
            className="inline-flex items-center justify-center px-1 py-0 mx-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 border border-zinc-700 align-baseline transition-colors"
            title={`Jump to Grounded Citation [${displayNum}]`}
          >
            [{displayNum}]
          </button>
        );
      } else if (match[2]) {
        const num = parseInt(match[2], 10);
        const cit = citations[num - 1];
        nodes.push(
          <button
            key={`inline-cit-${match.index}`}
            onClick={() => cit && onCitationClick(cit.chunkId)}
            className="inline-flex items-center justify-center px-1 py-0 mx-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 border border-zinc-700 align-baseline transition-colors"
            title={cit ? `Jump to Grounded Citation [${num}]` : `Citation [${num}]`}
          >
            [{num}]
          </button>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      nodes.push(text.substring(lastIndex));
    }

    return (
      <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
        {nodes}
      </div>
    );
  };

  const handleCopyMessage = (msgId: string, text: string, citations: Citation[]) => {
    let content = text;
    if (citations.length > 0) {
      content += "\n\n---\n**Grounded Sources:**\n";
      citations.forEach((c, idx) => {
        content += `[${idx + 1}] ${c.sourceTitle || "Source"}: "${c.snippet}"\n`;
      });
    }
    navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
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
      <div className="px-6 py-3 border-b border-border bg-card/60 backdrop-blur flex items-center justify-between shrink-0 z-10">
        <span className="text-xs font-semibold text-foreground tracking-tight">
          {notebookName || "Untitled Document"}
        </span>
        <span className="text-[11px] font-mono text-muted-foreground">
          {sourceCount} source{sourceCount === 1 ? "" : "s"} connected
        </span>
      </div>

      {/* Message List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-6 pt-6 pb-36 space-y-6">
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
            <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto pt-20 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center text-foreground">
                <Bot className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">No Knowledge Sources Yet</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                  Upload research PDFs, YouTube videos, web articles, or notes to ground your AI assistant with verifiable citations.
                </p>
              </div>
              {onOpenAddSource && (
                <Button
                  onClick={onOpenAddSource}
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-zinc-200 text-xs gap-1.5 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Knowledge Source
                </Button>
              )}
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg) => {
            const citations = parseCitations(msg.answer?.citations);

            return (
              <div key={msg.id} className="space-y-3 max-w-3xl mx-auto">
                {/* User Question */}
                <div className="flex items-start gap-3 justify-end">
                  <div className="bg-secondary border border-border rounded-xl px-4 py-2.5 text-xs text-foreground max-w-lg leading-relaxed shadow-sm">
                    {msg.question}
                  </div>
                  <div className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 text-xs font-semibold shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* AI Answer */}
                {msg.answer && (
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 space-y-3 bg-card/60 border border-border rounded-xl p-4 shadow-sm">
                      {renderFormattedAnswer(msg.answer.text, citations)}

                      {/* Verifiable Citations */}
                      {citations.length > 0 && (
                        <div className="pt-3 border-t border-border">
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <BookmarkCheck className="w-3 h-3 text-zinc-400" />
                            Grounded Sources ({citations.length})
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {citations.map((cit, idx) => (
                              <button
                                key={`${cit.chunkId}-${idx}`}
                                onClick={() => onCitationClick(cit.chunkId)}
                                className="group flex items-center gap-1.5 px-2 py-0.5 rounded bg-background hover:bg-accent border border-border text-xs text-muted-foreground hover:text-foreground transition"
                                title={cit.snippet}
                              >
                                <span className="font-mono font-semibold text-zinc-300">[{idx + 1}]</span>
                                <span className="truncate max-w-[150px]">{cit.snippet}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Utilities Bar: Read Aloud + Copy */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                        <button
                          onClick={() => handleToggleSpeech(msg.id, msg.answer!.text)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] transition-colors ${
                            speakingMsgId === msg.id
                              ? "bg-zinc-800 border-zinc-600 text-white"
                              : "border-border/60 hover:bg-accent hover:text-foreground"
                          }`}
                          title={speakingMsgId === msg.id ? "Stop audio read-aloud" : "Read aloud (zero-cost browser TTS)"}
                        >
                          {speakingMsgId === msg.id ? (
                            <>
                              <VolumeX className="w-3 h-3 text-rose-400" />
                              <span className="text-rose-400">Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3 h-3" />
                              <span>Listen</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleCopyMessage(msg.id, msg.answer!.text, citations)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded border border-border/60 hover:bg-accent hover:text-foreground transition-colors text-[11px]"
                          title="Copy answer with markdown citations"
                        >
                          {copiedMsgId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400 font-medium">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-3 max-w-3xl mx-auto">
              <div className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 animate-pulse">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs text-muted-foreground animate-pulse font-mono">
                Searching vectors & synthesizing grounded response...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Floating Query Bar + Quick Prompts */}
      <div className="absolute bottom-5 left-0 right-0 px-6 z-20 pointer-events-none">
        <div className="max-w-3xl mx-auto space-y-2 pointer-events-auto">
          {/* Quick Prompt Pills */}
          {sourceCount > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 justify-center scrollbar-none">
              {QUICK_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isLoading}
                  onClick={() => handleQuickPromptClick(prompt)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border/80 bg-card/90 text-muted-foreground hover:text-foreground hover:border-zinc-500 transition-colors whitespace-nowrap shadow-sm backdrop-blur-md cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Form Input */}
          <form onSubmit={handleSubmit} className="flex items-center relative">
            <input
              type="text"
              placeholder="Ask a grounded question about your sources..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              disabled={isLoading}
              className="w-full text-xs px-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-zinc-500 transition shadow-lg"
            />
            <div className="absolute right-2.5 flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={!inputQuery.trim() || isLoading}
                className="h-7 w-7 p-0 rounded-lg bg-primary text-primary-foreground hover:bg-zinc-200"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
