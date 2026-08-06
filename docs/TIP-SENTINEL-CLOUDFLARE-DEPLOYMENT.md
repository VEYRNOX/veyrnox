# TIP Intelligence Dashboard — Cloudflare Deployment Guide

**Target:** Deploy Microsoft Sentinel-style design to https://tip.veyrnox.com/dashboard  
**Platform:** Cloudflare Pages / Workers  
**Estimated Effort:** 4-6 hours  
**Last Updated:** 2026-08-06

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Implementation Steps](#implementation-steps)
4. [Testing & Verification](#testing--verification)
5. [Deployment](#deployment)
6. [Rollback Procedures](#rollback-procedures)
7. [Monitoring & Support](#monitoring--support)

---

## Pre-Deployment Checklist

- [ ] Review design system documentation (`TIP-SENTINEL-DESIGN-SYSTEM.md`)
- [ ] Component library reviewed (`TIP-SENTINEL-COMPONENTS.jsx`)
- [ ] CSS-in-JS versions prepared (Styled Components or Emotion)
- [ ] Storybook stories documented (`TIP-SENTINEL-STORYBOOK.stories.jsx`)
- [ ] Current dashboard backup created
- [ ] Team notified of deployment window
- [ ] Cloudflare access credentials ready
- [ ] Git access to TIP dashboard repository confirmed
- [ ] Node.js 18+ installed locally for development
- [ ] Access to production environment variables

---

## Environment Setup

### 1. Clone TIP Dashboard Repository

```bash
# If you have access to the TIP dashboard repo
git clone https://github.com/your-org/tip-dashboard.git
cd tip-dashboard

# Create a new branch for the Sentinel design update
git checkout -b feat/sentinel-design-system
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# If using Styled Components
npm install styled-components
# OR if using Emotion
npm install @emotion/react @emotion/styled

# Install dev dependencies
npm install --save-dev sass postcss autoprefixer
```

### 3. Copy Design System Files

```bash
# Copy design system documentation
cp ../TIP-SENTINEL-DESIGN-SYSTEM.md ./docs/

# Copy component files into your src/components directory
cp ../TIP-SENTINEL-COMPONENTS.jsx ./src/components/
cp ../TIP-SENTINEL-STYLED-COMPONENTS.jsx ./src/components/
# OR
cp ../TIP-SENTINEL-EMOTION.jsx ./src/components/

# Copy Storybook stories
cp ../TIP-SENTINEL-STORYBOOK.stories.jsx ./src/stories/
```

### 4. Environment Variables

Create `.env.local` in the project root:

```bash
VITE_API_URL=https://api.tip.veyrnox.com
VITE_THEME=sentinel
VITE_ENVIRONMENT=production

# Cloudflare Pages specific
CLOUDFLARE_PAGES_BUILD_COMMAND=npm run build
CLOUDFLARE_PAGES_FRAMEWORK=vite
```

---

## Implementation Steps

### Step 1: Integrate Global Styles

**File:** `src/styles/global.css` (or create if doesn't exist)

```css
:root {
  /* Color Palette */
  --color-surface-primary: #0d1117;
  --color-surface-secondary: #161b22;
  --color-surface-tertiary: #21262d;
  --color-surface-hover: rgba(88, 166, 255, 0.05);

  --color-text-primary: #e6edf3;
  --color-text-secondary: #8b949e;
  --color-text-tertiary: #6e7681;

  --color-accent-primary: #58a6ff;
  --color-accent-hover: #79c0ff;

  --color-success: #3fb950;
  --color-warning: #d29922;
  --color-danger: #f85149;

  /* Spacing */
  --spacing-xs: 8px;
  --spacing-sm: 12px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Transitions */
  --transition-quick: 120ms cubic-bezier(0.16, 1, 0.3, 1);
}

html, body {
  background-color: var(--color-surface-primary);
  color: var(--color-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif;
  line-height: 1.5;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Step 2: Update Component Imports

**File:** `src/components/index.js` (or equivalent)

```javascript
// Core dashboard components
export { StatCard } from './TIP-SENTINEL-COMPONENTS';
export { DataTable } from './TIP-SENTINEL-COMPONENTS';
export { ChartContainer } from './TIP-SENTINEL-COMPONENTS';
export { ActivityList } from './TIP-SENTINEL-COMPONENTS';

// Extended components
export { Modal } from './TIP-SENTINEL-EXTENDED-COMPONENTS';
export { Toast, ToastContainer } from './TIP-SENTINEL-EXTENDED-COMPONENTS';
export { Drawer } from './TIP-SENTINEL-EXTENDED-COMPONENTS';

// If using Styled Components
export { tipTheme } from './TIP-SENTINEL-STYLED-COMPONENTS';

// If using Emotion
export { tipThemeEmotion } from './TIP-SENTINEL-EMOTION';
```

### Step 3: Update Main Dashboard Component

**File:** `src/pages/Dashboard.jsx` (or equivalent)

```javascript
import { ThemeProvider } from 'styled-components';
// OR: import { ThemeProvider } from '@emotion/react';
import { tipTheme } from '../components/TIP-SENTINEL-STYLED-COMPONENTS';
import { StatCard, DataTable, ChartContainer, ActivityList } from '../components';

export default function Dashboard({ data }) {
  return (
    <ThemeProvider theme={tipTheme}>
      <div className="dashboard">
        <header className="dashboard__header">
          <h1>TIP Intelligence Dashboard</h1>
        </header>

        <main className="dashboard__content">
          {/* Verdict Stats */}
          <section>
            <h2>Verdict Statistics (24h)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
              <StatCard
                label="Allow"
                value={data.stats.allow}
                meta={`7d: ${data.stats.allow7d}`}
                severity="allow"
              />
              {/* ...more cards */}
            </div>
          </section>

          {/* Charts & Tables */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <ChartContainer title="Verdict Timeline">
              {/* Your chart component */}
            </ChartContainer>
            <DataTable columns={columns} rows={data.iocs} />
          </div>

          {/* Activity */}
          <ActivityList items={data.activity} />
        </main>
      </div>
    </ThemeProvider>
  );
}
```

### Step 4: Update Styling Classes

Replace old class names with new Sentinel-aligned classes:

**Before:**
```html
<div class="stat-box">
  <div class="value">0</div>
</div>
```

**After:**
```jsx
<StatCard
  label="Allow (24h)"
  value="0"
  meta="7d: 2 · 30d: 2"
  severity="allow"
/>
```

### Step 5: Run Storybook for Local Testing

```bash
npm run storybook
```

This opens Storybook at `http://localhost:6006` where you can see all components in isolation.

---

## Testing & Verification

### 1. Local Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` (or your configured port) and verify:
- [ ] Page loads with Sentinel dark theme
- [ ] All stat cards display correctly
- [ ] Hover effects work smoothly
- [ ] Data tables are readable
- [ ] Charts render properly
- [ ] Mobile responsive (375px - 1280px)
- [ ] No console errors

### 2. Accessibility Audit

```bash
# Install axe DevTools or Lighthouse
# Run accessibility check
npx lighthouse http://localhost:5173 --view
```

Verify:
- [ ] Color contrast ≥ 4.5:1 (AA standard)
- [ ] Focus rings visible on all interactive elements
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Screen reader announces labels correctly
- [ ] No focus traps

### 3. Performance Check

```bash
# Build production bundle
npm run build

# Test build output
npm run preview
```

Verify:
- [ ] Bundle size reasonable (< 500KB gzipped)
- [ ] Page loads in < 2 seconds
- [ ] LCP (Largest Contentful Paint) < 2.5s
- [ ] No layout shifts (CLS < 0.1)

### 4. Browser Compatibility

Test on:
- [ ] Chrome/Edge (latest 2 versions)
- [ ] Firefox (latest 2 versions)
- [ ] Safari (iOS 15+)
- [ ] Mobile browsers (Android Chrome, iOS Safari)

### 5. Dark Mode Verification

```bash
# Force dark mode in browser DevTools
# Verify all colors render correctly
```

- [ ] Text contrast maintained
- [ ] Borders visible
- [ ] Shadows subtle and effective
- [ ] No white flashes

---

## Deployment

### 1. Build Verification

```bash
# Clean build
rm -rf node_modules/.vite
npm run build

# Check output
ls -lah dist/
```

### 2. Staging Deployment (Optional)

If you have a staging environment:

```bash
# Deploy to staging branch
git push origin feat/sentinel-design-system

# Test on staging URL
# https://staging-tip.veyrnox.com/dashboard
```

### 3. Production Deployment via Cloudflare Pages

#### Option A: Git Integration (Recommended)

1. **Connect Repository to Cloudflare Pages:**
   - Log into Cloudflare dashboard
   - Navigate to Pages → Create project
   - Connect your Git repository (GitHub/GitLab)
   - Select branch: `feat/sentinel-design-system`
   - Build settings:
     - Framework preset: Vite
     - Build command: `npm run build`
     - Build output directory: `dist`

2. **Environment Variables:**
   - Add any required env vars in Cloudflare Pages dashboard
   - Match local `.env.local` settings

3. **Deploy:**
   ```bash
   # Push your branch
   git push origin feat/sentinel-design-system
   
   # Cloudflare automatically builds and deploys
   # Monitor at: https://dash.cloudflare.com/pages
   ```

#### Option B: Manual Upload

```bash
# Build locally
npm run build

# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
wrangler pages deploy dist/
```

#### Option C: GitHub Actions (CI/CD)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches:
      - feat/sentinel-design-system

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - run: npm ci
      - run: npm run build
      
      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: tip-dashboard
          directory: dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

### 4. Production URL Verification

After deployment, verify the live dashboard:

```bash
# Test production dashboard
curl -I https://tip.veyrnox.com/dashboard

# Verify CSS loads
curl https://tip.veyrnox.com/dashboard | grep "color-surface-primary"

# Check performance
npx lighthouse https://tip.veyrnox.com/dashboard --view
```

### 5. DNS & Routing (If applicable)

If using custom domain:

```bash
# Verify CNAME or A records point to Cloudflare
dig tip.veyrnox.com +short

# Should return Cloudflare nameserver IPs
```

---

## Rollback Procedures

### Quick Rollback (< 5 minutes)

1. **Revert Cloudflare Pages Deployment:**
   - Cloudflare dashboard → Pages
   - Click on "Deployments"
   - Select previous green deployment
   - Click "Rollback to this deployment"

2. **Verify Rollback:**
   ```bash
   curl https://tip.veyrnox.com/dashboard
   # Should show old design
   ```

### Full Rollback (Git)

```bash
# Revert to previous commit
git revert HEAD

# Push revert
git push origin feat/sentinel-design-system

# Cloudflare automatically redeploys old version
```

### Emergency Fallback

If DNS/routing is broken:

```bash
# Switch DNS to backup origin server
# Contact Cloudflare support if needed

# Or serve static snapshot
# Deploy previous build to backup endpoint
```

---

## Monitoring & Support

### 1. Real-Time Monitoring

**Cloudflare Analytics:**
- Dashboard → Analytics
- Monitor requests, errors, response times
- Set up alerts for error rate > 1%

**Browser Console Errors:**
```javascript
// Add error tracking
window.addEventListener('error', (e) => {
  console.error('Dashboard error:', e.message, e.filename, e.lineno);
  // Send to error tracking service (Sentry, etc.)
});
```

### 2. Performance Monitoring

```javascript
// Monitor Core Web Vitals
web-vital-analytics.js example:
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log); // Cumulative Layout Shift
getFID(console.log); // First Input Delay
getFCP(console.log); // First Contentful Paint
getLCP(console.log); // Largest Contentful Paint
getTTFB(console.log); // Time to First Byte
```

### 3. User Feedback Collection

Add feedback widget to dashboard:

```javascript
<!-- Feedback button in corner -->
<button id="feedback-btn" style={{
  position: 'fixed',
  bottom: '20px',
  right: '20px',
  padding: '12px 20px',
  background: '#58a6ff',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer'
}}>
  ? Feedback
</button>

<script>
  document.getElementById('feedback-btn').onclick = () => {
    const message = prompt('How can we improve the dashboard?');
    if (message) {
      // Send to feedback endpoint
      fetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ message, url: window.location.href })
      });
    }
  };
</script>
```

### 4. Support Runbook

**Issue: Styling not loading**
```bash
# Check CSS variables
chrome devtools → elements → computed styles
# Should show --color-* variables

# Verify no CSS errors
chrome devtools → console
# Should have no stylesheet errors
```

**Issue: Slow page load**
```bash
# Check bundle size
npm run build
du -h dist/

# If > 500KB, analyze:
npm install --save-dev webpack-bundle-analyzer
# Add to build process
```

**Issue: Dark mode text unreadable**
```bash
# Check contrast ratio
# DevTools → Accessibility → Contrast
# Must be ≥ 4.5:1

# If failed, update color tokens in design system
```

### 5. Escalation Path

1. **L1 - Dashboard Team:** Check Cloudflare dashboard, redeploy
2. **L2 - Frontend Team:** Debug CSS/JS issues, check browser console
3. **L3 - Infrastructure:** Check DNS, Cloudflare configs, backend APIs
4. **L4 - Third-party:** Contact Cloudflare support if needed

---

## Post-Deployment Checklist

- [ ] Live dashboard loads at https://tip.veyrnox.com/dashboard
- [ ] Sentinel design visible (dark theme, correct colors)
- [ ] All interactive elements respond correctly
- [ ] No console errors
- [ ] Mobile responsive (tested on phone)
- [ ] Accessibility passes (keyboard nav, screen reader)
- [ ] Performance metrics acceptable
- [ ] Team notified of live status
- [ ] Documentation updated
- [ ] Support team briefed on changes
- [ ] Monitoring alerts configured

---

## Troubleshooting

### CSS Variables Not Applied

**Symptom:** Page shows old colors

**Fix:**
```bash
# Clear Cloudflare cache
# Cloudflare dashboard → Caching → Purge everything

# Or add cache busting to CSS
<link rel="stylesheet" href="style.css?v=1.0.1">

# Force browser refresh
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
```

### Fonts Not Loading

**Symptom:** Text renders in serif (fallback font)

**Fix:**
```css
/* Add font-face declarations */
@font-face {
  font-family: 'SF Pro Display';
  src: url('/fonts/sf-pro-display.woff2') format('woff2');
  font-display: swap;
}
```

### Chart Not Rendering

**Symptom:** Empty chart container

**Fix:**
```javascript
// Check if chart library loaded
console.log(window.Recharts || window.Chart);

// If undefined, check imports
import { LineChart, Line } from 'recharts';

// Verify data passed correctly
console.log('Chart data:', chartData);
```

### Mobile Layout Broken

**Symptom:** Layout doesn't stack on small screens

**Fix:**
```css
/* Add mobile breakpoint */
@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr !important;
  }
  
  .stat-card {
    width: 100%;
  }
}
```

---

## Support Contacts

- **Cloudflare Support:** support@cloudflare.com
- **Frontend Team Lead:** @team-lead
- **Design System Owner:** @designer
- **Incident Channel:** #dashboard-incidents (Slack)

---

## Additional Resources

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [Web Vitals Measurement](https://web.dev/vitals/)
- [WCAG 2.1 Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Design System Documentation](./TIP-SENTINEL-DESIGN-SYSTEM.md)
- [Component Library](./TIP-SENTINEL-COMPONENTS.jsx)

---

**Deployment Completed:** When this guide is followed, you'll have the TIP Intelligence Dashboard live with a professional Microsoft Sentinel-style design on Cloudflare Pages.

**Need Help?** Refer to the troubleshooting section or contact the support team.
