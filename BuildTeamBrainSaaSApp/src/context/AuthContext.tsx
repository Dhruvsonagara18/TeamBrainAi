import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { authApi, type User } from "../lib/api"

type AuthContextType = {
  user: User | null
  loading: boolean
  login: (tokens: { access_token: string; refresh_token: string; user: User }) => void
  logout: () => void
  currentWorkspaceId: string | null
  setCurrentWorkspaceId: (id: string | null) => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
  currentWorkspaceId: null,
  setCurrentWorkspaceId: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    () => localStorage.getItem("current_workspace_id"),
  )

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (token) {
      authApi
        .me()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem("access_token")
          localStorage.removeItem("refresh_token")
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  function login(tokens: { access_token: string; refresh_token: string; user: User }) {
    localStorage.setItem("access_token", tokens.access_token)
    localStorage.setItem("refresh_token", tokens.refresh_token)
    setUser(tokens.user)
  }

  function logout() {
    localStorage.removeItem("access_token")
    localStorage.removeItem("refresh_token")
    setUser(null)
    setCurrentWorkspaceId(null)
  }

  function handleSetWorkspace(id: string | null) {
    if (id) localStorage.setItem("current_workspace_id", id)
    else localStorage.removeItem("current_workspace_id")
    setCurrentWorkspaceId(id)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, currentWorkspaceId, setCurrentWorkspaceId: handleSetWorkspace }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
