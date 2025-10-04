import * as React from 'react'

type HeaderProps = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  badge?: React.ReactNode
  actions?: React.ReactNode
}

export function InspectorShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col bg-slate-50 border-l border-slate-200">
      {children}
    </div>
  )
}

export function InspectorHeader({ title, subtitle, badge, actions }: HeaderProps) {
  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-slate-900">
              <h2 className="truncate text-base font-semibold leading-tight">{title}</h2>
              {badge ? (
                <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600">
                  {badge}
                </span>
              ) : null}
            </div>
            {subtitle ? (
              <p className="mt-1 text-xs text-slate-500 leading-normal">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  )
}

export function InspectorContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-6 pt-5 text-base text-slate-700">
      {children}
    </div>
  )
}

type SectionProps = {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  tone?: 'default' | 'muted' | 'danger'
  children: React.ReactNode
}

export function InspectorSection({ title, description, actions, tone = 'default', children }: SectionProps) {
  const toneClasses = {
    default: 'border-slate-200 bg-white',
    muted: 'border-slate-200 bg-slate-50',
    danger: 'border-red-200 bg-red-50'
  }
  return (
    <section className={`rounded-2xl border shadow-sm transition ${toneClasses[tone]}`}>
      {(title || description || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/50 px-5 pb-2.5 pt-4">
          <div>
            {title ? (
              <h3 className="text-lg font-semibold tracking-wide text-slate-700">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-prose text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      )}
      <div className="px-5 pb-5 pt-2">{children}</div>
    </section>
  )
}

export function FormGrid({ columns = 1, children }: { columns?: 1 | 2 | 3; children: React.ReactNode }) {
  const base = 'grid gap-4'
  const colClass = columns === 3 ? 'md:grid-cols-3 sm:grid-cols-2' : columns === 2 ? 'sm:grid-cols-2' : ''
  return <div className={`${base} ${colClass}`.trim()}>{children}</div>
}

type FormFieldProps = {
  label: React.ReactNode
  htmlFor?: string
  description?: React.ReactNode
  required?: boolean
  children: React.ReactNode
}

export function FormField({ label, htmlFor, description, required, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={typeof htmlFor === 'string' ? htmlFor : undefined} className="text-sm font-semibold tracking-wide text-slate-600">
        <span>{label}</span>
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      {children}
      {description ? <p className="text-sm text-slate-500 leading-relaxed">{description}</p> : null}
    </div>
  )
}

type Metric = {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'default' | 'danger'
}

export function MetricGrid({ items }: { items: Metric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item, idx) => {
        const toneClass = item.tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-700'
        return (
          <div key={idx} className={`flex flex-col gap-1 rounded-xl border px-4 py-4 ${toneClass}`}>
            <span className="text-sm font-semibold tracking-wide text-slate-600/80">{item.label}</span>
            <span className="text-xl font-semibold text-slate-900">{item.value}</span>
            {item.hint ? <span className="text-sm text-slate-500">{item.hint}</span> : null}
          </div>
        )
      })}
    </div>
  )
}

export function InlineKeyValue({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-transparent bg-slate-100 px-4 py-3 text-base text-slate-700">
      <span className="font-medium text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-base text-slate-500">
      <p className="text-lg font-medium text-slate-600">{title}</p>
      {description ? <p className="max-w-xs text-base text-slate-500">{description}</p> : null}
    </div>
  )
}

