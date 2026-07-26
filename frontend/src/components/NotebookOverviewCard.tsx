import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";
import { NotebookOverview } from "./types";

interface NotebookOverviewCardProps {
  notebookId: string;
  sourceCount: number;
  onQuestionSelect: (q: string) => void;
  hasMessages: boolean;
}

export const NotebookOverviewCard: React.FC<NotebookOverviewCardProps> = ({
  notebookId,
  sourceCount,
  onQuestionSelect,
  hasMessages,
}) => {
  const [overview, setOverview] = useState<NotebookOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchOverview = async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/overview`);
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.overview) {
            setOverview(data.overview);
            setLoading(false);
          }
        }
      } catch {
        if (mounted) setLoading(false);
      }
    };

    fetchOverview();

    // Poll until overview arrives (it may be generating)
    const interval = setInterval(() => {
      if (!overview) fetchOverview();
    }, 4000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [notebookId, overview]);

  // Loading skeleton
  if (loading && !overview) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="space-y-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/4" />
          <div className="space-y-2 mt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </div>
    );
  }

  if (!overview) return null;

  const dateStr = new Date(overview.generatedAt).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const byline = `${sourceCount} source${sourceCount === 1 ? "" : "s"} · ${dateStr}`;

  // Render markdown bold (**text**)
  const renderSummary = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Small icon */}
      <div className="mb-4">
        <div className="w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-medium text-foreground leading-tight mb-1">
        {overview.title}
      </h1>

      {/* Byline */}
      <p className="text-sm text-muted-foreground mb-6">{byline}</p>

      {/* Summary body */}
      <div className="text-base text-muted-foreground leading-relaxed mb-8 pb-6 border-b border-border font-normal">
        {renderSummary(overview.summaryMarkdown)}
      </div>

      {/* Suggested question chips — only show when no messages yet */}
      {!hasMessages && overview.suggestedQuestions.length > 0 && (
        <div className="flex flex-col gap-2 w-full">
          {overview.suggestedQuestions.map((q: string, idx: number) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              className="w-full justify-start text-left h-auto py-3 px-4 text-[15px] font-normal rounded-xl text-muted-foreground hover:text-foreground"
              onClick={() => onQuestionSelect(q)}
            >
              {q}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
