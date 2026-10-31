import { useState, useEffect } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router"
import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard,
  MessageSquareText,
  BrainCircuit,
  FolderKanban,
  Scale,
  ListTodo,
  Users,
  Activity,
  Settings,
  Plus,
  Search,
  Bell,
  ChevronDown,
  Menu,
  X,
  LogOut,
  Check,
} from "lucide-react"
import { Avatar, Button, Input, Modal } from "./ui"
import { useAuth } from "../context/AuthContext"
import { workspacesApi, type Workspace } from "../lib/api"

type NavItem = [label: string, path: string, icon: LucideIcon]

const nav: { group: string; items: NavItem[] }[] = [
  {
    group: "Workspace",
    items: [
      ["Dashboard", "/", LayoutDashboard],
      ["AI Chat", "/chat", MessageSquareText],
      ["Memory Center", "/memories", BrainCircuit],
      ["Projects", "/projects", FolderKanban],
      ["Decisions", "/decisions", Scale],
      ["Tasks", "/tasks", ListTodo],
    ],
  },
  {
    group: "Team",
    items: [
      ["Members", "/projects?tab=members", Users],
      ["Activity", "/?view=activity", Activity],
    ],
  },
  { group: "Personal", items: [["Settings", "/settings", Settings]] },
]

export function AppShell() {
  const [mobile, setMobile] = useState(false)
  const [workspace, setWorkspace] = useState(false)
  const [profile, setProfile] = useState(false)
  const [search, setSearch] = useState(false)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [createWsOpen, setCreateWsOpen] = useState(false)
  const [newWsName, setNewWsName] = useState("")
  const [creating, setCreating] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, currentWorkspaceId, setCurrentWorkspaceId } = useAuth()

  const current =
    nav
      .flatMap((g) => g.items)
      .find((item) => item[1].split("?")[0] === location.pathname)?.[0] ||
    "Dashboard"

  const activeWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0]

  useEffect(() => {
    workspacesApi.list().then((data) => {
      setWorkspaces(data)
      if (!currentWorkspaceId && data.length > 0) {
        setCurrentWorkspaceId(data[0].id)
      }
    }).catch(() => {})
  }, [])

  async function handleCreateWorkspace() {
    if (!newWsName.trim()) return
    setCreating(true)
    try {
      const ws = await workspacesApi.create({ name: newWsName.trim() })
      setWorkspaces((prev) => [...prev, ws])
      setCurrentWorkspaceId(ws.id)
      setCreateWsOpen(false)
      setNewWsName("")
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  function handleLogout() {
    logout()
    navigate("/auth")
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">
            <BrainCircuit size={19} />
          </div>
          <span>TeamBrain</span>
          <Button
            variant="ghost"
            className="icon-btn mobile-close"
            onClick={() => setMobile(false)}
          >
            <X size={18} />
          </Button>
        </div>
        <Button
          className="new-chat"
          onClick={() => {
            navigate("/chat")
            setMobile(false)
          }}
        >
          <Plus size={17} /> New chat <span>⌘ N</span>
        </Button>
        <nav>
          {nav.map((group) => (
            <div className="nav-group" key={group.group}>
              <p>{group.group}</p>
              {group.items.map(([label, path, Icon]) => (
                <NavLink
                  end={path === "/"}
                  to={path}
                  key={label}
                  onClick={() => setMobile(false)}
                  className={({ isActive }) =>
                    isActive ? "nav-link active" : "nav-link"
                  }
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className="workspace-card"
            onClick={() => setWorkspace(!workspace)}
          >
            <span className="workspace-logo">
              {activeWorkspace?.name?.[0]?.toUpperCase() || "W"}
            </span>
            <span>
              <strong>{activeWorkspace?.name || "My Workspace"}</strong>
              <small>{activeWorkspace?.role || "member"}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {workspace && (
            <div className="pop-menu workspace-pop">
              <p>Switch workspace</p>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => {
                    setCurrentWorkspaceId(ws.id)
                    setWorkspace(false)
                  }}
                >
                  <span className="workspace-logo">{ws.name[0]?.toUpperCase()}</span>
                  {ws.name}
                  {ws.id === currentWorkspaceId && <Check size={15} />}
                </button>
              ))}
              <button
                onClick={() => {
                  setWorkspace(false)
                  setCreateWsOpen(true)
                }}
              >
                <Plus size={14} /> Create workspace
              </button>
            </div>
          )}
        </div>
      </aside>
      {mobile && (
        <div className="mobile-scrim" onClick={() => setMobile(false)} />
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              className="icon-btn mobile-menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </Button>
            <span>{activeWorkspace?.name || "TeamBrain"}</span>
            <span>/</span>
            <strong>{current}</strong>
          </div>
          <div className="top-actions">
            <Button
              variant="secondary"
              className="header-search"
              onClick={() => setSearch(true)}
            >
              <Search size={16} />
              <span>Search anything...</span>
              <kbd>⌘K</kbd>
            </Button>
            <Button variant="ghost" className="icon-btn notification">
              <Bell size={18} />
            </Button>
            <div className="profile-wrap">
              <Button
                variant="ghost"
                className="profile-button"
                onClick={() => setProfile(!profile)}
              >
                <Avatar name={user?.name || "User"} size="sm" />
                <span>{user?.name || "User"}</span>
                <ChevronDown size={14} />
              </Button>
              {profile && (
                <div className="pop-menu profile-pop">
                  <div className="profile-summary">
                    <Avatar name={user?.name || "User"} />
                    <span>
                      <strong>{user?.name}</strong>
                      <small>{user?.email}</small>
                    </span>
                  </div>
                  <button onClick={() => navigate("/settings")}>
                    <Settings size={16} /> Account settings
                  </button>
                  <button onClick={handleLogout}>
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="content">
          <Outlet context={{ workspaceId: activeWorkspace?.id, workspace: activeWorkspace }} />
        </div>
      </main>

      {/* Search modal */}
      <Modal
        open={search}
        onClose={() => setSearch(false)}
        title="Search TeamBrain"
      >
        <div className="command-search">
          <Search size={18} />
          <Input
            autoFocus
            placeholder="Search memories, projects, decisions..."
          />
        </div>
        <p className="menu-label">Quick navigation</p>
        <div className="search-results">
          {(
            [
              ["Memory Center", BrainCircuit, "/memories"],
              ["Ask TeamBrain", MessageSquareText, "/chat"],
              ["Projects", FolderKanban, "/projects"],
            ] as [string, LucideIcon, string][]
          ).map(([label, Icon, path]) => (
            <button
              key={label}
              onClick={() => {
                navigate(path)
                setSearch(false)
              }}
            >
              <Icon size={17} />
              {label}
              <span>Jump to</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Create workspace modal */}
      <Modal
        open={createWsOpen}
        onClose={() => setCreateWsOpen(false)}
        title="Create a workspace"
      >
        <div className="modal-form">
          <label>
            Workspace name
            <Input
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="e.g. Acme Labs"
              autoFocus
            />
          </label>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setCreateWsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateWorkspace} disabled={creating || !newWsName.trim()}>
              {creating ? "Creating..." : "Create workspace"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
