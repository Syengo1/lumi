


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."attach_order_stk_request"("target_order_id" "uuid", "target_store_id" "uuid", "checkout_req_id" "text", "merchant_req_id" "text", "result_desc" "text", "updated_phone" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_has_valid_req boolean;
  v_attempt_status text;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = target_order_id
    AND store_id = target_store_id
    AND payment_status != 'paid'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_has_valid_req := (checkout_req_id IS NOT NULL AND length(trim(checkout_req_id)) > 0);
  v_attempt_status := CASE WHEN v_has_valid_req THEN 'pending' ELSE 'failed' END;

  INSERT INTO public.payment_attempts (
    store_id,
    order_id,
    merchant_request_id,
    checkout_request_id,
    phone_number,
    amount,
    status,
    result_description,
    completed_at
  ) VALUES (
    target_store_id,
    target_order_id,
    merchant_req_id,
     NULLIF(trim(checkout_req_id), ''),
    COALESCE(updated_phone, v_order.customer_phone),
    v_order.total_amount,
    v_attempt_status,
    result_desc,
    CASE WHEN v_attempt_status = 'failed' THEN timezone('utc'::text, now()) ELSE NULL END
  )
  ON CONFLICT (checkout_request_id) DO UPDATE
  SET
    merchant_request_id = EXCLUDED.merchant_request_id,
    result_description = EXCLUDED.result_description,
    status = EXCLUDED.status;

  IF v_has_valid_req THEN
    UPDATE public.orders
    SET
      mpesa_checkout_request_id = trim(checkout_req_id),
      mpesa_merchant_request_id = COALESCE(NULLIF(trim(merchant_req_id), ''), mpesa_merchant_request_id),
      mpesa_result_desc = result_desc,
      customer_phone = COALESCE(updated_phone, customer_phone),
      payment_status = 'pending',
      order_status = CASE WHEN order_status = 'cancelled' THEN 'pending' ELSE order_status END,
      payment_expires_at = timezone('utc'::text, now()) + interval '120 seconds'
    WHERE id = target_order_id
      AND store_id = target_store_id;
  ELSE
    -- Initiation failed: do NOT keep stale CheckoutRequestID active or fake a pending timer
    UPDATE public.orders
    SET
      mpesa_result_desc = result_desc,
      customer_phone = COALESCE(updated_phone, customer_phone),
      payment_status = 'failed'
    WHERE id = target_order_id
      AND store_id = target_store_id;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."attach_order_stk_request"("target_order_id" "uuid", "target_store_id" "uuid", "checkout_req_id" "text", "merchant_req_id" "text", "result_desc" "text", "updated_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_delivery_fee_kes"("distance_km" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN distance_km <= 10 THEN 0::numeric
    WHEN distance_km <= 20 THEN 150::numeric
    WHEN distance_km <= 35 THEN 200::numeric
    WHEN distance_km <= 60 THEN 300::numeric
    ELSE 1000::numeric
  END;
$$;


ALTER FUNCTION "public"."calculate_delivery_fee_kes"("distance_km" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT ROUND(
    (
      6371.0 * 2.0 * ASIN(
        SQRT(
          POWER(SIN(RADIANS(lat2 - lat1) / 2.0), 2) +
          COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
          POWER(SIN(RADIANS(lng2 - lng1) / 2.0), 2)
        )
      )
    )::numeric,
    2
  );
$$;


ALTER FUNCTION "public"."calculate_haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_cancel_pending_order"("target_order_id" "uuid", "target_store_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  affected integer;
BEGIN
  -- Cancels an unpaid pending order without deducting any stock
  UPDATE public.orders
  SET
    payment_status = 'failed',
    order_status = 'cancelled',
    mpesa_result_desc = 'Code 1032: Order cancelled by customer',
    payment_expires_at = timezone('utc'::text, now())
  WHERE id = target_order_id
    AND store_id = target_store_id
    AND payment_status != 'paid'
    AND order_status = 'pending';

  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected > 0 THEN
    UPDATE public.payment_attempts
    SET
      status = 'cancelled',
      result_code = 1032,
      result_description = 'Cancelled by customer',
      completed_at = COALESCE(completed_at, timezone('utc'::text, now()))
    WHERE order_id = target_order_id
      AND status IN ('initiating', 'pending');
  END IF;

  RETURN affected > 0;
END;
$$;


ALTER FUNCTION "public"."customer_cancel_pending_order"("target_order_id" "uuid", "target_store_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_order_mpesa_payment"("target_order_id" "uuid", "checkout_req_id" "text", "result_code" integer, "result_desc" "text", "receipt_num" "text" DEFAULT NULL::"text", "raw_payload" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item RECORD;
  v_prod RECORD;
  v_new_variants jsonb;
  v_recalculated_stock integer;
  v_mapped_attempt_status text;
  v_effective_receipt text;
  v_caller_role text;
BEGIN
  v_caller_role := COALESCE(
    current_setting('request.jwt.claim.role', true),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    current_user
  );

  SELECT * INTO v_order
  FROM public.orders
  WHERE (target_order_id IS NOT NULL AND id = target_order_id)
     OR (checkout_req_id IS NOT NULL AND mpesa_checkout_request_id = checkout_req_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- If called via anon key (when SUPABASE_SERVICE_ROLE_KEY is not set), require matching CheckoutRequestID
  IF v_caller_role = 'anon' THEN
    IF checkout_req_id IS NULL
       OR v_order.mpesa_checkout_request_id IS NULL
       OR trim(checkout_req_id) != trim(v_order.mpesa_checkout_request_id) THEN
      RAISE EXCEPTION 'Unauthorized: Valid matching CheckoutRequestID required.';
    END IF;
  END IF;

  v_mapped_attempt_status := CASE
    WHEN result_code = 0 THEN 'succeeded'
    WHEN result_code IN (1032, 1031) THEN 'cancelled'
    WHEN result_code IN (1037, 1019) THEN 'timed_out'
    ELSE 'failed'
  END;

  v_effective_receipt := COALESCE(
    NULLIF(upper(trim(receipt_num)), ''),
    v_order.mpesa_receipt_number,
    CASE
      WHEN result_code = 0 AND checkout_req_id IS NOT NULL THEN 'CONF-' || right(checkout_req_id, 8)
      WHEN result_code = 0 THEN 'MPESA-PAID'
      ELSE NULL
    END
  );

  UPDATE public.payment_attempts
  SET
    status = v_mapped_attempt_status,
    result_code = finalize_order_mpesa_payment.result_code,
    result_description = result_desc,
    mpesa_receipt_number = COALESCE(v_effective_receipt, mpesa_receipt_number),
    raw_callback_payload = COALESCE(raw_payload, raw_callback_payload),
    completed_at = COALESCE(completed_at, timezone('utc'::text, now()))
  WHERE (checkout_req_id IS NOT NULL AND checkout_request_id = checkout_req_id)
     OR (checkout_req_id IS NULL AND id = (
          SELECT id FROM public.payment_attempts
          WHERE order_id = v_order.id
          ORDER BY created_at DESC
          LIMIT 1
        ));

  -- Idempotency guard: never double-deduct stock if already paid
  IF v_order.payment_status = 'paid' THEN
    IF v_effective_receipt IS NOT NULL AND (v_order.mpesa_receipt_number IS NULL OR v_order.mpesa_receipt_number LIKE 'CONF-%') THEN
      UPDATE public.orders
      SET mpesa_receipt_number = v_effective_receipt
      WHERE id = v_order.id;
    END IF;
    RETURN v_order.id;
  END IF;

  -- ONLY deduct stock when result_code = 0 (payment succeeded & order confirmed)
  IF result_code = 0 THEN
    UPDATE public.orders
    SET
      payment_status = 'paid',
      order_status = CASE WHEN order_status IN ('pending', 'cancelled') THEN 'confirmed' ELSE order_status END,
      mpesa_receipt_number = v_effective_receipt,
      mpesa_result_desc = result_desc,
      paid_at = timezone('utc'::text, now()),
      payment_expires_at = timezone('utc'::text, now())
    WHERE id = v_order.id;

    FOR v_item IN
      SELECT product_id, selected_size, quantity
      FROM public.order_items
      WHERE order_id = v_order.id
    LOOP
      IF v_item.product_id IS NOT NULL THEN
        SELECT id, stock_count, variants INTO v_prod
        FROM public.products
        WHERE id = v_item.product_id
        FOR UPDATE;

        IF FOUND THEN
          IF jsonb_typeof(v_prod.variants) = 'array' AND jsonb_array_length(v_prod.variants) > 0 THEN
            SELECT COALESCE(
              jsonb_agg(
                CASE
                  WHEN upper(trim(elem->>'size')) = upper(trim(v_item.selected_size)) THEN
                    jsonb_set(
                      elem,
                      '{stock}',
                      to_jsonb(GREATEST(0, COALESCE((elem->>'stock')::int, 0) - v_item.quantity))
                    )
                  ELSE elem
                END
              ),
              '[]'::jsonb
            ) INTO v_new_variants
            FROM jsonb_array_elements(v_prod.variants) AS elem;

            SELECT COALESCE(SUM(GREATEST(0, COALESCE((elem->>'stock')::int, 0))), 0)::int
            INTO v_recalculated_stock
            FROM jsonb_array_elements(v_new_variants) AS elem;
          ELSE
            v_new_variants := v_prod.variants;
            v_recalculated_stock := GREATEST(0, COALESCE(v_prod.stock_count, 0) - v_item.quantity);
          END IF;

          UPDATE public.products
          SET
            stock_count = v_recalculated_stock,
            variants = v_new_variants
          WHERE id = v_prod.id;
        END IF;
      END IF;
    END LOOP;
  ELSE
    -- Prompt cancelled (1032) or failed: DO NOT deduct stock, and expire timer immediately
    UPDATE public.orders
    SET
      payment_status = 'failed',
      mpesa_result_desc = result_desc,
      payment_expires_at = timezone('utc'::text, now())
    WHERE id = v_order.id;
  END IF;

  RETURN v_order.id;
END;
$$;


ALTER FUNCTION "public"."finalize_order_mpesa_payment"("target_order_id" "uuid", "checkout_req_id" "text", "result_code" integer, "result_desc" "text", "receipt_num" "text", "raw_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_store_admin"("target_store_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() 
      AND store_id = target_store_id 
      AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_store_admin"("target_store_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."requested_store_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT NULLIF(
    current_setting('request.headers', true)::json->>'x-store-id',
    ''
  )::uuid;
$$;


ALTER FUNCTION "public"."requested_store_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_manual_mpesa_receipt"("target_order_id" "uuid", "target_store_id" "uuid", "submitted_receipt" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_clean_receipt text;
  v_duplicate_exists boolean;
BEGIN
  v_clean_receipt := upper(regexp_replace(COALESCE(submitted_receipt, ''), '[^A-Za-z0-9]', '', 'g'));

  IF length(v_clean_receipt) < 10 OR length(v_clean_receipt) > 12 THEN
    RAISE EXCEPTION 'Invalid M-Pesa receipt format.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE mpesa_receipt_number = v_clean_receipt
      AND id != target_order_id
  ) INTO v_duplicate_exists;

  IF v_duplicate_exists THEN
    RAISE EXCEPTION 'This M-Pesa receipt code has already been used on another order.';
  END IF;

  UPDATE public.orders
  SET
    mpesa_receipt_number = v_clean_receipt,
    mpesa_result_desc = 'Customer submitted M-Pesa code ' || v_clean_receipt || ' (Pending verification)',
    payment_status = CASE WHEN payment_status = 'paid' THEN 'paid' ELSE 'pending' END
  WHERE id = target_order_id
    AND store_id = target_store_id
    AND payment_status != 'paid';

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."submit_manual_mpesa_receipt"("target_order_id" "uuid", "target_store_id" "uuid", "submitted_receipt" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "store_id" "uuid" NOT NULL,
    "size_type" "text" DEFAULT 'apparel'::"text" NOT NULL,
    CONSTRAINT "categories_size_type_check" CHECK (("size_type" = ANY (ARRAY['apparel'::"text", 'footwear'::"text", 'waist'::"text", 'headwear'::"text", 'bags'::"text", 'socks'::"text", 'one_size'::"text"])))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "title" "text" NOT NULL,
    "sku" "text",
    "selected_size" "text" NOT NULL,
    "primary_color" "text",
    "quantity" integer NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "line_total" numeric(10,2) NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "unit_buy_price" numeric(10,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "order_number" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "customer_email" "text",
    "delivery_method" "text" DEFAULT 'delivery'::"text" NOT NULL,
    "delivery_address" "text" NOT NULL,
    "delivery_apartment" "text",
    "delivery_notes" "text",
    "delivery_lat" double precision NOT NULL,
    "delivery_lng" double precision NOT NULL,
    "distance_km" numeric(10,2) DEFAULT 0 NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "delivery_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(10,2) NOT NULL,
    "payment_method" "text" DEFAULT 'mpesa'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "order_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "mpesa_checkout_request_id" "text",
    "mpesa_merchant_request_id" "text",
    "mpesa_receipt_number" "text",
    "mpesa_result_desc" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "dispatched_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "payment_expires_at" timestamp with time zone DEFAULT ("timezone"('utc'::"text", "now"()) + '00:02:00'::interval) NOT NULL,
    CONSTRAINT "orders_delivery_method_check" CHECK (("delivery_method" = ANY (ARRAY['delivery'::"text", 'pickup'::"text"]))),
    CONSTRAINT "orders_order_status_check" CHECK (("order_status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'dispatched'::"text", 'delivered'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "orders_payment_method_check" CHECK (("payment_method" = 'mpesa'::"text")),
    CONSTRAINT "orders_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "merchant_request_id" "text",
    "checkout_request_id" "text",
    "phone_number" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" "text" DEFAULT 'initiating'::"text" NOT NULL,
    "result_code" integer,
    "result_description" "text",
    "mpesa_receipt_number" "text",
    "raw_callback_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "payment_attempts_status_check" CHECK (("status" = ANY (ARRAY['initiating'::"text", 'pending'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text", 'timed_out'::"text"])))
);


ALTER TABLE "public"."payment_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2) NOT NULL,
    "stock_count" integer DEFAULT 0 NOT NULL,
    "image_urls" "text"[] DEFAULT '{}'::"text"[],
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "store_id" "uuid" NOT NULL,
    "sku" "text",
    "buy_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "offer_price" numeric(10,2),
    "primary_color" "text" DEFAULT 'Black'::"text" NOT NULL,
    "color_hex" "text" DEFAULT '#18181b'::"text" NOT NULL,
    "size_type" "text" DEFAULT 'apparel'::"text" NOT NULL,
    "variants" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "measurement_notes" "text",
    "is_featured" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "primary_color" "text" DEFAULT '#f97316'::"text" NOT NULL,
    "contact_email" "text" DEFAULT 'contact@luminousdrip.com'::"text" NOT NULL,
    "hero_banner_text" "text" DEFAULT 'Welcome to Luminous Drip Line'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "origin_address" "text" DEFAULT 'Luminous Drip Shop'::"text" NOT NULL,
    "origin_lat" double precision DEFAULT '-1.3554'::numeric NOT NULL,
    "origin_lng" double precision DEFAULT 36.6562 NOT NULL,
    "base_delivery_fee" numeric(10,2) DEFAULT 150.00 NOT NULL,
    "delivery_fee_per_km" numeric(10,2) DEFAULT 35.00 NOT NULL,
    "min_delivery_fee" numeric(10,2) DEFAULT 200.00 NOT NULL,
    "max_delivery_fee" numeric(10,2) DEFAULT 1500.00 NOT NULL,
    "free_delivery_threshold" numeric(10,2) DEFAULT 15000.00
);


ALTER TABLE "public"."stores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "store_id" "uuid" NOT NULL,
    CONSTRAINT "user_roles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'customer'::"text"])))
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_store_slug_unique" UNIQUE ("store_id", "slug");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_mpesa_checkout_request_id_key" UNIQUE ("mpesa_checkout_request_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_checkout_request_id_key" UNIQUE ("checkout_request_id");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stores"
    ADD CONSTRAINT "stores_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "store_id");



CREATE INDEX "idx_categories_store_id" ON "public"."categories" USING "btree" ("store_id");



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_checkout_req" ON "public"."orders" USING "btree" ("mpesa_checkout_request_id");



CREATE INDEX "idx_orders_store_id" ON "public"."orders" USING "btree" ("store_id", "created_at" DESC);



CREATE INDEX "idx_payment_attempts_checkout_req" ON "public"."payment_attempts" USING "btree" ("checkout_request_id");



CREATE INDEX "idx_payment_attempts_order_id" ON "public"."payment_attempts" USING "btree" ("order_id", "created_at" DESC);



CREATE INDEX "idx_products_category_id" ON "public"."products" USING "btree" ("category_id");



CREATE INDEX "idx_products_featured" ON "public"."products" USING "btree" ("store_id", "is_featured");



CREATE INDEX "idx_products_primary_color" ON "public"."products" USING "btree" ("store_id", "primary_color");



CREATE INDEX "idx_products_store_id" ON "public"."products" USING "btree" ("store_id");



CREATE INDEX "idx_user_roles_user_store" ON "public"."user_roles" USING "btree" ("user_id", "store_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone in store context can view order items" ON "public"."order_items" FOR SELECT TO "authenticated", "anon" USING ((("store_id" = "public"."requested_store_id"()) OR "public"."is_store_admin"("store_id")));



CREATE POLICY "Anyone in store context can view order status" ON "public"."orders" FOR SELECT TO "authenticated", "anon" USING ((("store_id" = "public"."requested_store_id"()) OR "public"."is_store_admin"("store_id")));



CREATE POLICY "Anyone in store context can view payment attempts" ON "public"."payment_attempts" FOR SELECT TO "authenticated", "anon" USING ((("store_id" = "public"."requested_store_id"()) OR "public"."is_store_admin"("store_id")));



CREATE POLICY "Customers can create orders for active store" ON "public"."orders" FOR INSERT TO "authenticated", "anon" WITH CHECK (("store_id" = "public"."requested_store_id"()));



CREATE POLICY "Customers can insert order items for active store" ON "public"."order_items" FOR INSERT TO "authenticated", "anon" WITH CHECK (("store_id" = "public"."requested_store_id"()));



CREATE POLICY "Store admins can manage own categories" ON "public"."categories" TO "authenticated" USING ("public"."is_store_admin"("store_id")) WITH CHECK ("public"."is_store_admin"("store_id"));



CREATE POLICY "Store admins can manage own order items" ON "public"."order_items" TO "authenticated" USING ("public"."is_store_admin"("store_id")) WITH CHECK ("public"."is_store_admin"("store_id"));



CREATE POLICY "Store admins can manage own orders" ON "public"."orders" TO "authenticated" USING ("public"."is_store_admin"("store_id")) WITH CHECK ("public"."is_store_admin"("store_id"));



CREATE POLICY "Store admins can manage own products" ON "public"."products" TO "authenticated" USING ("public"."is_store_admin"("store_id")) WITH CHECK ("public"."is_store_admin"("store_id"));



CREATE POLICY "Store admins can manage payment attempts" ON "public"."payment_attempts" TO "authenticated" USING ("public"."is_store_admin"("store_id")) WITH CHECK ("public"."is_store_admin"("store_id"));



CREATE POLICY "Store admins can manage roles for their store" ON "public"."user_roles" TO "authenticated" USING ("public"."is_store_admin"("store_id")) WITH CHECK ("public"."is_store_admin"("store_id"));



CREATE POLICY "Store admins can update own orders" ON "public"."orders" FOR UPDATE TO "authenticated" USING ("public"."is_store_admin"("store_id")) WITH CHECK ("public"."is_store_admin"("store_id"));



CREATE POLICY "Store admins can update own store settings" ON "public"."stores" FOR UPDATE TO "authenticated" USING ("public"."is_store_admin"("id")) WITH CHECK ("public"."is_store_admin"("id"));



CREATE POLICY "Tenant can view own active products" ON "public"."products" FOR SELECT TO "authenticated", "anon" USING (((("is_active" = true) AND ("store_id" = "public"."requested_store_id"())) OR "public"."is_store_admin"("store_id")));



CREATE POLICY "Tenant can view own categories" ON "public"."categories" FOR SELECT TO "authenticated", "anon" USING ((("store_id" = "public"."requested_store_id"()) OR "public"."is_store_admin"("store_id")));



CREATE POLICY "Tenant can view own store settings" ON "public"."stores" FOR SELECT TO "authenticated", "anon" USING ((("id" = "public"."requested_store_id"()) OR "public"."is_store_admin"("id")));



CREATE POLICY "Users can read own store roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."attach_order_stk_request"("target_order_id" "uuid", "target_store_id" "uuid", "checkout_req_id" "text", "merchant_req_id" "text", "result_desc" "text", "updated_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."attach_order_stk_request"("target_order_id" "uuid", "target_store_id" "uuid", "checkout_req_id" "text", "merchant_req_id" "text", "result_desc" "text", "updated_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."attach_order_stk_request"("target_order_id" "uuid", "target_store_id" "uuid", "checkout_req_id" "text", "merchant_req_id" "text", "result_desc" "text", "updated_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_delivery_fee_kes"("distance_km" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_delivery_fee_kes"("distance_km" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_delivery_fee_kes"("distance_km" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."customer_cancel_pending_order"("target_order_id" "uuid", "target_store_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."customer_cancel_pending_order"("target_order_id" "uuid", "target_store_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."customer_cancel_pending_order"("target_order_id" "uuid", "target_store_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_order_mpesa_payment"("target_order_id" "uuid", "checkout_req_id" "text", "result_code" integer, "result_desc" "text", "receipt_num" "text", "raw_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_order_mpesa_payment"("target_order_id" "uuid", "checkout_req_id" "text", "result_code" integer, "result_desc" "text", "receipt_num" "text", "raw_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_order_mpesa_payment"("target_order_id" "uuid", "checkout_req_id" "text", "result_code" integer, "result_desc" "text", "receipt_num" "text", "raw_payload" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."finalize_order_mpesa_payment"("target_order_id" "uuid", "checkout_req_id" "text", "result_code" integer, "result_desc" "text", "receipt_num" "text", "raw_payload" "jsonb") TO "anon";



GRANT ALL ON FUNCTION "public"."is_store_admin"("target_store_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_store_admin"("target_store_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_store_admin"("target_store_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."requested_store_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."requested_store_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."requested_store_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_manual_mpesa_receipt"("target_order_id" "uuid", "target_store_id" "uuid", "submitted_receipt" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_manual_mpesa_receipt"("target_order_id" "uuid", "target_store_id" "uuid", "submitted_receipt" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_manual_mpesa_receipt"("target_order_id" "uuid", "target_store_id" "uuid", "submitted_receipt" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."categories" TO "service_role";
GRANT SELECT ON TABLE "public"."categories" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."categories" TO "authenticated";



GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."order_items" TO "anon";



GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."orders" TO "anon";



GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."payment_attempts" TO "anon";
GRANT ALL ON TABLE "public"."payment_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "service_role";
GRANT SELECT ON TABLE "public"."products" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."products" TO "authenticated";



GRANT ALL ON TABLE "public"."stores" TO "service_role";
GRANT SELECT ON TABLE "public"."stores" TO "anon";
GRANT SELECT,UPDATE ON TABLE "public"."stores" TO "authenticated";



GRANT ALL ON TABLE "public"."user_roles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_roles" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































