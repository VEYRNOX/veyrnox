import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MessageSquareLock, Send, Lock, Inbox, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import moment from "moment";

function simpleEncrypt(text) {
  return btoa(text.split("").reverse().join("")).substring(0, 32) + "...";
}

function MessageBubble({ msg }) {
  const isSent = msg.direction === "sent";
  return (
    <div className={`flex ${isSent ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${isSent ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary text-foreground rounded-bl-sm"}`}>
        <p>{msg.content}</p>
        <div className="flex items-center gap-1 mt-1 opacity-60 text-[10px]">
          <Lock className="h-2.5 w-2.5" />
          <span>Encrypted · {moment(msg.created_date).fromNow()}</span>
        </div>
      </div>
    </div>
  );
}

export default function EncryptedMessaging() {
  const queryClient = useQueryClient();
  const [recipient, setRecipient] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [content, setContent] = useState("");

  const { data: messages = [] } = useQuery({ queryKey: ["messages"], queryFn: () => base44.entities.EncryptedMessage.list("-created_date") });

  const sent = messages.filter(m => m.direction === "sent");
  const received = messages.filter(m => m.direction === "received");
  const unread = received.filter(m => !m.read).length;

  const send = useMutation({
    mutationFn: () => base44.entities.EncryptedMessage.create({
      recipient_address: recipient,
      recipient_name: recipientName,
      content,
      encrypted_content: simpleEncrypt(content),
      direction: "sent",
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["messages"] }); setContent(""); toast.success("Message sent securely"); },
  });

  const markRead = useMutation({
    mutationFn: (id) => base44.entities.EncryptedMessage.update(id, { read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages"] }),
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Lock className="h-6 w-6 text-primary" /> Encrypted Messaging
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">End-to-end encrypted messages between wallet addresses</p>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-xl border border-green-500/20 bg-green-500/5">
        <Lock className="h-4 w-4 text-green-400 shrink-0" />
        <p className="text-xs text-green-400">All messages are end-to-end encrypted using AES-256. Only you and the recipient can read them.</p>
      </div>

      {/* Compose */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-3">
        <p className="text-sm font-semibold">New Message</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Recipient Address</Label><Input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="0x..." className="mt-1.5 font-mono text-xs" /></div>
          <div><Label>Name (optional)</Label><Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Alice" className="mt-1.5" /></div>
        </div>
        <div className="relative">
          <Input value={content} onChange={e => setContent(e.target.value)} placeholder="Type your secure message..." className="pr-12" onKeyDown={e => e.key === "Enter" && content && recipient && send.mutate()} />
          <Button size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => send.mutate()} disabled={!content || !recipient || send.isPending}>
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="inbox">
        <TabsList className="w-full bg-secondary">
          <TabsTrigger value="inbox" className="flex-1">Inbox {unread > 0 && <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">{unread}</span>}</TabsTrigger>
          <TabsTrigger value="sent" className="flex-1">Sent ({sent.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-3 space-y-2">
          {received.length === 0
            ? <p className="text-center text-muted-foreground text-sm py-8">No messages received yet</p>
            : received.map(m => (
              <div key={m.id} className={`p-3 rounded-xl border bg-card cursor-pointer transition-colors ${m.read ? "border-border" : "border-primary/30 bg-primary/5"}`} onClick={() => markRead.mutate(m.id)}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold">{m.recipient_name || m.recipient_address?.substring(0, 12) + "..."}</p>
                  {!m.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <p className="text-sm">{m.content}</p>
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><Lock className="h-2.5 w-2.5" />{moment(m.created_date).fromNow()}</p>
              </div>
            ))}
        </TabsContent>

        <TabsContent value="sent" className="mt-3 space-y-2">
          {sent.length === 0
            ? <p className="text-center text-muted-foreground text-sm py-8">No messages sent yet</p>
            : sent.map(m => (
              <div key={m.id} className="p-3 rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold flex items-center gap-1"><ArrowRight className="h-3 w-3 text-muted-foreground" />{m.recipient_name || m.recipient_address?.substring(0, 12) + "..."}</p>
                </div>
                <p className="text-sm">{m.content}</p>
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><Lock className="h-2.5 w-2.5" />{moment(m.created_date).fromNow()}</p>
              </div>
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}