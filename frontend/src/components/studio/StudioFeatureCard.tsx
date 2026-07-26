import React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronRight } from "lucide-react";

interface StudioFeatureCardProps {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  colorClass?: string;
}

export const StudioFeatureCard: React.FC<StudioFeatureCardProps> = ({
  icon,
  label,
  badge,
  onClick,
  disabled = false,
  disabledReason,
  colorClass = "text-primary hover:bg-accent",
}) => {
  const cardContent = (
    <Card
      onClick={disabled ? undefined : onClick}
      className={cn(
        "p-4 flex items-center gap-3 cursor-pointer transition-colors border-border",
        colorClass,
        disabled && "opacity-50 cursor-not-allowed pointer-events-none"
      )}
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {label}
          </span>
          {badge && (
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {badge}
            </Badge>
          )}
        </div>
      </div>
      <ChevronRight className="text-muted-foreground shrink-0" />
    </Card>
  );

  if (disabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger>{cardContent}</TooltipTrigger>
        <TooltipContent>
          <p>{disabledReason}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return cardContent;
};
