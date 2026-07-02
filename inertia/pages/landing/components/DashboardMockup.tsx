import { motion } from 'framer-motion'
import {
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Search,
} from 'lucide-react'

const cards = [
  {
    icon: TrendingUp,
    label: 'Revenue',
    value: '$48,290',
    change: '+12.5%',
    up: true,
    color: '#22D3EE',
    delay: 0,
  },
  {
    icon: ShoppingCart,
    label: 'Orders',
    value: '1,423',
    change: '+8.2%',
    up: true,
    color: '#10B981',
    delay: 0.1,
  },
  {
    icon: Users,
    label: 'Customers',
    value: '856',
    change: '+23.1%',
    up: true,
    color: '#6366F1',
    delay: 0.2,
  },
  {
    icon: Package,
    label: 'Products',
    value: '2,847',
    change: '-3.2%',
    up: false,
    color: '#F59E0B',
    delay: 0.3,
  },
]

const recentOrders = [
  {
    id: '#ORD-0042',
    customer: 'Sarah Chen',
    product: 'Wireless Headphones',
    amount: '$129.99',
    status: 'Completed',
  },
  {
    id: '#ORD-0041',
    customer: 'Mike Johnson',
    product: 'Running Shoes',
    amount: '$89.99',
    status: 'Processing',
  },
  {
    id: '#ORD-0040',
    customer: 'Emily Davis',
    product: 'Yoga Mat',
    amount: '$49.99',
    status: 'Completed',
  },
]

const notifications = [
  { text: 'New order from Sarah Chen', time: '2m ago', type: 'order' },
  { text: 'Low stock: Premium Sneakers', time: '15m ago', type: 'warning' },
  { text: 'Payment of $1,299 received', time: '1h ago', type: 'payment' },
]

export function DashboardMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-[#6366F1]/20 via-[#8B5CF6]/20 to-[#22D3EE]/20 blur-2xl" />
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1020]/90 shadow-2xl shadow-black/50 backdrop-blur-xl"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]" />
              <span className="font-display text-sm font-semibold text-white">VendorHub</span>
            </div>
            <div className="hidden items-center gap-1 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-gray-400 sm:flex">
              <Search className="h-3 w-3" />
              <span>Search...</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Bell className="h-4 w-4 text-gray-500" />
            <div className="relative">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#6366F1] to-[#22D3EE]" />
              <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0B1020] bg-[#10B981]" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4">
          {cards.map((card) => (
            <motion.div
              key={card.label}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + card.delay, duration: 0.4 }}
            >
              <div className="mb-2 flex items-center justify-between">
                <card.icon className="h-3.5 w-3.5" style={{ color: card.color }} />
                <span
                  className={`flex items-center gap-0.5 text-[10px] font-medium ${card.up ? 'text-[#10B981]' : 'text-[#EF4444]'}`}
                >
                  {card.change}
                  {card.up ? (
                    <ArrowUpRight className="h-2.5 w-2.5" />
                  ) : (
                    <ArrowDownRight className="h-2.5 w-2.5" />
                  )}
                </span>
              </div>
              <div className="font-display text-sm font-semibold text-white">{card.value}</div>
              <div className="text-[10px] text-gray-500">{card.label}</div>
            </motion.div>
          ))}

          {/* Mini Sales Chart */}
          <motion.div
            className="col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.4 }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-400">Sales Overview</span>
              <span className="text-[10px] text-gray-600">This week</span>
            </div>
            <div className="flex items-end justify-between gap-1">
              {[40, 55, 45, 70, 60, 85, 75].map((h, i) => (
                <motion.div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${h}%`,
                    background:
                      i >= 5
                        ? 'linear-gradient(to top, #6366F1, #8B5CF6)'
                        : 'rgba(99, 102, 241, 0.2)',
                  }}
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ delay: 1 + i * 0.05, duration: 0.4, ease: 'easeOut' }}
                />
              ))}
            </div>
          </motion.div>

          {/* Recent Orders */}
          <motion.div
            className="col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.4 }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-400">Recent Orders</span>
              <MoreHorizontal className="h-3 w-3 text-gray-600" />
            </div>
            <div className="space-y-1.5">
              {recentOrders.slice(0, 3).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] font-medium text-gray-300">{order.customer}</div>
                    <div className="hidden text-[9px] text-gray-600 sm:block">{order.product}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">{order.amount}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[8px] font-medium ${
                        order.status === 'Completed'
                          ? 'bg-[#10B981]/10 text-[#10B981]'
                          : order.status === 'Processing'
                            ? 'bg-[#6366F1]/10 text-[#6366F1]'
                            : 'bg-[#F59E0B]/10 text-[#F59E0B]'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Notifications */}
          <motion.div
            className="col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.4 }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-400">Notifications</span>
              <Bell className="h-3 w-3 text-gray-600" />
            </div>
            <div className="space-y-1.5">
              {notifications.map((n, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${n.type === 'order' ? 'bg-[#6366F1]' : n.type === 'warning' ? 'bg-[#F59E0B]' : 'bg-[#10B981]'}`}
                    />
                    <span className="text-[10px] text-gray-400">{n.text}</span>
                  </div>
                  <span className="text-[9px] text-gray-600">{n.time}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
