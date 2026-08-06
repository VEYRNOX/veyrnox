/**
 * TIP Intelligence Dashboard — Storybook Stories
 *
 * Installation:
 * npx storybook@latest init
 * npm install @storybook/react @storybook/addon-essentials
 *
 * Usage:
 * npm run storybook
 */

import { ThemeProvider } from 'styled-components';
import { StatCard, DataTable, ChartContainer, ActivityItem, ActivityList, Button, Input, Modal, Toast, Drawer } from '../TIP-SENTINEL-COMPONENTS';
import { tipTheme } from '../TIP-SENTINEL-STYLED-COMPONENTS';

// Meta configuration
export default {
  title: 'TIP Intelligence Dashboard',
  decorators: [
    (Story) => (
      <ThemeProvider theme={tipTheme}>
        <div style={{ background: tipTheme.colors.surface.primary, padding: '40px', minHeight: '100vh' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
};

// ============================================================================
// STAT CARDS
// ============================================================================

export const StatCardAllow = {
  render: () => (
    <StatCard
      label="Allow (24h)"
      value="0"
      meta="7d: 2 · 30d: 2"
      severity="allow"
    />
  ),
};

export const StatCardWarn = {
  render: () => (
    <StatCard
      label="Warn (24h)"
      value="0"
      meta="7d: 0 · 30d: 0"
      severity="warn"
    />
  ),
};

export const StatCardBlock = {
  render: () => (
    <StatCard
      label="Block (24h)"
      value="5"
      meta="7d: 5 · 30d: 5"
      severity="block"
    />
  ),
};

export const StatCardsGrid = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
      <StatCard label="Allow (24h)" value="0" meta="7d: 2 · 30d: 2" severity="allow" />
      <StatCard label="Warn (24h)" value="0" meta="7d: 0 · 30d: 0" severity="warn" />
      <StatCard label="Block (24h)" value="5" meta="7d: 5 · 30d: 5" severity="block" />
    </div>
  ),
};

// ============================================================================
// DATA TABLE
// ============================================================================

const iocTableColumns = [
  { key: 'address', label: 'Address', render: (v) => v.slice(0, 10) + '…', width: '30%' },
  { key: 'type', label: 'Type', width: '15%' },
  {
    key: 'risk',
    label: 'Risk',
    render: (v) => (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        fontWeight: 600,
        fontSize: '12px',
        padding: '2px 8px',
        borderRadius: '8px',
        color: '#f85149',
        background: 'rgba(248, 81, 73, 0.1)',
      }}>
        🔴 {v.toUpperCase()}
      </span>
    ),
    width: '20%'
  },
  { key: 'source', label: 'Source', width: '20%' },
  { key: 'lastSeen', label: 'Last Seen', width: '15%' },
];

const iocTableData = [
  { id: 1, address: '0x098B71…3E2f96', type: 'address_evm', risk: 'critical', source: 'ofac-manual', lastSeen: '8/4/2026' },
  { id: 2, address: '0xd90e2f…24F31b', type: 'address_evm', risk: 'critical', source: 'ofac-manual', lastSeen: '8/4/2026' },
  { id: 3, address: 'http://2…64.exe', type: 'url', risk: 'critical', source: 'osint:feed', lastSeen: '8/4/2026' },
];

export const DataTableIOCs = {
  render: () => (
    <DataTable
      columns={iocTableColumns}
      rows={iocTableData}
      onRowClick={(row) => console.log('Clicked row:', row)}
    />
  ),
};

// ============================================================================
// CHART CONTAINER
// ============================================================================

export const ChartVerdictTimeline = {
  render: () => (
    <ChartContainer
      title="Verdict Timeline (24h)"
      legend={[
        { label: 'Allow', color: '#3fb950', visible: true },
        { label: 'Warn', color: '#d29922', visible: true },
        { label: 'Block', color: '#f85149', visible: true },
      ]}
    >
      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8b949e' }}>
        [Recharts/Chart.js placeholder - Replace with actual chart library]
      </div>
    </ChartContainer>
  ),
};

// ============================================================================
// ACTIVITY LIST
// ============================================================================

const activityItems = [
  {
    id: 1,
    type: 'block',
    title: 'OFAC/sanctions match',
    description: 'on list: OFAC-SDN',
    id: 'tip-c4ea56...',
    timestamp: '7:25 PM',
  },
  {
    id: 2,
    type: 'allow',
    title: 'No threats detected',
    description: '',
    id: '96cd1089...',
    timestamp: '11:40 AM',
  },
  {
    id: 3,
    type: 'block',
    title: 'OFAC/sanctions match',
    description: 'on list: OFAC-SDN',
    id: 'tip-5420ed...',
    timestamp: '4:54 PM',
  },
];

export const ActivityListExample = {
  render: () => (
    <ActivityList
      items={activityItems}
      onItemClick={(item) => console.log('Clicked activity:', item)}
    />
  ),
};

// ============================================================================
// BUTTONS
// ============================================================================

export const ButtonPrimary = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      <Button variant="primary" onClick={() => alert('Clicked')}>
        Action Button
      </Button>
      <Button variant="primary" disabled>
        Disabled
      </Button>
    </div>
  ),
};

export const ButtonSecondary = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      <Button variant="secondary" onClick={() => alert('Clicked')}>
        Secondary Action
      </Button>
      <Button variant="secondary" disabled>
        Disabled
      </Button>
    </div>
  ),
};

export const ButtonDanger = {
  render: () => (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
      <Button variant="danger" onClick={() => alert('Clicked')}>
        Delete
      </Button>
      <Button variant="danger" disabled>
        Disabled
      </Button>
    </div>
  ),
};

// ============================================================================
// INPUTS
// ============================================================================

export const InputExample = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '400px' }}>
      <Input
        label="API Key"
        placeholder="Enter your API key..."
        value=""
      />
      <Input
        label="Signing Secret"
        type="password"
        placeholder="Enter signing secret..."
        value=""
      />
      <Input
        label="Error Example"
        value=""
        error="This field is required"
        helper="Helper text appears here"
      />
    </div>
  ),
};

// ============================================================================
// MODAL
// ============================================================================

export const ModalExample = {
  render: () => {
    const [isOpen, setIsOpen] = React.useState(true);
    return (
      <>
        <Button onClick={() => setIsOpen(true)}>Open Modal</Button>
        <Modal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="Confirm Action"
          subtitle="Are you sure you want to proceed?"
          action={{
            label: 'Confirm',
            onClick: () => { setIsOpen(false); alert('Confirmed!'); },
          }}
        >
          <p>This action cannot be undone. Please confirm that you want to continue.</p>
        </Modal>
      </>
    );
  },
};

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

export const ToastInfo = {
  render: () => (
    <Toast
      type="info"
      title="Information"
      message="This is an informational message."
      duration={4000}
      onClose={() => console.log('Toast closed')}
    />
  ),
};

export const ToastSuccess = {
  render: () => (
    <Toast
      type="success"
      title="Success"
      message="Your action completed successfully."
      duration={4000}
      onClose={() => console.log('Toast closed')}
    />
  ),
};

export const ToastWarning = {
  render: () => (
    <Toast
      type="warning"
      title="Warning"
      message="Please review this before proceeding."
      duration={4000}
      onClose={() => console.log('Toast closed')}
    />
  ),
};

export const ToastError = {
  render: () => (
    <Toast
      type="error"
      title="Error"
      message="Something went wrong. Please try again."
      duration={4000}
      action={{ label: 'Retry', onClick: () => console.log('Retry clicked') }}
      onClose={() => console.log('Toast closed')}
    />
  ),
};

// ============================================================================
// DRAWER / SIDEBAR
// ============================================================================

export const DrawerExample = {
  render: () => {
    const [isOpen, setIsOpen] = React.useState(true);
    return (
      <>
        <Button onClick={() => setIsOpen(true)}>Open Drawer</Button>
        <Drawer
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="Dashboard Settings"
          position="right"
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <Input label="Refresh Interval" value="30" />
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button variant="secondary">Cancel</Button>
              <Button variant="primary">Save</Button>
            </div>
          </div>
        </Drawer>
      </>
    );
  },
};

// ============================================================================
// DASHBOARD LAYOUT
// ============================================================================

export const CompleteDashboard = {
  render: () => (
    <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '32px', fontWeight: 600 }}>
            TIP Intelligence Dashboard
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#8b949e' }}>
            SIEM Threat Monitoring
          </p>
        </div>
        <Button>↻ Refresh</Button>
      </div>

      {/* Stats Grid */}
      <section>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
          Verdict Statistics (24h)
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
          <StatCard label="Allow (24h)" value="0" meta="7d: 2 · 30d: 2" severity="allow" />
          <StatCard label="Warn (24h)" value="0" meta="7d: 0 · 30d: 0" severity="warn" />
          <StatCard label="Block (24h)" value="5" meta="7d: 5 · 30d: 5" severity="block" />
        </div>
      </section>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <ChartContainer
          title="Verdict Timeline (24h)"
          legend={[
            { label: 'Allow', color: '#3fb950', visible: true },
            { label: 'Warn', color: '#d29922', visible: true },
            { label: 'Block', color: '#f85149', visible: true },
          ]}
        >
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8b949e' }}>
            [Chart placeholder]
          </div>
        </ChartContainer>

        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
            High-Risk IOCs (20)
          </h2>
          <DataTable
            columns={iocTableColumns}
            rows={iocTableData}
            onRowClick={(row) => console.log('Clicked row:', row)}
          />
        </div>
      </div>

      {/* Activity */}
      <section>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
          Recent Screening Activity (7)
        </h2>
        <ActivityList
          items={activityItems}
          onItemClick={(item) => console.log('Clicked activity:', item)}
        />
      </section>
    </div>
  ),
};
