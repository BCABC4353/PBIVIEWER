import { useState } from 'react'
import {
  Search,
  Mail,
  User,
  Settings,
  LogOut,
  Edit,
  Trash,
  Plus,
  ChevronRight,
  Bell,
} from 'lucide-react'

// Layout
import { TopNav } from '../components/layout/TopNav'
import { PageContainer } from '../components/layout/PageContainer'
import { Section } from '../components/layout/Section'
import { SectionHeader } from '../components/layout/SectionHeader'

// UI Components
import {
  Card,
  Button,
  Input,
  Select,
  Modal,
  Dropdown,
  Avatar,
  Tooltip,
  Badge,
  Tabs,
  TabPanel,
  ProgressBar,
  Skeleton,
} from '../components/ui'

// Data Components
import { Sparkline, Heatmap, StackedBarChart } from '../components/data'

// Chart Components
import { ChartContainer, FunnelChart, GaugeChart } from '../components/charts'

// Sample data
const sparklineData = [10, 25, 15, 30, 22, 35, 28, 40, 32, 45]

const heatmapData = [
  [5, 10, 15, 20, 25],
  [8, 12, 18, 22, 28],
  [3, 7, 11, 16, 21],
  [9, 14, 19, 24, 30],
]

const stackedData = [
  { name: 'Jan', sales: 4000, returns: 400, profit: 2400 },
  { name: 'Feb', sales: 3000, returns: 300, profit: 1800 },
  { name: 'Mar', sales: 5000, returns: 500, profit: 3000 },
  { name: 'Apr', sales: 4500, returns: 350, profit: 2700 },
]

const funnelData = [
  { name: 'Visitors', value: 5000 },
  { name: 'Leads', value: 3200 },
  { name: 'Qualified', value: 1800 },
  { name: 'Proposals', value: 900 },
  { name: 'Closed', value: 450 },
]

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'reports', label: 'Reports' },
]

const selectOptions = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
]

const dropdownItems = [
  { label: 'Edit', icon: Edit, onClick: () => console.log('Edit') },
  { label: 'Settings', icon: Settings, onClick: () => console.log('Settings') },
  { label: 'Delete', icon: Trash, danger: true, onClick: () => console.log('Delete') },
]

export function ComponentShowcase() {
  const [modalOpen, setModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [inputValue, setInputValue] = useState('')
  const [selectValue, setSelectValue] = useState('')

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <TopNav
        logo="Component Showcase"
        links={[
          { label: 'Dashboard', href: '#' },
          { label: 'Components', href: '#' },
        ]}
      />

      <main id="main" className="pt-[var(--nav-height)]">
        <PageContainer size="wide">
          {/* Buttons Section */}
          <Section>
            <SectionHeader title="Buttons" subtitle="Various button styles and states" />
            <Card>
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Variants</h4>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="primary">Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="danger">Danger</Button>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Sizes</h4>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm">Small</Button>
                    <Button size="md">Medium</Button>
                    <Button size="lg">Large</Button>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">With Icons</h4>
                  <div className="flex flex-wrap gap-3">
                    <Button icon={Plus}>Add Item</Button>
                    <Button icon={ChevronRight} iconPosition="right">Continue</Button>
                    <Button variant="secondary" icon={Settings}>Settings</Button>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">States</h4>
                  <div className="flex flex-wrap gap-3">
                    <Button loading>Loading</Button>
                    <Button disabled>Disabled</Button>
                    <Button fullWidth variant="secondary">Full Width</Button>
                  </div>
                </div>
              </div>
            </Card>
          </Section>

          {/* Form Elements */}
          <Section>
            <SectionHeader title="Form Elements" subtitle="Inputs, selects, and form controls" />
            <Card>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  label="Email"
                  placeholder="Enter your email"
                  icon={Mail}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  hint="We'll never share your email"
                />
                <Input
                  label="Search"
                  placeholder="Search..."
                  icon={Search}
                />
                <Input
                  label="With Error"
                  placeholder="Enter value"
                  error="This field is required"
                  defaultValue="Invalid input"
                />
                <Select
                  label="Select Option"
                  options={selectOptions}
                  value={selectValue}
                  onChange={(e) => setSelectValue(e.target.value)}
                  placeholder="Choose an option"
                />
              </div>
            </Card>
          </Section>

          {/* Avatar, Tooltip, Dropdown */}
          <Section>
            <SectionHeader title="Interactive Elements" subtitle="Avatars, tooltips, and dropdowns" />
            <Card>
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Avatars</h4>
                  <div className="flex items-center gap-4">
                    <Avatar size="sm" name="John Doe" />
                    <Avatar size="md" name="Jane Smith" />
                    <Avatar size="lg" name="Bob Wilson" />
                    <Avatar size="xl" src="https://i.pravatar.cc/150?img=3" name="Alice Brown" />
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Tooltips</h4>
                  <div className="flex items-center gap-4">
                    <Tooltip content="Top tooltip" position="top">
                      <Button variant="secondary" size="sm">Top</Button>
                    </Tooltip>
                    <Tooltip content="Bottom tooltip" position="bottom">
                      <Button variant="secondary" size="sm">Bottom</Button>
                    </Tooltip>
                    <Tooltip content="Left tooltip" position="left">
                      <Button variant="secondary" size="sm">Left</Button>
                    </Tooltip>
                    <Tooltip content="Right tooltip" position="right">
                      <Button variant="secondary" size="sm">Right</Button>
                    </Tooltip>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Dropdown</h4>
                  <Dropdown
                    trigger={<Button variant="secondary" icon={Settings}>Options</Button>}
                    items={dropdownItems}
                  />
                </div>
              </div>
            </Card>
          </Section>

          {/* Modal */}
          <Section>
            <SectionHeader title="Modal" subtitle="Dialog overlays for focused interactions" />
            <Card>
              <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
              <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Example Modal"
                footer={
                  <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={() => setModalOpen(false)}>
                      Confirm
                    </Button>
                  </div>
                }
              >
                <p className="text-[var(--text-secondary)]">
                  This is a modal dialog. It traps focus, closes on escape, and prevents
                  background scrolling. Use it for important interactions that require
                  user attention.
                </p>
                <div className="mt-4">
                  <Input label="Name" placeholder="Enter your name" />
                </div>
              </Modal>
            </Card>
          </Section>

          {/* Badges & Progress */}
          <Section>
            <SectionHeader title="Badges & Progress" subtitle="Status indicators and progress bars" />
            <Card>
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Badges</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge>Default</Badge>
                    <Badge variant="primary">Primary</Badge>
                    <Badge variant="success">Success</Badge>
                    <Badge variant="warning">Warning</Badge>
                    <Badge variant="danger">Danger</Badge>
                    <Badge variant="info">Info</Badge>
                    <Badge variant="success" dot>With Dot</Badge>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Progress Bars</h4>
                  <div className="space-y-3">
                    <ProgressBar value={25} />
                    <ProgressBar value={50} color="var(--positive)" />
                    <ProgressBar value={75} color="var(--warning)" showLabel />
                    <ProgressBar value={90} color="var(--negative)" size="lg" showLabel />
                  </div>
                </div>
              </div>
            </Card>
          </Section>

          {/* Tabs */}
          <Section>
            <SectionHeader title="Tabs" subtitle="Navigation between related content" />
            <Card>
              <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
              <TabPanel id="overview" activeTab={activeTab}>
                <div className="py-4 text-[var(--text-secondary)]">
                  Overview content goes here. This is the first tab panel.
                </div>
              </TabPanel>
              <TabPanel id="analytics" activeTab={activeTab}>
                <div className="py-4 text-[var(--text-secondary)]">
                  Analytics content with charts and metrics would appear here.
                </div>
              </TabPanel>
              <TabPanel id="reports" activeTab={activeTab}>
                <div className="py-4 text-[var(--text-secondary)]">
                  Reports and data exports would be shown in this panel.
                </div>
              </TabPanel>
            </Card>
          </Section>

          {/* Skeleton Loading */}
          <Section>
            <SectionHeader title="Skeleton Loading" subtitle="Placeholder content during data fetching" />
            <Card>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
                <Skeleton.Card />
                <div className="flex items-center gap-3">
                  <Skeleton.Circle size={48} />
                  <div className="flex-1 space-y-2">
                    <Skeleton.Text lines={2} />
                  </div>
                </div>
              </div>
            </Card>
          </Section>

          {/* Sparkline */}
          <Section>
            <SectionHeader title="Sparkline" subtitle="Inline micro-charts for data trends" />
            <Card>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[var(--text-secondary)]">Revenue</span>
                  <div className="flex-1">
                    <Sparkline data={sparklineData} color="var(--chart-1)" height={32} />
                  </div>
                  <span className="text-sm font-medium text-[var(--positive)]">+12%</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[var(--text-secondary)]">Users</span>
                  <div className="flex-1">
                    <Sparkline data={sparklineData} color="var(--chart-2)" height={32} showDot />
                  </div>
                  <span className="text-sm font-medium text-[var(--positive)]">+8%</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[var(--text-secondary)]">Bounce Rate</span>
                  <div className="flex-1">
                    <Sparkline data={[45, 38, 42, 35, 30, 28, 32, 25, 22, 20]} color="var(--negative)" height={32} />
                  </div>
                  <span className="text-sm font-medium text-[var(--negative)]">-15%</span>
                </div>
              </div>
            </Card>
          </Section>

          {/* Heatmap */}
          <Section>
            <SectionHeader title="Heatmap" subtitle="Visualize data density in a grid" />
            <ChartContainer title="Weekly Activity" subtitle="Engagement by day and time">
              <Heatmap
                data={heatmapData}
                xLabels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri']}
                yLabels={['Morning', 'Afternoon', 'Evening', 'Night']}
              />
            </ChartContainer>
          </Section>

          {/* Stacked Bar Chart */}
          <Section>
            <SectionHeader title="Stacked Bar Chart" subtitle="Compare multiple data series" />
            <ChartContainer title="Sales Breakdown" subtitle="Monthly performance by category" height={300}>
              <StackedBarChart
                data={stackedData}
                xKey="name"
                segments={[
                  { key: 'sales', name: 'Sales', color: 'var(--chart-1)' },
                  { key: 'returns', name: 'Returns', color: 'var(--chart-4)' },
                  { key: 'profit', name: 'Profit', color: 'var(--chart-2)' },
                ]}
                height={250}
              />
            </ChartContainer>
          </Section>

          {/* Funnel Chart */}
          <Section>
            <SectionHeader title="Funnel Chart" subtitle="Visualize conversion flow" />
            <ChartContainer title="Sales Funnel" subtitle="Conversion rates through pipeline">
              <FunnelChart data={funnelData} showConversion />
            </ChartContainer>
          </Section>

          {/* Gauge Chart */}
          <Section>
            <SectionHeader title="Gauge Chart" subtitle="Display progress toward a goal" />
            <Card>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col items-center">
                  <GaugeChart value={35} label="Low" size={180} />
                </div>
                <div className="flex flex-col items-center">
                  <GaugeChart value={65} label="Medium" size={180} />
                </div>
                <div className="flex flex-col items-center">
                  <GaugeChart value={92} label="High" size={180} />
                </div>
              </div>
            </Card>
          </Section>
        </PageContainer>
      </main>
    </div>
  )
}
