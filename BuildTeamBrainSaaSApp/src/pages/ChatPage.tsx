import { useState, useEffect, useRef } from "react"
import { useOutletContext } from "react-router"
import {
  Plus,
  Search,
  MoreHorizontal,
  Paperclip,
  Send,
  Copy,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  BrainCircuit,
  ChevronDown,
  PanelRightClose,
  Trash2,
} from "lucide-react"
import { Badge, Button, Card, Input } from "../components/ui"
import {
  chatApi,
  memoriesApi,
  projectsApi,
  type Conversation,
  type Message,
  type Project,
} from "../lib/api"

type OutletCtx = { workspaceId?: string }

export function ChatPage() {
  const { workspaceId } = useOutletContext<OutletCtx>()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [message, setMessage] = useState("")
  const [panel, setPanel] = useState(true)
  const [sending, setSending] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeConv = conversations.find((c) => c.id === activeConvId)

  useEffect(() => {
    if (!workspaceId) return
    chatApi.listConversations(workspaceId).then((data) => {
      setConversations(data)
      if (data.length > 0) {
        setActiveConvId(data[0].id)
      } else {
        chatApi.createConversation({
          workspace_id: workspaceId,
          title: "New conversation",
        }).then((conv) => {
          setConversations([conv])
          setActiveConvId(conv.id)
        }).catch(() => {})
      }
    }).catch(() => {})
    projectsApi.list(workspaceId).then((r) => setProjects((r as any).tasks || r as any)).catch(() => {})
  }, [workspaceId])

  useEffect(() => {
    if (!activeConvId) return
    setLoading(true)
    chatApi.getMessages(activeConvId).then(setMessages).finally(() => setLoading(false))
  }, [activeConvId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function startNewConversation() {
    if (!workspaceId) return
    const conv = await chatApi.createConversation({
      workspace_id: workspaceId,
      project_id: selectedProject || undefined,
      title: "New conversation",
    })
    setConversations((prev) => [conv, ...prev])
    setActiveConvId(conv.id)
    setMessages([])
  }

  async function send() {
    if (!message.trim() || sending) return
    const text = message
    setMessage("")
    setSending(true)

    let targetConvId = activeConvId
    if (!targetConvId && workspaceId) {
      try {
        const newConv = await chatApi.createConversation({
          workspace_id: workspaceId,
          project_id: selectedProject || undefined,
          title: "New conversation",
        })
        setConversations((prev) => [newConv, ...prev])
        setActiveConvId(newConv.id)
        targetConvId = newConv.id
      } catch (err) {
        console.error("Failed to create conversation:", err)
        setSending(false)
        return
      }
    }
    if (!targetConvId) {
      setSending(false)
      return
    }

    // Optimistic user message
    const tempMsg: Message = {
      id: "temp-" + Date.now(),
      conversation_id: targetConvId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempMsg])
    try {
      const result = await chatApi.sendMessage(targetConvId, {
        content: text,
        project_id: selectedProject || undefined,
      })
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempMsg.id),
        result.user_message,
        result.ai_message,
      ])
      // Refresh conversation list to get updated titles
      if (workspaceId) {
        chatApi.listConversations(workspaceId).then(setConversations)
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id))
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  async function deleteConversation(id: string) {
    await chatApi.deleteConversation(id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeConvId === id) {
      setActiveConvId(conversations.find((c) => c.id !== id)?.id || null)
      setMessages([])
    }
  }

  const usedMemories = messages
    .filter((m) => m.role === "assistant" && m.used_memories?.length)
    .flatMap((m) => m.used_memories || [])
    .slice(-8)

  return (
    <div className="chat-layout">
      <aside className="conversation-list">
        <Button className="full" onClick={startNewConversation}>
          <Plus size={16} /> New conversation
        </Button>
        <div className="conversation-search">
          <Search size={15} />
          <Input placeholder="Search conversations" />
        </div>
        <p className="menu-label">Conversations</p>
        {conversations.length === 0 && (
          <p style={{ padding: "0.5rem 1rem", opacity: 0.5, fontSize: "0.85rem" }}>
            No conversations yet.
          </p>
        )}
        {conversations.map((c) => (
          <button
            className={`conversation-item ${c.id === activeConvId ? "active" : ""}`}
            key={c.id}
            onClick={() => setActiveConvId(c.id)}
          >
            <span>
              <BrainCircuit size={15} />
            </span>
            <div>
              <strong>{c.title || "Conversation"}</strong>
              <small>{new Date(c.updated_at).toLocaleDateString()}</small>
            </div>
          </button>
        ))}
      </aside>
      <section className="chat-main">
        <header className="chat-head">
          <div>
            <div className="project-select" onClick={() => setShowProjectMenu(!showProjectMenu)}>
              <span className="project-dot" />
              {projects.find((p) => p.id === selectedProject)?.name || "All projects"}{" "}
              <ChevronDown size={14} />
              {showProjectMenu && (
                <div className="pop-menu" style={{ position: "absolute", top: "2rem", zIndex: 10 }}>
                  <button onClick={() => { setSelectedProject(null); setShowProjectMenu(false) }}>All projects</button>
                  {projects.map((p) => (
                    <button key={p.id} onClick={() => { setSelectedProject(p.id); setShowProjectMenu(false) }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <h2>{activeConv?.title || "Select or start a conversation"}</h2>
          </div>
          <div>
            <Button variant="ghost" className="icon-btn" onClick={() => setPanel(!panel)}>
              <PanelRightClose size={18} />
            </Button>
            {activeConvId && (
              <Button variant="ghost" className="icon-btn" onClick={() => deleteConversation(activeConvId)}>
                <Trash2 size={18} />
              </Button>
            )}
          </div>
        </header>
        <div className="messages">
          {loading && (
            <p style={{ padding: "2rem", opacity: 0.5, textAlign: "center" }}>Loading messages…</p>
          )}
          {!activeConvId && !loading && (
            <div style={{ padding: "3rem", textAlign: "center", opacity: 0.5 }}>
              <BrainCircuit size={40} style={{ margin: "0 auto 1rem" }} />
              <p>Start a new conversation to chat with TeamBrain.</p>
            </div>
          )}
          {messages.map((msg) =>
            msg.role === "user" ? (
              <div className="message user-message" key={msg.id}>
                <div>{msg.content}</div>
                <time>{new Date(msg.created_at).toLocaleTimeString()}</time>
              </div>
            ) : (
              <div className="message ai-message" key={msg.id}>
                <div className="ai-avatar">
                  <BrainCircuit size={18} />
                </div>
                <div className="ai-content">
                  {msg.used_memories && msg.used_memories.length > 0 && (
                    <div className="memory-used">
                      <span />
                      <BrainCircuit size={14} /> Used {msg.used_memories.length} team{" "}
                      {msg.used_memories.length === 1 ? "memory" : "memories"}
                    </div>
                  )}
                  <p style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>
                  {msg.extracted_memories && msg.extracted_memories.length > 0 && (
                    <p style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: "0.5rem" }}>
                      💾 {msg.extracted_memories.length} new{" "}
                      {msg.extracted_memories.length === 1 ? "memory" : "memories"} stored.
                    </p>
                  )}
                  <div className="message-actions">
                    <time>{new Date(msg.created_at).toLocaleTimeString()}</time>
                    <Button
                      variant="ghost"
                      className="icon-btn"
                      onClick={() => navigator.clipboard.writeText(msg.content)}
                    >
                      <Copy size={14} />
                    </Button>
                    <Button variant="ghost" className="icon-btn">
                      <ThumbsUp size={14} />
                    </Button>
                    <Button variant="ghost" className="icon-btn">
                      <ThumbsDown size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ),
          )}
          {sending && (
            <div className="message ai-message">
              <div className="ai-avatar">
                <BrainCircuit size={18} />
              </div>
              <div className="ai-content">
                <p style={{ opacity: 0.5 }}>Thinking…</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="composer-wrap">
          <div className="prompt-chips">
            <button onClick={() => setMessage("What decisions are still unresolved?")}>
              Unresolved decisions
            </button>
            <button onClick={() => setMessage("Summarize this project's architecture")}>
              Summarize architecture
            </button>
            <button onClick={() => setMessage("What do we know about this project?")}>
              Project knowledge
            </button>
          </div>
          <div className="composer">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask TeamBrain about your project..."
              disabled={sending}
            />
            <Button className="send-btn" onClick={send} disabled={sending || !message.trim()}>
              <Send size={17} />
            </Button>
          </div>
          <p>TeamBrain can make mistakes. Verify important decisions.</p>
        </div>
      </section>
      {panel && (
        <aside className="context-panel">
          <div className="context-title">
            <div>
              <BrainCircuit size={17} />
              <span>Context memory</span>
            </div>
            <Badge tone="green">{usedMemories.length} used</Badge>
          </div>
          <p>Memories used in recent responses</p>
          {usedMemories.length === 0 && (
            <p style={{ opacity: 0.5, fontSize: "0.85rem" }}>
              No memories used yet. Ask a question to see relevant memories appear here.
            </p>
          )}
          {usedMemories.map((m, i) => (
            <Card className="context-memory" key={m.memory_id || i}>
              <div className="context-card-head">
                <Badge>{m.memory_type}</Badge>
              </div>
              <strong>{m.content}</strong>
              <div>
                <span>Relevance</span>
                <strong>{((m.relevance_score || 0) * 100).toFixed(0)}%</strong>
              </div>
            </Card>
          ))}
          <div className="context-note">
            <BrainCircuit size={15} />
            <p>Responses with this indicator include verified workspace memory.</p>
          </div>
        </aside>
      )}
    </div>
  )
}
