import { useState, useEffect, useRef } from "react";
import { base44, LLM_AVAILABLE } from "@/api/base44Client";
import { Send, Bot, Trash2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import LocalBuildNotice from "@/components/LocalBuildNotice";
import ReactMarkdown from "react-markdown";

const AGENT_NAME = "assistant";

const SUGGESTED_PROMPTS = [
  "What's the current sentiment around Bitcoin?",
  "How do I reduce my crypto tax liability?",
  "Explain DCA strategy and its benefits",
  "What is a good portfolio allocation for a moderate risk investor?",
  "How do I stay safe from crypto scams?",
];

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  if (!message.content && !message.tool_calls?.length) return null;

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? "flex flex-col items-end" : ""}`}>
        {message.content && (
          <div className={`rounded-2xl px-4 py-2.5 ${isUser ? "bg-primary text-primary-foreground" : "bg-secondary border border-border"}`}>
            {isUser ? (
              <p className="text-sm leading-relaxed">{message.content}</p>
            ) : (
              <ReactMarkdown
                className="text-sm prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                components={{
                  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li className="my-0">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  code: ({ children }) => <code className="px-1 py-0.5 rounded bg-background/50 text-xs font-mono">{children}</code>,
                  a: ({ children, href }) => {
                    // Only allow https/http — block javascript: and data: URIs that
                    // an untrusted LLM backend (I5) could inject (VULN-3 fix).
                    const safeHref = /^https?:\/\//i.test(href ?? '') ? href : '#';
                    return <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-primary underline">{children}</a>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}
        {message.tool_calls?.length > 0 && message.tool_calls.map((tc, i) => (
          <div key={i} className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-lg border border-border/50">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>{tc.status === "running" || tc.status === "in_progress" ? "Thinking..." : tc.name?.replace(/_/g, " ")}</span>
            {(tc.status === "running" || tc.status === "in_progress") && (
              <span className="ml-1 flex gap-0.5">
                {[0,1,2].map(i => <span key={i} className="h-1 w-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AIAssistant() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    if (!LLM_AVAILABLE) return;
    const list = await (/** @type {any} */ (base44)).agents.listConversations({ agent_name: AGENT_NAME });
    setConversations(list || []);
  };

  const startNewConversation = async () => {
    if (!LLM_AVAILABLE) return;
    const conv = await (/** @type {any} */ (base44)).agents.createConversation({
      agent_name: AGENT_NAME,
      metadata: { name: `Chat ${new Date().toLocaleDateString()}` },
    });
    setConversation(conv);
    setMessages([]);
    setShowHistory(false);
    await loadConversations();
    inputRef.current?.focus();
  };

  const openConversation = async (convId) => {
    if (!LLM_AVAILABLE) return;
    const conv = await (/** @type {any} */ (base44)).agents.getConversation(convId);
    setConversation(conv);
    setMessages(conv.messages || []);
    setShowHistory(false);
  };

  useEffect(() => {
    if (!LLM_AVAILABLE) return;
    if (!conversation?.id) return;
    const unsub = (/** @type {any} */ (base44)).agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
      setSending(false);
    });
    return unsub;
  }, [conversation?.id]);

  const send = async (text) => {
    if (!LLM_AVAILABLE) return;
    const msg = text || input.trim();
    if (!msg || sending) return;
    setInput("");

    let conv = conversation;
    if (!conv) {
      conv = await (/** @type {any} */ (base44)).agents.createConversation({
        agent_name: AGENT_NAME,
        metadata: { name: msg.slice(0, 40) },
      });
      setConversation(conv);
      await loadConversations();
    }

    setSending(true);
    setMessages(prev => [...prev, { role: "user", content: msg, id: Date.now() }]);
    await (/** @type {any} */ (base44)).agents.addMessage(conv, { role: "user", content: msg });
  };

  const isStreaming = messages.some(m => m.tool_calls?.some(tc => tc.status === "running" || tc.status === "in_progress")) || (sending && messages[messages.length - 1]?.role === "user");

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold">VEYRNOX AI</h1>
            <p className="text-xs text-muted-foreground">Your crypto co-pilot</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={() => { setShowHistory(h => !h); }}>
            <Trash2 className="h-3.5 w-3.5" /> History
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={startNewConversation}>
            <Plus className="h-3.5 w-3.5" /> New Chat
          </Button>
        </div>
      </div>

      {/* Conversation history panel */}
      {showHistory && (
        <div className="mb-3 border border-border rounded-xl overflow-hidden bg-card">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Chats</p>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">No previous conversations</p>
            ) : conversations.map(c => (
              <button key={c.id} onClick={() => openConversation(c.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors border-b border-border/50 last:border-0 ${conversation?.id === c.id ? "bg-primary/5 text-primary" : ""}`}>
                {c.metadata?.name || "Untitled Chat"}
                <span className="block text-xs text-muted-foreground">{new Date(c.created_date).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-2">
        {!LLM_AVAILABLE && messages.length === 0 && (
          <div className="py-4">
            <LocalBuildNotice
              feature="AI chat"
              detail="It needs a connection to an LLM service, which this offline-first build doesn't include. The rest of the app stays fully local and usable; only the AI chat is disabled."
            />
          </div>
        )}
        {LLM_AVAILABLE && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold mb-1">How can I help you today?</p>
              <p className="text-sm text-muted-foreground">Ask me anything about crypto, DeFi, portfolio strategy, or platform features.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 w-full max-w-md">
              {SUGGESTED_PROMPTS.map(p => (
                <button key={p} onClick={() => send(p)}
                  className="text-left text-sm px-4 py-2.5 rounded-xl border border-border bg-card hover:bg-secondary hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => <MessageBubble key={msg.id || i} message={msg} />)}
        {isStreaming && messages[messages.length - 1]?.role === "user" && (
          <div className="flex gap-3 justify-start">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-secondary border border-border rounded-2xl px-4 py-3 flex gap-1 items-center">
              {[0,1,2].map(i => <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-3 border-t border-border">
        <div className="flex gap-2 items-end bg-secondary rounded-2xl px-4 py-2 border border-border focus-within:border-primary/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={LLM_AVAILABLE ? "Ask anything about crypto, DeFi, your portfolio..." : "AI chat unavailable in this build"}
            disabled={!LLM_AVAILABLE}
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm outline-none placeholder:text-muted-foreground max-h-32 py-1 disabled:cursor-not-allowed"
            style={{ fieldSizing: "content" }}
          />
          <Button size="icon" className="h-8 w-8 shrink-0 rounded-xl" disabled={!input.trim() || sending || !LLM_AVAILABLE} onClick={() => send()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">Not financial advice · Press Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}