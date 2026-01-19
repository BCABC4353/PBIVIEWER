import { fmt, date } from './utils'
import { Badge } from '../components/ui/Badge'

// 12 months of trend data
export const trendData = [
  { month: 'Jan', value: 4200 },
  { month: 'Feb', value: 4800 },
  { month: 'Mar', value: 5100 },
  { month: 'Apr', value: 4900 },
  { month: 'May', value: 5400 },
  { month: 'Jun', value: 6200 },
  { month: 'Jul', value: 5800 },
  { month: 'Aug', value: 6500 },
  { month: 'Sep', value: 7100 },
  { month: 'Oct', value: 6800 },
  { month: 'Nov', value: 7400 },
  { month: 'Dec', value: 8200 },
]

// Category breakdown data
export const categoryData = [
  { name: 'Product A', value: 4500 },
  { name: 'Product B', value: 3200 },
  { name: 'Product C', value: 2800 },
  { name: 'Product D', value: 1900 },
  { name: 'Other', value: 1100 },
]

// Table data with various fields
export const tableData = [
  { id: 'INV-001', name: 'Acme Corp', status: 'Completed', amount: 12500, date: '2024-01-15' },
  { id: 'INV-002', name: 'Globex Inc', status: 'Pending', amount: 8750, date: '2024-01-14' },
  { id: 'INV-003', name: 'Initech', status: 'Completed', amount: 15200, date: '2024-01-13' },
  { id: 'INV-004', name: 'Umbrella Co', status: 'Failed', amount: 4300, date: '2024-01-12' },
  { id: 'INV-005', name: 'Stark Industries', status: 'Completed', amount: 28900, date: '2024-01-11' },
  { id: 'INV-006', name: 'Wayne Enterprises', status: 'Pending', amount: 19500, date: '2024-01-10' },
  { id: 'INV-007', name: 'Oscorp', status: 'Completed', amount: 7650, date: '2024-01-09' },
  { id: 'INV-008', name: 'LexCorp', status: 'Completed', amount: 33100, date: '2024-01-08' },
  { id: 'INV-009', name: 'Cyberdyne', status: 'Pending', amount: 11200, date: '2024-01-07' },
  { id: 'INV-010', name: 'Weyland-Yutani', status: 'Completed', amount: 45000, date: '2024-01-06' },
]

// Column definitions for the table
export const tableColumns = [
  {
    key: 'id',
    label: 'Invoice',
    mono: true,
  },
  {
    key: 'name',
    label: 'Customer',
  },
  {
    key: 'status',
    label: 'Status',
    render: (value) => {
      const variant = {
        Completed: 'success',
        Pending: 'warning',
        Failed: 'danger',
      }[value] || 'default'
      return <Badge variant={variant}>{value}</Badge>
    },
  },
  {
    key: 'amount',
    label: 'Amount',
    align: 'right',
    render: (value) => fmt.currency(value),
  },
  {
    key: 'date',
    label: 'Date',
    align: 'right',
    render: (value) => date.medium(value),
  },
]

// Multi-line chart data
export const multiLineData = [
  { month: 'Jan', revenue: 4200, expenses: 2800, profit: 1400 },
  { month: 'Feb', revenue: 4800, expenses: 3100, profit: 1700 },
  { month: 'Mar', revenue: 5100, expenses: 3200, profit: 1900 },
  { month: 'Apr', revenue: 4900, expenses: 3000, profit: 1900 },
  { month: 'May', revenue: 5400, expenses: 3300, profit: 2100 },
  { month: 'Jun', revenue: 6200, expenses: 3800, profit: 2400 },
]

// Navigation links
export const navLinks = [
  { href: '#dashboard', label: 'Dashboard' },
  { href: '#reports', label: 'Reports' },
  { href: '#analytics', label: 'Analytics' },
  { href: '#settings', label: 'Settings' },
]

// Sidebar sections
export const sidebarSections = [
  {
    title: 'Filters',
    items: [
      { href: '#all', label: 'All Items' },
      { href: '#active', label: 'Active' },
      { href: '#archived', label: 'Archived' },
    ],
  },
  {
    title: 'Categories',
    items: [
      { href: '#cat-a', label: 'Category A' },
      { href: '#cat-b', label: 'Category B' },
      { href: '#cat-c', label: 'Category C' },
    ],
  },
]
