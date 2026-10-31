import { useMemo, useState, useEffect } from "react"
import { useOutletContext } from "react-router"
import {
  Search,
  SlidersHorizontal,
  Plus,
  Brain,
  CheckCircle2,
  Clock3,
  RefreshCw,
  MoreHorizontal,
  Shield,
  User,
  Sparkles,
  Pencil,
  Trash2,
  History,
  X,
} from "lucide-react"
import {
  Avatar,
  Badge,
  Button,
  Card,
  Drawer,
  Input,
  Modal,
  PageTitle,
  StatCard,
} from "../components/ui"
import { memoriesApi, type Memory, type MemoryStats } from "../lib/api"

type OutletCtx = { workspaceId?: string }

const MEMORY_TYPES = ["fact", "preference", "decision", "constraint", "task", "lesson", "architecture", "responsibility", "outcome", "feedback", "summary"]

export function MemoryPage() {
  const { workspaceId } = useOutletContext<OutletCtx>()
  const [memories, setMemories] = useState<Memory[]>([])
  const [stats, setStats] = useState<MemoryStats>({ total: 0, by_type: {}, recent_7_days: 0 })
  const [selected, setSelected] = useState<Memory | null>(null)
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [scopeFilter, setScopeFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [correctOpen, setCorrectOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  // Form state
  const [newContent, setNewContent] = useState("")
  const [newType, setNewType] = useState("fact")
  const [newScope, setNewScope] = useState("workspace")
  const [newImportance, setNewImportance] = useState(0.5)
  const [correctContent, setCorrectContent] = useState("")
  const [correctReason, setCorrectReason] = useState("")

  useEffect(() => {
    if (!workspaceId) return
    loadMemories()
    memoriesApi.stats(workspaceId).then(setStats)
  }, [workspaceId])

  async function loadMemories() {
    if (!workspaceId) return
    setLoading(true)
    try {
      const result = await memoriesApi.list(workspaceId, { limit: 100 })
      setMemories(result.memories)
      setTotal(result.total)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return memories.filter((m) => {
      const matchesQuery = !query || m.content.toLowerCase().includes(query.toLowerCase())
      const matchesType = typeFilter === "all" || m.memory_type === typeFilter
      const matchesScope = scopeFilter === "all" || m.privacy_scope === scopeFilter
      return matchesQuery && matchesType && matchesScope
    })
  }, [memories, query, typeFilter, scopeFilter])

  async function handleAddMemory() {
    if (!workspaceId || !newContent.trim()) return
    setSaving(true)
    try {
      const m = await memoriesApi.create(workspaceId, {
        content: newContent,
        memory_type: newType,
        privacy_scope: newScope,
        importance: newImportance,
      })
      setMemories((prev) => [m, ...prev])
      setTotal((t) => t + 1)
      setAddOpen(false)
      setNewContent("")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit() {
    if (!selected || !workspaceId) return
    setSaving(true)
    try {
      const updated = await memoriesApi.update(selected.id, workspaceId, {
        content: newContent || selected.content,
        memory_type: (newType as Memory["memory_type"]) || selected.memory_type,
        importance: newImportance,
        privacy_scope: newScope as Memory["privacy_scope"],
      })
      setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      setSelected(updated)
      setEditOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleCorrect() {
    if (!selected || !workspaceId || !correctContent.trim()) return
    setSaving(true)
    try {
      const updated = await memoriesApi.correct(selected.id, workspaceId, {
        corrected_content: correctContent,
        reason: correctReason,
      })
      setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      setSelected(updated)
      setCorrectOpen(false)
      setCorrectContent("")
      setCorrectReason("")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected || !workspaceId) return
    setSaving(true)
    try {
      await memoriesApi.delete(selected.id, workspaceId)
      setMemories((prev) => prev.filter((m) => m.id !== selected.id))
      setTotal((t) => t - 1)
      setSelected(null)
      setDeleteConfirm(false)
    } finally {
      setSaving(false)
    }
  }

  const typeBadgeTone = (t: string): "amber" | "blue" | "purple" | "green" | "neutral" => {
    if (t === "constraint") return "amber"
    if (t === "lesson") return "blue"
    if (t === "decision") return "green"
    return "purple"
  }

  return (
    <div>
      <PageTitle
        title="Memory Center"
        subtitle="Your team's knowledge, organized and searchable."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={17} /> Add memory
          </Button>
        }
      />
      <div className="stats-grid">
        <StatCard label="Total memories" value={String(stats.total)} change={`+${stats.recent_7_days} this week`} icon={<Brain size={20} />} />
        <StatCard label="Active memories" value={String(total)} change="Active" icon={<CheckCircle2 size={20} />} />
        <StatCard label="Facts" value={String(stats.by_type?.fact || 0)} icon={<Clock3 size={20} />} />
        <StatCard label="Recently updated" value={String(stats.recent_7_days)} change="Last 7 days" icon={<RefreshCw size={20} />} />
      </div>
      <Card className="memory-table-card">
        <div className="filter-row">
          <div className="search-field">
            <Search size={17} />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search memories..." />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {MEMORY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
            <option value="all">All scopes</option>
            <option value="workspace">Workspace</option>
            <option value="personal">Personal</option>
            <option value="project">Project</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Memory</th>
                <th>Type</th>
                <th>Owner</th>
                <th>Importance</th>
                <th>Visibility</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ textAlign: "center", opacity: 0.5, padding: "2rem" }}>Loading memories…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", opacity: 0.5, padding: "2rem" }}>No memories found. Start a conversation to capture knowledge.</td></tr>
              )}
              {filtered.map((m) => (
                <tr key={m.id} onClick={() => setSelected(m)}>
                  <td>
                    <div className="memory-cell">
                      <span className="memory-type"><Brain size={16} /></span>
                      <div>
                        <strong>{m.content.slice(0, 70)}{m.content.length > 70 ? "…" : ""}</strong>
                        <small>From {m.source || "manual"}</small>
                      </div>
                    </div>
                  </td>
                  <td><Badge tone={typeBadgeTone(m.memory_type)}>{m.memory_type}</Badge></td>
                  <td>
                    <div className="owner-cell">
                      <Avatar name={m.owner_name || "User"} size="sm" />
                      {m.owner_name || "User"}
                    </div>
                  </td>
                  <td><span className={`importance ${m.importance >= 0.7 ? "high" : m.importance >= 0.4 ? "medium" : "low"}`}>{m.importance >= 0.7 ? "High" : m.importance >= 0.4 ? "Medium" : "Low"}</span></td>
                  <td>
                    <span className="privacy">
                      {m.privacy_scope === "workspace" ? <Shield size={14} /> : <User size={14} />}
                      {m.privacy_scope}
                    </span>
                  </td>
                  <td>{new Date(m.updated_at).toLocaleDateString()}</td>
                  <td><MoreHorizontal size={17} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Memory detail drawer */}
      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Memory details">
        {selected && (
          <div className="drawer-content">
            <div className="memory-detail-top">
              <span className="detail-brain"><Brain size={21} /></span>
              <div>
                <Badge tone={typeBadgeTone(selected.memory_type)}>{selected.memory_type}</Badge>
                <Badge tone="green">{selected.privacy_scope}</Badge>
              </div>
            </div>
            <h3>{selected.content}</h3>
            <div className="why-stored">
              <Sparkles size={17} />
              <div>
                <strong>Why this was stored</strong>
                <p>TeamBrain detected durable knowledge worth preserving across conversations.</p>
              </div>
            </div>
            <h4>Memory information</h4>
            <dl>
              <div><dt>Type</dt><dd>{selected.memory_type}</dd></div>
              <div><dt>Source</dt><dd>{selected.source || "manual"}</dd></div>
              <div><dt>Importance</dt><dd>{(selected.importance * 100).toFixed(0)}%</dd></div>
              <div><dt>Version</dt><dd>{selected.version || 1}</dd></div>
              <div><dt>Created</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div>
              <div><dt>Expires</dt><dd>{selected.expires_at ? new Date(selected.expires_at).toLocaleDateString() : "Never"}</dd></div>
            </dl>
            {selected.history && selected.history.length > 0 && (
              <>
                <h4>History ({selected.history.length} versions)</h4>
                <div className="activity-line">
                  <span><History size={15} /></span>
                  <div>
                    <strong>Memory has been edited</strong>
                    <p>{selected.history.length} previous version(s)</p>
                  </div>
                </div>
              </>
            )}
            <div className="drawer-actions">
              <Button onClick={() => { setNewContent(selected.content); setNewType(selected.memory_type); setNewScope(selected.privacy_scope); setNewImportance(selected.importance); setEditOpen(true) }}>
                <Pencil size={16} /> Edit
              </Button>
              <Button variant="secondary" onClick={() => { setCorrectContent(selected.content); setCorrectOpen(true) }}>
                Correct
              </Button>
              <Button variant="danger" onClick={() => setDeleteConfirm(true)}>
                <Trash2 size={16} />
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Add memory modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add memory">
        <div className="modal-form">
          <label>Memory content<textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="What should TeamBrain remember?" /></label>
          <label>Type<select value={newType} onChange={(e) => setNewType(e.target.value)}>{MEMORY_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Visibility<select value={newScope} onChange={(e) => setNewScope(e.target.value)}><option value="workspace">Workspace (shared)</option><option value="personal">Personal (private)</option></select></label>
          <label>Importance (0–1)<Input type="number" min="0" max="1" step="0.1" value={newImportance} onChange={(e) => setNewImportance(parseFloat(e.target.value))} /></label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddMemory} disabled={saving || !newContent.trim()}>{saving ? "Saving…" : "Add memory"}</Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit memory">
        <div className="modal-form">
          <label>Content<textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} /></label>
          <label>Type<select value={newType} onChange={(e) => setNewType(e.target.value)}>{MEMORY_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Visibility<select value={newScope} onChange={(e) => setNewScope(e.target.value)}><option value="workspace">Workspace</option><option value="personal">Personal</option></select></label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </div>
      </Modal>

      {/* Correct modal */}
      <Modal open={correctOpen} onClose={() => setCorrectOpen(false)} title="Correct memory">
        <div className="modal-form">
          <label>Corrected content<textarea value={correctContent} onChange={(e) => setCorrectContent(e.target.value)} /></label>
          <label>Reason for correction<Input value={correctReason} onChange={(e) => setCorrectReason(e.target.value)} placeholder="Why is this being corrected?" /></label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setCorrectOpen(false)}>Cancel</Button>
            <Button onClick={handleCorrect} disabled={saving || !correctContent.trim()}>{saving ? "Saving…" : "Save correction"}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)} title="Delete memory">
        <div className="modal-form">
          <p>Are you sure you want to delete this memory? This action cannot be undone.</p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={saving}>{saving ? "Deleting…" : "Delete memory"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
