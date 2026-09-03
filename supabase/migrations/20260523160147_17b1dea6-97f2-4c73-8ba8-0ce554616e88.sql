CREATE OR REPLACE FUNCTION public.place_order(
  p_restaurant_id uuid,
  p_items jsonb,
  p_address text,
  p_payment_method text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_delivery_fee numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_item jsonb;
  v_product_id uuid;
  v_quantity int;
  v_price numeric;
  v_product_name text;
  v_validated_items jsonb := '[]'::jsonb;
  v_order_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- Get real delivery fee from restaurant
  SELECT delivery_fee INTO v_delivery_fee
  FROM public.restaurants
  WHERE id = p_restaurant_id AND is_open = true;
  
  IF v_delivery_fee IS NULL THEN
    RAISE EXCEPTION 'Restaurant not found or closed';
  END IF;

  -- Validate each item with real price from products table
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := COALESCE((v_item->>'quantity')::int, 0);

    IF v_quantity <= 0 OR v_quantity > 100 THEN
      RAISE EXCEPTION 'Invalid quantity for item';
    END IF;

    SELECT price, name INTO v_price, v_product_name
    FROM public.products
    WHERE id = v_product_id 
      AND restaurant_id = p_restaurant_id 
      AND is_available = true;

    IF v_price IS NULL THEN
      RAISE EXCEPTION 'Product not available';
    END IF;

    v_subtotal := v_subtotal + (v_price * v_quantity);
    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_product_id,
      'name', v_product_name,
      'price', v_price,
      'quantity', v_quantity
    );
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;

  INSERT INTO public.orders (
    user_id, restaurant_id, items, subtotal, delivery_fee, total,
    address, payment_method, status, notes
  ) VALUES (
    v_user_id, p_restaurant_id, v_validated_items, v_subtotal, v_delivery_fee, v_total,
    p_address, p_payment_method, 'pending', p_notes
  ) RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, jsonb, text, text, text) TO authenticated;

-- Remove the direct INSERT policy so users must use the secure RPC
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert their own orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can insert orders" ON public.orders;
