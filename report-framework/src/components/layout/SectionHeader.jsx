import { cn } from '../../lib/utils'

export function SectionHeader({ title, subtitle, action, className }) {
  return (
    <div
      className={cn(
        'mb-6 md:mb-8 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div>
        <h2 className="text-xl md:text-2xl font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-[var(--text-secondary)]">{subtitle}</p>
        )}
      </div>
      {action && <div className="mt-3 sm:mt-0">{action}</div>}
    </div>
  )
}
