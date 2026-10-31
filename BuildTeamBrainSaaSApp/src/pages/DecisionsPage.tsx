import { useState, useEffect } from "react"
import { useOutletContext } from "react-router"
import {
  Plus,
  Scale,
  CheckCircle2,
  Clock3,
  History,
  Search,
  MoreHorizontal,
  Pencil,
  ThumbsUp,
  XCircle,
  Link2,
  AlertTriangle,
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
import { decisionsApi, type Decision, type DecisionStats } from "../lib/api"

type OutletCtx = { workspaceId?: string; workspace?: { role?: string } }

const STATUS_TONES: Record<string, "green" | "amber" | "neutral" | "red"> = {
  approved: "green",
  proposed: "amber",
  rejected: "red",
  superseded: "neutral",
}

export function DecisionsPage() {
  const { workspaceId, workspace } = useOutletContext<OutletCtx>()
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [stats, setStats] = useState<DecisionStats>({ total: 0, approved: 0, proposed: 0, superseded: 0, rejected: 0 })
  const [selected, setSelected] = useState<Decision | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const isAdmin = workspace?.role === "owner" || workspace?.role === "admin"

  // Form fields
  const [form, setForm] = useState({ title: "", description: "", reasoning: "", alternatives: "" })
  const [editForm, setEditForm] = useState({ title: "", description: "", reasoning: "" })

  useEffect(() => {
    if (!workspaceId) return
    loadDecisions()
    decisionsApi.stats(workspaceId).then(setStats)
  }, [workspaceId, statusFilter])

  async function loadDecisions() {
    if (!workspaceId) return
    setLoading(true)
    try {
      const result = await decisionsApi.list(workspaceId, { status: statusFilter || undefined })
      setDecisions(result.decisions)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!workspaceId || !form.title.trim()) return
    setSaving(true)
    try {
      const newDec = await decisionsApi.create({
        workspace_id: workspaceId,
        title: form.title,
        description: form.description,
        reasoning: form.reasoning,
        alternatives: form.alternatives
          ? form.alternatives.split("\n").filter(Boolean).map((a) => ({ title: a, description: "" }))
          : [],
      })
      setDecisions((prev) => [newDec, ...prev])
      setStats((s) => ({ ...s, total: s.total + 1, proposed: s.proposed + 1 }))
      setCreateOpen(false)
      setForm({ title: "", description: "", reasoning: "", alternatives: "" })
      // Show conflict warning
      if (newDec.has_conflict) {
        alert(`⚠️ Conflict detected: This decision may conflict with an existing approved decision.`)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit() {
    if (!selected || !workspaceId) return
    setSaving(true)
    try {
      const updated = await decisionsApi.update(selected.id, workspaceId, {
        title: editForm.title || selected.title,
        description: editForm.description || selected.description,
        reasoning: editForm.reasoning || selected.reasoning,
      })
      setDecisions((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      setSelected(updated)
      setEditOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove(id: string) {
    if (!workspaceId) return
    const updated = await decisionsApi.approve(id, workspaceId)
    setDecisions((prev) => prev.map((d) => (d.id === id ? updated : d)))
    setSelected(updated)
    setStats((s) => ({ ...s, approved: s.approved + 1, proposed: Math.max(0, s.proposed - 1) }))
  }

  async function handleReject(id: string) {
    if (!workspaceId) return
    const updated = await decisionsApi.reject(id, workspaceId)
    setDecisions((prev) => prev.map((d) => (d.id === id ? updated : d)))
    setSelected(updated)
  }

  const shown = decisions.filter((d) =>
    !query || d.title.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div>
      <PageTitle
        title="Decision Tracker"
        subtitle="Never lose the reasoning behind important decisions."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={17} /> Create decision
          </Button>
        }
      />
      <div className="stats-grid">
        <StatCard label="Total decisions" value={String(stats.total)} change={`Across workspace`} icon={<Scale size={20} />} />
        <StatCard label="Approved" value={String(stats.approved)} change={`${stats.total ? Math.round(stats.approved / stats.total * 100) : 0}% of total`} icon={<CheckCircle2 size={20} />} />
        <StatCard label="Proposed" value={String(stats.proposed)} change="Pending review" icon={<Clock3 size={20} />} />
        <StatCard label="Superseded" value={String(stats.superseded)} change="History preserved" icon={<History size={20} />} />
      </div>
      <Card>
        <div className="filter-row decision-filter">
          <div className="search-field">
            <Search size={17} />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search decisions..." />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="approved">Approved</option>
            <option value="proposed">Proposed</option>
            <option value="rejected">Rejected</option>
            <option value="superseded">Superseded</option>
          </select>
          <Button variant="secondary">Newest first</Button>
        </div>
        <div className="decision-list">
          {loading && <p style={{ padding: "2rem", opacity: 0.5 }}>Loading decisions…</p>}
          {!loading && shown.length === 0 && (
            <p style={{ padding: "2rem", opacity: 0.5 }}>No decisions yet. Create your first decision.</p>
          )}
          {shown.map((d) => (
            <button className="decision-row" key={d.id} onClick={() => setSelected(d)}>
              <span className="decision-large-icon"><Scale size={19} /></span>
              <div className="decision-content">
                <div>
                  <Badge tone={STATUS_TONES[d.status] || "neutral"}>{d.status}</Badge>
                  {d.has_conflict && <Badge tone="red"><AlertTriangle size={12} /> Conflict</Badge>}
                  <span>{new Date(d.created_at).toLocaleDateString()}</span>
                </div>
                <h3>{d.title}</h3>
                <p>{d.description}</p>
                <div className="decision-owner">
                  <Avatar name={d.owner_name || "User"} size="sm" />
                  Owned by {d.owner_name || "Unknown"}
                </div>
              </div>
              <MoreHorizontal size={18} />
            </button>
          ))}
        </div>
      </Card>

      {/* Decision detail drawer */}
      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Decision details">
        {selected && (
          <div className="drawer-content">
            <div className="memory-detail-top">
              <span className="detail-brain"><Scale size={21} /></span>
              <Badge tone={STATUS_TONES[selected.status] || "neutral"}>{selected.status}</Badge>
              {selected.has_conflict && <Badge tone="red"><AlertTriangle size={12} /> Conflict detected</Badge>}
            </div>
            <h3>{selected.title}</h3>
            <p className="detail-body">{selected.description}</p>
            {selected.reasoning && (
              <>
                <h4>Reasoning</h4>
                <p className="detail-body">{selected.reasoning}</p>
              </>
            )}
            {selected.alternatives && selected.alternatives.length > 0 && (
              <>
                <h4>Alternatives considered</h4>
                {selected.alternatives.map((alt, i) => (
                  <div className="alternative" key={i}>
                    <strong>{alt.title}</strong>
                    {alt.description && <p>{alt.description}</p>}
                  </div>
                ))}
              </>
            )}
            {selected.conflicts && selected.conflicts.length > 0 && (
              <>
                <h4>⚠️ Conflicts with</h4>
                {selected.conflicts.map((c, i) => (
                  <div className="alternative" key={i} style={{ borderColor: "var(--red)" }}>
                    <strong>{c.decision}</strong>
                    <p>{c.reason}</p>
                  </div>
                ))}
              </>
            )}
            <div className="drawer-actions">
              <Button onClick={() => { setEditForm({ title: selected.title, description: selected.description || "", reasoning: selected.reasoning || "" }); setEditOpen(true) }}>
                <Pencil size={16} /> Edit
              </Button>
              {selected.status === "proposed" && isAdmin && (
                <Button variant="secondary" onClick={() => handleApprove(selected.id)}>
                  <ThumbsUp size={16} /> Approve
                </Button>
              )}
              {selected.status !== "rejected" && isAdmin && (
                <Button variant="danger" onClick={() => handleReject(selected.id)}>
                  <XCircle size={16} /> Reject
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Create decision modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a decision">
        <div className="modal-form">
          <label>Title *<Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What was decided?" /></label>
          <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the decision..." /></label>
          <label>Reasoning<textarea value={form.reasoning} onChange={(e) => setForm({ ...form, reasoning: e.target.value })} placeholder="Why was this decision made?" /></label>
          <label>Alternatives (one per line)<textarea value={form.alternatives} onChange={(e) => setForm({ ...form, alternatives: e.target.value })} placeholder="Alternative A&#10;Alternative B" /></label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.title.trim()}>{saving ? "Creating…" : "Create decision"}</Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit decision">
        <div className="modal-form">
          <label>Title<Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></label>
          <label>Description<textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></label>
          <label>Reasoning<textarea value={editForm.reasoning} onChange={(e) => setEditForm({ ...editForm, reasoning: e.target.value })} /></label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
