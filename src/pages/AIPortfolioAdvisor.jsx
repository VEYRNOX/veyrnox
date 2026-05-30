import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Sparkles, Send, Loader2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";

const USD_RATES = { BTC: 68000, ETH: 3200, SOL: 165, USDC: 1, USDT: 1 };

const SUGGESTED_PROMPTS = [
  "Analyse my portfolio and suggest rebalancing",
  "What is my biggest risk exposure right now?",
  "Should I DCA into ETH this month?",
  "Summarise my recent trading performance",
  "How diversified is my portfolio?",
];

export default function AIPortfolioAdvisor() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hello! I'm your AI portfolio advisor. I have full context of your wallets, transactions, and holdings. Ask me anything about your crypto strategy." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: wallets = [] } = useQuery({ queryKey: ["wallets"], queryFn: () => base44.entities.Wallet.list() });
  const { data: transactions = [] } = useQuery({ queryKey: ["transactions"], queryFn: () => base44.entities.Transaction.list("-created_date", 50) });
  const { data: stakingPositions = [] } = useQuery({ queryKey: ["staking"], queryFn: () => base44.entities.StakingPosition.list() });
  const { data: plRecords = [] } = useQuery({ queryKey: ["pl-records"], queryFn: () => base44.entities.PLRecord.list() });

  const buildContext = () => {
    const totalUSD = wallets.reduce((s, w) => s + (w.balance || 0) * (USD_RATES[w.currency] || 1), 0);
    const breakdown = wallets.map(w => `${w.name}: ${w.balance} ${w.currency} (~$${((w.balance || 0) * (USD_RATES[w.currency] || 1)).toFixed(0)})`).join(", ");
    const recentTxs = transactions.slice(0, 10).map(t => `${t.type} ${t.amount} ${t.currency}`).join(", ");
    const staking = stakingPositions.filter(s => s.status === "active").map(s => `${s.staked_amount} ${s.currency} @ ${s.apy}% APY`).join(", ");
    const pnl = plRecords.filter(p => p.status === "closed").reduce((s, p) => s + (p.pnl_usd || 0), 0);
    return `Portfolio total: $${totalUSD.toFixed(0)}. Wallets: ${breakdown || "none"}. Recent transactions: ${recentTxs || "none"}. Active staking: ${staking || "none"}. Realised P&L: $${pnl.toFixed(2)}.`;
  };

  const sendMessage = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg) return;
    setMessages(m => [...m, { role: "user", content: userMsg }]);
    setInput("");
    setLoading(true);
    try {
      const context = buildContext();
      const history = messages.slice(-6).map(m => `${m.role === "user" ? "User" : "Advisor"}: ${m.content}`).join("\n");
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert cryptocurrency portfolio advisor. You have access to the user's real portfolio data:\n\n${context}\n\nConversation so far:\n${history}\n\nUser: ${userMsg}\n\nProvide a concise, actionable response. Use markdown formatting. Be specific to their actual portfolio data.`,
        model: "claude_sonnet_4_6",
      });
      setMessages(m => [...m, { role: "assistant", content: response }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Sorry, I couldn't process that. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> AI Portfolio Advisor
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Personalised advice powered by your real portfolio data</p>
      </div>

      {/* Suggested prompts */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {SUGGESTED_PROMPTS.map(p => (
            <button key={p} onClick={() => sendMessage(p)} className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/40 bg-secondary hover:bg-secondary/80 transition-colors text-left">
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
              {msg.role === "assistant" ? (
                <ReactMarkdown className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {msg.content}
                </ReactMarkdown>
              ) : msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-card border border-border rounded-2xl px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !loading && sendMessage()}
          placeholder="Ask about your portfolio..."
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={() => sendMessage()} disabled={!input.trim() || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}