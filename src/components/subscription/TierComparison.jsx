// Side-by-side Free / Safety Plus / AI Security Protection comparison.
// Rows come from subscriptionCopy.COMPARISON_ROWS (only rows confirmed against
// the entitlement code). Uses a real <table> so screen readers get row/column
// headers; the "not available" cell reads "Not included", never a bare dash.
import { COMPARISON_ROWS } from '@/lib/subscriptionCopy';

const LABEL = { included: 'Included', baseline: 'Baseline', enhanced: 'Enhanced' };
const COLUMNS = [
  { key: 'free', label: 'Free' },
  { key: 'safety_plus', label: 'Safety Plus' },
  { key: 'ai_security_protection', label: 'AI Security Protection' },
];

export default function TierComparison({ rows = COMPARISON_ROWS }) {
  return (
    <div className="overflow-x-auto" data-testid="tier-comparison">
      <table className="w-full text-xs border-collapse">
        <caption className="sr-only">
          What each plan includes. AI Security Protection includes Safety Plus, and Safety Plus
          builds on Free.
        </caption>
        <thead>
          <tr className="text-start">
            <th scope="col" className="text-start font-semibold py-2 pe-2">Capability</th>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" className="text-center font-semibold py-2 px-1">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.capability} className="border-t border-border">
              <th scope="row" className="text-start font-normal py-2 pe-2">{row.capability}</th>
              {COLUMNS.map((c) => {
                const v = row[c.key];
                return (
                  <td
                    key={c.key}
                    className={`text-center py-2 px-1 ${v ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {v ? LABEL[v] : <span aria-label="Not included">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
