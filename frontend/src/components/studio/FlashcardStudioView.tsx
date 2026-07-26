import React, { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  MoreVertical,
  RefreshCw,
  Trash2,
  Lightbulb,
  Loader2,
  RotateCcw,
  ArrowLeft,
  Filter,
} from "lucide-react";
import type { Flashcard, FlashcardDeck } from "../types";

interface FlashcardStudioViewProps {
  notebookId: string;
  sourceIds: string[];
  notebookName: string;
  onBackToStudio: () => void;
}

type ViewState = "loading" | "studying" | "complete" | "error";

export const FlashcardStudioView: React.FC<FlashcardStudioViewProps> = ({
  notebookId,
  sourceIds,
  notebookName,
  onBackToStudio,
}) => {
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [explainContent, setExplainContent] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [scorePopKey, setScorePopKey] = useState(0);

  const correctCount = cards.filter((c) => c.status === "correct").length;
  const incorrectCount = cards.filter((c) => c.status === "incorrect").length;
  const currentCard = cards[currentIndex];

  // Fetch or generate deck
  const fetchDeck = useCallback(
    async (regenerate = false) => {
      setViewState("loading");
      setErrorMessage("");
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/flashcards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceIds, count: 15, regenerate }),
        });

        if (!res.ok) {
          let errText = "Failed to generate flashcards";
          try {
            const data = await res.json();
            errText = data.error || errText;
          } catch {
            const text = await res.text();
            if (text) errText = text;
          }
          throw new Error(errText);
        }

        const data = await res.json();
        const fetchedDeck: FlashcardDeck = data.deck;

        // Initialize card statuses to 'unseen' (session state, per spec)
        const initializedCards = fetchedDeck.cards.map((c) => ({
          ...c,
          status: "unseen" as const,
        }));

        setDeck(fetchedDeck);
        setCards(initializedCards);
        setCurrentIndex(0);
        setFlipped(false);
        setExplainContent(null);
        setViewState("studying");
      } catch (err) {
        setErrorMessage((err as Error).message);
        setViewState("error");
      }
    },
    [notebookId, sourceIds]
  );

  useEffect(() => {
    fetchDeck(false);
  }, [fetchDeck]);

  // Card navigation
  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setFlipped(false);
      setExplainContent(null);
    }
  };

  const goToNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((i) => i + 1);
      setFlipped(false);
      setExplainContent(null);
    } else {
      // Past the last card → deck complete
      setViewState("complete");
    }
  };

  // Grade card
  const gradeCard = (grade: "correct" | "incorrect") => {
    if (!currentCard) return;

    // Auto-flip if question side showing
    if (!flipped) {
      setFlipped(true);
      // Short delay then grade
      setTimeout(() => applyGrade(grade), 400);
      return;
    }

    applyGrade(grade);
  };

  const applyGrade = (grade: "correct" | "incorrect") => {
    setCards((prev) => {
      const updated = [...prev];
      const card = updated[currentIndex];
      // If re-grading, the count will be adjusted naturally since we
      // derive counts from the cards array statuses
      updated[currentIndex] = { ...card, status: grade };
      return updated;
    });
    setScorePopKey((k) => k + 1);

    // Auto-advance after a brief pause
    setTimeout(() => {
      goToNext();
    }, 300);
  };

  // Explain
  const handleExplain = async () => {
    if (!currentCard || explainLoading) return;
    setExplainLoading(true);
    try {
      const res = await fetch("/api/flashcards/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentCard.question,
          answer: currentCard.answer,
        }),
      });
      if (!res.ok) throw new Error("Failed to get explanation");
      const data = await res.json();
      setExplainContent(data.explanation);
    } catch {
      setExplainContent("Failed to load explanation. Please try again.");
    } finally {
      setExplainLoading(false);
    }
  };

  // Regenerate
  const handleRegenerate = () => {
    setShowRegenerateDialog(false);
    fetchDeck(true);
  };

  // Delete deck
  const handleDeleteDeck = async () => {
    setShowDeleteDialog(false);
    if (deck) {
      try {
        await fetch(`/api/notebooks/${notebookId}/flashcards/${deck.id}`, {
          method: "DELETE",
        });
      } catch {
        // silent
      }
    }
    onBackToStudio();
  };

  // Deck complete actions
  const studyIncorrectAgain = () => {
    const incorrectCards = cards
      .filter((c) => c.status === "incorrect")
      .map((c) => ({ ...c, status: "unseen" as const }));

    if (incorrectCards.length === 0) {
      // All correct — restart
      restartDeck();
      return;
    }

    setCards(incorrectCards);
    setCurrentIndex(0);
    setFlipped(false);
    setExplainContent(null);
    setViewState("studying");
  };

  const restartDeck = () => {
    setCards((prev) => prev.map((c) => ({ ...c, status: "unseen" as const })));
    setCurrentIndex(0);
    setFlipped(false);
    setExplainContent(null);
    setViewState("studying");
  };

  // --- RENDER ---

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                onClick={onBackToStudio}
                className="cursor-pointer text-muted-foreground hover:text-foreground text-xs"
              >
                Studio
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-xs text-foreground">
                Flashcards
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {deck && viewState === "studying" && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" />}>
                <MoreVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setShowRegenerateDialog(true)}>
                  <RefreshCw data-icon="inline-start" />
                  Regenerate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 data-icon="inline-start" />
                  Delete deck
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Title bar */}
      {deck && viewState !== "loading" && (
        <div className="px-4 py-2 flex items-center gap-2 shrink-0">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {deck.title}
          </h3>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {deck.sourceIds.length} source{deck.sourceIds.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto">
        {/* Loading state */}
        {viewState === "loading" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="size-8 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Generating flashcards…
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                based on {sourceIds.length} source{sourceIds.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-sm mt-4">
              <Skeleton className="h-40 w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
            </div>
          </div>
        )}

        {/* Error state */}
        {viewState === "error" && (
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <X className="text-destructive" />
            </div>
            <p className="text-sm text-foreground">{errorMessage}</p>
            <Button onClick={() => fetchDeck(false)} variant="outline" size="sm">
              <RotateCcw data-icon="inline-start" />
              Retry
            </Button>
          </div>
        )}

        {/* Studying state */}
        {viewState === "studying" && currentCard && (
          <div className="w-full max-w-lg flex flex-col items-center gap-4">
            {/* Card counter */}
            <div className="self-start text-xs text-muted-foreground font-medium">
              {currentIndex + 1} / {cards.length}
            </div>

            {/* Flip card */}
            <div
              className="card-flip-container w-full cursor-pointer"
              style={{ minHeight: "220px" }}
              onClick={() => setFlipped(!flipped)}
            >
              <div className={cn("card-flip-inner", flipped && "flipped")}>
                {/* Front — Question */}
                <div className="card-front">
                  <Card className="p-6 h-full flex items-center justify-center min-h-[220px] border-border bg-card">
                    <p className="text-lg font-medium text-foreground text-center leading-relaxed">
                      {currentCard.question}
                    </p>
                  </Card>
                </div>

                {/* Back — Answer */}
                <div className="card-back">
                  <Card className="p-6 h-full flex flex-col items-center justify-center min-h-[220px] border-border bg-card">
                    <p className="text-sm text-foreground text-center leading-relaxed mb-4">
                      {currentCard.answer}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExplain();
                      }}
                      disabled={explainLoading}
                    >
                      <Lightbulb data-icon="inline-start" />
                      {explainLoading ? "Explaining…" : "Explain"}
                    </Button>
                  </Card>
                </div>
              </div>
            </div>

            {/* Explain panel */}
            {(explainContent || explainLoading) && flipped && (
              <Card className="w-full p-4 bg-card border-border">
                {explainLoading ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {explainContent}
                  </p>
                )}
              </Card>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3 mt-2">
              {/* Previous */}
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPrev}
                disabled={currentIndex === 0}
                className="size-10"
              >
                <ChevronLeft />
              </Button>

              {/* Incorrect */}
              <button
                key={`incorrect-${scorePopKey}`}
                onClick={() => gradeCard("incorrect")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors",
                  "bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20",
                  incorrectCount > 0 && "animate-score-pop"
                )}
              >
                <X className="size-4" />
                <span className="text-sm font-semibold">{incorrectCount}</span>
              </button>

              {/* Correct */}
              <button
                key={`correct-${scorePopKey}`}
                onClick={() => gradeCard("correct")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors",
                  "bg-success/10 border border-success/30 text-success hover:bg-success/20",
                  correctCount > 0 && "animate-score-pop"
                )}
              >
                <Check className="size-4" />
                <span className="text-sm font-semibold">{correctCount}</span>
              </button>

              {/* Next */}
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNext}
                className="size-10"
              >
                <ChevronRight />
              </Button>
            </div>

            {!flipped && (
              <p className="text-[11px] text-muted-foreground">
                Click the card to reveal the answer
              </p>
            )}
          </div>
        )}

        {/* Deck complete state */}
        {viewState === "complete" && (
          <div className="flex flex-col items-center gap-5 text-center max-w-sm">
            <div className="size-16 rounded-full bg-success/10 flex items-center justify-center">
              <Check className="size-8 text-success" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Deck Complete!
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                You've reviewed all {cards.length} cards —{" "}
                <span className="text-success font-medium">{correctCount} correct</span>,{" "}
                <span className="text-destructive font-medium">
                  {incorrectCount} to review
                </span>
              </p>
            </div>
            <Separator />
            <div className="flex flex-col gap-2 w-full">
              {incorrectCount > 0 && (
                <Button onClick={studyIncorrectAgain} className="w-full">
                  <Filter data-icon="inline-start" />
                  Study incorrect again ({incorrectCount})
                </Button>
              )}
              <Button onClick={restartDeck} variant="outline" className="w-full">
                <RotateCcw data-icon="inline-start" />
                Restart deck
              </Button>
              <Button
                onClick={onBackToStudio}
                variant="ghost"
                className="w-full"
              >
                <ArrowLeft data-icon="inline-start" />
                Back to Studio
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Regenerate confirmation dialog */}
      <AlertDialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate flashcards?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces your current deck and resets all progress. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate}>
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete flashcard deck?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this flashcard deck. You can always
              generate a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDeck}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
