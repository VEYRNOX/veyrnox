import { ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const statusIcons = {
  pending: <Clock className="h-3.5 w-3.5 text-yellow-500" />,
  confirmed: <CheckCircle2 className="h-3.5 w-3.5 text-primary" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
};

export default function TransactionList({ transactions = [] }) {
  if (!transactions.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No transactions yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors"
        >
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
            tx.type === "send" ? "bg-destructive/10" : "bg-primary/10"
          }`}>
            {tx.type === "send" ? (
              <ArrowUpRight className="h-4 w-4 text-destructive" />
            ) : (
              <ArrowDownLeft className="h-4 w-4 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium capitalize">{tx.type}</p>
              {statusIcons[tx.status]}
            </div>
            <p className="text-xs text-muted-foreground truncate font-mono">
              {tx.type === "send" ? tx.to_address : tx.from_address}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-semibold ${tx.type === "send" ? "text-destructive" : "text-primary"}`}>
              {tx.type === "send" ? "-" : "+"}{tx.amount} {tx.currency}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(tx.created_date), { addSuffix: true })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}