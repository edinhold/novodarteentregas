import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare, Circle } from "lucide-react";

interface SupportChatProps {
  currentUserId: string;
  otherUserId: string;
  title?: string;
  maxHeight?: string;
  online?: boolean;
}

/**
 * Direct 1:1 chat between an admin and any single user (driver / store owner).
 * Uses the public.admin_direct_messages table.
 */
const SupportChat = ({ currentUserId, otherUserId, title = "Conversa", maxHeight = "max-h-72", online }: SupportChatProps) => {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const queryKey = ["admin-dm", [currentUserId, otherUserId].sort().join(":")];

  const { data: messages = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_direct_messages" as any)
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUserId})`
        )
        .order("created_at");
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!currentUserId && !!otherUserId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!currentUserId || !otherUserId) return;
    const channel = supabase
      .channel(`admin-dm-${[currentUserId, otherUserId].sort().join("-")}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_direct_messages" },
        (payload: any) => {
          const row = payload.new;
          const involves =
            (row.sender_id === currentUserId && row.recipient_id === otherUserId) ||
            (row.sender_id === otherUserId && row.recipient_id === currentUserId);
          if (involves) qc.invalidateQueries({ queryKey });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, otherUserId, qc]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const msg = text.trim();
    if (!msg) return;
    setText("");
    const { error } = await supabase.from("admin_direct_messages" as any).insert({
      sender_id: currentUserId,
      recipient_id: otherUserId,
      message: msg,
    } as any);
    if (error) {
      console.error("send dm error", error);
      setText(msg);
    } else {
      qc.invalidateQueries({ queryKey });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> {title}
          {typeof online === "boolean" && (
            <span className={`ml-auto flex items-center gap-1 text-[11px] ${online ? "text-green-600" : "text-muted-foreground"}`}>
              <Circle className={`w-2 h-2 ${online ? "fill-green-500 text-green-500" : "fill-muted-foreground/40 text-muted-foreground/40"}`} />
              {online ? "Online" : "Offline"}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={scrollRef} className={`${maxHeight} overflow-y-auto space-y-2 bg-muted/30 rounded-lg p-3`}>
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma mensagem ainda. Inicie a conversa!</p>
          )}
          {messages.map((m: any) => (
            <div key={m.id} className={`flex ${m.sender_id === currentUserId ? "justify-end" : "justify-start"}`}>
              <div className={`px-3 py-2 rounded-xl max-w-[80%] text-sm ${m.sender_id === currentUserId ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                <p className="whitespace-pre-wrap break-words">{m.message}</p>
                <p className={`text-[10px] mt-1 ${m.sender_id === currentUserId ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite uma mensagem..."
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <Button size="icon" onClick={send} disabled={!text.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SupportChat;
