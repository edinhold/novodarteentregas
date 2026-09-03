import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare } from "lucide-react";

interface ChatWidgetProps {
  deliveryRequestId: string;
  currentUserId: string;
  title?: string;
  maxHeight?: string;
}

const ChatWidget = ({ deliveryRequestId, currentUserId, title = "Chat", maxHeight = "max-h-60" }: ChatWidgetProps) => {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["chat-messages", deliveryRequestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("delivery_request_id", deliveryRequestId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!deliveryRequestId,
    refetchInterval: 5000,
  });

  // Realtime
  useEffect(() => {
    if (!deliveryRequestId) return;
    const channel = supabase
      .channel(`chat-${deliveryRequestId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `delivery_request_id=eq.${deliveryRequestId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["chat-messages", deliveryRequestId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [deliveryRequestId, queryClient]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    try {
      const { error } = await supabase.from("chat_messages").insert({
        delivery_request_id: deliveryRequestId,
        sender_id: currentUserId,
        message: message.trim(),
      });
      if (error) throw error;
      setMessage("");
    } catch {
      // silent fail
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={scrollRef} className={`${maxHeight} overflow-y-auto space-y-2 bg-muted/30 rounded-lg p-3`}>
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma mensagem ainda. Inicie a conversa!</p>
          )}
          {messages.map((msg: any) => (
            <div key={msg.id} className={`flex ${msg.sender_id === currentUserId ? "justify-end" : "justify-start"}`}>
              <div className={`px-3 py-2 rounded-xl max-w-[80%] text-sm ${msg.sender_id === currentUserId ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                <p>{msg.message}</p>
                <p className={`text-[10px] mt-1 ${msg.sender_id === currentUserId ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                  {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Digite uma mensagem..."
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          <Button size="icon" onClick={sendMessage} disabled={!message.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChatWidget;
