import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import {
  BrainCircuit,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react"
import { Button, Input } from "../components/ui"
import { authApi } from "../lib/api"
import { useAuth } from "../context/AuthContext"

export function AuthPage() {
  const [signup, setSignup] = useState(false)
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const navigate = useNavigate()
  const { login } = useAuth()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError("")
    const form = event.currentTarget as HTMLFormElement
    const email = (form.elements.namedItem("email") as HTMLInputElement).value
    const password = (form.elements.namedItem("password") as HTMLInputElement).value
    const name = signup
      ? (form.elements.namedItem("name") as HTMLInputElement)?.value
      : ""

    if (signup) {
      const confirm = (form.elements.namedItem("confirm") as HTMLInputElement)?.value
      if (password !== confirm) {
        setError("Passwords do not match.")
        return
      }
    }

    setLoading(true)
    try {
      const tokens = signup
        ? await authApi.register({ name, email, password })
        : await authApi.login({ email, password })
      login(tokens)
      navigate("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="auth-brand">
          <span>
            <BrainCircuit size={21} />
          </span>
          TeamBrain
        </div>
        <div className="auth-copy">
          <div className="mini-label">
            <Sparkles size={14} /> Shared intelligence for teams
          </div>
          <h1>
            Turn every conversation into <em>lasting knowledge.</em>
          </h1>
          <p>
            TeamBrain gives your team and AI agents a shared memory for
            decisions, context, and everything learned along the way.
          </p>
          <div className="auth-proof">
            {[
              "Context that compounds",
              "Decisions with full reasoning",
              "Built for humans and AI agents",
            ].map((x) => (
              <div key={x}>
                <CheckCircle2 size={16} />
                {x}
              </div>
            ))}
          </div>
        </div>
        <div className="memory-visual">
          <div className="node n1" />
          <div className="node n2" />
          <div className="node n3" />
          <div className="node n4" />
          <div className="memory-orb">
            <BrainCircuit size={32} />
            <span>Shared memory</span>
          </div>
        </div>
        <p className="auth-foot">
          Built for the MongoDB Student Hackathon · 2025
        </p>
      </section>
      <section className="auth-form-side">
        <form className="auth-form" onSubmit={submit}>
          <div>
            <p className="eyebrow">WELCOME TO TEAMBRAIN</p>
            <h2>{signup ? "Create your account" : "Welcome back"}</h2>
            <p>
              {signup
                ? "Start building your team's collective intelligence."
                : "Sign in to continue to your workspace."}
            </p>
          </div>
          {signup && (
            <label>
              Full name
              <Input name="name" placeholder="Alex Morgan" required />
            </label>
          )}
          <label>
            Work email
            <Input
              name="email"
              type="email"
              placeholder="you@company.com"
              required
            />
          </label>
          <label>
            Password
            <div className="password-input">
              <Input
                name="password"
                type={visible ? "text" : "password"}
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
              <Button
                type="button"
                variant="ghost"
                className="icon-btn"
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </Button>
            </div>
          </label>
          {signup && (
            <label>
              Confirm password
              <Input
                name="confirm"
                type={visible ? "text" : "password"}
                placeholder="Repeat your password"
                required
              />
            </label>
          )}
          {!signup && (
            <div className="form-options">
              <label className="checkbox">
                <input type="checkbox" /> Remember me
              </label>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          <Button className="auth-submit" disabled={loading}>
            {loading ? (
              "Please wait…"
            ) : signup ? (
              "Create account"
            ) : (
              <>
                Sign in <ArrowRight size={17} />
              </>
            )}
          </Button>
          <p className="switch-auth">
            {signup ? "Already have an account?" : "New to TeamBrain?"}{" "}
            <button type="button" onClick={() => setSignup(!signup)}>
              {signup ? "Sign in" : "Create an account"}
            </button>
          </p>
        </form>
      </section>
    </div>
  )
}
