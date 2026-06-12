import React, { useState } from 'react';
import { Spinner } from '@fluentui/react-components';
import type { AdminInsights } from '../../../shared/types';
import { luce, unlockStageText } from './insights-luce';
import { formatTime, relativeAge, tabular } from './insights-shared';
import { LuceButton } from './LuceButton';
import { SectionHeading } from './SectionHeading';

export const InsightsAdmin: React.FC<{
  admin: AdminInsights | null;
  adminLoading: boolean;
  adminError: string | null;
  unlockElapsedMs: number;
  loadAdmin: (force: boolean) => Promise<void>;
  cancelAdminLoad: () => void;
}> = ({ admin, adminLoading, adminError, unlockElapsedMs, loadAdmin, cancelAdminLoad }) => {
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set());
  return (
    <section
      id="insights-admin"
      aria-labelledby="insights-admin-heading"
      className="luce-wing-l"
      style={{ scrollMarginTop: 48, '--luce-i': 2 } as React.CSSProperties}
    >
      <div className="mb-3">
        <SectionHeading id="insights-admin-heading" eyebrow="Admin" title="Admin view — everyone's usage and App audiences" />
      </div>
      {!admin && (
        <div className="luce-panel luce-card p-4">
          <p className="text-sm mb-3" style={{ color: luce.textSecondary }}>
            For Fabric administrators: see who opened what across ALL users (last 2 days to start) and who
            has access to each published App. The first unlock may show a Microsoft permission window — it
            can open BEHIND this window, so check your taskbar if nothing appears. Approve it once (you can
            tick "consent on behalf of your organization") and it never asks again.
          </p>
          {adminError && (
            <p role="alert" className="text-sm mb-3" style={{ color: luce.broken }}>{adminError}</p>
          )}
          {adminLoading ? (
            <div className="flex items-center gap-3" role="status">
              <Spinner size="tiny" />
              <span className="text-sm" style={{ color: luce.textSecondary }}>{unlockStageText(unlockElapsedMs)}</span>
              <LuceButton onClick={cancelAdminLoad}>Cancel</LuceButton>
            </div>
          ) : (
            <LuceButton tone="accent" onClick={() => void loadAdmin(false)}>Unlock admin view</LuceButton>
          )}
        </div>
      )}
      {admin && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: luce.textTertiary, ...tabular }}>
              Last {admin.days} days · checked {relativeAge(admin.generatedAt) || 'just now'}
              {admin.fromCache ? ' (cached)' : ''}
              {admin.failedDays > 0 ? ` · ${admin.failedDays} day(s) could not be read — counts are partial` : ''}
              {admin.truncated ? ' · very high activity — showing a partial count' : ''}
            </span>
            <LuceButton disabled={adminLoading} onClick={() => void loadAdmin(true)}>
              {adminLoading ? 'Refreshing…' : 'Refresh'}
            </LuceButton>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="luce-panel luce-card overflow-hidden">
              <div className="luce-tablehead px-3 py-2 luce-legend">What's being used</div>
              {admin.activityByItem.length === 0 ? (
                <p className="text-xs p-3" style={{ color: luce.textTertiary }}>No report views recorded in this window.</p>
              ) : (
                <table className="w-full text-sm" style={tabular}>
                  <thead>
                    <tr className="text-left">
                      <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>Report</th>
                      <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>Views</th>
                      <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>People</th>
                      <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>Last viewed</th>
                    </tr>
                  </thead>
                  <tbody className="luce-groove">
                    {admin.activityByItem.slice(0, 15).map((it) => (
                      <tr key={it.name} className="transition-colors hover:bg-white/[0.03]">
                        <td className="px-3 py-1.5" style={{ color: luce.textPrimary }}>{it.name}</td>
                        <td className="px-3 py-1.5" style={{ color: luce.textSecondary }}>{it.views}</td>
                        <td className="px-3 py-1.5" style={{ color: luce.textSecondary }}>{it.uniqueUsers}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: luce.textTertiary }}>
                          {relativeAge(it.lastViewed) || formatTime(it.lastViewed)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="luce-panel luce-card overflow-hidden">
              <div className="luce-tablehead px-3 py-2 luce-legend">Who's using it</div>
              {admin.activityByUser.length === 0 ? (
                <p className="text-xs p-3" style={{ color: luce.textTertiary }}>No user activity recorded in this window.</p>
              ) : (
                <table className="w-full text-sm" style={tabular}>
                  <thead>
                    <tr className="text-left">
                      <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>User</th>
                      <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>Views</th>
                      <th className="px-3 py-1.5 font-medium text-[11px] uppercase tracking-wider" style={{ color: luce.textTertiary }}>Last active</th>
                    </tr>
                  </thead>
                  <tbody className="luce-groove">
                    {admin.activityByUser.slice(0, 15).map((u) => (
                      <tr key={u.user} className="transition-colors hover:bg-white/[0.03]">
                        <td className="px-3 py-1.5" style={{ color: luce.textPrimary }}>{u.user}</td>
                        <td className="px-3 py-1.5" style={{ color: luce.textSecondary }}>{u.views}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: luce.textTertiary }}>
                          {relativeAge(u.lastActive) || formatTime(u.lastActive)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold mb-2" style={{ color: luce.textPrimary }}>
              App audiences — who can open each published App
            </div>
            <div className="space-y-2">
              {admin.appAudiences.length === 0 && (
                <p className="text-xs" style={{ color: luce.textTertiary }}>No published Apps visible to this account.</p>
              )}
              {admin.appAudiences.map((app) => (
                <div key={app.appId} className="luce-panel luce-card overflow-hidden">
                  <button
                    className="luce-press w-full flex items-center justify-between px-4 py-2.5 text-left cursor-pointer hover:bg-white/[0.03]"
                    onClick={() => setExpandedApps((prev) => {
                      const next = new Set(prev);
                      if (next.has(app.appId)) next.delete(app.appId);
                      else next.add(app.appId);
                      return next;
                    })}
                    aria-expanded={expandedApps.has(app.appId)}
                  >
                    <span className="flex items-center gap-2 text-sm" style={{ color: luce.textPrimary }}>
                      <span
                        aria-hidden="true"
                        className="inline-block text-xs"
                        style={{ color: luce.textTertiary, transform: expandedApps.has(app.appId) ? 'rotate(90deg)' : 'none', transition: 'transform 250ms var(--spring-settle)' }}
                      >▸</span>
                      {app.appName}
                    </span>
                    <span className="text-xs" style={{ color: luce.textTertiary, ...tabular }}>
                      {app.users === null ? 'audience not readable' : `${app.users.length} member(s)`}
                    </span>
                  </button>
                  {expandedApps.has(app.appId) && app.users !== null && (
                    <div className="luce-groove px-4 pb-3" style={{ borderTop: '1px solid rgba(0,0,0,0.45)' }}>
                      {app.users.map((u, i) => (
                        <div key={`${u.email || u.name}-${i}`} className="flex items-center justify-between py-1.5">
                          <div>
                            <div className="text-sm" style={{ color: luce.textPrimary }}>{u.name}</div>
                            {u.email && <div className="text-xs" style={{ color: luce.textTertiary }}>{u.email}</div>}
                          </div>
                          <span className="luce-chip px-2 py-0.5 text-[11px]" style={{ color: luce.textSecondary }}>{u.accessRight}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
