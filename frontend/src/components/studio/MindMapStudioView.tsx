import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState,
  Handle,
  Position,
  NodeProps,
  Edge,
  Node,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { hierarchy, tree } from 'd3-hierarchy';
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RefreshCw, Trash2, MoreVertical, ChevronRight, ChevronDown, XCircle } from 'lucide-react';
import { MindMap, MindMapNode as MindMapNodeType } from '../types';

interface MindMapStudioViewProps {
  notebookId: string;
  sourceIds: string[];
  notebookName: string;
  onBackToStudio: () => void;
}

// Custom Node Component
const CustomNode = ({ data, isConnectable }: NodeProps) => {
  const { label, isExpanded, hasChildren, onToggle, isRoot, summary } = data as any;
  
  return (
    <div className={`relative px-4 py-2 shadow-md rounded-md border-2 bg-card text-card-foreground ${isRoot ? 'border-primary' : 'border-border'}`}>
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} isConnectable={isConnectable} />
      
      <div className="flex items-center gap-2">
        <div className="font-semibold text-sm max-w-[150px] text-center break-words">
          {label}
        </div>
        {hasChildren && (
          <button 
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-muted"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} isConnectable={isConnectable} />
    </div>
  );
};

const nodeTypes = { custom: CustomNode };

export const MindMapStudioView: React.FC<MindMapStudioViewProps> = ({
  notebookId,
  sourceIds,
  notebookName,
  onBackToStudio
}) => {
  const [mindMapData, setMindMapData] = useState<MindMap | null>(null);
  const [viewState, setViewState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const fetchMindMap = useCallback(async (regenerate = false) => {
    setViewState("loading");
    setErrorMessage("");
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/mindmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceIds, regenerate }),
      });

        if (!res.ok) {
          let errText = "Failed to generate mind map";
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
      setMindMapData(data.mindMap);
      
      // Initialize expanded nodes: root and its immediate children
      const initialExpanded = new Set<string>();
      if (data.mindMap.root) {
        initialExpanded.add(data.mindMap.root.id);
      }
      setExpandedNodes(initialExpanded);
      setViewState("ready");
    } catch (err) {
      setErrorMessage((err as Error).message);
      setViewState("error");
    }
  }, [notebookId, sourceIds]);

  useEffect(() => {
    fetchMindMap();
  }, [fetchMindMap]);

  const handleToggleNode = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Compute Layout whenever data or expanded state changes
  useEffect(() => {
    if (!mindMapData || !mindMapData.root) return;

    // Filter tree based on expanded nodes
    const filterTree = (node: MindMapNodeType): MindMapNodeType => {
      if (expandedNodes.has(node.id) && node.children && node.children.length > 0) {
        return { ...node, children: node.children.map(filterTree) };
      }
      return { ...node, children: [] };
    };

    const visibleTree = filterTree(mindMapData.root);
    
    // Create D3 hierarchy
    const root = hierarchy(visibleTree);
    
    // Compute tree layout
    const nodeWidth = 200;
    const nodeHeight = 60;
    const treeLayout = tree<MindMapNodeType>().nodeSize([nodeHeight * 1.5, nodeWidth * 1.5]);
    treeLayout(root);

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    root.each((node) => {
      // Find original node to know if it actually has children (to show chevron)
      const findOrigNode = (n: MindMapNodeType, id: string): MindMapNodeType | null => {
        if (n.id === id) return n;
        for (const child of n.children || []) {
          const found = findOrigNode(child, id);
          if (found) return found;
        }
        return null;
      };
      
      const origNode = findOrigNode(mindMapData.root, node.data.id);
      const hasChildren = origNode && origNode.children && origNode.children.length > 0;

      newNodes.push({
        id: node.data.id,
        type: 'custom',
        // Note: d3 tree assigns x (horizontal) and y (vertical). For a horizontal tree, swap them.
        position: { x: node.y || 0, y: node.x || 0 },
        data: { 
          label: node.data.label,
          summary: node.data.summary,
          isExpanded: expandedNodes.has(node.data.id),
          hasChildren: hasChildren,
          isRoot: node.depth === 0,
          onToggle: () => handleToggleNode(node.data.id)
        },
      });

      if (node.parent) {
        newEdges.push({
          id: `e-${node.parent.data.id}-${node.data.id}`,
          source: node.parent.data.id,
          target: node.data.id,
          type: 'smoothstep',
          animated: true,
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: 'hsl(var(--primary))',
          },
        });
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [mindMapData, expandedNodes, setNodes, setEdges, handleToggleNode]);

  const handleRegenerate = () => {
    setShowRegenerateDialog(false);
    fetchMindMap(true);
  };

  const handleDelete = async () => {
    setShowDeleteDialog(false);
    if (mindMapData) {
      try {
        await fetch(`/api/notebooks/${notebookId}/mindmap/${mindMapData.id}`, { method: "DELETE" });
      } catch {
        // silent
      }
    }
    onBackToStudio();
  };

  return (
    <div className="flex flex-col h-full bg-muted/20">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-border bg-background shrink-0 z-10">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink onClick={onBackToStudio} className="text-muted-foreground hover:text-foreground cursor-pointer">
                  Studio
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Mind Map</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {viewState === "ready" && (
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setShowRegenerateDialog(true)}>
                  <RefreshCw data-icon="inline-start" />
                  Regenerate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive focus:text-destructive">
                  <Trash2 data-icon="inline-start" />
                  Delete mind map
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 w-full relative">
        {viewState === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6 text-center z-20 bg-background/50 backdrop-blur-sm">
            <RefreshCw className="size-10 animate-spin text-primary" />
            <div className="space-y-2">
              <h3 className="text-xl font-medium">Generating mind map...</h3>
              <p className="text-muted-foreground">based on {sourceIds.length} source(s)</p>
            </div>
          </div>
        )}

        {viewState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6 text-center z-20 bg-background">
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
              <Button onClick={() => fetchMindMap(true)}>Retry</Button>
            </div>
          </div>
        )}

        {viewState === "ready" && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="hsl(var(--muted-foreground))" gap={16} />
            <Controls />
          </ReactFlow>
        )}
      </div>

      {/* Dialogs */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate mind map?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new mind map and replace the current one.
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
            <AlertDialogTitle>Delete this mind map?</AlertDialogTitle>
            <AlertDialogDescription>
              This mind map will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
