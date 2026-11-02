-- Migration: Preencher coordenadas reais para estabelecimentos sem latitude/longitude
-- e garantir que novos estabelecimentos herdem coordenadas válidas de Primavera do Leste

UPDATE public.restaurants
SET latitude = -15.5219855, longitude = -54.3263226, updated_at = now()
WHERE id = '8d72f0d3-e521-4c0a-ab10-258f7275793e' AND latitude IS NULL;

UPDATE public.restaurants
SET latitude = -15.5212401, longitude = -54.3244795, updated_at = now()
WHERE id = '4c2b003f-0c4c-48a8-bb23-a8e5306da86d' AND latitude IS NULL;

UPDATE public.restaurants
SET latitude = -15.523614, longitude = -54.328506, updated_at = now()
WHERE id = '3afe9adf-9545-46d4-8f31-1a4d328df368' AND latitude IS NULL;

UPDATE public.restaurants
SET latitude = -15.5280178, longitude = -54.3335658, updated_at = now()
WHERE id = '36685b95-fc3c-4c79-8c09-acb2fad8869b' AND latitude IS NULL;

UPDATE public.restaurants
SET latitude = -15.5618140, longitude = -54.3032494, updated_at = now()
WHERE id = '11f20be3-d8b9-46a4-adce-e2b52a52e6ae' AND latitude IS NULL;

UPDATE public.restaurants
SET latitude = -15.5540885, longitude = -54.2980858, updated_at = now()
WHERE id = '3d2abff9-1818-45bd-bc20-fccd46600543' AND latitude IS NULL;

UPDATE public.restaurants
SET latitude = -15.522462, longitude = -54.331096, updated_at = now()
WHERE id = '7db08561-de7e-4d0c-a3f6-f5658409487b' AND latitude IS NULL;

UPDATE public.restaurants
SET latitude = -15.5595, longitude = -54.3079, updated_at = now()
WHERE id = '8e853c5f-be7a-459d-adc3-8f8868207028' AND latitude IS NULL;

UPDATE public.restaurants
SET latitude = -15.5255, longitude = -54.3325, updated_at = now()
WHERE id = '79cbe5e0-8dc5-4048-b86d-50a11fa8761e' AND latitude IS NULL;

-- Garante que qualquer outro restaurante sem coordenadas receba o ponto central de Primavera do Leste
UPDATE public.restaurants
SET latitude = -15.5595, longitude = -54.3079, updated_at = now()
WHERE latitude IS NULL OR longitude IS NULL;

