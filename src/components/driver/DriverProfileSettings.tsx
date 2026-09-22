import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DriverPhoto } from "@/components/DriverPhoto";
import {
  User,
  Phone,
  FileText,
  Bike,
  Key,
  Camera,
  Upload,
  Save,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  ShieldCheck,
  Check
} from "lucide-react";

interface DriverProfileSettingsProps {
  driverProfile: any;
}

export default function DriverProfileSettings({ driverProfile }: DriverProfileSettingsProps) {
  const queryClient = useQueryClient();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile Form state
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("moto");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [pixKey, setPixKey] = useState("");

  // Photo state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Form saving state
  const [savingProfile, setSavingProfile] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Sync initial driver data into local form state
  useEffect(() => {
    if (driverProfile) {
      setFullName(driverProfile.full_name || "");
      setCpf(driverProfile.cpf || "");
      setPhone(driverProfile.phone || "");
      setVehicleType(driverProfile.vehicle_type || "moto");
      setVehiclePlate(driverProfile.vehicle_plate || "");
      setPixKeyType(driverProfile.pix_key_type || "cpf");
      setPixKey(driverProfile.pix_key || "");
    }
  }, [driverProfile]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type.toLowerCase())) {
      toast.error("Formato inválido. Envie apenas imagem JPG, PNG ou WEBP.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A foto deve ter no máximo 5MB.");
      e.target.value = "";
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverProfile?.user_id) return;

    const cleanFullName = fullName.trim();
    const cleanPhone = phone.trim();
    const cleanCpf = cpf.trim();
    const cleanPlate = vehiclePlate.trim().toUpperCase();
    const cleanPixKey = pixKey.trim();

    if (!cleanFullName) {
      toast.error("Por favor, preencha o seu nome completo.");
      return;
    }

    if (!cleanPhone) {
      toast.error("Por favor, informe o seu telefone de contato.");
      return;
    }

    const digitsPhone = cleanPhone.replace(/\D/g, "");
    if (digitsPhone.length < 10) {
      toast.error("Informe um telefone válido com DDD (mínimo 10 dígitos).");
      return;
    }

    setSavingProfile(true);

    try {
      let finalPhotoUrl = driverProfile.photo_url;

      // Upload new photo if selected
      if (photoFile) {
        setUploadingPhoto(true);
        const ext = photoFile.name.split(".").pop() || "jpg";
        const storagePath = `${driverProfile.user_id}/photo_${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("driver-photos")
          .upload(storagePath, photoFile, { upsert: true });

        if (uploadErr) {
          console.error("Erro ao enviar foto:", uploadErr);
          toast.error("Não foi possível enviar a nova foto de perfil.");
        } else {
          const { data: urlData } = supabase.storage
            .from("driver-photos")
            .getPublicUrl(storagePath);
          finalPhotoUrl = urlData.publicUrl;
        }
        setUploadingPhoto(false);
      }

      // 1. Update `drivers` table
      const { error: driverErr } = await supabase
        .from("drivers")
        .update({
          full_name: cleanFullName,
          phone: cleanPhone,
          cpf: cleanCpf || null,
          vehicle_type: vehicleType,
          vehicle_plate: cleanPlate || null,
          pix_key_type: pixKeyType,
          pix_key: cleanPixKey || null,
          photo_url: finalPhotoUrl,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", driverProfile.id);

      if (driverErr) throw driverErr;

      // 2. Update `profiles` table
      const { error: profileErr } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: driverProfile.user_id,
            full_name: cleanFullName,
            phone: cleanPhone,
            avatar_url: finalPhotoUrl,
            role: "driver",
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "user_id" }
        );

      if (profileErr) {
        console.warn("[DriverProfileSettings] Profile upsert warning:", profileErr.message);
      }

      // 3. Update auth metadata (optional, best effort)
      try {
        await supabase.auth.updateUser({
          data: { full_name: cleanFullName, phone: cleanPhone, avatar_url: finalPhotoUrl },
        });
      } catch (authErr) {
        console.warn("[DriverProfileSettings] Auth metadata update warning:", authErr);
      }

      toast.success("Seus dados de perfil foram atualizados com sucesso!");
      setPhotoFile(null);
      setPhotoPreview(null);

      // Invalidate queries to refresh state across app (admin, store, and driver panels)
      queryClient.invalidateQueries({ queryKey: ["my-driver-profile"] });
      queryClient.invalidateQueries({ queryKey: ["my-driver-profile", driverProfile.user_id] });
      queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["monitor-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["favorite-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["all-radar-drivers"] });
      queryClient.invalidateQueries({ queryKey: ["radar-drivers-favorites"] });
      queryClient.invalidateQueries({ queryKey: ["assigned-driver-info"] });
    } catch (err: any) {
      console.error("[DriverProfileSettings] Error updating profile:", err);
      toast.error(err.message || "Erro ao atualizar dados do perfil.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.trim().length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("As senhas digitadas não coincidem.");
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });

      if (error) throw error;

      toast.success("Sua senha foi alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("[DriverProfileSettings] Error updating password:", err);
      toast.error(err.message || "Erro ao alterar senha.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-sm border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" /> Meu Perfil de Entregador
            </span>
            <Badge variant="outline" className="capitalize text-xs">
              {vehicleType === "moto" && "🏍️ Moto"}
              {vehicleType === "bicicleta" && "🚲 Bicicleta"}
              {vehicleType === "carro" && "🚗 Carro"}
              {vehicleType === "a_pe" && "🚶 A pé"}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Mantenha suas informações pessoais, veículo e PIX sempre atualizados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSaveProfile} className="space-y-5">
            {/* Foto de Perfil */}
            <div className="flex flex-col items-center justify-center space-y-3 bg-muted/40 p-4 rounded-xl border border-dashed">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary shadow-sm bg-muted flex items-center justify-center">
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Nova foto"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <DriverPhoto
                      photoUrl={driverProfile?.photo_url}
                      driverId={driverProfile?.user_id}
                      alt={driverProfile?.full_name || "Foto de perfil"}
                      className="w-full h-full rounded-full"
                    />
                  )}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1 text-xs"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="w-3.5 h-3.5 text-primary" /> Tirar Foto
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 text-muted-foreground" /> Escolher Arquivo
                </Button>

                {photoPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-xl text-destructive text-xs"
                    onClick={() => {
                      setPhotoFile(null);
                      setPhotoPreview(null);
                    }}
                  >
                    Desfazer
                  </Button>
                )}
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="user"
                className="hidden"
                onChange={handlePhotoChange}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />

              <p className="text-[11px] text-muted-foreground text-center">
                {photoFile
                  ? "✓ Nova foto selecionada. Clique em 'Salvar Alterações' para concluir."
                  : "Foto de identificação visível para estabelecimentos parceiros."}
              </p>
            </div>

            {/* Dados Pessoais */}
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5 border-b pb-1.5">
                <User className="w-4 h-4 text-primary" /> Dados Pessoais
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="driver-fullname" className="text-xs font-medium">
                    Nome Completo *
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="driver-fullname"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Seu nome completo"
                      className="pl-9 h-10 text-sm rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="driver-cpf" className="text-xs font-medium">
                    CPF
                  </Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="driver-cpf"
                      value={cpf}
                      onChange={(e) => setCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="pl-9 h-10 text-sm rounded-lg"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="driver-phone" className="text-xs font-medium">
                    Telefone / WhatsApp *
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="driver-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(00) 90000-0000"
                      className="pl-9 h-10 text-sm rounded-lg"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Dados do Veículo */}
            <div className="space-y-3 pt-2">
              <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5 border-b pb-1.5">
                <Bike className="w-4 h-4 text-primary" /> Dados do Veículo
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Tipo de Veículo *</Label>
                  <Select value={vehicleType} onValueChange={setVehicleType}>
                    <SelectTrigger className="h-10 text-sm rounded-lg">
                      <SelectValue placeholder="Selecione o veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moto">🏍️ Moto</SelectItem>
                      <SelectItem value="bicicleta">🚲 Bicicleta</SelectItem>
                      <SelectItem value="carro">🚗 Carro</SelectItem>
                      <SelectItem value="a_pe">🚶 A pé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="driver-plate" className="text-xs font-medium">
                    Placa do Veículo (se aplicável)
                  </Label>
                  <Input
                    id="driver-plate"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="ABC-1D23"
                    className="h-10 text-sm rounded-lg uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Dados de Pagamento PIX */}
            <div className="space-y-3 pt-2">
              <h4 className="font-semibold text-sm text-foreground flex items-center gap-1.5 border-b pb-1.5">
                <Key className="w-4 h-4 text-primary" /> Chave PIX para Recebimentos
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <Label className="text-xs font-medium">Tipo de Chave</Label>
                  <Select value={pixKeyType} onValueChange={setPixKeyType}>
                    <SelectTrigger className="h-10 text-sm rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="phone">Telefone</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="random">Aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="driver-pixkey" className="text-xs font-medium">
                    Chave PIX
                  </Label>
                  <Input
                    id="driver-pixkey"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="Sua chave PIX para saques"
                    className="h-10 text-sm rounded-lg"
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={savingProfile || uploadingPhoto}
              className="w-full h-11 font-semibold rounded-lg gap-2 text-sm shadow-sm"
            >
              {savingProfile ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Salvando Alterações...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Salvar Alterações do Perfil
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Alterar Senha */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> Segurança e Acesso
          </CardTitle>
          <CardDescription className="text-xs">
            Atualize sua senha de acesso ao aplicativo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="driver-new-pass" className="text-xs font-medium">
                  Nova Senha *
                </Label>
                <div className="relative">
                  <Input
                    id="driver-new-pass"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="h-10 text-sm rounded-lg pr-10"
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="driver-confirm-pass" className="text-xs font-medium">
                  Confirmar Nova Senha *
                </Label>
                <Input
                  id="driver-confirm-pass"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="h-10 text-sm rounded-lg"
                  minLength={6}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="outline"
              disabled={savingPassword || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword}
              className="w-full h-10 font-medium rounded-lg gap-2 text-xs mt-1"
            >
              {savingPassword ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Atualizando Senha...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Atualizar Senha de Acesso
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
