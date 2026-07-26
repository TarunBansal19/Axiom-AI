import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, FileText, Lightbulb, MoreVertical, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Quiz, QuizQuestion } from "../types";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

interface QuizStudioViewProps {
  notebookId: string;
  sourceIds: string[];
  notebookName: string;
  onBackToStudio: () => void;
}

type ViewState = "loading" | "quizzing" | "complete" | "error";

export const QuizStudioView: React.FC<QuizStudioViewProps> = ({
  notebookId,
  sourceIds,
  notebookName,
  onBackToStudio,
}) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { selectedOptionId: string; correct: boolean }>>({});
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [explainContent, setExplainContent] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const fetchQuiz = useCallback(
    async (regenerate = false) => {
      setViewState("loading");
      setErrorMessage("");
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/quiz`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceIds, count: 10, regenerate }),
        });

        if (!res.ok) {
          let errText = "Failed to generate quiz";
          try {
            const clone = res.clone();
            const data = await clone.json();
            errText = data.error || errText;
          } catch {
            const text = await res.text();
            if (text) errText = text;
          }
          throw new Error(errText);
        }

        const data = await res.json();
        setQuiz(data.quiz);
        setCurrentIndex(0);
        setAnswers({});
        setExplainContent(null);
        setViewState("quizzing");
      } catch (err) {
        setErrorMessage((err as Error).message);
        setViewState("error");
      }
    },
    [notebookId, sourceIds]
  );

  useEffect(() => {
    fetchQuiz(false);
  }, [fetchQuiz]);

  const currentQuestion = quiz?.questions[currentIndex];
  const answeredState = currentQuestion ? answers[currentQuestion.id] : null;

  const handleSelectOption = (optionId: string) => {
    if (!currentQuestion || answeredState) return;

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        selectedOptionId: optionId,
        correct: optionId === currentQuestion.correctOptionId,
      },
    }));
  };

  const goToNext = () => {
    if (!quiz) return;
    if (currentIndex < quiz.questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setExplainContent(null);
    } else {
      setViewState("complete");
    }
  };

  const handleExplain = async () => {
    if (!currentQuestion || explainLoading) return;
    setExplainLoading(true);
    try {
      const res = await fetch("/api/flashcards/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion.prompt,
          answer: currentQuestion.options.find((o) => o.id === currentQuestion.correctOptionId)?.label || "",
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

  const handleRegenerate = () => {
    setShowRegenerateDialog(false);
    fetchQuiz(true);
  };

  const handleDeleteQuiz = async () => {
    setShowDeleteDialog(false);
    if (quiz) {
      try {
        await fetch(`/api/notebooks/${notebookId}/quiz/${quiz.id}`, {
          method: "DELETE",
        });
      } catch {
        // silent
      }
    }
    onBackToStudio();
  };

  const correctCount = Object.values(answers).filter((a) => a.correct).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border bg-background shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={onBackToStudio} className="text-muted-foreground hover:text-foreground cursor-pointer">
                  Studio
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Quiz</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {quiz && viewState === "quizzing" && (
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
                <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive focus:text-destructive">
                  <Trash2 data-icon="inline-start" />
                  Delete quiz
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* Main Content Area */}
      <ScrollArea className="flex-1">
        <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto h-full flex flex-col items-center">
          {viewState === "loading" && (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-6 text-center py-20">
              <RefreshCw className="size-10 animate-spin text-primary" />
              <div className="space-y-2">
                <h3 className="text-xl font-medium">Generating quiz...</h3>
                <p className="text-muted-foreground">based on {sourceIds.length} source(s)</p>
              </div>
              <div className="w-full max-w-md space-y-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            </div>
          )}

          {viewState === "error" && (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-6 text-center py-20">
              <div className="rounded-full bg-destructive/10 p-4">
                <XCircle className="size-10 text-destructive" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-xl font-medium">Generation Failed</h3>
                <p className="text-muted-foreground">{errorMessage}</p>
              </div>
              <div className="flex gap-4">
                <Button variant="outline" onClick={onBackToStudio}>
                  Back to Studio
                </Button>
                <Button onClick={() => fetchQuiz(true)}>Retry</Button>
              </div>
            </div>
          )}

          {viewState === "quizzing" && quiz && currentQuestion && (
            <div className="w-full animate-in fade-in-50 slide-in-from-bottom-4 duration-500">
              <div className="mb-6 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  Question {currentIndex + 1} / {quiz.questions.length}
                </span>
              </div>

              <h2 className="text-2xl font-semibold mb-8 leading-tight">
                {currentQuestion.prompt}
              </h2>

              <div className="space-y-4 mb-8">
                {currentQuestion.options.map((option) => {
                  const isSelected = answeredState?.selectedOptionId === option.id;
                  const isCorrect = option.id === currentQuestion.correctOptionId;
                  
                  let borderClass = "border-border hover:border-primary/50";
                  let bgClass = "bg-card hover:bg-muted/50";
                  let icon = null;
                  let label = null;

                  if (answeredState) {
                    borderClass = "border-border";
                    bgClass = "bg-card";
                    if (isCorrect) {
                      borderClass = "border-success bg-success/5";
                      icon = <CheckCircle2 className="size-5 text-success" />;
                      label = <span className="text-sm font-medium text-success ml-2">Right answer</span>;
                    } else if (isSelected) {
                      borderClass = "border-destructive bg-destructive/5";
                      icon = <XCircle className="size-5 text-destructive" />;
                      label = <span className="text-sm font-medium text-destructive ml-2">Not quite</span>;
                    }
                  }

                  return (
                    <Card
                      key={option.id}
                      className={cn(
                        "p-4 transition-all duration-200 cursor-pointer overflow-hidden",
                        borderClass,
                        bgClass,
                        answeredState && !isSelected && !isCorrect && "opacity-70"
                      )}
                      onClick={() => handleSelectOption(option.id)}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground mt-0.5">
                          {option.id}
                        </div>
                        <div className="flex-1 space-y-1 mt-1">
                          <p className="text-base">{option.label}</p>
                          {answeredState && (
                            <p className="text-sm text-muted-foreground mt-2 animate-in fade-in slide-in-from-top-1">
                              {option.rationale}
                            </p>
                          )}
                        </div>
                        {answeredState && (isCorrect || isSelected) && (
                          <div className="flex items-center">
                            {label}
                            {icon && <div className="ml-2">{icon}</div>}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>

              {answeredState && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between">
                    <Button variant="outline" onClick={handleExplain} disabled={explainLoading}>
                      {explainLoading ? <RefreshCw className="size-4 animate-spin mr-2" /> : <Lightbulb className="size-4 mr-2" />}
                      Explain
                    </Button>
                    <Button onClick={goToNext} size="lg">
                      {currentIndex < quiz.questions.length - 1 ? "Next Question" : "See Results"}
                      <ChevronRight className="size-4 ml-2" />
                    </Button>
                  </div>
                  
                  {explainContent && (
                    <Card className="p-4 bg-primary/5 border-primary/20 animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-start gap-3">
                        <Lightbulb className="size-5 text-primary shrink-0 mt-0.5" />
                        <p className="text-sm leading-relaxed">{explainContent}</p>
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}

          {viewState === "complete" && quiz && (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-8 text-center py-10 animate-in zoom-in-95 duration-500">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Quiz Complete!</h2>
                <p className="text-muted-foreground">You finished all {quiz.questions.length} questions.</p>
              </div>

              <div className="relative">
                <svg className="w-48 h-48 transform -rotate-90">
                  <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-muted" />
                  <circle
                    cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent"
                    strokeDasharray={552.92}
                    strokeDashoffset={552.92 - (552.92 * correctCount) / quiz.questions.length}
                    className="text-primary transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-bold">{correctCount}</span>
                  <span className="text-lg text-muted-foreground">/ {quiz.questions.length}</span>
                </div>
              </div>

              <div className="flex gap-4">
                <Button variant="outline" size="lg" onClick={onBackToStudio}>
                  Back to Studio
                </Button>
                <Button size="lg" onClick={() => { setCurrentIndex(0); setAnswers({}); setViewState("quizzing"); }}>
                  <RefreshCw className="size-4 mr-2" />
                  Retake Quiz
                </Button>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Dialogs */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new set of 10 questions and replace the current quiz. Your current progress will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerate}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              This quiz will be permanently deleted. You can generate a new one later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteQuiz} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
