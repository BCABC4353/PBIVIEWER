import { cn } from '../../lib/utils'

export function StatCard({ label, value, sublabel, className }) {
  return (
    <div className={cn('p-4 text-center', className)}>
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-semibold text-zinc-900 mt-1">{value}</p>
      {sublabel && (
        <p className="text-xs text-zinc-400 mt-1">{sublabel}</p>
      )}
    </div>
  )
}
