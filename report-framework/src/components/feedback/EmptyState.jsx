export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-12">
      {Icon && (
        <div className="inline-flex p-3 bg-zinc-100 rounded-full mb-4">
          <Icon className="w-6 h-6 text-zinc-400" />
        </div>
      )}
      {title && (
        <p className="text-sm font-medium text-zinc-900">{title}</p>
      )}
      {description && (
        <p className="text-sm text-zinc-500 mt-1">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
