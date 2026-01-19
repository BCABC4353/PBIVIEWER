import { useState } from 'react'
import { TopNav } from '../components/layout/TopNav'
import { Sidebar } from '../components/layout/Sidebar'
import { Tabs } from '../components/ui/Tabs'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { DataTable } from '../components/data/DataTable'
import { ChartContainer } from '../components/charts/ChartContainer'
import { BarChartComponent } from '../components/charts/BarChartComponent'
import { fmt } from '../lib/utils'
import {
  navLinks,
  sidebarSections,
  tableData,
  tableColumns,
  categoryData,
} from '../lib/sampleData'

const tabs = [
  { id: 'grid', label: 'Grid View' },
  { id: 'table', label: 'Table View' },
  { id: 'chart', label: 'Chart View' },
]

export function ExplorerExample() {
  const [activeTab, setActiveTab] = useState('grid')

  return (
    <div className="min-h-screen bg-zinc-50">
      <TopNav logo="Explorer" links={navLinks} actions={null} />

      <div className="pt-16 lg:flex">
        <Sidebar sections={sidebarSections} currentPath="#all" />

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-zinc-900">
              Data Explorer
            </h1>
            <p className="text-zinc-500 mt-1">
              Browse and analyze your data
            </p>
          </div>

          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

          <div className="mt-6">
            {activeTab === 'grid' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tableData.map((item) => (
                  <Card key={item.id} hover padding="default">
                    <div className="flex items-start justify-between mb-3">
                      <span className="font-mono text-sm text-zinc-500">
                        {item.id}
                      </span>
                      <Badge
                        variant={
                          item.status === 'Completed'
                            ? 'success'
                            : item.status === 'Pending'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <h3 className="font-medium text-zinc-900">{item.name}</h3>
                    <p className="text-2xl font-semibold text-zinc-900 mt-2">
                      {fmt.currency(item.amount)}
                    </p>
                  </Card>
                ))}
              </div>
            )}

            {activeTab === 'table' && (
              <Card>
                <DataTable columns={tableColumns} data={tableData} />
              </Card>
            )}

            {activeTab === 'chart' && (
              <ChartContainer
                title="Amount by Customer"
                subtitle="Top transactions by value"
                height={400}
              >
                <BarChartComponent
                  data={tableData.slice(0, 6).map((d) => ({
                    name: d.name,
                    value: d.amount,
                  }))}
                  xKey="name"
                  yKey="value"
                  color="var(--chart-1)"
                />
              </ChartContainer>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
