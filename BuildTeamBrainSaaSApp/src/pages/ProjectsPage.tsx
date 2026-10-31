import { useState, useEffect } from "react"
import { useOutletContext } from "react-router"
import {
  Plus,
  UserPlus,
  Search,
  MoreHorizontal,
  Brain,
  Scale,
  CheckSquare,
  ArrowRight,
  Activity,
  Users,
  Trash2,
} from "lucide-react"
import { Avatar, Badge, Button, Card, Modal, PageTitle } from "../components/ui"
import {
  projectsApi,
  workspacesApi,
  type Project,
  type Member,
  type Workspace,
} from "../lib/api"

type OutletCtx = { workspaceId?: string; workspace?: Workspace }

export function ProjectsPage() {
  const { workspaceId, workspace } = useOutletContext<OutletCtx>()
  const [projects, setProjects] = useState<Project[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [tab, setTab] = useState("Overview")
  const [create, setCreate] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [form, setForm] = useState({ name: "", description: "", stack: "" })
  const [inviteForm, setInviteForm] = useState({ email: "", role: "member" })

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    Promise.allSettled([
      projectsApi.list(workspaceId).then((r: any) => {
        const list = r.tasks || r
        setProjects(list)
        if (list.length > 0 && !selected) setSelected(list[0])
      }),
      workspacesApi.members(workspaceId).then(setMembers),
    ]).finally(() => setLoading(false))
  }, [workspaceId])

  async function handleCreate() {
    if (!workspaceId || !form.name.trim()) return
    setSaving(true)
    try {
      const p = await projectsApi.create({
        workspace_id: workspaceId,
        name: form.name,
        description: form.description,
        stack: form.stack.split(",").map((s) => s.trim()).filter(Boolean),
      })
      setProjects((prev) => [...prev, p])
      setSelected(p)
      setCreate(false)
      setForm({ name: "", description: "", stack: "" })
    } finally {
      setSaving(false)
    }
  }

  async function handleInvite() {
    if (!workspaceId || !inviteForm.email.trim()) return
    setSaving(true)
    try {
      await workspacesApi.invite(workspaceId, { email: inviteForm.email, role: inviteForm.role })
      const updatedMembers = await workspacesApi.members(workspaceId)
      setMembers(updatedMembers)
      setInviteOpen(false)
      setInviteForm({ email: "", role: "member" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteProject(id: string) {
    if (!workspaceId) return
    if (!confirm("Delete this project? This cannot be undone.")) return
    await projectsApi.delete(id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (selected?.id === id) setSelected(projects.find((p) => p.id !== id) || null)
  }

  const filtered = projects.filter((p) => {
    if (filter === "active") return p.status === "active"
    if (filter === "archived") return p.status === "archived"
    return true
  })

  return (
    <div>
      <PageTitle
        title="Workspace"
        subtitle="Manage your team's projects and shared knowledge."
        actions={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(true)}>
              <UserPlus size={16} /> Invite member
            </Button>
            <Button onClick={() => setCreate(true)}>
              <Plus size={16} /> Create project
            </Button>
          </>
        }
      />
      <Card className="workspace-hero">
        <div className="workspace-identity">
          <span className="workspace-big-logo">{workspace?.name?.[0]?.toUpperCase() || "W"}</span>
          <div>
            <p className="eyebrow">WORKSPACE</p>
            <h2>{workspace?.name || "My Workspace"}</h2>
            <p>{workspace?.description || "Your team's shared knowledge base."}</p>
          </div>
        </div>
        <div className="workspace-stats">
          <div>
            <strong>{members.length}</strong>
            <span>Members</span>
          </div>
          <div>
            <strong>{projects.length}</strong>
            <span>Projects</span>
          </div>
          <div>
            <strong>{workspace?.memory_count || 0}</strong>
            <span>Memories</span>
          </div>
          <div className="avatar-stack">
            {members.slice(0, 4).map((m) => (
              <Avatar key={m.user_id} name={m.name} />
            ))}
          </div>
        </div>
      </Card>
      <div className="workspace-toolbar">
        <div>
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
            All projects <span>{projects.length}</span>
          </button>
          <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>
            Active <span>{projects.filter((p) => p.status === "active").length}</span>
          </button>
          <button className={filter === "archived" ? "active" : ""} onClick={() => setFilter("archived")}>
            Archived <span>{projects.filter((p) => p.status === "archived").length}</span>
          </button>
        </div>
        <Button variant="secondary">
          <Search size={16} /> Search projects
        </Button>
      </div>
      <div className="projects-grid">
        {loading && <p style={{ opacity: 0.5 }}>Loading projects…</p>}
        {!loading && filtered.length === 0 && (
          <p style={{ opacity: 0.5 }}>No projects yet. Create your first project.</p>
        )}
        {filtered.map((p, i) => (
          <Card className="project-card" key={p.id}>
            <div className="project-card-top">
              <span className={`project-logo logo-${i % 3}`}>{p.name[0]}</span>
              <Badge tone={p.status === "archived" ? "neutral" : "green"}>{p.status}</Badge>
              <button onClick={() => handleDeleteProject(p.id)} style={{ marginLeft: "auto" }}>
                <Trash2 size={15} />
              </button>
            </div>
            <h2>{p.name}</h2>
            <p>{p.description}</p>
            {p.stack && p.stack.length > 0 && (
              <div className="tech-row">
                {p.stack.map((x) => <Badge key={x}>{x}</Badge>)}
              </div>
            )}
            <div className="project-progress">
              <span>Progress</span>
              <strong>{p.progress}%</strong>
              <div className="progress"><i style={{ width: `${p.progress}%` }} /></div>
            </div>
            <div className="project-metrics">
              <span><Brain size={15} />{p.memory_count || 0} memories</span>
              <span><Scale size={15} />{p.decision_count || 0} decisions</span>
            </div>
            <div className="project-card-foot">
              <Button variant="ghost" onClick={() => { setSelected(p); setTab("Overview") }}>
                Open project <ArrowRight size={15} />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {selected && (
        <div className="project-detail-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">PROJECT DETAIL</p>
              <h2>{selected.name}</h2>
            </div>
            <Badge tone="green">{selected.status}</Badge>
          </div>
          <div className="detail-tabs">
            {["Overview", "Memories", "Decisions", "Tasks", "Members"].map((x) => (
              <button className={tab === x ? "active" : ""} onClick={() => setTab(x)} key={x}>{x}</button>
            ))}
          </div>
          <div className="project-detail-grid">
            <Card>
              <h3>{tab} summary</h3>
              <p>
                {tab === "Overview" ? selected.description :
                  `All ${tab.toLowerCase()} connected to ${selected.name} appear here.`}
              </p>
              {tab === "Overview" && (
                <>
                  <div className="detail-feature">
                    <CheckSquare size={18} />
                    <div>
                      <strong>Task progress</strong>
                      <p>{selected.task_count || 0} tasks</p>
                    </div>
                  </div>
                  <div className="detail-feature">
                    <Users size={18} />
                    <div>
                      <strong>Created by</strong>
                      <p>{selected.creator_name}</p>
                    </div>
                  </div>
                </>
              )}
              {tab === "Members" && (
                <div>
                  {members.map((m) => (
                    <div className="activity-line" key={m.user_id}>
                      <Avatar name={m.name} size="sm" />
                      <div>
                        <strong>{m.name}</strong>
                        <p>{m.email} · {m.role}</p>
                      </div>
                      <Badge tone={m.role === "owner" ? "purple" : "neutral"}>{m.role}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <h3>Project stats</h3>
              <div className="compact-activity">
                <span><Brain size={14} /></span>
                <div><strong>{selected.memory_count || 0} memories</strong><p>Knowledge captured</p></div>
              </div>
              <div className="compact-activity">
                <span><Scale size={14} /></span>
                <div><strong>{selected.decision_count || 0} decisions</strong><p>Technical choices</p></div>
              </div>
              <div className="compact-activity">
                <span><Activity size={14} /></span>
                <div><strong>{selected.task_count || 0} tasks</strong><p>Work items</p></div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Create project modal */}
      <Modal open={create} onClose={() => setCreate(false)} title="Create a new project">
        <div className="modal-form">
          <label>Project name *<input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Developer Portal" /></label>
          <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this project about?" /></label>
          <label>Tech stack (comma-separated)<input className="input" value={form.stack} onChange={(e) => setForm({ ...form, stack: e.target.value })} placeholder="React, FastAPI, MongoDB" /></label>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setCreate(false)}>Cancel</Button>
            <Button type="button" onClick={handleCreate} disabled={saving || !form.name.trim()}>{saving ? "Creating…" : "Create project"}</Button>
          </div>
        </div>
      </Modal>

      {/* Invite member modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a team member">
        <div className="modal-form">
          <label>Email address<input className="input" type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="colleague@company.com" /></label>
          <label>Role<select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select></label>
          <div className="modal-actions">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleInvite} disabled={saving || !inviteForm.email.trim()}>{saving ? "Inviting…" : "Send invite"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
