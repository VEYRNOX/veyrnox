/**
 * TIP Intelligence Dashboard — Microsoft Sentinel Style Components
 *
 * Copy these components into your TIP dashboard frontend.
 * Requires: React, CSS from TIP-SENTINEL-DESIGN-SYSTEM.md
 */

import React, { useState } from 'react';

// ============================================================================
// 1. STAT CARD COMPONENT
// ============================================================================

export function StatCard({
  label,
  value,
  meta,
  severity = 'allow',  // 'allow' | 'warn' | 'block'
  onClick
}) {
  return (
    <div
      className={`stat-card stat-card--${severity}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${value}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(e)}
    >
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__meta">{meta}</div>
    </div>
  );
}

// ============================================================================
// 2. DATA TABLE COMPONENT
// ============================================================================

export function DataTable({
  columns,       // [{ key, label, render, width }]
  rows,          // [{ id, address, type, risk, ... }]
  onRowClick
}) {
  return (
    <table className="data-table">
      <thead className="data-table__head">
        <tr>
          {columns.map((col) => (
            <th key={col.key} className="data-table__header-cell" style={{ width: col.width }}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className="data-table__body-row"
            onClick={() => onRowClick?.(row)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onRowClick?.(row)}
          >
            {columns.map((col) => (
              <td
                key={col.key}
                className={`data-table__cell ${col.mono ? 'data-table__cell--mono' : ''}`}
              >
                {col.render ? col.render(row[col.key], row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================================================
// 3. SEVERITY BADGE COMPONENT
// ============================================================================

export function SeverityBadge({ level }) {
  const severityMap = {
    critical: 'data-table__severity--critical',
    high: 'data-table__severity--high',
    medium: 'data-table__severity--medium',
    low: 'data-table__severity--low',
  };

  const labelMap = {
    critical: '🔴 CRITICAL',
    high: '🟠 HIGH',
    medium: '🟡 MEDIUM',
    low: '🟢 LOW',
  };

  return (
    <span className={`data-table__severity ${severityMap[level] || severityMap.low}`}>
      {labelMap[level] || 'UNKNOWN'}
    </span>
  );
}

// ============================================================================
// 4. CHART CONTAINER COMPONENT
// ============================================================================

export function ChartContainer({
  title,
  children,  // Your chart library (Recharts, Chart.js, etc.)
  legend,    // [{ label, color, visible }]
  onToggleLegend
}) {
  return (
    <div className="chart-container">
      {title && <h3 className="chart-container__title">{title}</h3>}

      {legend && (
        <div className="chart-container__legend">
          {legend.map((item, idx) => (
            <div
              key={idx}
              className="chart-container__legend-item"
              onClick={() => onToggleLegend?.(idx)}
              role="button"
              tabIndex={0}
              aria-label={`Toggle ${item.label}`}
            >
              <div
                className="chart-container__legend-dot"
                style={{
                  backgroundColor: item.color,
                  opacity: item.visible ? 1 : 0.4
                }}
              />
              <span style={{ opacity: item.visible ? 1 : 0.5 }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="chart-container__canvas">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// 5. ACTIVITY LIST ITEM COMPONENT
// ============================================================================

export function ActivityItem({
  type,           // 'allow' | 'warn' | 'block'
  title,
  description,
  id,
  timestamp,
  onClick
}) {
  const iconClass = `activity-item__icon--${type}`;
  const iconSymbol = type === 'allow' ? '✓' : type === 'warn' ? '!' : '✕';

  return (
    <div
      className="activity-item"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.(e)}
      aria-label={`${type.toUpperCase()}: ${title}`}
    >
      <div className={`activity-item__icon ${iconClass}`}>
        {iconSymbol}
      </div>

      <div className="activity-item__content">
        <div className="activity-item__title">{title}</div>
        {description && (
          <div className="activity-item__description">{description}</div>
        )}
        {id && (
          <div className="activity-item__id" title={id}>
            {id}
          </div>
        )}
      </div>

      {timestamp && (
        <div className="activity-item__timestamp">{timestamp}</div>
      )}
    </div>
  );
}

// ============================================================================
// 6. ACTIVITY LIST COMPONENT
// ============================================================================

export function ActivityList({ items, onItemClick }) {
  return (
    <div className="activity-list">
      {items.length === 0 ? (
        <div className="empty-state">
          <p>No activity yet</p>
        </div>
      ) : (
        items.map((item) => (
          <ActivityItem
            key={item.id}
            {...item}
            onClick={() => onItemClick?.(item)}
          />
        ))
      )}
    </div>
  );
}

// ============================================================================
// 7. BUTTON COMPONENT
// ============================================================================

export function Button({
  children,
  variant = 'primary',  // 'primary' | 'secondary' | 'danger'
  disabled = false,
  onClick,
  aria-label
}) {
  const variantClass = `btn--${variant}`;

  return (
    <button
      className={`btn ${variantClass}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={aria-label}
    >
      {children}
    </button>
  );
}

// ============================================================================
// 8. INPUT COMPONENT
// ============================================================================

export function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  helper,
  required = false,
  disabled = false
}) {
  return (
    <div className="form__group">
      {label && (
        <label className={`form__label ${required ? 'form__label--required' : ''}`}>
          {label}
        </label>
      )}

      <input
        type={type}
        className={`input ${error ? 'input--error' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? 'error' : helper ? 'helper' : undefined}
      />

      {error && <div className="form__error" id="error">{error}</div>}
      {helper && !error && <div className="form__helper" id="helper">{helper}</div>}
    </div>
  );
}

// ============================================================================
// 9. CARD COMPONENT
// ============================================================================

export function Card({
  title,
  subtitle,
  children,
  footer,
  onClick
}) {
  return (
    <div
      className="card"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick(e) : undefined}
    >
      {(title || subtitle) && (
        <div className="card__header">
          {title && <h3 className="card__title">{title}</h3>}
          {subtitle && <p className="card__subtitle">{subtitle}</p>}
        </div>
      )}

      <div className="card__content">
        {children}
      </div>

      {footer && (
        <div className="card__footer">
          {footer}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 10. EXAMPLE: TIP DASHBOARD MAIN COMPONENT
// ============================================================================

export function TipIntelligenceDashboard({ data }) {
  const [selectedRow, setSelectedRow] = useState(null);

  const verdictColumns = [
    { key: 'address', label: 'Address', render: (v) => v.slice(0, 10) + '…', width: '30%' },
    { key: 'type', label: 'Type', width: '15%' },
    {
      key: 'risk',
      label: 'Risk',
      render: (v) => <SeverityBadge level={v.toLowerCase()} />,
      width: '20%'
    },
    { key: 'source', label: 'Source', width: '20%' },
    { key: 'lastSeen', label: 'Last Seen', width: '15%' },
  ];

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard__header">
        <div className="dashboard__title-group">
          <h1>TIP Intelligence Dashboard</h1>
          <p className="dashboard__subtitle">SIEM Threat Monitoring</p>
        </div>
        <Button onClick={() => window.location.reload()}>
          ↻ Refresh
        </Button>
      </header>

      {/* Main Content */}
      <main className="dashboard__content">

        {/* Verdict Stats Grid */}
        <section className="dashboard__section">
          <h2>Verdict Statistics (24h)</h2>
          <div className="grid grid--3col">
            <StatCard
              label="Allow (24h)"
              value={data?.stats?.allow24h || 0}
              meta={`7d: ${data?.stats?.allow7d || 0} · 30d: ${data?.stats?.allow30d || 0}`}
              severity="allow"
            />
            <StatCard
              label="Warn (24h)"
              value={data?.stats?.warn24h || 0}
              meta={`7d: ${data?.stats?.warn7d || 0} · 30d: ${data?.stats?.warn30d || 0}`}
              severity="warn"
            />
            <StatCard
              label="Block (24h)"
              value={data?.stats?.block24h || 0}
              meta={`7d: ${data?.stats?.block7d || 0} · 30d: ${data?.stats?.block30d || 0}`}
              severity="block"
            />
          </div>
        </section>

        {/* Charts & Data Grid */}
        <div className="grid grid--2col">
          {/* Chart */}
          <section className="dashboard__section">
            <ChartContainer
              title="Verdict Timeline (24h)"
              legend={[
                { label: 'Allow', color: '#3fb950', visible: true },
                { label: 'Warn', color: '#d29922', visible: true },
                { label: 'Block', color: '#f85149', visible: true },
              ]}
            >
              {/* Insert your chart library here (Recharts, Chart.js, etc.) */}
              <p style={{ textAlign: 'center', padding: '40px', color: '#8b949e' }}>
                [Chart placeholder - Replace with Recharts/Chart.js]
              </p>
            </ChartContainer>
          </section>

          {/* High-Risk IOCs */}
          <section className="dashboard__section">
            <h2>High-Risk IOCs ({data?.iocs?.length || 0})</h2>
            <DataTable
              columns={verdictColumns}
              rows={data?.iocs || []}
              onRowClick={(row) => setSelectedRow(row)}
            />
          </section>
        </div>

        {/* Recent Activity */}
        <section className="dashboard__section">
          <h2>Recent Screening Activity ({data?.activity?.length || 0})</h2>
          <ActivityList
            items={data?.activity || []}
            onItemClick={(item) => console.log('Activity item:', item)}
          />
        </section>

        {/* Sanctions Blocks */}
        <section className="dashboard__section">
          <h2>Sanctions Blocks ({data?.sanctions?.length || 0})</h2>
          <ActivityList
            items={data?.sanctions?.map((s) => ({
              id: s.id,
              type: 'block',
              title: 'OFAC/sanctions match',
              description: s.reason,
              timestamp: s.timestamp,
            })) || []}
          />
        </section>
      </main>
    </div>
  );
}

// ============================================================================
// EXPORT ALL COMPONENTS
// ============================================================================

export default {
  StatCard,
  DataTable,
  SeverityBadge,
  ChartContainer,
  ActivityItem,
  ActivityList,
  Button,
  Input,
  Card,
  TipIntelligenceDashboard,
};
