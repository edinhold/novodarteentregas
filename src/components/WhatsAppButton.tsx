import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle } from "lucide-react";

const WhatsAppButton = () => {
  const { data: config } = useQuery({
    queryKey: ["delivery-config-whatsapp"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_public_delivery_config");
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    staleTime: 60000,
  });

  const number = config?.whatsapp_number;
  if (!number) return null;

  const cleanNumber = number.replace(/\D/g, "");
  const url = `https://wa.me/${cleanNumber}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 right-4 z-50 w-14 h-14 bg-[#25D366] hover:bg-[#20bd5a] rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-110"
      aria-label="Falar no WhatsApp"
    >
      <MessageCircle className="w-7 h-7 text-white" fill="white" />
    </a>
  );
};

export default WhatsAppButton;
