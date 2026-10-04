import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  BarChart3,
  Settings,
  Search,
  Bell,
  DollarSign,
  Activity,
  ShoppingBag,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
} from 'lucide-react'

const sidebarItems = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Package, label: 'Products', active: false },
  { icon: ShoppingCart, label: 'Orders', active: false },
  { icon: Users, label: 'Customers', active: false },
  { icon: BarChart3, label: 'Reports', active: false },
  { icon: Settings, label: 'Settings', active: false },
]

const statCards = [
  {
    icon: DollarSign,
    label: 'Revenue',
    value: '$128,430',
    change: '+18.2%',
    up: true,
    color: '#22D3EE',
  },
  {
    icon: ShoppingBag,
    label: 'Orders',
    value: '2,847',
    change: '+12.5%',
    up: true,
    color: '#10B981',
  },
  { icon: Users, label: 'Visitors', value: '18,234', change: '+32.1%', up: true, color: '#6366F1' },
  {
    icon: Activity,
    label: 'Conversion',
    value: '3.24%',
    change: '+2.1%',
    up: true,
    color: '#8B5CF6',
  },
  {
    icon: Package,
    label: 'Inventory',
    value: '9,421',
    change: '-5.3%',
    up: false,
    color: '#F59E0B',
  },
]

const transactions = [
  {
    customer: 'Sarah Chen',
    email: 'sarah@example.com',
    amount: '$129.99',
    status: 'Completed',
    date: '2 min ago',
  },
  {
    customer: 'Mike Johnson',
    email: 'mike@example.com',
    amount: '$89.99',
    status: 'Processing',
    date: '1 hour ago',
  },
  {
    customer: 'Emily Davis',
    email: 'emily@example.com',
    amount: '$249.99',
    status: 'Completed',
    date: '3 hours ago',
  },
  {
    customer: 'Alex Kim',
    email: 'alex@example.com',
    amount: '$69.99',
    status: 'Pending',
    date: '5 hours ago',
  },
]

const lowStockItems = [
  { name: 'Premium Sneakers', sku: 'SNK-001', stock: 3, threshold: 10 },
  { name: 'Wireless Earbuds', sku: 'AUD-042', stock: 5, threshold: 15 },
  { name: 'Yoga Mat Pro', sku: 'YOG-007', stock: 8, threshold: 20 },
]

function AnimatedChart() {
  const data = [35, 42, 28, 55, 48, 62, 78, 65, 72, 58, 82, 90]
  return (
    <div className="flex h-24 items-end justify-between gap-1.5 pt-4">
      {data.map((h, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            background:
              i > 7 ? 'linear-gradient(to top, #6366F1, #8B5CF6)' : 'rgba(99, 102, 241, 0.15)',
          }}
          initial={{ height: 0 }}
          whileInView={{ height: `${h}%` }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + i * 0.03, duration: 0.4, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

function PieChartPreview() {
  const segments = [
    { label: 'Electronics', percent: 35, color: '#6366F1' },
    { label: 'Fashion', percent: 25, color: '#8B5CF6' },
    { label: 'Home', percent: 20, color: '#22D3EE' },
    { label: 'Sports', percent: 12, color: '#10B981' },
    { label: 'Other', percent: 8, color: '#F59E0B' },
  ]
  return (
    <div className="space-y-2">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          <span className="flex-1 text-xs text-gray-400">{s.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full"
              style={{ background: s.color }}
              initial={{ width: 0 }}
              whileInView={{ width: `${s.percent}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />
          </div>
          <span className="text-xs font-medium text-gray-300">{s.percent}%</span>
        </div>
      ))}
    </div>
  )
}

export function DashboardPreview() {
  return (
    <section className="relative z-10 py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4 md:px-8 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-2xl text-center"
        >
          <span className="mb-4 inline-block rounded-full border border-[#6366F1]/20 bg-[#6366F1]/10 px-3 py-1 text-xs font-medium text-[#6366F1]">
            Dashboard
          </span>
          <h2 className="font-display text-4xl font-bold text-white md:text-5xl">
            A dashboard that actually{' '}
            <span className="bg-gradient-to-r from-[#6366F1] to-[#22D3EE] bg-clip-text text-transparent">
              makes sense
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Everything you need to run your store, at a glance. No clutter, no noise.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-[#6366F1]/10 via-[#8B5CF6]/10 to-[#22D3EE]/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1020]/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
            {/* Top Nav */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-3">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]" />
                  <span className="font-display text-sm font-semibold text-white">VendorHub</span>
                </div>
                <div className="hidden items-center gap-1 rounded-lg bg-white/[0.05] px-3 py-1.5 text-sm text-gray-500 sm:flex">
                  <Search className="h-3.5 w-3.5" />
                  <span>Search products, orders...</span>
                  <span className="ml-4 rounded border border-white/[0.08] px-1.5 py-0.5 text-[10px] text-gray-600">
                    Ctrl+K
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 text-gray-500" />
                <div className="relative">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#6366F1] to-[#22D3EE]" />
                  <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0B1020] bg-[#10B981]" />
                </div>
              </div>
            </div>

            <div className="flex">
              {/* Sidebar */}
              <div className="hidden w-48 border-r border-white/[0.06] p-3 lg:block">
                <nav className="space-y-1">
                  {sidebarItems.map((item) => (
                    <div
                      key={item.label}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        item.active
                          ? 'bg-[#6366F1]/10 text-[#6366F1]'
                          : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'
                      }`}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                    </div>
                  ))}
                </nav>
              </div>

              {/* Main Content */}
              <div className="flex-1 p-5">
                <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                  {statCards.map((stat) => (
                    <motion.div
                      key={stat.label}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition-all duration-300 hover:border-white/[0.12]"
                      whileHover={{ y: -2 }}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
                        <span
                          className={`flex items-center gap-0.5 text-[11px] font-medium ${stat.up ? 'text-[#10B981]' : 'text-[#EF4444]'}`}
                        >
                          {stat.change}
                          {stat.up ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                        </span>
                      </div>
                      <div className="font-display text-lg font-semibold text-white">
                        {stat.value}
                      </div>
                      <div className="text-xs text-gray-500">{stat.label}</div>
                    </motion.div>
                  ))}
                </div>

                <div className="mb-5 grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-300">Sales Chart</h4>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span>This Month</span>
                        <ChevronDown className="h-3 w-3" />
                      </div>
                    </div>
                    <AnimatedChart />
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-300">Revenue Breakdown</h4>
                      <MoreHorizontal className="h-3.5 w-3.5 text-gray-600" />
                    </div>
                    <PieChartPreview />
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  {/* Recent Transactions */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-300">Recent Transactions</h4>
                      <button className="text-xs text-[#6366F1] hover:text-[#8B5CF6]">
                        View All
                      </button>
                    </div>
                    <div className="space-y-2">
                      {transactions.map((tx) => (
                        <div
                          key={tx.email}
                          className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#6366F1]/20 to-[#8B5CF6]/20" />
                            <div>
                              <div className="text-xs font-medium text-gray-300">{tx.customer}</div>
                              <div className="text-[10px] text-gray-600">{tx.email}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400">{tx.amount}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                tx.status === 'Completed'
                                  ? 'bg-[#10B981]/10 text-[#10B981]'
                                  : tx.status === 'Processing'
                                    ? 'bg-[#6366F1]/10 text-[#6366F1]'
                                    : 'bg-[#F59E0B]/10 text-[#F59E0B]'
                              }`}
                            >
                              {tx.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Low Stock Alerts */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-300">Low Stock Alerts</h4>
                      <span className="rounded-full bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] font-medium text-[#F59E0B]">
                        3 Alerts
                      </span>
                    </div>
                    <div className="space-y-2">
                      {lowStockItems.map((item) => (
                        <div
                          key={item.sku}
                          className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2.5"
                        >
                          <div>
                            <div className="text-xs font-medium text-gray-300">{item.name}</div>
                            <div className="text-[10px] text-gray-600">{item.sku}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xs font-medium text-[#F59E0B]">
                                {item.stock} left
                              </div>
                              <div className="text-[10px] text-gray-600">Min: {item.threshold}</div>
                            </div>
                            <div className="h-6 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                              <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] to-[#EF4444]"
                                initial={{ width: 0 }}
                                whileInView={{ width: `${(item.stock / item.threshold) * 100}%` }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5 }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
