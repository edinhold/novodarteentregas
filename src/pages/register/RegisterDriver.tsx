import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Bike, Mail, Lock, Phone, User, Camera, Upload } from "lucide-react";
import { motion } from "framer-motion";


const RegisterDriver = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    fullName: "", email: "", phone: "", cpf: "", password: "",
    vehicleType: "moto", vehiclePlate: "",
    pixKey: "", pixKeyType: "cpf",
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(file.type.toLowerCase())) {
      toast.error("Formato inválido. Envie apenas JPG ou PNG.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A foto deve ter no máximo 5MB");
      e.target.value = "";
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };


  const handleChange = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoFile) {
      toast.error("Envie ou tire uma foto para concluir o cadastro");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { full_name: form.fullName }, emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data.user) {
        let photoUrl: string | null = null;

        // Upload photo
        if (photoFile) {
          const ext = photoFile.name.split(".").pop();
          const path = `${data.user.id}/photo.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("driver-photos")
            .upload(path, photoFile, { upsert: true });
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("driver-photos").getPublicUrl(path);
            photoUrl = urlData.publicUrl;
          }
        }

        await supabase.from("profiles").update({ phone: form.phone }).eq("user_id", data.user.id);
        await supabase.from("drivers").insert({
          user_id: data.user.id, full_name: form.fullName, phone: form.phone,
          cpf: form.cpf || null, vehicle_type: form.vehicleType, vehicle_plate: form.vehiclePlate || null,
          pix_key: form.pixKey || null, pix_key_type: form.pixKeyType || null,
          photo_url: photoUrl,
        } as any);
        await supabase.from("user_roles").insert({ user_id: data.user.id, role: "driver" as any });
      }
      toast.success("Cadastro de entregador realizado com sucesso!");
      navigate("/entregador");
    } catch (error: any) {
      toast.error(error.message || "Erro no cadastro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-primary text-primary-foreground px-4 pt-10 pb-16 rounded-b-3xl">
        <button onClick={() => navigate("/auth")} className="mb-4"><ArrowLeft className="w-5 h-5" /></button>
        <h1 className="text-3xl font-extrabold flex items-center gap-2"><Bike className="w-8 h-8" /> Cadastro Entregador</h1>
        <p className="opacity-80 mt-1">Comece a entregar e ganhar dinheiro</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="px-4 -mt-8 max-w-lg mx-auto w-full pb-8">
        <div className="bg-card rounded-2xl p-6 shadow-lg border border-border/50">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="font-bold text-foreground">Dados Pessoais</h3>

            {/* Photo upload */}
            <div className="flex flex-col items-center gap-3">
              <div
                onClick={() => cameraInputRef.current?.click()}
                className={`w-28 h-28 rounded-full bg-muted border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors overflow-hidden ${photoPreview ? "border-primary" : "border-destructive/60 hover:border-primary"}`}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="Foto" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png"
                capture="user"
                className="hidden"
                onChange={handlePhotoChange}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={handlePhotoChange}
              />

              <div className="flex gap-2 flex-wrap justify-center">
                <Button type="button" variant="default" size="sm" className="rounded-xl gap-1" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="w-3 h-3" /> Tirar foto
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-3 h-3" /> Enviar do dispositivo
                </Button>
                {photoPreview && (
                  <Button type="button" variant="ghost" size="sm" className="rounded-xl text-destructive" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
                    Remover
                  </Button>
                )}
              </div>
              <p className={`text-xs ${photoFile ? "text-muted-foreground" : "text-destructive"}`}>
                {photoFile ? "Foto pronta para envio" : "Foto obrigatória — JPG ou PNG (máx. 5MB), ou tire uma selfie pela câmera"}
              </p>

            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Seu nome" value={form.fullName} onChange={(e) => handleChange("fullName", e.target.value)} className="pl-10 rounded-xl h-11" required />
                </div>
              </div>
              <div className="space-y-2"><Label>CPF</Label><Input placeholder="000.000.000-00" value={form.cpf} onChange={(e) => handleChange("cpf", e.target.value)} className="rounded-xl h-11" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>E-mail</Label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="email" placeholder="seu@email.com" value={form.email} onChange={(e) => handleChange("email", e.target.value)} className="pl-10 rounded-xl h-11" required /></div></div>
              <div className="space-y-2"><Label>Telefone</Label><div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="(00) 00000-0000" value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} className="pl-10 rounded-xl h-11" required /></div></div>
            </div>
            <div className="space-y-2"><Label>Senha</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="password" placeholder="••••••••" value={form.password} onChange={(e) => handleChange("password", e.target.value)} className="pl-10 rounded-xl h-11" required minLength={6} /></div></div>

            <h3 className="font-bold text-foreground pt-2">Veículo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tipo de veículo</Label>
                <Select value={form.vehicleType} onValueChange={(v) => handleChange("vehicleType", v)}>
                  <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="moto">🏍️ Moto</SelectItem><SelectItem value="bicicleta">🚲 Bicicleta</SelectItem><SelectItem value="carro">🚗 Carro</SelectItem><SelectItem value="a_pe">🚶 A pé</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Placa (se aplicável)</Label><Input placeholder="ABC-1234" value={form.vehiclePlate} onChange={(e) => handleChange("vehiclePlate", e.target.value)} className="rounded-xl h-11" /></div>
            </div>


            <h3 className="font-bold text-foreground pt-2 flex items-center gap-2">💰 Chave PIX</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tipo de chave</Label>
                <Select value={form.pixKeyType} onValueChange={(v) => handleChange("pixKeyType", v)}>
                  <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="cpf">CPF</SelectItem><SelectItem value="phone">Telefone</SelectItem><SelectItem value="email">E-mail</SelectItem><SelectItem value="random">Aleatória</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Chave PIX</Label><Input placeholder="Sua chave PIX" value={form.pixKey} onChange={(e) => handleChange("pixKey", e.target.value)} className="rounded-xl h-11" /></div>
            </div>

            <Button type="submit" className="w-full rounded-xl h-12 font-bold text-base" disabled={loading}>
              {loading ? "Cadastrando..." : "Cadastrar como Entregador"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Já tem conta?{" "}<button onClick={() => navigate("/auth")} className="text-primary font-semibold">Faça login</button>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterDriver;
