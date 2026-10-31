import { createBrowserRouter, Navigate } from "react-router"
import { AppShell } from "../components/AppShell"
import { AuthPage } from "../pages/AuthPage"
import { DashboardPage } from "../pages/DashboardPage"
import { ChatPage } from "../pages/ChatPage"
import { MemoryPage } from "../pages/MemoryPage"
import { ProjectsPage } from "../pages/ProjectsPage"
import { DecisionsPage } from "../pages/DecisionsPage"
import { TasksPage } from "../pages/TasksPage"
import { SettingsPage } from "../pages/SettingsPage"

function requireAuth() {
  const token = localStorage.getItem("access_token")
  if (!token) return { redirect: "/auth" }
  return null
}

export const router = createBrowserRouter([
  { path: "/auth", Component: AuthPage },
  {
    path: "/",
    Component: AppShell,
    loader: requireAuth,
    children: [
      { index: true, Component: DashboardPage },
      { path: "chat", Component: ChatPage },
      { path: "memories", Component: MemoryPage },
      { path: "projects", Component: ProjectsPage },
      { path: "decisions", Component: DecisionsPage },
      { path: "tasks", Component: TasksPage },
      { path: "settings", Component: SettingsPage },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
])
