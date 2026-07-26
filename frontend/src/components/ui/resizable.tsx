import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({
  className,
  orientation = "horizontal",
  direction,
  ...props
}: React.ComponentProps<typeof Group> & { direction?: "horizontal" | "vertical" }) => (
  <Group
    orientation={direction || orientation}
    className={cn(
      "flex h-full w-full data-[orientation=vertical]:flex-col",
      className
    )}
    {...props}
  />
);

const ResizablePanel = ({
  className,
  ...props
}: React.ComponentProps<typeof Panel>) => (
  <Panel
    className={cn("min-h-0 overflow-hidden flex flex-col", className)}
    {...props}
  />
);

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      "relative flex w-1.5 items-center justify-center bg-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-primary/60 transition-colors cursor-col-resize z-20 select-none after:absolute after:inset-y-0 after:-left-1.5 after:-right-1.5 after:z-30",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-card">
        <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
