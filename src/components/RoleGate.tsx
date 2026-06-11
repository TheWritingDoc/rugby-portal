type Role = 'Player' | 'Referee' | 'Coach' | 'SchoolAdmin' | 'ZoneCoordinator' | 'EPHSRUAdmin'

export function RoleGate({ role, allow, children }: { role: Role; allow: Role[]; children: any }) {
  return allow.includes(role) ? children : null
}

export function RolePicker({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  const roles: Role[] = ['Player', 'Referee', 'Coach', 'SchoolAdmin', 'ZoneCoordinator', 'EPHSRUAdmin']
  return (
    <label className="block">
      <span className="text-sm font-medium">Signed in as</span>
      <select
        className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as Role)}
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </label>
  )
}