import { useEffect, useState } from "react"
import { useNavigate, useOutletContext } from "react-router"
import {
  Brain,
  FolderKanban,
  Users,
  Scale,
  ArrowUpRight,
  MoreHorizontal,
  Sparkles,
  MessageSquareText,
  GitCommit,
  CheckCircle2,
} from "lucide-react"
import {
  Avatar,
  Badge,
  Button,
  Card,
  PageTitle,
  StatCard,
} from "../components/ui"
import {
  memoriesApi,
  decisionsApi,
  workspacesApi,
  tasksApi,
  type Memory,
  type Decision,
  type ActivityLog,
} from "../lib/api"

type OutletCtx = { workspaceId?: string }

export function DashboardPage() {
  const navigate = useNavigate()
  const { workspaceId } = useOutletContext<OutletCtx>()
  const [memories, setMemories] = useState<Memory[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [memStats, setMemStats] = useState({ total: 0, recent_7_days: 0 })
  const [decStats, setDecStats] = useState({ total: 0, approved: 0 })
  const [taskStats, setTaskStats] = useState({ total: 0 })
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const bars = [42, 57, 39, 68, 53, 88, 73]

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    Promise.allSettled([
      memoriesApi.list(workspaceId, { limit: 5 }).then((r) => setMemories(r.memories)),
      memoriesApi.stats(workspaceId).then(setMemStats),
      decisionsApi.list(workspaceId).then((r) => setDecisions(r.decisions.slice(0, 3))),
      decisionsApi.stats(workspaceId).then(setDecStats),
      tasksApi.stats(workspaceId).then(setTaskStats),
      workspacesApi.members(workspaceId).then((r) => setMemberCount(r.length)),
      workspacesApi.activity(workspaceId, 5).then(setActivity),
    ]).finally(() => setLoading(false))
  }, [workspaceId])

  const statusBadge = (status: string) => {
    if (status === "approved") return "green"
    if (status === "proposed") return "amber"
    if (status === "rejected") return "red"
    return "neutral"
  }

  return (
    <div>
      <PageTitle
        title="Dashboard"
        subtitle="Here's what's happening in your workspace."
        actions={
          <Button onClick={() => navigate("/chat")}>
            <MessageSquareText size={17} /> Ask TeamBrain
          </Button>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Total memories"
          value={loading ? "…" : memStats.total.toLocaleString()}
          change={`+${memStats.recent_7_days} this week`}
          icon={<Brain size={20} />}
        />
        <StatCard
          label="Active tasks"
          value={loading ? "…" : String(taskStats.total)}
          change="This sprint"
          icon={<FolderKanban size={20} />}
        />
        <StatCard
          label="Team members"
          value={loading ? "…" : String(memberCount)}
          icon={<Users size={20} />}
        />
        <StatCard
          label="Decisions recorded"
          value={loading ? "…" : String(decStats.total)}
          change={`${decStats.approved} approved`}
          icon={<Scale size={20} />}
        />
      </div>
      <div className="dashboard-grid">
        <Card className="chart-card span-2">
          <div className="section-head">
            <div>
              <h2>Memory activity</h2>
              <p>Knowledge captured in the last 7 days</p>
            </div>
            <Button variant="secondary">Last 7 days</Button>
          </div>
          <div className="chart">
            <div className="chart-y">
              <span>120</span>
              <span>80</span>
              <span>40</span>
              <span>0</span>
            </div>
            <div className="bars">
              {bars.map((height, i) => (
                <div className="bar-col" key={i}>
                  <div className="bar-tip">{height + 28}</div>
                  <div className="bar" style={{ height: `${height}%` }} />
                  <span>
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card className="insight-card">
          <div className="insight-icon">
            <Sparkles size={20} />
          </div>
          <Badge tone="purple">AI INSIGHT</Badge>
          <h2>
            {decStats.total - decStats.approved > 0
              ? `${decStats.total - decStats.approved} decisions pending review.`
              : "All decisions are up to date."}
          </h2>
          <p>Use AI chat to explore your workspace knowledge.</p>
          <Button variant="secondary" onClick={() => navigate("/chat")}>
            Explore with AI <ArrowUpRight size={16} />
          </Button>
        </Card>
        <Card className="span-2">
          <div className="section-head">
            <div>
              <h2>Recent memories</h2>
              <p>Latest knowledge captured by your team</p>
            </div>
            <Button variant="ghost" onClick={() => navigate("/memories")}>
              View all <ArrowUpRight size={15} />
            </Button>
          </div>
          <div className="memory-list">
            {loading && <p style={{ padding: "1rem", opacity: 0.5 }}>Loading…</p>}
            {!loading && memories.length === 0 && (
              <p style={{ padding: "1rem", opacity: 0.5 }}>
                No memories yet. Start a conversation to create some.
              </p>
            )}
            {memories.slice(0, 4).map((m) => (
              <div className="memory-row" key={m.id}>
                <span className="memory-dot" />
                <div>
                  <strong>{m.content.slice(0, 80)}{m.content.length > 80 ? "…" : ""}</strong>
                  <p>
                    {m.memory_type} · {m.source || "manual"}
                  </p>
                </div>
                <Badge tone={m.memory_type === "constraint" ? "amber" : "purple"}>
                  {m.memory_type}
                </Badge>
                <span className="row-date">
                  {new Date(m.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="section-head">
            <div>
              <h2>Recent activity</h2>
              <p>Across your workspace</p>
            </div>
            <MoreHorizontal size={18} />
          </div>
          <div className="timeline">
            {loading && <p style={{ opacity: 0.5, fontSize: "0.85rem" }}>Loading…</p>}
            {!loading && activity.length === 0 && (
              <p style={{ opacity: 0.5, fontSize: "0.85rem" }}>No activity yet.</p>
            )}
            {activity.map((log) => (
              <div className="timeline-item" key={log.id}>
                <span>
                  <GitCommit size={15} />
                </span>
                <div>
                  <strong>{log.user_name}</strong>
                  <p>{log.detail || log.action}</p>
                  <small>{new Date(log.created_at).toLocaleTimeString()}</small>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="span-3">
          <div className="section-head">
            <div>
              <h2>Recent decisions</h2>
              <p>Technical choices with context preserved</p>
            </div>
            <Button variant="ghost" onClick={() => navigate("/decisions")}>
              Decision tracker <ArrowUpRight size={15} />
            </Button>
          </div>
          <div className="decision-strip">
            {loading && <p style={{ opacity: 0.5, fontSize: "0.85rem" }}>Loading…</p>}
            {!loading && decisions.length === 0 && (
              <p style={{ opacity: 0.5, fontSize: "0.85rem" }}>No decisions yet.</p>
            )}
            {decisions.map((d) => (
              <div key={d.id}>
                <span className="decision-icon">
                  <Scale size={16} />
                </span>
                <div>
                  <strong>{d.title}</strong>
                  <p>
                    {d.owner_name} · {new Date(d.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge tone={statusBadge(d.status) as "green" | "amber" | "red" | "neutral"}>
                  {d.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
