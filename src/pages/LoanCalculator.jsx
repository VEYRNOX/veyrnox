import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Calculator, TrendingDown, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function LoanCalculator() {
  const [principal, setPrincipal] = useState("10000");
  const [rate, setRate] = useState("8.5");
  const [termMonths, setTermMonths] = useState("12");
  const [selectedLoanId, setSelectedLoanId] = useState("manual");

  const { data: loans = [] } = useQuery({ queryKey: ["crypto-loans"], queryFn: () => base44.entities.CryptoLoan.filter({ status: "active" }) });

  const calc = useMemo(() => {
    const P = parseFloat(principal) || 0;
    const r = (parseFloat(rate) || 0) / 100 / 12;
    const n = parseInt(termMonths) || 1;
    if (!P || !r) {
      const monthly = P / n;
      return { monthly, total: P, interest: 0, schedule: Array.from({ length: n }, (_, i) => ({ month: i + 1, payment: monthly, interest: 0, balance: P - monthly * (i + 1) })) };
    }
    const monthly = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const total = monthly * n;
    const interest = total - P;
    let balance = P;
    const schedule = Array.from({ length: n }, (_, i) => {
      const interestPayment = balance * r;
      const principalPayment = monthly - interestPayment;
      balance -= principalPayment;
      return { month: i + 1, payment: parseFloat(monthly.toFixed(2)), interest: parseFloat(interestPayment.toFixed(2)), principal: parseFloat(principalPayment.toFixed(2)), balance: parseFloat(Math.max(balance, 0).toFixed(2)) };
    });
    return { monthly, total, interest, schedule };
  }, [principal, rate, termMonths]);

  const loadLoan = (loan) => {
    setPrincipal(loan.borrow_amount?.toString() || "");
    setRate(loan.interest_rate?.toString() || "");
    const dueDate = loan.due_date ? new Date(loan.due_date) : null;
    if (dueDate) {
      const months = Math.max(1, Math.round((dueDate - new Date()) / (1000 * 60 * 60 * 24 * 30)));
      setTermMonths(months.toString());
    }
  };

  const fmt = (n) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Loan Repayment Calculator</h1>
        <p className="text-sm text-muted-foreground">Plan your crypto loan payoff schedule</p>
      </div>

      {/* Loan selector */}
      {loans.length > 0 && (
        <div className="p-3 rounded-xl border border-border bg-card">
          <p className="text-xs text-muted-foreground mb-2">Load from existing loan</p>
          <div className="flex gap-2 flex-wrap">
            {loans.map(l => (
              <button key={l.id} onClick={() => loadLoan(l)}
                className="px-3 py-1.5 rounded-lg text-xs bg-secondary hover:bg-primary/10 hover:text-primary border border-border transition-colors">
                {l.borrow_asset} ${l.borrow_amount?.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inputs */}
      <div className="p-5 rounded-xl border border-border bg-card grid grid-cols-3 gap-4">
        <div><Label className="text-xs">Loan Amount (USD)</Label><Input className="mt-1.5" type="number" value={principal} onChange={e => setPrincipal(e.target.value)} placeholder="10000" /></div>
        <div><Label className="text-xs">Interest Rate (% APR)</Label><Input className="mt-1.5" type="number" step="0.1" value={rate} onChange={e => setRate(e.target.value)} placeholder="8.5" /></div>
        <div><Label className="text-xs">Term (months)</Label>
          <Select value={termMonths} onValueChange={setTermMonths}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 3, 6, 12, 18, 24, 36].map(m => <SelectItem key={m} value={m.toString()}>{m} mo</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Monthly Payment", value: fmt(calc.monthly), icon: <Calendar className="h-4 w-4 text-primary" /> },
          { label: "Total Interest", value: fmt(calc.interest), icon: <TrendingDown className="h-4 w-4 text-destructive" /> },
          { label: "Total Cost", value: fmt(calc.total), icon: <Calculator className="h-4 w-4 text-foreground" /> },
        ].map(c => (
          <div key={c.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <div className="flex justify-center mb-1">{c.icon}</div>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="font-bold mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="chart">
        <TabsList className="w-full bg-secondary"><TabsTrigger value="chart" className="flex-1">Chart</TabsTrigger><TabsTrigger value="schedule" className="flex-1">Schedule</TabsTrigger></TabsList>

        <TabsContent value="chart" className="mt-3">
          <div className="p-4 rounded-xl border border-border bg-card">
            <p className="text-sm font-semibold mb-4">Monthly Breakdown</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={calc.schedule.slice(0, 24)} barCategoryGap="20%">
                <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: "Month", position: "insideBottom", offset: -2, fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                <Bar dataKey="principal" stackId="a" fill="#f97316" name="Principal" radius={[0, 0, 0, 0]} />
                <Bar dataKey="interest" stackId="a" fill="#ef4444" name="Interest" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="schedule" className="mt-3">
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr>{["Month", "Payment", "Principal", "Interest", "Balance"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calc.schedule.map(row => (
                  <tr key={row.month} className="hover:bg-secondary/50 transition-colors">
                    <td className="px-4 py-2 text-muted-foreground">{row.month}</td>
                    <td className="px-4 py-2 font-medium">{fmt(row.payment)}</td>
                    <td className="px-4 py-2 text-primary">{fmt(row.principal || 0)}</td>
                    <td className="px-4 py-2 text-destructive">{fmt(row.interest)}</td>
                    <td className="px-4 py-2">{fmt(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}