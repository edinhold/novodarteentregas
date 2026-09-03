import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "lucide-react";

interface DriverPhotoProps {
  photoUrl?: string | null;
  driverId?: string;
  alt?: string;
  className?: string;
}

/**
 * Resolves a driver photo stored in the private `driver-photos` bucket
 * into a signed URL that can be displayed. Falls back to a default
 * avatar when there is no photo or the URL cannot be resolved.
 */
export const DriverPhoto = ({ photoUrl, driverId, alt = "Foto do motorista", className = "" }: DriverPhotoProps) => {
  const [resolved, setResolved] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    setResolved(null);

    if (!photoUrl) return;

    // Extract storage path from stored URL. Supports both public and signed URL formats.
    const marker = "/driver-photos/";
    const idx = photoUrl.indexOf(marker);
    if (idx === -1) {
      // Not a supabase storage URL — use as-is
      setResolved(photoUrl);
      return;
    }
    let path = photoUrl.substring(idx + marker.length);
    // Strip any query string (?token=...)
    path = path.split("?")[0];

    setLoading(true);
    supabase.storage
      .from("driver-photos")
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error: err }) => {
        if (!active) return;
        console.log("[DriverPhoto:Load]", { driverId, path, ok: !err });
        if (err || !data?.signedUrl) {
          setError(true);
        } else {
          setResolved(data.signedUrl);
        }
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [photoUrl, driverId]);

  if (!photoUrl || error) {
    return (
      <div
        aria-label={alt}
        className={`flex items-center justify-center bg-muted text-muted-foreground transition-all duration-200 ${className}`}
      >
        <User className="w-1/2 h-1/2" />
      </div>
    );
  }

  if (loading || !resolved) {
    return (
      <div
        aria-label="Carregando foto"
        className={`bg-muted animate-pulse transition-all duration-200 ${className}`}
      />
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      onError={() => setError(true)}
      className={`object-cover transition-all duration-200 ${className}`}
    />
  );
};
