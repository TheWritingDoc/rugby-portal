// The one "Show more" control used by every list in the app, so pagination
// looks and behaves identically everywhere (same style as the school folder
// view rosters).
export default function ShowMoreButton({
  total,
  shown,
  onMore,
  className = '',
}: {
  total: number
  shown: number
  onMore: () => void
  className?: string
}) {
  if (total <= shown) return null
  return (
    <button
      type="button"
      onClick={onMore}
      className={`w-full rounded-lg border border-dashed border-gray-300 bg-white px-4 py-2.5 text-center text-xs font-medium text-gray-600 hover:bg-gray-50 ${className}`}
    >
      Show more ({total - shown} remaining)
    </button>
  )
}
