import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";

interface TopBarProps {
  notebookName: string;
  onCreateNotebook: () => void;
  onNotebookNameChange?: (name: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  notebookName,
  onCreateNotebook,
  onNotebookNameChange,
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
    <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 shrink-0 z-20">
      {/* Left: Logo + notebook title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center shrink-0 overflow-hidden">
          <img src="/favicon.png" alt="Axiom Logo" className="w-full h-full object-cover" />
        </div>

        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleFinishEdit();
              if (e.key === "Escape") setIsEditing(false);
            }}
            className="text-sm font-medium bg-transparent border-b border-primary text-foreground outline-none px-1 max-w-[400px]"
            autoFocus
          />
        ) : (
          <button
            onClick={handleStartEdit}
            className="text-sm font-medium text-foreground truncate max-w-[400px] hover:text-primary transition-colors"
            title="Click to rename"
          >
            {notebookName || "Untitled Notebook"}
          </button>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={onCreateNotebook}
        >
          <Plus className="w-3.5 h-3.5" />
          Create notebook
        </Button>

        <Show when="signed-out">
          <div className="flex items-center gap-2">
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm" className="h-8 text-xs">
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
