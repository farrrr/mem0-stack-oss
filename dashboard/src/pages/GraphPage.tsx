import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ForceGraph2D from 'react-force-graph-2d';
import {
  GitFork, RotateCcw, List, Search, ChevronDown,
  CircleDot, ArrowRight,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { DEFAULT_USER_ID } from '../lib/constants.ts';
import StatCard from '../components/ui/StatCard.tsx';
import Card from '../components/ui/Card.tsx';
import Badge from '../components/ui/Badge.tsx';
import LoadingState from '../components/ui/LoadingState.tsx';
import ErrorState from '../components/ui/ErrorState.tsx';
import Pagination from '../components/ui/Pagination.tsx';
import Button from '../components/ui/Button.tsx';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Relation {
  source: string;
  source_type: string;
  relationship: string;
  target: string;
  target_type: string;
}

interface GraphNode {
  id: string;
  name: string;
  type: string;
  val: number;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NODE_COLORS: Record<string, string> = {
  person: '#bb9af7',
  user: '#bb9af7',
  software: '#7aa2f7',
  tool: '#7aa2f7',
  service: '#9ece6a',
  organization: '#73daca',
  company: '#73daca',
};

const DEFAULT_NODE_COLOR = '#565f89';

function getNodeColor(type: string | null | undefined): string {
  if (!type) return DEFAULT_NODE_COLOR;
  const lower = type.toLowerCase();
  return NODE_COLORS[lower] || DEFAULT_NODE_COLOR;
}

type BadgeColor = 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'cyan' | 'orange';

function getTypeBadgeColor(type: string | null | undefined): BadgeColor {
  if (!type) return 'blue';
  const lower = type.toLowerCase();
  if (lower === 'person' || lower === 'user') return 'purple';
  if (lower === 'software' || lower === 'tool') return 'blue';
  if (lower === 'service') return 'green';
  if (lower === 'organization' || lower === 'company') return 'cyan';
  return 'orange';
}

const RELATIONS_PAGE_SIZE = 25;

const SORT_OPTIONS = ['source_asc', 'source_desc'] as const;
type SortOption = typeof SORT_OPTIONS[number];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function GraphPage() {
  const { t } = useTranslation();
  const [showRelations, setShowRelations] = useState(false);
  const [relationsPage, setRelationsPage] = useState(1);
  const [relationsSearch, setRelationsSearch] = useState('');
  const [relationsSort, setRelationsSort] = useState<SortOption>('source_asc');
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [highlightNode, setHighlightNode] = useState<string | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const [graphDimensions, setGraphDimensions] = useState({ width: 600, height: 450 });

  // Resize observer for graph container
  useEffect(() => {
    const el = graphRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setGraphDimensions({ width: Math.max(300, width), height: Math.max(300, height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch graph stats
  const { data: stats, isLoading: statsLoading, isError: statsError, error: statsErr, refetch: refetchStats } = useQuery({
    queryKey: ['graph-stats', DEFAULT_USER_ID],
    queryFn: () => api.graphStats(DEFAULT_USER_ID),
    staleTime: 60_000,
  });

  // Fetch initial relations (for building the graph)
  const { data: initialRelations, isLoading: initialLoading } = useQuery({
    queryKey: ['graph-initial-relations', DEFAULT_USER_ID],
    queryFn: () => api.graphRelations(DEFAULT_USER_ID, 100, 0),
    staleTime: 60_000,
  });

  // Build initial graph from relations
  useEffect(() => {
    if (!initialRelations?.relations) return;
    const { nodes, links } = buildGraphFromRelations(initialRelations.relations);
    setGraphData({ nodes, links });
    setExpandedNodes(new Set());
  }, [initialRelations]);

  // Fetch relations for the table
  const relationsOffset = (relationsPage - 1) * RELATIONS_PAGE_SIZE;
  const { data: relationsData, isLoading: relationsLoading } = useQuery({
    queryKey: ['graph-relations', DEFAULT_USER_ID, RELATIONS_PAGE_SIZE, relationsOffset, relationsSearch],
    queryFn: () => api.graphRelations(DEFAULT_USER_ID, RELATIONS_PAGE_SIZE, relationsOffset, relationsSearch || undefined),
    staleTime: 30_000,
    enabled: showRelations,
  });

  // Sort relations client-side
  const sortedRelations = useMemo(() => {
    if (!relationsData?.relations) return [];
    const copy = [...relationsData.relations];
    if (relationsSort === 'source_asc') {
      copy.sort((a, b) => a.source.localeCompare(b.source));
    } else {
      copy.sort((a, b) => b.source.localeCompare(a.source));
    }
    return copy;
  }, [relationsData?.relations, relationsSort]);

  const relationsTotal = relationsData?.total ?? 0;

  // Handle node click -> expand neighbors
  const handleNodeClick = useCallback(async (node: GraphNode) => {
    setHighlightNode(node.id);

    if (expandedNodes.has(node.id)) return;

    try {
      const data = await api.graphNeighbors(DEFAULT_USER_ID, node.id);
      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];

      for (const neighbor of data.neighbors) {
        // Add new node if not existing
        if (!graphData.nodes.find((n) => n.id === neighbor.name)) {
          newNodes.push({
            id: neighbor.name,
            name: neighbor.name,
            type: neighbor.type,
            val: 1,
          });
        }

        // Add link
        if (neighbor.direction === 'outgoing') {
          const linkKey = `${node.id}->${neighbor.name}:${neighbor.relationship}`;
          if (!graphData.links.find((l) =>
            (typeof l.source === 'string' ? l.source : (l.source as unknown as GraphNode).id) === node.id &&
            (typeof l.target === 'string' ? l.target : (l.target as unknown as GraphNode).id) === neighbor.name &&
            l.label === neighbor.relationship
          )) {
            newLinks.push({
              source: node.id,
              target: neighbor.name,
              label: neighbor.relationship,
            });
          }
          void linkKey;
        } else {
          const linkKey = `${neighbor.name}->${node.id}:${neighbor.relationship}`;
          if (!graphData.links.find((l) =>
            (typeof l.source === 'string' ? l.source : (l.source as unknown as GraphNode).id) === neighbor.name &&
            (typeof l.target === 'string' ? l.target : (l.target as unknown as GraphNode).id) === node.id &&
            l.label === neighbor.relationship
          )) {
            newLinks.push({
              source: neighbor.name,
              target: node.id,
              label: neighbor.relationship,
            });
          }
          void linkKey;
        }
      }

      // Update node val (connection count)
      const updatedNodes = graphData.nodes.map((n) =>
        n.id === node.id ? { ...n, val: Math.max(n.val, data.neighbors.length) } : n
      );

      setGraphData({
        nodes: [...updatedNodes, ...newNodes],
        links: [...graphData.links, ...newLinks],
      });
      setExpandedNodes((prev) => new Set(prev).add(node.id));
    } catch {
      // silently fail on neighbor fetch
    }
  }, [graphData, expandedNodes]);

  // Reset graph
  const handleReset = useCallback(() => {
    if (!initialRelations?.relations) return;
    const { nodes, links } = buildGraphFromRelations(initialRelations.relations);
    setGraphData({ nodes, links });
    setExpandedNodes(new Set());
    setHighlightNode(null);
  }, [initialRelations]);

  // Stats bar data
  const topNodeTypes = (stats?.node_types ?? []).slice(0, 10);
  const topRelTypes = (stats?.relationship_types ?? []).slice(0, 10);
  const maxNodeTypeCount = topNodeTypes.length > 0 ? Math.max(...topNodeTypes.map((t) => t.count)) : 0;
  const maxRelTypeCount = topRelTypes.length > 0 ? Math.max(...topRelTypes.map((t) => t.count)) : 0;

  const barColors = [
    'var(--color-accent)',
    'var(--color-purple)',
    'var(--color-success)',
    'var(--color-info)',
    'var(--color-warning)',
    'var(--color-orange)',
    'var(--color-danger)',
  ];

  // Graph node canvas draw
  const nodeCanvasObject = useCallback((node: GraphNode & { x?: number; y?: number }, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const fontSize = Math.max(10 / globalScale, 2);
    const nodeSize = Math.sqrt(Math.max(node.val || 1, 1)) * 3 + 2;
    const isHighlighted = highlightNode === node.id;

    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x || 0, node.y || 0, nodeSize, 0, 2 * Math.PI);
    ctx.fillStyle = getNodeColor(node.type);
    ctx.globalAlpha = isHighlighted ? 1 : 0.85;
    ctx.fill();

    if (isHighlighted) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Draw label
    if (globalScale > 0.5) {
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(192, 202, 245, 0.9)';
      ctx.fillText(label, node.x || 0, (node.y || 0) + nodeSize + 2);
    }
  }, [highlightNode]);

  const nodePointerAreaPaint = useCallback((node: GraphNode & { x?: number; y?: number }, color: string, ctx: CanvasRenderingContext2D) => {
    const nodeSize = Math.sqrt(Math.max(node.val || 1, 1)) * 3 + 4;
    ctx.beginPath();
    ctx.arc(node.x || 0, node.y || 0, nodeSize, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const isLoading = statsLoading || initialLoading;

  // Legend items from unique types in graph
  const legendTypes = useMemo(() => {
    const typeSet = new Map<string, string>();
    for (const node of graphData.nodes) {
      if (!typeSet.has(node.type)) {
        typeSet.set(node.type, getNodeColor(node.type));
      }
    }
    return Array.from(typeSet.entries());
  }, [graphData.nodes]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-info) 15%, transparent)', color: 'var(--color-info)' }}
          >
            <GitFork size={18} />
          </div>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {t('graph.title')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={handleReset}>
            {t('graph.reset')}
          </Button>
          <Button
            variant={showRelations ? 'primary' : 'secondary'}
            size="sm"
            icon={List}
            onClick={() => setShowRelations((v) => !v)}
          >
            {t('graph.view_relations')}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && <LoadingState message={t('common.loading')} />}

      {/* Error */}
      {statsError && (
        <ErrorState
          message={(statsErr as Error)?.message || t('common.error')}
          onRetry={() => refetchStats()}
        />
      )}

      {/* Main content */}
      {!isLoading && !statsError && (
        <>
          {/* Top section: Graph + Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Graph visualization - 3/5 */}
            <Card className="lg:col-span-3 !p-0 overflow-hidden">
              <div
                ref={graphRef}
                className="relative"
                style={{ height: '450px', backgroundColor: 'var(--color-bg-primary)' }}
              >
                {graphData.nodes.length > 0 ? (
                  <ForceGraph2D
                    graphData={graphData}
                    nodeLabel={(node: GraphNode) => `${node.name} (${node.type || 'unknown'})`}
                    nodeCanvasObject={nodeCanvasObject as never}
                    nodePointerAreaPaint={nodePointerAreaPaint as never}
                    linkDirectionalArrowLength={4}
                    linkDirectionalArrowRelPos={0.9}
                    linkColor={() => 'rgba(86, 95, 137, 0.4)'}
                    linkLabel={(link: GraphLink) => link.label}
                    linkWidth={0.8}
                    onNodeClick={handleNodeClick as never}
                    width={graphDimensions.width}
                    height={450}
                    backgroundColor="transparent"
                    cooldownTicks={80}
                    d3AlphaDecay={0.02}
                    d3VelocityDecay={0.3}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      {t('graph.no_data')}
                    </span>
                  </div>
                )}

                {/* Legend */}
                {legendTypes.length > 0 && (
                  <div
                    className="absolute bottom-3 left-3 rounded-lg px-3 py-2 flex flex-wrap gap-x-3 gap-y-1"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--color-bg-secondary) 90%, transparent)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {legendTypes.map(([type, color]) => (
                      <div key={type} className="flex items-center gap-1.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {type}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Node count indicator */}
                <div
                  className="absolute top-3 right-3 rounded-lg px-2.5 py-1.5 text-xs"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-bg-secondary) 90%, transparent)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {graphData.nodes.length} {t('graph.nodes_label')} / {graphData.links.length} {t('graph.links_label')}
                </div>
              </div>
            </Card>

            {/* Stats - 2/5 */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label={t('graph.total_nodes')}
                  value={stats?.node_count ?? 0}
                  icon={CircleDot}
                  color="var(--color-info)"
                />
                <StatCard
                  label={t('graph.total_relations')}
                  value={stats?.relationship_count ?? 0}
                  icon={ArrowRight}
                  color="var(--color-purple)"
                />
              </div>

              {/* Top Node Types */}
              <Card title={t('graph.top_node_types')}>
                <div className="flex flex-col gap-2.5 max-h-[140px] overflow-y-auto pr-1">
                  {topNodeTypes.map((item, idx) => (
                    <div key={item.type} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {item.type}
                        </span>
                        <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                          {item.count}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${maxNodeTypeCount > 0 ? (item.count / maxNodeTypeCount) * 100 : 0}%`,
                            backgroundColor: barColors[idx % barColors.length],
                            minWidth: item.count > 0 ? '4px' : '0',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Top Relationship Types */}
              <Card title={t('graph.top_rel_types')}>
                <div className="flex flex-col gap-2.5 max-h-[140px] overflow-y-auto pr-1">
                  {topRelTypes.map((item, idx) => (
                    <div key={item.type} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {item.type}
                        </span>
                        <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                          {item.count}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full w-full" style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${maxRelTypeCount > 0 ? (item.count / maxRelTypeCount) * 100 : 0}%`,
                            backgroundColor: barColors[(idx + 3) % barColors.length],
                            minWidth: item.count > 0 ? '4px' : '0',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          {/* Bottom: Relations Table */}
          {showRelations && (
            <Card>
              {/* Table header */}
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {t('graph.relations_title', { count: relationsTotal })}
                </h3>
                <div className="flex items-center gap-3">
                  {/* Search */}
                  <div
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5"
                    style={{
                      backgroundColor: 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <Search size={14} style={{ color: 'var(--color-text-muted)' }} />
                    <input
                      type="text"
                      value={relationsSearch}
                      onChange={(e) => {
                        setRelationsSearch(e.target.value);
                        setRelationsPage(1);
                      }}
                      placeholder={t('graph.search_placeholder')}
                      className="bg-transparent border-none outline-none text-xs w-40"
                      style={{ color: 'var(--color-text-primary)' }}
                    />
                  </div>

                  {/* Sort */}
                  <div className="relative">
                    <select
                      value={relationsSort}
                      onChange={(e) => setRelationsSort(e.target.value as SortOption)}
                      className="appearance-none rounded-lg px-3 py-1.5 pr-8 text-xs cursor-pointer outline-none"
                      style={{
                        backgroundColor: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      <option value="source_asc">{t('graph.sort_source_asc')}</option>
                      <option value="source_desc">{t('graph.sort_source_desc')}</option>
                    </select>
                    <ChevronDown
                      size={12}
                      className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'var(--color-text-muted)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Table */}
              {relationsLoading ? (
                <LoadingState message={t('common.loading')} />
              ) : sortedRelations.length === 0 ? (
                <div className="py-8 text-center">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {t('graph.no_relations')}
                  </span>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <th className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                            {t('graph.col_source')}
                          </th>
                          <th className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                            {t('graph.col_source_type')}
                          </th>
                          <th className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                            {t('graph.col_relationship')}
                          </th>
                          <th className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                            {t('graph.col_target')}
                          </th>
                          <th className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                            {t('graph.col_target_type')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRelations.map((rel, idx) => (
                          <tr
                            key={`${rel.source}-${rel.relationship}-${rel.target}-${idx}`}
                            className="transition-colors"
                            style={{ borderBottom: '1px solid var(--color-border)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <td className="py-2 px-3">
                              <button
                                className="text-xs font-mono cursor-pointer hover:underline"
                                style={{ color: 'var(--color-accent)' }}
                                onClick={() => {
                                  const node = graphData.nodes.find((n) => n.id === rel.source);
                                  if (node) {
                                    handleNodeClick(node);
                                  } else {
                                    // Add the node and expand it
                                    const newNode: GraphNode = {
                                      id: rel.source,
                                      name: rel.source,
                                      type: rel.source_type,
                                      val: 1,
                                    };
                                    setGraphData((prev) => ({
                                      nodes: [...prev.nodes, newNode],
                                      links: prev.links,
                                    }));
                                    handleNodeClick(newNode);
                                  }
                                }}
                              >
                                {rel.source}
                              </button>
                            </td>
                            <td className="py-2 px-3">
                              <Badge label={rel.source_type} color={getTypeBadgeColor(rel.source_type)} />
                            </td>
                            <td className="py-2 px-3">
                              <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                {rel.relationship}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <button
                                className="text-xs font-mono cursor-pointer hover:underline"
                                style={{ color: 'var(--color-accent)' }}
                                onClick={() => {
                                  const node = graphData.nodes.find((n) => n.id === rel.target);
                                  if (node) {
                                    handleNodeClick(node);
                                  } else {
                                    const newNode: GraphNode = {
                                      id: rel.target,
                                      name: rel.target,
                                      type: rel.target_type,
                                      val: 1,
                                    };
                                    setGraphData((prev) => ({
                                      nodes: [...prev.nodes, newNode],
                                      links: prev.links,
                                    }));
                                    handleNodeClick(newNode);
                                  }
                                }}
                              >
                                {rel.target}
                              </button>
                            </td>
                            <td className="py-2 px-3">
                              <Badge label={rel.target_type} color={getTypeBadgeColor(rel.target_type)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    page={relationsPage}
                    pageSize={RELATIONS_PAGE_SIZE}
                    total={relationsTotal}
                    onChange={setRelationsPage}
                  />
                </>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildGraphFromRelations(relations: Relation[]): GraphData {
  const nodeMap = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  for (const rel of relations) {
    if (!nodeMap.has(rel.source)) {
      nodeMap.set(rel.source, {
        id: rel.source,
        name: rel.source,
        type: rel.source_type,
        val: 1,
      });
    } else {
      const n = nodeMap.get(rel.source)!;
      n.val += 1;
    }

    if (!nodeMap.has(rel.target)) {
      nodeMap.set(rel.target, {
        id: rel.target,
        name: rel.target,
        type: rel.target_type,
        val: 1,
      });
    } else {
      const n = nodeMap.get(rel.target)!;
      n.val += 1;
    }

    links.push({
      source: rel.source,
      target: rel.target,
      label: rel.relationship,
    });
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links,
  };
}
