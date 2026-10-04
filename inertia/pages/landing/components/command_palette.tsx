import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Command,
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  MessageCircle,
  FileText,
  HelpCircle,
} from 'lucide-react'

const commands = [
  { icon: LayoutDashboard, label: 'Go to Dashboard', shortcut: 'G D' },
  { icon: Package, label: 'View Products', shortcut: 'G P' },
  { icon: ShoppingCart, label: 'View Orders', shortcut: 'G O' },
  { icon: BarChart3, label: 'View Analytics', shortcut: 'G A' },
  { icon: Settings, label: 'Open Settings', shortcut: 'G S' },
  { icon: FileText, label: 'Documentation', shortcut: 'G ?' },
  { icon: MessageCircle, label: 'Contact Support', shortcut: '' },
  { icon: HelpCircle, label: 'FAQ', shortcut: '' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const filtered = commands.filter((cmd) => cmd.label.toLowerCase().includes(query.toLowerCase()))

  const handleSelect = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-start justify-center bg-black/60 pt-[15vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0, 1] as const }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.1] bg-[#141B2D] shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
              <Search className="h-4 w-4 text-gray-500" />
              <input
                autoFocus
                placeholder="Search commands..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
              />
              <span className="flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-gray-600">
                <Command className="h-3 w-3" />K
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-500">No results found.</p>
              )}
              {filtered.map((cmd) => {
                const Icon = cmd.icon
                return (
                  <button
                    key={cmd.label}
                    onClick={handleSelect}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-400 transition-all hover:bg-white/[0.06] hover:text-white"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{cmd.label}</span>
                    {cmd.shortcut && (
                      <span className="flex items-center gap-1 rounded border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-600">
                        {cmd.shortcut}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
