'use client'

import React, {
  useCallback, useEffect, useRef, useState, memo,
} from 'react'
import {
  Loader2, RefreshCw, Brain, Network, ChevronRight, ChevronDown,
  AlertCircle, BookOpen, Target, FileText, Sparkles, ZoomIn, ZoomOut,
  RotateCcw, Info,
} from 'lucide-react'
import { api } from '@/lib/api'
import type {
  KnowledgeOutline, KnowledgeGraph, KnowledgeOutlineNode,
  KnowledgeGraphNode, KnowledgeEvidence,
} from '@/lib/types'

// ── AI Badge ─────────────────────────────────────────────────────────────────

function AiBadge({ confidence }: { confidence?: string | null }) {
  const color = confidence === 'high' ? '#F59E0B' : confidence === 'low' ? '#6B7280' : '#A78BFA'
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0"
      style={{ background: 'rgba(167,139,250,0.15)', color, border: `1px solid ${color}40`, fontSize: 10 }}>
      <Sparkles size={9} />【AI补全】{confidence ? `(${confidence})` : ''}
    </span>
  )
}

// ── Evidence List ─────────────────────────────────────────────────────────────

function EvidenceList({ evidence }: { evidence?: KnowledgeEvidence[] }) {
  if (!evidence || evidence.length === 0) return (
    <p className="text-xs italic" style={{ color: '#555' }}>无证据记录</p>
  )
  return (
    <div className="flex flex-col gap-1.5">
      {evidence.map((ev, i) => {
        const noEvidence = ev.doc?.includes('No direct evidence')
        return (
          <div key={i} className="rounded-lg px-3 py-2 text-xs"
            style={{
              background: noEvidence ? 'rgba(107,114,128,0.08)' : 'rgba(255,215,0,0.05)',
              border: `1px solid ${noEvidence ? 'rgba(107,114,128,0.2)' : 'rgba(255,215,0,0.1)'}`,
            }}>
            {noEvidence
              ? <span style={{ color: '#6B7280' }}>无直接资料证据（AI生成内容）</span>
              : <>
                  <span className="font-medium" style={{ color: '#FFD700' }}>{ev.doc}</span>
                  {ev.page != null && <span style={{ color: '#888' }}> · p.{ev.page}</span>}
                  {ev.quote && <p className="mt-1 italic" style={{ color: '#AAA' }}>"{ev.quote}"</p>}
                </>
            }
          </div>
        )
      })}
    </div>
  )
}

// ── Node Detail Panel ────────────────────────────────────────────────────────

function NodeDetailPanel({ node }: { node: KnowledgeOutlineNode | KnowledgeGraphNode | null }) {
  if (!node) return (
    <div className="flex flex-col items-center justify-center h-full gap-3"
      style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, background: 'rgba(255,255,255,0.02)' }}>
      <Info size={28} style={{ color: '#333' }} />
      <p className="text-xs" style={{ color: '#444' }}>点击节点查看详情</p>
    </div>
  )

  const outline = node as KnowledgeOutlineNode
  const isAI = node.is_ai_generated

  return (
    <div className="flex flex-col gap-3 overflow-y-auto h-full p-4 rounded-xl"
      style={{ border: '1px solid rgba(255,215,0,0.1)', background: 'rgba(255,215,0,0.02)' }}>
      {/* Title + AI badge */}
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="text-sm font-bold leading-tight flex-1" style={{ color: '#FFD700' }}>
          {(node as KnowledgeGraphNode).label ?? (node as KnowledgeOutlineNode).title}
        </h3>
        {isAI && <AiBadge confidence={(node as KnowledgeOutlineNode).confidence} />}
      </div>

      {/* AI supplement reason */}
      {isAI && outline.reason && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', color: '#C4B5FD' }}>
          <span className="font-semibold">补全原因：</span>{outline.reason}
        </div>
      )}

      {/* Summary */}
      {outline.summary && (
        <div>
          <p className="text-xs font-semibold mb-1 flex items-center gap-1" style={{ color: '#888' }}>
            <FileText size={11} /> 摘要
          </p>
          <p className="text-xs leading-relaxed" style={{ color: '#AAA' }}>{outline.summary}</p>
        </div>
      )}

      {/* Key points */}
      {outline.key_points?.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1" style={{ color: '#888' }}>
            <BookOpen size={11} /> 要点
          </p>
          <ul className="flex flex-col gap-1">
            {outline.key_points.map((kp, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: '#BBB' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{ background: '#FFD700' }} />
                {kp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Exam focus */}
      {outline.exam_focus?.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1" style={{ color: '#888' }}>
            <Target size={11} /> 考点
          </p>
          <ul className="flex flex-col gap-1">
            {outline.exam_focus.map((ef, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: '#F59E0B' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{ background: '#F59E0B' }} />
                {ef}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Evidence */}
      <div>
        <p className="text-xs font-semibold mb-1.5 flex items-center gap-1" style={{ color: '#888' }}>
          <FileText size={11} /> 资料来源
        </p>
        <EvidenceList evidence={outline.evidence ?? (node as KnowledgeGraphNode).evidence} />
      </div>
    </div>
  )
}

// ── Outline Node Row (memoized) ───────────────────────────────────────────────

interface NodeRowProps {
  node: KnowledgeOutlineNode
  depth: number
  isCollapsed: boolean
  hasChildren: boolean
  isSelected: boolean
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}

const OutlineNodeRow = memo(function OutlineNodeRow({
  node, depth, isCollapsed, hasChildren, isSelected, onToggle, onSelect,
}: NodeRowProps) {
  const isAI = node.is_ai_generated
  return (
    <div
      className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all"
      style={{
        marginLeft: depth * 16,
        background: isSelected ? 'rgba(255,215,0,0.1)' : 'transparent',
        border: isSelected ? '1px solid rgba(255,215,0,0.2)' : '1px solid transparent',
      }}
      onClick={() => onSelect(node.id)}>

      {/* Collapse toggle */}
      <button
        className="flex-shrink-0 w-4 h-4 flex items-center justify-center mt-0.5"
        style={{ color: '#555' }}
        onClick={e => { e.stopPropagation(); if (hasChildren) onToggle(node.id) }}>
        {hasChildren
          ? (isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />)
          : <span className="w-1 h-1 rounded-full block" style={{ background: '#333', margin: 'auto' }} />}
      </button>

      {/* Level indicator dot */}
      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
        style={{ background: node.level === 1 ? '#FFD700' : node.level === 2 ? '#A78BFA' : '#555' }} />

      {/* Title */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="text-xs leading-snug"
            style={{ color: isAI ? '#9CA3AF' : isSelected ? '#FFD700' : '#CCC' }}>
            {node.title}
          </span>
          {isAI && <AiBadge confidence={node.confidence} />}
        </div>
        {node.exam_focus?.length > 0 && !isAI && (
          <p className="text-xs mt-0.5 truncate" style={{ color: '#F59E0B', opacity: 0.7 }}>
            考点: {node.exam_focus[0]}
          </p>
        )}
      </div>
    </div>
  )
})

// ── Outline View ─────────────────────────────────────────────────────────────

function OutlineView({
  outline,
  selectedNodeId,
  collapsed,
  onToggle,
  onSelect,
}: {
  outline: KnowledgeOutline | null
  selectedNodeId?: string
  collapsed: Set<string>
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}) {
  if (!outline?.nodes?.length) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-xs" style={{ color: '#444' }}>无大纲数据</p>
    </div>
  )

  // Build parent→children map
  const childMap = new Map<string | null, KnowledgeOutlineNode[]>()
  for (const n of outline.nodes) {
    const key = n.parent_id ?? null
    if (!childMap.has(key)) childMap.set(key, [])
    childMap.get(key)!.push(n)
  }

  function renderNode(node: KnowledgeOutlineNode, depth = 0): React.ReactNode {
    const children = childMap.get(node.id) ?? []
    const isCollapsed = collapsed.has(node.id)
    return (
      <div key={node.id}>
        <OutlineNodeRow
          node={node}
          depth={depth}
          hasChildren={children.length > 0}
          isCollapsed={isCollapsed}
          isSelected={selectedNodeId === node.id}
          onToggle={onToggle}
          onSelect={onSelect}
        />
        {!isCollapsed && children.map(c => renderNode(c, depth + 1))}
      </div>
    )
  }

  const roots = childMap.get(null) ?? []
  return (
    <div className="h-full overflow-y-auto rounded-xl p-3"
      style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
      {roots.map(r => renderNode(r))}
    </div>
  )
}

// ── Cytoscape Graph View ──────────────────────────────────────────────────────

function CytoscapeGraph({
  graph,
  selectedNodeId,
  onSelect,
}: {
  graph: KnowledgeGraph | null
  selectedNodeId?: string
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef        = useRef<any>(null)

  // Init / re-init when graph data changes
  useEffect(() => {
    if (!containerRef.current || !graph?.nodes?.length) return

    let cy: any = null

    import('cytoscape').then(({ default: cytoscape }) => {
      if (!containerRef.current) return

      const elements = [
        ...graph.nodes.map(n => ({
          data: {
            id:    n.id,
            label: n.label,
            type:  n.type ?? 'Concept',
            isAI:  n.is_ai_generated ? 'true' : 'false',
          },
        })),
        ...graph.edges.map(e => ({
          data: {
            id:     e.id,
            source: e.source,
            target: e.target,
            label:  e.relation,
            isAI:   e.is_ai_generated ? 'true' : 'false',
          },
        })),
      ]

      cy = cytoscape({
        container: containerRef.current,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              'label':           'data(label)',
              'background-color':'#1e1e3a',
              'border-color':    '#FFD700',
              'border-width':     1.5,
              'color':           '#CCC',
              'font-size':        10,
              'text-valign':     'center',
              'text-halign':     'center',
              'width':            65,
              'height':           65,
              'text-wrap':       'wrap',
              'text-max-width':   '58px',
            },
          },
          {
            selector: 'node[isAI = "true"]',
            style: {
              'background-color': '#141428',
              'border-color':     '#555',
              'border-style':     'dashed',
              'color':            '#6B7280',
            },
          },
          {
            selector: 'node:selected',
            style: {
              'background-color': 'rgba(255,215,0,0.25)',
              'border-color':     '#FFD700',
              'border-width':      2.5,
              'color':            '#FFD700',
            },
          },
          {
            selector: 'edge',
            style: {
              'curve-style':          'bezier',
              'target-arrow-shape':   'triangle',
              'target-arrow-color':   '#444',
              'line-color':           '#333',
              'width':                 1.5,
              'label':               'data(label)',
              'font-size':             8,
              'color':               '#666',
              'text-rotation':       'autorotate',
              'text-margin-y':       -6,
            },
          },
          {
            selector: 'edge[isAI = "true"]',
            style: {
              'line-style':           'dashed',
              'line-color':           '#2a2a2a',
              'target-arrow-color':   '#2a2a2a',
            },
          },
          {
            selector: '.highlighted',
            style: {
              'background-color': 'rgba(255,215,0,0.15)',
              'border-color':     '#FFD700',
              'border-width':      2,
            },
          },
        ],
        layout: {
          name:           'cose',
          animate:         false,
          padding:         20,
          nodeRepulsion:   800000,
          idealEdgeLength: 100,
          randomize:       true,
        },
      })

      cy.on('tap', 'node', (evt: any) => {
        const id = evt.target.data('id') as string
        // Highlight neighbours
        cy.elements().removeClass('highlighted')
        evt.target.neighborhood().addClass('highlighted')
        onSelect(id)
      })

      cy.on('tap', (evt: any) => {
        if (evt.target === cy) {
          cy.elements().removeClass('highlighted')
        }
      })

      cyRef.current = cy
    })

    return () => {
      cy?.destroy()
      cyRef.current = null
    }
  }, [graph]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync selection
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes().deselect()
    if (selectedNodeId) {
      cy.getElementById(selectedNodeId).select()
    }
  }, [selectedNodeId])

  return (
    <div ref={containerRef} className="w-full h-full rounded-xl"
      style={{ background: 'rgba(10,10,20,0.8)', minHeight: 420 }} />
  )
}

function GraphView({
  graph,
  selectedNodeId,
  onSelect,
}: {
  graph: KnowledgeGraph | null
  selectedNodeId?: string
  onSelect: (id: string) => void
}) {
  const cyRef = useRef<any>(null)

  if (!graph?.nodes?.length) return (
    <div className="flex items-center justify-center h-full rounded-xl"
      style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
      <p className="text-xs" style={{ color: '#444' }}>无图谱数据</p>
    </div>
  )

  // Count AI nodes/edges
  const aiNodeCount = graph.nodes.filter(n => n.is_ai_generated).length
  const aiEdgeCount = graph.edges.filter(e => e.is_ai_generated).length

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-1.5 rounded-lg flex-wrap"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#888' }}>
          <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#1e1e3a', border: '1.5px solid #FFD700' }} />
          资料支撑节点
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#888' }}>
          <span className="w-3 h-3 rounded-full inline-block" style={{ background: '#141428', border: '1.5px dashed #555' }} />
          AI补全节点 ({aiNodeCount})
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#888' }}>
          <span className="inline-block border-t-2 w-5" style={{ borderStyle: 'dashed', borderColor: '#444' }} />
          AI补全边 ({aiEdgeCount})
        </div>
        <div className="flex-1" />
        <span className="text-xs" style={{ color: '#555' }}>
          {graph.nodes.length} 节点 · {graph.edges.length} 边
        </span>
      </div>

      {/* Graph container */}
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <CytoscapeGraph
          graph={graph}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
        />
      </div>
    </div>
  )
}

// ── Main KnowledgeTab ─────────────────────────────────────────────────────────

export default function KnowledgeTab({ courseId }: { courseId: string }) {
  const [activeTab,    setActiveTab]    = useState<'outline' | 'graph'>('outline')
  const [outline,      setOutline]      = useState<KnowledgeOutline | null>(null)
  const [graph,        setGraph]        = useState<KnowledgeGraph | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [building,     setBuilding]     = useState(false)
  const [allowAiFill,  setAllowAiFill]  = useState(true)
  const [selectedNode, setSelectedNode] = useState<KnowledgeOutlineNode | KnowledgeGraphNode | null>(null)
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set())
  const [error,        setError]        = useState<string | null>(null)

  // Load persisted data on mount
  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      api.knowledge.getOutline(courseId),
      api.knowledge.getGraph(courseId),
    ]).then(([outRes, grRes]) => {
      if (outRes.status === 'fulfilled' && (outRes.value as KnowledgeOutline)?.nodes?.length > 0)
        setOutline(outRes.value as KnowledgeOutline)
      if (grRes.status === 'fulfilled' && (grRes.value as KnowledgeGraph)?.nodes?.length > 0)
        setGraph(grRes.value as KnowledgeGraph)
    }).finally(() => setLoading(false))
  }, [courseId])

  async function handleBuild() {
    setBuilding(true)
    setError(null)
    try {
      const result = await api.knowledge.build(courseId, allowAiFill)
      setOutline(result.outline)
      setGraph(result.graph)
      setSelectedNode(null)
    } catch (e: any) {
      setError(e.message || '生成失败')
    } finally {
      setBuilding(false)
    }
  }

  const handleNodeSelect = useCallback(async (nodeId: string) => {
    // Try to get full detail from API first, fallback to local data
    try {
      const node = await api.knowledge.getNode(courseId, nodeId)
      if (node?.id) { setSelectedNode(node); return }
    } catch { /* ignore */ }

    const fromOutline = outline?.nodes?.find(n => n.id === nodeId)
    if (fromOutline) { setSelectedNode(fromOutline); return }

    const fromGraph = graph?.nodes?.find(n => n.id === nodeId)
    if (fromGraph) setSelectedNode(fromGraph as any)
  }, [courseId, outline, graph])

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const hasData = (outline?.nodes?.length ?? 0) > 0 || (graph?.nodes?.length ?? 0) > 0

  // ── Statistics for header strip ──
  const aiNodeCount  = outline?.nodes?.filter(n => n.is_ai_generated).length ?? 0
  const totalNodes   = outline?.nodes?.length ?? 0

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Top controls ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap shrink-0">

        {/* Tab switcher */}
        <div className="flex rounded-lg overflow-hidden"
          style={{ border: '1px solid rgba(255,215,0,0.15)' }}>
          {(['outline', 'graph'] as const).map((tab, i) => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 text-sm font-medium transition-all"
              style={{
                background: activeTab === tab ? 'rgba(255,215,0,0.15)' : 'transparent',
                color: activeTab === tab ? '#FFD700' : '#666',
                borderRight: i === 0 ? '1px solid rgba(255,215,0,0.15)' : 'none',
              }}>
              {tab === 'outline' ? '📋 知识点大纲' : '🕸️ 知识图谱'}
            </button>
          ))}
        </div>

        {/* Stats strip */}
        {hasData && (
          <div className="flex items-center gap-3 text-xs" style={{ color: '#555' }}>
            <span>{totalNodes} 节点</span>
            {aiNodeCount > 0 && (
              <span className="flex items-center gap-1" style={{ color: '#A78BFA' }}>
                <Sparkles size={10} />{aiNodeCount} AI补全
              </span>
            )}
            {outline?.generated_at && (
              <span>{new Date(outline.generated_at).toLocaleDateString('zh-CN')}</span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* AI Fill toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <div onClick={() => setAllowAiFill(v => !v)}
            className="relative w-9 h-5 rounded-full transition-colors cursor-pointer"
            style={{ background: allowAiFill ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.08)' }}>
            <div className="absolute top-0.5 transition-all rounded-full w-4 h-4"
              style={{
                left: allowAiFill ? '18px' : '2px',
                background: allowAiFill ? '#A78BFA' : '#444',
                transition: 'left 0.2s ease',
              }} />
          </div>
          <span className="text-xs" style={{ color: '#888' }}>AI 补全</span>
        </label>

        {/* Build button */}
        <button onClick={handleBuild} disabled={building}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: building ? 'rgba(255,215,0,0.08)' : 'rgba(255,215,0,0.18)',
            color: '#FFD700',
            border: '1px solid rgba(255,215,0,0.3)',
            opacity: building ? 0.7 : 1,
          }}>
          {building ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {hasData ? '重新生成' : '生成知识图谱'}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mb-3 px-4 py-2 rounded-lg flex items-center gap-2 text-sm shrink-0"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle size={14} />{error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={28} />
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !hasData && !building && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <Brain size={52} style={{ color: '#222' }} />
          <p className="text-sm font-medium" style={{ color: '#444' }}>尚未生成知识图谱</p>
          <p className="text-xs" style={{ color: '#333' }}>
            点击「生成知识图谱」按钮开始。开启 AI 补全可自动填充资料中缺失的知识点。
          </p>
        </div>
      )}

      {/* ── Building overlay ── */}
      {building && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <Brain size={48} style={{ color: '#FFD700', opacity: 0.6 }} className="animate-pulse" />
          <p className="text-sm font-medium" style={{ color: '#FFD700' }}>正在生成知识图谱…</p>
          <p className="text-xs" style={{ color: '#666' }}>
            阶段 1: 从资料中抽取知识结构
            {allowAiFill && ' → 阶段 2: AI 补全缺口'}
          </p>
          <Loader2 className="animate-spin" style={{ color: '#FFD700' }} size={24} />
        </div>
      )}

      {/* ── Main content ── */}
      {!loading && !building && hasData && (
        <div className="flex gap-4 flex-1 min-h-0">

          {/* Left: outline tree / graph (takes ~65% width) */}
          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
            {activeTab === 'outline'
              ? <OutlineView
                  outline={outline}
                  selectedNodeId={selectedNode?.id}
                  collapsed={collapsed}
                  onToggle={handleToggleCollapse}
                  onSelect={handleNodeSelect}
                />
              : <GraphView
                  graph={graph}
                  selectedNodeId={selectedNode?.id}
                  onSelect={handleNodeSelect}
                />
            }
          </div>

          {/* Right: node detail panel (~280 px) */}
          <div className="w-72 flex-shrink-0 min-h-0">
            <NodeDetailPanel node={selectedNode} />
          </div>

        </div>
      )}

    </div>
  )
}
