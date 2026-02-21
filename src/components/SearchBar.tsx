import { useState, useEffect, useRef } from 'react'
import { Search, X, Filter, History } from 'lucide-react'

interface SearchFilters {
  team?: string
  ageGroup?: string
  position?: string
  status?: 'pending' | 'approved' | 'rejected' | 'all'
}

interface SearchBarProps {
  onSearch: (query: string, filters: SearchFilters) => void
  suggestions: string[]
  searchHistory: string[]
  onClearHistory: () => void
  placeholder?: string
  showFilters?: boolean
  filters?: SearchFilters
  onFilterChange?: (filters: SearchFilters) => void
}

export default function SearchBar({
  onSearch,
  suggestions,
  searchHistory,
  onClearHistory,
  placeholder = "Search players...",
  showFilters = true,
  filters: externalFilters,
  onFilterChange
}: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [localFilters, setLocalFilters] = useState<SearchFilters>(externalFilters || {})
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
        setShowHistory(false)
        setShowFilterPanel(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter suggestions based on query
  const filteredSuggestions = query.length >= 2 
    ? suggestions.filter(s => s.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : []

  // Filter history based on query
  const filteredHistory = query.length >= 1
    ? searchHistory.filter(h => h.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : searchHistory.slice(0, 6)

  const handleSearch = (searchQuery: string = query) => {
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim(), localFilters)
      setShowSuggestions(false)
      setShowHistory(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setShowHistory(false)
      setShowFilterPanel(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion)
    handleSearch(suggestion)
  }

  const handleHistoryClick = (historyItem: string) => {
    setQuery(historyItem)
    handleSearch(historyItem)
  }

  const handleFilterChange = (key: keyof SearchFilters, value: string) => {
    const newFilters = { ...localFilters, [key]: value }
    setLocalFilters(newFilters)
    if (onFilterChange) {
      onFilterChange(newFilters)
    }
    // Trigger search with new filters
    if (query.trim()) {
      handleSearch()
    }
  }

  const clearSearch = () => {
    setQuery('')
    inputRef.current?.focus()
  }

  return (
    <div className="relative" ref={searchRef}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.length >= 1) {
              setShowHistory(true)
            }
          }}
          placeholder={placeholder}
          className="block w-full rounded-lg border border-gray-300 bg-white pl-10 pr-20 text-sm placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500"
        />
        <div className="absolute inset-y-0 right-0 flex items-center">
          {query && (
            <button
              onClick={clearSearch}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {showFilters && (
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <Filter className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => handleSearch()}
            className="rounded-r-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
          >
            Search
          </button>
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="py-1">
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* History Dropdown */}
      {showHistory && filteredHistory.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-200 px-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Recent Searches</span>
              <button
                onClick={onClearHistory}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear All
              </button>
            </div>
          </div>
          <div className="py-1">
            {filteredHistory.map((historyItem, index) => (
              <button
                key={index}
                onClick={() => handleHistoryClick(historyItem)}
                className="flex w-full items-center px-4 py-2 text-left text-sm hover:bg-gray-100"
              >
                <History className="mr-2 h-3 w-3 text-gray-400" />
                {historyItem}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter Panel */}
      {showFilterPanel && showFilters && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Team</label>
              <select
                value={localFilters.team || ''}
                onChange={(e) => handleFilterChange('team', e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All Teams</option>
                <option value="U15">U15</option>
                <option value="U16">U16</option>
                <option value="U17">U17</option>
                <option value="U19">U19</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Age Group</label>
              <select
                value={localFilters.ageGroup || ''}
                onChange={(e) => handleFilterChange('ageGroup', e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All Age Groups</option>
                <option value="U15">U15</option>
                <option value="U16">U16</option>
                <option value="U17">U17</option>
                <option value="U19">U19</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Position</label>
              <select
                value={localFilters.position || ''}
                onChange={(e) => handleFilterChange('position', e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All Positions</option>
                <option value="Prop">Prop</option>
                <option value="Hooker">Hooker</option>
                <option value="Lock">Lock</option>
                <option value="Flanker">Flanker</option>
                <option value="Number 8">Number 8</option>
                <option value="Scrum-half">Scrum-half</option>
                <option value="Fly-half">Fly-half</option>
                <option value="Centre">Centre</option>
                <option value="Wing">Wing</option>
                <option value="Fullback">Fullback</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                value={localFilters.status || 'all'}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="all">All Players</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setLocalFilters({})
                if (onFilterChange) {
                  onFilterChange({})
                }
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
