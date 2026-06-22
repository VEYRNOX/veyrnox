// src/components/HonestDisabledPage.jsx
//
// Full-page honest notice for a route classified 'disabled' in the feature
// registry. It reads the registry entry for the current path and explains WHY
// the feature is off, rather than showing fabricated data. Visual language
// mirrors components/LocalBuildNotice.jsx.
import { CloudOff } from 'lucide-react';
import { getFeatureStatus } from '@/lib/featureRegistry';

const HEADINGS = {
  leaks: 'Off by default to protect your privacy',
  server: 'Not available in this build',
  unverified: 'Not yet verified',
  'off-wedge': 'Removed',
};

export default function HonestDisabledPage({ path }) {
  const entry = getFeatureStatus(path);
  const heading = HEADINGS[entry.reason] || 'Not available yet';
  return (
    <div className="max-w-md mx-auto mt-12 p-6 rounded-2xl border border-caution/30 bg-caution/5 flex items-start gap-3">
      <CloudOff className="h-6 w-6 text-caution shrink-0 mt-0.5" />
      <div className="text-sm min-w-0">
        <p className="font-semibold text-foreground">{heading}</p>
        <p className="text-muted-foreground mt-1">
          {entry.note || 'This feature is disabled until it can be done honestly.'}
        </p>
      </div>
    </div>
  );
}
