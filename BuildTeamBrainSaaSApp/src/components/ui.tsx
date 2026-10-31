import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react"
import { X } from "lucide-react"

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
}) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return <section className={`card ${className}`}>{children}</section>
}

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "purple" | "blue" | "green" | "amber" | "red"
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Avatar({
  name,
  size = "md",
}: {
  name: string
  size?: "sm" | "md" | "lg"
}) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
  return (
    <span className={`avatar avatar-${size}`} title={name}>
      {initials}
    </span>
  )
}

export function StatCard({
  label,
  value,
  change,
  icon,
}: {
  label: string
  value: string
  change?: string
  icon: ReactNode
}) {
  return (
    <Card className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <p className="eyebrow">{label}</p>
        <strong>{value}</strong>
        {change && <span className="change">{change}</span>}
      </div>
    </Card>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <Button variant="ghost" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <>
      <div className={`drawer-scrim ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`drawer ${open ? "show" : ""}`}>
        <div className="modal-head">
          <h2>{title}</h2>
          <Button variant="ghost" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
        {children}
      </aside>
    </>
  )
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: () => void
}) {
  return (
    <Button
      variant="ghost"
      className={`toggle ${checked ? "on" : ""}`}
      onClick={onChange}
      aria-pressed={checked}
    >
      <span />
    </Button>
  )
}

export function EmptyState({
  icon,
  title,
  text,
}: {
  icon: ReactNode
  title: string
  text: string
}) {
  return (
    <div className="empty-state">
      <div>{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}
