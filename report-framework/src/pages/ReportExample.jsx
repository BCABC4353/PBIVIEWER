import { PageContainer } from '../components/layout/PageContainer'
import { Section } from '../components/layout/Section'
import { StatCard } from '../components/ui/StatCard'
import { ChartContainer } from '../components/charts/ChartContainer'
import { BarChartComponent } from '../components/charts/BarChartComponent'
import { CompactTable } from '../components/data/CompactTable'
import { date, fmt } from '../lib/utils'
import { categoryData, tableData, tableColumns } from '../lib/sampleData'

export function ReportExample() {
  const reportDate = new Date()

  return (
    <div className="min-h-screen bg-white">
      <PageContainer size="default">
        {/* Header */}
        <header className="py-8 border-b border-zinc-200 mb-8">
          <h1 className="text-3xl font-semibold text-zinc-900">
            Monthly Performance Report
          </h1>
          <p className="text-zinc-500 mt-2">
            Generated on {date.long(reportDate)}
          </p>
        </header>

        {/* Executive Summary */}
        <Section animate={false}>
          <h2 className="text-xl font-semibold text-zinc-900 mb-4">
            Executive Summary
          </h2>
          <p className="text-zinc-600 leading-relaxed">
            This report provides a comprehensive overview of our performance
            metrics for the past month. Overall, we have seen positive growth
            across key indicators, with revenue increasing by 12.5% compared
            to the previous period.
          </p>
        </Section>

        {/* Key Metrics */}
        <Section animate={false}>
          <h2 className="text-xl font-semibold text-zinc-900 mb-6">
            Key Metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-zinc-50 rounded-xl p-4">
            <StatCard
              label="Revenue"
              value="$84.2K"
              sublabel="+12.5% MoM"
            />
            <StatCard
              label="Users"
              value="2,847"
              sublabel="+8.2% MoM"
            />
            <StatCard
              label="Orders"
              value="1,284"
              sublabel="-3.1% MoM"
            />
            <StatCard
              label="Avg. Order"
              value="$65.60"
              sublabel="+5.3% MoM"
            />
          </div>
        </Section>

        {/* Category Performance */}
        <Section animate={false}>
          <h2 className="text-xl font-semibold text-zinc-900 mb-6">
            Category Performance
          </h2>
          <ChartContainer height={300}>
            <BarChartComponent
              data={categoryData}
              xKey="name"
              yKey="value"
              color="var(--chart-1)"
              horizontal
            />
          </ChartContainer>
        </Section>

        {/* Transaction Details */}
        <Section animate={false}>
          <h2 className="text-xl font-semibold text-zinc-900 mb-6">
            Transaction Details
          </h2>
          <div className="bg-white border border-zinc-200 rounded-xl p-6">
            <CompactTable
              columns={tableColumns}
              data={tableData.slice(0, 5)}
            />
          </div>
        </Section>

        {/* Footer */}
        <footer className="py-8 border-t border-zinc-200 mt-8">
          <p className="text-sm text-zinc-500">
            This report was automatically generated. For questions or
            clarifications, please contact the analytics team.
          </p>
        </footer>
      </PageContainer>
    </div>
  )
}
