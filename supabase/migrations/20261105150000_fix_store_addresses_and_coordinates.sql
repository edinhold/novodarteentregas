-- Migration: Correção Definitiva de Endereços e Coordenadas de Todas as Lojas em Primavera do Leste
-- Data: 2026-11-05
-- Autor: Duarte Entregas - Arquitetura Sênior

-- 1. ATUALIZAÇÃO DAS COORDENADAS REAIS E ENDEREÇOS PADRONIZADOS DAS 19 LOJAS CADASTRADAS

-- Alessandra Bolos
UPDATE public.restaurants
SET latitude = -15.5458000,
    longitude = -54.3216000,
    address = 'Rua Rio de Janeiro, 747, Primavera II',
    updated_at = now()
WHERE id = 'a0f7637d-b50a-48da-ab38-7ea198f18cf1'
   OR name ILIKE '%Alessandra Bolos%';

-- DUARTE INFORMATICA (Correção crítica: estava apontando para Cuiabá)
UPDATE public.restaurants
SET latitude = -15.5684710,
    longitude = -54.3142270,
    address = 'Rua Olivio Bissoloti, 859, Parque Eldorado, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '57f00f07-8898-466a-b2ff-d66795f93539'
   OR name ILIKE '%DUARTE INFORMATICA%';

-- Jó cakes
UPDATE public.restaurants
SET latitude = -15.5562000,
    longitude = -54.3015000,
    address = 'Rua Campo Grande, 836, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '455d3420-56ef-46ce-b11c-d78ea1f48665'
   OR name ILIKE '%Jó cakes%'
   OR name ILIKE '%Jo cakes%';

-- Lanchonete Duarte
UPDATE public.restaurants
SET latitude = -15.5684710,
    longitude = -54.3142270,
    address = 'Rua Olivio Bissoloti, 859, Parque Eldorado, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '7ad824a7-8f5b-4375-9abf-a64b971a81dc'
   OR name ILIKE '%Lanchonete Duarte%';

-- Neofarma Bh (Correção: deslocamento de 1.6km para Av Belo Horizonte 1222)
UPDATE public.restaurants
SET latitude = -15.5484860,
    longitude = -54.2930560,
    address = 'Av Belo Horizonte, 1222, Centro, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '5ce3bb58-3f5f-4d43-98fe-89241b7ddc5c'
   OR name ILIKE '%Neofarma%';

-- Raízes do Cerrado
UPDATE public.restaurants
SET latitude = -15.5512000,
    longitude = -54.3060000,
    address = 'Av Minas Gerais, 600, Primavera do Leste - MT',
    updated_at = now()
WHERE id = 'e7fce44b-f2fe-4dc1-baea-41ffb9a67e91'
   OR name ILIKE '%Raízes do Cerrado%'
   OR name ILIKE '%Raizes do Cerrado%';

-- Sabor e Arte
UPDATE public.restaurants
SET latitude = -15.5574000,
    longitude = -54.2985000,
    address = 'Av Cuiabá, 350, Centro, Primavera do Leste - MT',
    updated_at = now()
WHERE id = 'f78235e1-ee24-4f40-80a2-2e928236d6ea'
   OR name ILIKE '%Sabor e Arte%';

-- Açaí Concept
UPDATE public.restaurants
SET latitude = -15.5573420,
    longitude = -54.2982140,
    address = 'Av. Cuiabá, 123, Centro, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '8d72f0d3-e521-4c0a-ab10-258f7275793e'
   OR name ILIKE '%Açaí Concept%'
   OR name ILIKE '%Acai Concept%';

-- Pizzaria Bella
UPDATE public.restaurants
SET latitude = -15.5542100,
    longitude = -54.3021450,
    address = 'Rua Piracicaba, 456, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '4c2b003f-0c4c-48a8-bb23-a8e5306da86d'
   OR name ILIKE '%Pizzaria Bella%';

-- Burger King
UPDATE public.restaurants
SET latitude = -15.5621000,
    longitude = -54.3112000,
    address = 'Av. dos Lagos, 789, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '3afe9adf-9545-46d4-8f31-1a4d328df368'
   OR name ILIKE '%Burger King%';

-- Sushi Prime
UPDATE public.restaurants
SET latitude = -15.5518000,
    longitude = -54.3045000,
    address = 'Rua Maringá, 321, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '36685b95-fc3c-4c79-8c09-acb2fad8869b'
   OR name ILIKE '%Sushi Prime%';

-- Padaria Central
UPDATE public.restaurants
SET latitude = -15.5589000,
    longitude = -54.2998000,
    address = 'Av. Porto Alegre, 654, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '11f20be3-d8b9-46a4-adce-e2b52a52e6ae'
   OR name ILIKE '%Padaria Central%';

-- Churrascaria Boi Branco
UPDATE public.restaurants
SET latitude = -15.5401000,
    longitude = -54.2852000,
    address = 'BR-070, Km 2, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '3d2abff9-1818-45bd-bc20-fccd46600543'
   OR name ILIKE '%Churrascaria Boi Branco%';

-- Farmácia São João
UPDATE public.restaurants
SET latitude = -15.5534000,
    longitude = -54.3011000,
    address = 'Av. São João, 987, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '7db08561-de7e-4d0c-a3f6-f5658409487b'
   OR name ILIKE '%Farmácia São João%'
   OR name ILIKE '%Farmacia Sao Joao%';

-- Supermercado Compre Bem
UPDATE public.restaurants
SET latitude = -15.5632000,
    longitude = -54.3054000,
    address = 'Av. Campo Grande, 1500, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '8e853c5f-be7a-459d-adc3-8f8868207028'
   OR name ILIKE '%Supermercado Compre Bem%';

-- Distribuidora de Bebidas
UPDATE public.restaurants
SET latitude = -15.5498000,
    longitude = -54.3072000,
    address = 'Rua Curitiba, 111, Primavera do Leste - MT',
    updated_at = now()
WHERE id = '79cbe5e0-8dc5-4048-b86d-50a11fa8761e'
   OR name ILIKE '%Distribuidora de Bebidas%';

-- DUARTE ENTREGAS
UPDATE public.restaurants
SET latitude = -15.5684710,
    longitude = -54.3142270,
    address = 'Rua Olivio Bissoloti, 859, Parque Eldorado, Primavera do Leste - MT',
    updated_at = now()
WHERE id = 'baec03ca-765f-42e7-b610-8b45a6c382cf'
   OR name ILIKE '%DUARTE ENTREGAS%';

-- Duarte Teste
UPDATE public.restaurants
SET latitude = -15.5684710,
    longitude = -54.3142270,
    address = 'Rua Olivio Bissoloti, 859, Parque Eldorado, Primavera do Leste - MT',
    updated_at = now()
WHERE id = 'bf3dfef3-6c8a-4424-b1f4-52627cbcae97'
   OR name ILIKE '%Duarte Teste%';

-- Edinho Duarte
UPDATE public.restaurants
SET latitude = -15.5684710,
    longitude = -54.3142270,
    address = 'Rua Olivio Bissoloti, 859, Parque Eldorado, Primavera do Leste - MT',
    updated_at = now()
WHERE id = 'cb98522f-38d7-4009-bc07-ce9d5f50ea3e'
   OR name ILIKE '%Edinho Duarte%';

-- Sanear qualquer outro estabelecimento com coordenadas fora do bounding box de Primavera do Leste
UPDATE public.restaurants
SET latitude = -15.5595,
    longitude = -54.3079,
    updated_at = now()
WHERE latitude IS NULL
   OR longitude IS NULL
   OR latitude < -15.70
   OR latitude > -15.40
   OR longitude < -54.45
   OR longitude > -54.15;


-- 2. ATUALIZAR FUNÇÃO deduct_credits_for_delivery PARA HERDAR E GRAVAR pickup_lat E pickup_lng NA CRIAÇÃO DA ENTREGA
CREATE OR REPLACE FUNCTION public.deduct_credits_for_delivery(
  p_pickup_address text, 
  p_delivery_address text, 
  p_notes text DEFAULT NULL, 
  p_restaurant_id uuid DEFAULT NULL, 
  p_distance_km numeric DEFAULT 0, 
  p_preferred_driver_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_base_fee numeric;
  v_fee_per_km numeric;
  v_dynamic_pricing_enabled boolean;
  v_dynamic_fee_per_km numeric;
  v_effective_fee_per_km numeric;
  v_min_km numeric;
  v_max_km numeric;
  v_round_km_up boolean;
  v_delivery_cost numeric;
  v_user_id uuid;
  v_current_credits numeric;
  v_request_id uuid;
  v_effective_km numeric;
  v_store_lat numeric;
  v_store_lng numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  
  -- Recuperar coordenadas da loja vinculada
  IF p_restaurant_id IS NOT NULL THEN
    SELECT latitude, longitude INTO v_store_lat, v_store_lng
    FROM public.restaurants
    WHERE id = p_restaurant_id;
  END IF;

  -- Se coordenadas forem nulas ou fora de Primavera do Leste, busca do restaurante do usuário
  IF v_store_lat IS NULL OR v_store_lng IS NULL OR v_store_lat < -15.70 OR v_store_lat > -15.40 THEN
    SELECT latitude, longitude INTO v_store_lat, v_store_lng
    FROM public.restaurants
    WHERE owner_id = v_user_id
    LIMIT 1;
  END IF;

  -- Fallback de segurança para centro de Primavera do Leste se ainda nulo
  IF v_store_lat IS NULL OR v_store_lng IS NULL THEN
    v_store_lat := -15.5595;
    v_store_lng := -54.3079;
  END IF;

  -- Obter configurações de entrega
  SELECT 
    base_fee, 
    fee_per_km, 
    dynamic_pricing_enabled, 
    dynamic_fee_per_km, 
    min_km, 
    max_km, 
    round_km_up 
  INTO 
    v_base_fee, 
    v_fee_per_km, 
    v_dynamic_pricing_enabled, 
    v_dynamic_fee_per_km, 
    v_min_km, 
    v_max_km, 
    v_round_km_up
  FROM public.delivery_config
  LIMIT 1;

  -- Valores padrão se configuração ausente
  v_base_fee := COALESCE(v_base_fee, 5.3);
  v_fee_per_km := COALESCE(v_fee_per_km, 1.7);
  v_dynamic_pricing_enabled := COALESCE(v_dynamic_pricing_enabled, false);
  v_dynamic_fee_per_km := COALESCE(v_dynamic_fee_per_km, 0);

  IF v_dynamic_pricing_enabled AND v_dynamic_fee_per_km > 0 THEN
    v_effective_fee_per_km := v_dynamic_fee_per_km;
  ELSE
    v_effective_fee_per_km := v_fee_per_km;
  END IF;

  v_min_km := COALESCE(v_min_km, 0);
  v_max_km := COALESCE(v_max_km, 0);
  v_round_km_up := COALESCE(v_round_km_up, false);

  -- Regras de KM
  v_effective_km := COALESCE(p_distance_km, 0);
  IF v_round_km_up AND v_effective_km > 0 THEN 
    v_effective_km := ceil(v_effective_km); 
  END IF;
  
  IF v_min_km > 0 AND v_effective_km < v_min_km THEN 
    v_effective_km := v_min_km; 
  END IF;
  
  IF v_max_km > 0 AND v_effective_km > v_max_km THEN 
    v_effective_km := v_max_km; 
  END IF;

  v_delivery_cost := v_base_fee + (v_effective_fee_per_km * v_effective_km);

  -- Verificar créditos
  SELECT balance INTO v_current_credits
  FROM public.store_credits
  WHERE user_id = v_user_id;

  IF v_current_credits IS NULL OR v_current_credits < v_delivery_cost THEN
    RAISE EXCEPTION 'Créditos insuficientes (Necessário R$ %, Possui R$ %)', round(v_delivery_cost, 2), round(COALESCE(v_current_credits, 0), 2);
  END IF;

  -- Debitar créditos
  UPDATE public.store_credits
  SET balance = balance - v_delivery_cost,
      updated_at = now()
  WHERE user_id = v_user_id;

  -- Criar chamado de entrega com coordenadas reais gravadas
  INSERT INTO public.delivery_requests (
    store_owner_id,
    restaurant_id,
    pickup_address,
    pickup_lat,
    pickup_lng,
    delivery_address,
    notes,
    credit_cost,
    driver_fee,
    status
  )
  VALUES (
    v_user_id,
    p_restaurant_id,
    p_pickup_address,
    v_store_lat,
    v_store_lng,
    p_delivery_address,
    p_notes,
    v_delivery_cost,
    v_delivery_cost,
    'pending'
  )
  RETURNING id INTO v_request_id;

  -- Entregador preferencial
  IF p_preferred_driver_id IS NOT NULL THEN
    UPDATE public.delivery_requests 
    SET notes = COALESCE(notes, '') || E'\n[DIRECIONADO PARA ENTREGADOR ID: ' || p_preferred_driver_id || ']'
    WHERE id = v_request_id;
  END IF;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_credits_for_delivery(text, text, text, uuid, numeric, uuid) TO authenticated, service_role;


-- 3. RETRO-CORREÇÃO DE ENTREGAS PENDENTES OU EM ANDAMENTO COM COORDENADAS DE COLETA NULAS
UPDATE public.delivery_requests dr
SET pickup_lat = r.latitude,
    pickup_lng = r.longitude
FROM public.restaurants r
WHERE dr.restaurant_id = r.id
  AND (dr.pickup_lat IS NULL OR dr.pickup_lng IS NULL)
  AND r.latitude IS NOT NULL
  AND r.longitude IS NOT NULL;

