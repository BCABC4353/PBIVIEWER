import { DollarSign, Users, ShoppingCart, TrendingUp } from 'lucide-react'
import { TopNav } from '../components/layout/TopNav'
import { PageContainer } from '../components/layout/PageContainer'
import { Section } from '../components/layout/Section'
import { SectionHeader } from '../components/layout/SectionHeader'
import { MetricCard } from '../components/ui/MetricCard'
import { InfoCard } from '../components/ui/InfoCard'
import { ChartContainer } from '../components/charts/ChartContainer'
import { AreaChartComponent } from '../components/charts/AreaChartComponent'
import { DonutChartComponent } from '../components/charts/DonutChartComponent'
import { DataTable } from '../components/data/DataTable'
import {
  trendData,
  categoryData,
  tableData,
  tableColumns,
  navLinks,
} from '../lib/sampleData'

export function DashboardExample() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <TopNav logo="Dashboard" links={navLinks} actions={null} />

      <main id="main" className="pt-[var(--nav-height)]">
        <PageContainer size="wide">
          {/* Overview Section */}
          <Section>
            <SectionHeader
              title="Overview"
              subtitle="Last 30 days"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <MetricCard
                label="Total Revenue"
                value="$84,232"
                change="+12.5%"
                changeLabel="vs last month"
                trend="up"
                icon={DollarSign}
              />
              <MetricCard
                label="Active Users"
                value="2,847"
                change="+8.2%"
                changeLabel="vs last month"
                trend="up"
                icon={Users}
              />
              <MetricCard
                label="Orders"
                value="1,284"
                change="-3.1%"
                changeLabel="vs last month"
                trend="down"
                icon={ShoppingCart}
              />
              <MetricCard
                label="Conversion Rate"
                value="3.24%"
                change="+0.4%"
                changeLabel="vs last month"
                trend="up"
                icon={TrendingUp}
              />
            </div>
          </Section>

          {/* Charts Section */}
          <Section>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartContainer
                title="Revenue Trend"
                subtitle="Monthly revenue over the past year"
                height={300}
              >
                <AreaChartComponent
                  data={trendData}
                  xKey="month"
                  yKey="value"
                  color="var(--chart-1)"
                />
              </ChartContainer>

              <ChartContainer
                title="Revenue by Category"
                subtitle="Distribution across product lines"
                height={300}
              >
                <DonutChartComponent
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                />
              </ChartContainer>
            </div>
          </Section>

          {/* Table Section */}
          <Section>
            <InfoCard
              title="Recent Transactions"
              subtitle="Latest invoices and their status"
            >
              <DataTable
                columns={tableColumns}
                data={tableData}
                aria-label="Recent transactions"
              />
            </InfoCard>
          </Section>
        </PageContainer>
      </main>
    </div>
  )
}
