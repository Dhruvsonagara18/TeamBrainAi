import { useState, type ReactNode } from "react"
import {
  User,
  KeyRound,
  Palette,
  Bell,
  Sparkles,
  Brain,
  ShieldCheck,
  Building2,
  PlugZap,
  Camera,
  Check,
  Monitor,
  Moon,
  Sun,
  Database,
  Bot,
  Boxes,
} from "lucide-react"
import {
  Avatar,
  Badge,
  Button,
  Card,
  Input,
  PageTitle,
  Toggle,
} from "../components/ui"
import { useAuth } from "../context/AuthContext"
import { usersApi, healthApi } from "../lib/api"

const sections = [
  ["Profile", User],
  ["Account", KeyRound],
  ["Appearance", Palette],
  ["Notifications", Bell],
  ["AI Preferences", Sparkles],
  ["Memory Preferences", Brain],
  ["Security", ShieldCheck],
  ["Workspace Settings", Building2],
  ["API Integrations", PlugZap],
] as const

export function SettingsPage() {
  const { user } = useAuth()
  const [active, setActive] = useState("Profile")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [healthStatus, setHealthStatus] = useState<Record<string, string> | null>(null)
  const [checkingHealth, setCheckingHealth] = useState(false)
  const [toggles, setToggles] = useState({
    extraction: true,
    shared: true,
    personal: false,
    temporary: true,
    email: true,
  })
  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    bio: user?.bio || "",
  })
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" })
  const [pwError, setPwError] = useState("")

  const toggle = (key: keyof typeof toggles) =>
    setToggles({ ...toggles, [key]: !toggles[key] })

  async function saveProfile() {
    setSaving(true)
    try {
      await usersApi.updateProfile({ name: profileForm.name, bio: profileForm.bio })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    setPwError("")
    if (pwForm.new_password !== pwForm.confirm) {
      setPwError("Passwords do not match")
      return
    }
    setSaving(true)
    try {
      await usersApi.changePassword({
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      })
      setPwForm({ current_password: "", new_password: "", confirm: "" })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to update password")
    } finally {
      setSaving(false)
    }
  }

  async function checkHealth() {
    setCheckingHealth(true)
    try {
      const result = await healthApi.detailed()
      setHealthStatus(result.checks)
    } catch {
      setHealthStatus({ api: "error" })
    } finally {
      setCheckingHealth(false)
    }
  }

  return (
    <div>
      <PageTitle
        title="Settings"
        subtitle="Manage your profile, workspace, and TeamBrain preferences."
      />
      <div className="settings-layout">
        <aside className="settings-nav">
          {sections.map(([label, Icon]) => (
            <button
              className={active === label ? "active" : ""}
              onClick={() => setActive(label)}
              key={label}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </aside>
        <div className="settings-content">
          {active === "Profile" && (
            <>
              <SettingsHeading title="Profile" text="Manage how you appear across TeamBrain." />
              <Card className="settings-card">
                <div className="avatar-setting">
                  <div className="avatar-photo">
                    <Avatar name={user?.name || "User"} size="lg" />
                    <span><Camera size={13} /></span>
                  </div>
                  <div>
                    <strong>Profile photo</strong>
                    <p>JPG, PNG or GIF. Max 2 MB.</p>
                    <Button variant="secondary">Change photo</Button>
                  </div>
                </div>
                <div className="settings-form two-col">
                  <label>
                    Full name
                    <Input
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                    />
                  </label>
                  <label>
                    Email address
                    <Input value={user?.email || ""} readOnly />
                  </label>
                  <label className="full-field">
                    Bio
                    <textarea
                      value={profileForm.bio}
                      onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                    />
                  </label>
                </div>
                <div className="settings-save">
                  {saved && <span style={{ color: "var(--green)" }}>✓ Saved!</span>}
                  <Button onClick={saveProfile} disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </Card>
            </>
          )}
          {active === "Security" && (
            <>
              <SettingsHeading title="Security" text="Protect your account and review active access." />
              <Card className="settings-card">
                <h3>Change password</h3>
                <div className="settings-form">
                  <label>
                    Current password
                    <Input
                      type="password"
                      value={pwForm.current_password}
                      onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                    />
                  </label>
                  <label>
                    New password
                    <Input
                      type="password"
                      placeholder="At least 8 characters"
                      value={pwForm.new_password}
                      onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                    />
                  </label>
                  <label>
                    Confirm new password
                    <Input
                      type="password"
                      value={pwForm.confirm}
                      onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                    />
                  </label>
                </div>
                {pwError && <p style={{ color: "var(--red)" }}>{pwError}</p>}
                {saved && <p style={{ color: "var(--green)" }}>✓ Password updated!</p>}
                <Button onClick={changePassword} disabled={saving}>
                  {saving ? "Updating…" : "Update password"}
                </Button>
              </Card>
            </>
          )}
          {active === "API Integrations" && (
            <>
              <SettingsHeading title="API integrations" text="Monitor the services connected to your workspace." />
              <Card className="settings-card integration-list">
                <Integration
                  icon={<Database size={19} />}
                  name="MongoDB Atlas"
                  detail="Primary database and vector search"
                  status={healthStatus?.database || "unknown"}
                  masked="mongodb+srv://••••••••"
                />
                <Integration
                  icon={<Bot size={19} />}
                  name="Gemini AI"
                  detail="Language model provider"
                  status={healthStatus?.gemini_text || "unknown"}
                  masked="AIza••••••••••••"
                />
                <Integration
                  icon={<Boxes size={19} />}
                  name="Gemini Embeddings"
                  detail="Memory vector embeddings (text-embedding-004)"
                  status={healthStatus?.gemini_embedding || "unknown"}
                  masked="text-embedding-004"
                />
                <div style={{ marginTop: "1rem" }}>
                  <Button onClick={checkHealth} disabled={checkingHealth} variant="secondary">
                    {checkingHealth ? "Checking…" : "Run health check"}
                  </Button>
                  {healthStatus && (
                    <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", opacity: 0.7 }}>
                      Overall: {Object.values(healthStatus).every((v) => v.startsWith("ok")) ? "✅ All healthy" : "⚠️ Some issues"}
                    </p>
                  )}
                </div>
              </Card>
            </>
          )}
          {active === "Appearance" && (
            <>
              <SettingsHeading title="Appearance" text="Personalize how TeamBrain looks on your device." />
              <Card className="settings-card">
                <h3>Theme</h3>
                <div className="theme-options">
                  {(
                    [
                      ["Dark", Moon],
                      ["Light", Sun],
                      ["System", Monitor],
                    ] as const
                  ).map(([x, Icon], i) => (
                    <button className={i === 0 ? "active" : ""} key={x as string}>
                      <span className={`theme-preview theme-${(x as string).toLowerCase()}`}>
                        <Icon size={20} />
                      </span>
                      <strong>{x as string}</strong>
                      {i === 0 && <Check size={15} />}
                    </button>
                  ))}
                </div>
                <div className="settings-save">
                  <Button>Save changes</Button>
                </div>
              </Card>
            </>
          )}
          {active === "AI Preferences" && (
            <>
              <SettingsHeading title="AI preferences" text="Control how TeamBrain responds and applies project context." />
              <Card className="settings-card">
                <SettingSelect label="Response style" text="Choose the default depth and tone." options={["Concise and technical", "Balanced", "Detailed and explanatory"]} />
                <SettingSelect label="Memory retrieval" text="How broadly should AI search workspace memory?" options={["Current project first", "Entire workspace", "Current conversation only"]} />
                <SettingSelect label="Context sensitivity" text="Set the threshold for including related memories." options={["Balanced", "High precision", "Broad discovery"]} />
                <div className="settings-save"><Button>Save changes</Button></div>
              </Card>
            </>
          )}
          {active === "Memory Preferences" && (
            <>
              <SettingsHeading title="Memory preferences" text="Control what TeamBrain remembers and for how long." />
              <Card className="settings-card">
                {([
                  ["Automatic memory extraction", "Identify durable facts and decisions from conversations.", "extraction"],
                  ["Shared workspace memories", "Allow new memories to be visible to workspace members.", "shared"],
                  ["Personal memory", "Save preferences that are visible only to you.", "personal"],
                  ["Temporary memory", "Use conversation context that expires after 30 days.", "temporary"],
                ] as const).map(([label, text, key]) => (
                  <SettingToggle
                    key={key}
                    label={label}
                    text={text}
                    checked={toggles[key as keyof typeof toggles]}
                    onChange={() => toggle(key as keyof typeof toggles)}
                  />
                ))}
                <SettingSelect label="Default expiry" text="Applied to temporary memories." options={["30 days", "7 days", "90 days", "Never"]} />
                <div className="settings-save"><Button>Save changes</Button></div>
              </Card>
            </>
          )}
          {!["Profile", "Appearance", "AI Preferences", "Memory Preferences", "Security", "API Integrations"].includes(active) && (
            <>
              <SettingsHeading title={active} text={`Manage your ${active.toLowerCase()} preferences.`} />
              <Card className="settings-card">
                <SettingToggle
                  label={`${active} updates`}
                  text="Receive important updates and recommended actions."
                  checked={toggles.email}
                  onChange={() => toggle("email")}
                />
                <div className="settings-save"><Button>Save changes</Button></div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsHeading({ title, text }: { title: string; text: string }) {
  return <div className="settings-heading"><h2>{title}</h2><p>{text}</p></div>
}

function SettingToggle({ label, text, checked, onChange }: { label: string; text: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="setting-row">
      <div><strong>{label}</strong><p>{text}</p></div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

function SettingSelect({ label, text, options }: { label: string; text: string; options: string[] }) {
  return (
    <div className="setting-row">
      <div><strong>{label}</strong><p>{text}</p></div>
      <select>{options.map((x) => <option key={x}>{x}</option>)}</select>
    </div>
  )
}

function Integration({ icon, name, detail, status, masked }: { icon: ReactNode; name: string; detail: string; status: string; masked: string }) {
  const isOk = status.startsWith("ok") || status === "Connected"
  return (
    <div className="integration">
      <span>{icon}</span>
      <div><strong>{name}</strong><p>{detail}</p></div>
      <code>{masked}</code>
      <Badge tone={isOk ? "green" : status === "unknown" ? "neutral" : "red"}>
        <Check size={12} /> {isOk ? "Connected" : status}
      </Badge>
      <Button variant="secondary">Configure</Button>
    </div>
  )
}
