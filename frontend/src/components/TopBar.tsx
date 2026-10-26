import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Home, Check, Edit2 } from "lucide-react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import { Badge } from "@/components/ui/badge";

interface TopBarProps {
  notebookName: string;
  onCreateNotebook: () => void;
  onNotebookNameChange?: (name: string) => void;
  onGoToLanding?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  notebookName,
  onCreateNotebook,
  onNotebookNameChange,
  onGoToLanding,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(notebookName);

  const handleStartEdit = () => {
    setEditValue(notebookName);
    setIsEditing(true);
  };

  const handleFinishEdit = () => {
    setIsEditing(false);
    if (editValue.trim() && editValue.trim() !== notebookName) {
      onNotebookNameChange?.(editValue.trim());
    }
  };

  return (
    <header className="h-14 border-b border-border bg-background/95 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 shrink-0 z-20">
      {/* Left: Brand + Notebook Title */}
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Clickable Brand Logo to return to Landing Page */}
        <button
          onClick={onGoToLanding}
          title="Return to Landing Page"
          className="flex items-center gap-2 p-1 rounded-lg hover:bg-accent/60 transition-colors group shrink-0"
        >
          <div className="w-7 h-7 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
            <img src="/favicon.png" alt="AxiomAI Logo" className="w-3.5 h-3.5 object-contain" />
          </div>
          <span className="font-semibold text-xs tracking-tight hidden sm:inline-block text-foreground group-hover:text-white transition-colors">
            AxiomAI
          </span>
        </button>

        <div className="h-3.5 w-[1px] bg-border hidden sm:block shrink-0" />

        {/* Notebook Name Editing */}
        <div className="flex items-center gap-2 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleFinishEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFinishEdit();
                  if (e.key === "Escape") setIsEditing(false);
                }}
                className="text-xs font-medium bg-secondary border border-border text-foreground rounded px-2 py-0.5 min-w-[180px] max-w-[340px] outline-none"
                autoFocus
              />
              <button
                onClick={handleFinishEdit}
                className="p-1 rounded hover:bg-secondary text-foreground"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartEdit}
              className="text-xs font-medium text-foreground truncate max-w-[260px] sm:max-w-[360px] hover:text-white transition-colors flex items-center gap-1.5 group"
              title="Click to rename notebook"
            >
              <span>{notebookName || "Untitled Notebook"}</span>
              <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          )}

          <Badge variant="outline" className="hidden lg:inline-flex text-[10px] px-1.5 py-0 border-border text-muted-foreground font-mono">
            Workspace
          </Badge>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {onGoToLanding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={onGoToLanding}
          >
            <Home className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Landing Page</span>
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 border-border bg-card hover:bg-accent text-foreground font-medium"
          onClick={onCreateNotebook}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Notebook</span>
          <span className="sm:hidden">New</span>
        </Button>

        <Show when="signed-out">
          <div className="flex items-center gap-1.5">
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm" className="h-8 text-xs bg-primary text-primary-foreground font-medium">
                Sign up
              </Button>
            </SignUpButton>
          </div>
        </Show>

        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </header>
  );
};
