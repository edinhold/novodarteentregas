import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Store, Mail, Lock, Phone, User, MapPin, ImageIcon, Upload } from "lucide-react";
import { motion } from "framer-motion";

const RegisterStoreOwner = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    restaurantName: "",
    restaurantAddress: "",
    deliveryTime: "30-45 min",
    deliveryFee: "5",
    minOrder: "15",
  });




  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (type: "logo" | "image", file: File | null) => {
    if (!file) return;
    if (type === "logo") {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    } else {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const uploadFile = async (file: File, userId: string, prefix: string): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `${userId}/${prefix}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("restaurant-images").upload(path, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("restaurant-images").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;

      if (data.user) {
        await supabase.from("profiles").update({ phone: form.phone }).eq("user_id", data.user.id);

        // Upload images
        let logoUrl: string | null = null;
        let imageUrl: string | null = null;
        if (logoFile) logoUrl = await uploadFile(logoFile, data.user.id, "logo");
        if (imageFile) imageUrl = await uploadFile(imageFile, data.user.id, "image");

        // Create restaurant
        const { error: restError } = await supabase.from("restaurants").insert({
          name: form.restaurantName,
          address: form.restaurantAddress,
          category_name: "Geral",
          delivery_time: form.deliveryTime,
          delivery_fee: parseFloat(form.deliveryFee) || 0,
          min_order: parseFloat(form.minOrder) || 0,
          owner_id: data.user.id,
          logo: logoUrl,
          image: imageUrl,
        });
        if (restError) throw restError;

        // Assign store_owner role
        const { error: roleError } = await supabase.from("user_roles").insert({ user_id: data.user.id, role: "store_owner" as any });
        if (roleError) throw roleError;
      }

      toast.success("Cadastro de lojista realizado com sucesso!");
      navigate("/lojista");
    } catch (error: any) {
      toast.error(error.message || "Erro no cadastro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-amber-600 text-white px-4 pt-10 pb-16 rounded-b-3xl">
        <button onClick={() => navigate("/auth")} className="mb-4">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-3xl font-extrabold flex items-center gap-2">
          <Store className="w-8 h-8" /> Cadastro Lojista
        </h1>
        <p className="text-white/80 mt-1">Cadastre seu restaurante e comece a vender</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 -mt-8 max-w-lg mx-auto w-full pb-8"
      >
        <div className="bg-card rounded-2xl p-6 shadow-lg border border-border/50">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Personal Info */}
            <h3 className="font-bold text-foreground">Dados Pessoais</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Seu nome" value={form.fullName} onChange={(e) => handleChange("fullName", e.target.value)} className="pl-10 rounded-xl h-11" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="(00) 00000-0000" value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} className="pl-10 rounded-xl h-11" required />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="email" placeholder="seu@email.com" value={form.email} onChange={(e) => handleChange("email", e.target.value)} className="pl-10 rounded-xl h-11" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="password" placeholder="••••••••" value={form.password} onChange={(e) => handleChange("password", e.target.value)} className="pl-10 rounded-xl h-11" required minLength={6} />
                </div>
              </div>
            </div>

            {/* Restaurant Info */}
            <h3 className="font-bold text-foreground pt-2 flex items-center gap-2">
              <Store className="w-4 h-4" /> Dados do Restaurante
            </h3>
            <div className="space-y-2">
              <Label>Nome do restaurante</Label>
              <Input placeholder="Ex: Pizzaria do João" value={form.restaurantName} onChange={(e) => handleChange("restaurantName", e.target.value)} className="rounded-xl h-11" required />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Rua, número, bairro" value={form.restaurantAddress} onChange={(e) => handleChange("restaurantAddress", e.target.value)} className="pl-10 rounded-xl h-11" required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tempo de entrega</Label>
                <Input placeholder="30-45 min" value={form.deliveryTime} onChange={(e) => handleChange("deliveryTime", e.target.value)} className="rounded-xl h-11" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Taxa de entrega (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.deliveryFee} onChange={(e) => handleChange("deliveryFee", e.target.value)} className="rounded-xl h-11" />
              </div>
              <div className="space-y-2">
                <Label>Pedido mínimo (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.minOrder} onChange={(e) => handleChange("minOrder", e.target.value)} className="rounded-xl h-11" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Logo da loja</Label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:bg-muted/50 transition">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="h-16 w-16 object-cover rounded-lg mb-2" />
                  ) : (
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  )}
                  <span className="text-xs text-muted-foreground">{logoFile ? logoFile.name : "Clique para enviar"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect("logo", e.target.files?.[0] || null)} />
                </label>
              </div>
              <div className="space-y-2">
                <Label>Imagem da loja</Label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:bg-muted/50 transition">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Image preview" className="h-16 w-16 object-cover rounded-lg mb-2" />
                  ) : (
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  )}
                  <span className="text-xs text-muted-foreground">{imageFile ? imageFile.name : "Clique para enviar"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelect("image", e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>

            <Button type="submit" className="w-full rounded-xl h-12 font-bold text-base bg-amber-600 hover:bg-amber-700" disabled={loading}>
              {loading ? "Cadastrando..." : "Cadastrar Restaurante"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Já tem conta?{" "}
            <button onClick={() => navigate("/auth")} className="text-amber-600 font-semibold">
              Faça login
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterStoreOwner;
