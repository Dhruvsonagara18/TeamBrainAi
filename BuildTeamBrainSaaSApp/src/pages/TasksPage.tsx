import { useState, useEffect } from "react"
import { useOutletContext } from "react-router"
import {
  Plus,
  ListTodo,
  CircleDot,
  LoaderCircle,
  CheckCircle2,
  SlidersHorizontal,
  Calendar,
  MessageSquare,
  MoreHorizontal,
  Flag,
  Link2,
  Trash2,
} from "lucide-react"
import {
  Avatar,
  Badge,
  Button,
  Card,
  Drawer,
  Modal,
  Input,
  PageTitle,
  StatCard,
} from "../components/ui"
import { tasksApi, type Task, type TaskStats } from "../lib/api"

type OutletCtx = { workspaceId?: string }

const COLUMNS = ["todo", "in_progress", "review", "completed"]
const COLUMN_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
}
const PRIORITY_TONES: Record<string, "red" | "amber" | "blue" | "neutral"> = {
  critical: "red",
  high: "amber",
  medium: "blue",
  low: "neutral",
}

export function TasksPage() {
  const { workspaceId } = useOutletContext<OutletCtx>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState<TaskStats>({ total: 0, by_status: {} })
  const [selected, setSelected] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [comment, setComment] = useState("")
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", due_date: "" })

  useEffect(() => {
    if (!workspaceId) return
    loadTasks()
    tasksApi.stats(workspaceId).then(setStats)
  }, [workspaceId])

  async function loadTasks() {
    if (!workspaceId) return
    setLoading(true)
    try {
      const result = await tasksApi.list(workspaceId)
      setTasks(result.tasks)
    } finally {
      setLoading(false)
    }
  }

  async function advance(task: Task) {
    if (!workspaceId) return
    const next = COLUMNS[Math.min(COLUMNS.indexOf(task.status) + 1, COLUMNS.length - 1)]
    const updated = await tasksApi.update(task.id, workspaceId, { status: next })
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    if (selected?.id === updated.id) setSelected(updated)
  }

  async function handleCreate() {
    if (!workspaceId || !form.title.trim()) return
    setSaving(true)
    try {
      const task = await tasksApi.create({
        workspace_id: workspaceId,
        title: form.title,
        description: form.description,
        priority: form.priority,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : undefined,
      })
      setTasks((prev) => [...prev, task])
      setStats((s) => ({ ...s, total: s.total + 1, by_status: { ...s.by_status, todo: (s.by_status.todo || 0) + 1 } }))
      setCreateOpen(false)
      setForm({ title: "", description: "", priority: "medium", due_date: "" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!workspaceId) return
    await tasksApi.delete(id, workspaceId)
    setTasks((prev) => prev.filter((t) => t.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  async function handleAddComment() {
    if (!selected || !workspaceId || !comment.trim()) return
    await tasksApi.addComment(selected.id, workspaceId, comment)
    setComment("")
    // Refresh task to get updated comments
    const result = await tasksApi.list(workspaceId)
    setTasks(result.tasks)
    const updated = result.tasks.find((t) => t.id === selected.id)
    if (updated) setSelected(updated)
  }

  return (
    <div>
      <PageTitle
        title="Tasks"
        subtitle="Keep your team aligned and projects moving."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={17} /> Create task
          </Button>
        }
      />
      <div className="stats-grid">
        <StatCard label="Total tasks" value={String(stats.total)} icon={<ListTodo size={20} />} />
        <StatCard label="To do" value={String(stats.by_status?.todo || 0)} icon={<CircleDot size={20} />} />
        <StatCard label="In progress" value={String(stats.by_status?.in_progress || 0)} icon={<LoaderCircle size={20} />} />
        <StatCard label="Completed" value={String(stats.by_status?.completed || 0)} icon={<CheckCircle2 size={20} />} />
      </div>
      <div className="board-toolbar">
        <div>
          <Button variant="secondary">All projects</Button>
          <Button variant="secondary">All assignees</Button>
          <Button variant="secondary"><SlidersHorizontal size={16} /> Filter</Button>
        </div>
      </div>
      <div className="kanban">
        {COLUMNS.map((column) => {
          const colTasks = tasks.filter((t) => t.status === column)
          return (
            <section className="kanban-column" key={column}>
              <header>
                <div>
                  <span className={`status-dot s-${column.replace("_", "")}`} />
                  <strong>{COLUMN_LABELS[column]}</strong>
                  <small>{colTasks.length}</small>
                </div>
                <Button variant="ghost" className="icon-btn" onClick={() => setCreateOpen(true)}>
                  <Plus size={16} />
                </Button>
              </header>
              <div className="kanban-list">
                {loading && <p style={{ opacity: 0.5, fontSize: "0.8rem", padding: "0.5rem" }}>Loading…</p>}
                {colTasks.map((t) => (
                  <Card className="task-card" key={t.id}>
                    <button className="task-card-click" onClick={() => setSelected(t)}>
                      <div className="task-top">
                        <Badge tone={PRIORITY_TONES[t.priority] || "neutral"}>
                          <Flag size={11} /> {t.priority}
                        </Badge>
                        <MoreHorizontal size={16} />
                      </div>
                      <h3>{t.title}</h3>
                      <p>{t.description}</p>
                      <div className="task-foot">
                        {t.assignee_name && <Avatar name={t.assignee_name} size="sm" />}
                        {t.due_date && (
                          <span className="due">
                            <Calendar size={13} />
                            {new Date(t.due_date).toLocaleDateString()}
                          </span>
                        )}
                        {t.comments && (
                          <span><MessageSquare size={13} />{t.comments.length}</span>
                        )}
                      </div>
                    </button>
                    {column !== "completed" && (
                      <Button variant="ghost" className="advance-task" onClick={() => advance(t)}>
                        Move forward →
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {/* Task detail drawer */}
      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Task details">
        {selected && (
          <div className="drawer-content">
            <div className="task-detail-meta">
              <Badge tone={PRIORITY_TONES[selected.priority] || "neutral"}>{selected.priority} priority</Badge>
              <Badge tone="blue">{COLUMN_LABELS[selected.status]}</Badge>
            </div>
            <h3>{selected.title}</h3>
            <p className="detail-body">{selected.description}</p>
            <dl>
              {selected.assignee_name && (
                <div><dt>Assignee</dt><dd><Avatar name={selected.assignee_name} size="sm" /> {selected.assignee_name}</dd></div>
              )}
              {selected.due_date && (
                <div><dt>Due date</dt><dd>{new Date(selected.due_date).toLocaleDateString()}</dd></div>
              )}
            </dl>
            <h4>Comments ({selected.comments?.length || 0})</h4>
            {selected.comments?.map((c) => (
              <div className="activity-line" key={c.id}>
                <Avatar name={c.user_name} size="sm" />
                <div>
                  <strong>{c.user_name}</strong>
                  <p>{c.content}</p>
                  <small>{new Date(c.created_at).toLocaleTimeString()}</small>
                </div>
              </div>
            ))}
            <textarea
              className="comment-box"
              placeholder="Write a comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="drawer-actions">
              <Button onClick={handleAddComment} disabled={!comment.trim()}>Add comment</Button>
              <Button variant="secondary" onClick={() => advance(selected)}>
                Move forward →
              </Button>
              <Button variant="danger" onClick={() => handleDelete(selected.id)}>
                <Trash2 size={16} />
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Create task modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a task">
        <div className="modal-form">
          <label>Title *<Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title..." /></label>
          <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What needs to be done?" /></label>
          <label>Priority
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label>Due date<Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.title.trim()}>{saving ? "Creating…" : "Create task"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
