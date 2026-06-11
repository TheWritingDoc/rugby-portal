import { currentSeasonYear } from '../utils/season'

export default function Header() {
  return (
    <header className="sticky top-0 z-10 bg-white shadow">
      <div className="mx-auto flex max-w-5xl items-center gap-3 p-3">
        <img src="/EPRU-LOGO.png" alt="EPRU" className="h-40 w-40 object-contain" />
        <div>
          <div className="text-lg font-bold">EPHSRU Rugby Portal</div>
          <div className="text-xs text-gray-500">Eastern Cape Schools Rugby Registration {currentSeasonYear()}</div>
        </div>
      </div>
    </header>
  )
}