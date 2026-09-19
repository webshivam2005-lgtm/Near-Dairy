

-- =========================================================================
-- Near Dairy - Supabase Schema with Separate Profile Tables
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- =========================================================================

-- 1. Create Dedicated Customer Profiles Table
CREATE TABLE IF NOT EXISTS public.customer_profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    address TEXT,
    flat_building TEXT,
    street_area TEXT,
    landmark TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    delivery_instructions TEXT,
    alternate_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Dedicated Dairy Partner Profiles Table
CREATE TABLE IF NOT EXISTS public.partner_profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    business_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create Dedicated Administrator Profiles Table
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    role_title TEXT DEFAULT 'Platform Administrator',
    department TEXT DEFAULT 'Operations',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Re-link Foreign Key Constraints
ALTER TABLE IF EXISTS public.dairies DROP CONSTRAINT IF EXISTS dairies_owner_id_fkey;
ALTER TABLE public.dairies
    ADD CONSTRAINT dairies_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.partner_profiles(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;
ALTER TABLE public.orders
    ADD CONSTRAINT orders_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customer_profiles(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_customer_id_fkey;
ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customer_profiles(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.reviews DROP CONSTRAINT IF EXISTS reviews_customer_id_fkey;
ALTER TABLE public.reviews
    ADD CONSTRAINT reviews_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customer_profiles(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.complaints DROP CONSTRAINT IF EXISTS complaints_customer_id_fkey;
ALTER TABLE public.complaints
    ADD CONSTRAINT complaints_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customer_profiles(id) ON DELETE CASCADE;

-- 5. Row Level Security (RLS) Policies
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public customer profiles are viewable by everyone" ON public.customer_profiles FOR SELECT USING (true);
CREATE POLICY "Allow insert to customer profiles" ON public.customer_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to customer profiles" ON public.customer_profiles FOR UPDATE USING (true);
CREATE POLICY "Allow delete to customer profiles" ON public.customer_profiles FOR DELETE USING (true);

CREATE POLICY "Public partner profiles are viewable by everyone" ON public.partner_profiles FOR SELECT USING (true);
CREATE POLICY "Allow insert to partner profiles" ON public.partner_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to partner profiles" ON public.partner_profiles FOR UPDATE USING (true);
CREATE POLICY "Allow delete to partner profiles" ON public.partner_profiles FOR DELETE USING (true);

CREATE POLICY "Public admin profiles are viewable by everyone" ON public.admin_profiles FOR SELECT USING (true);
CREATE POLICY "Allow insert to admin profiles" ON public.admin_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update to admin profiles" ON public.admin_profiles FOR UPDATE USING (true);
CREATE POLICY "Allow delete to admin profiles" ON public.admin_profiles FOR DELETE USING (true);

-- 6. Unified Compatibility View (profiles)
CREATE OR REPLACE VIEW public.profiles AS
    SELECT 
        id, email, full_name, phone, 'customer' AS role, avatar_url, 
        address, flat_building, street_area, landmark, city, state, pincode, 
        latitude, longitude, delivery_instructions, alternate_phone, 
        created_at, updated_at
    FROM public.customer_profiles
    UNION ALL
    SELECT 
        id, email, full_name, phone, 'partner' AS role, avatar_url, 
        address, NULL AS flat_building, NULL AS street_area, NULL AS landmark, 
        city, state, pincode, NULL AS latitude, NULL AS longitude, 
        NULL AS delivery_instructions, NULL AS alternate_phone, 
        created_at, updated_at
    FROM public.partner_profiles
    UNION ALL
    SELECT 
        id, email, full_name, phone, 'admin' AS role, avatar_url, 
        NULL AS address, NULL AS flat_building, NULL AS street_area, NULL AS landmark, 
        NULL AS city, NULL AS state, NULL AS pincode, NULL AS latitude, NULL AS longitude, 
        NULL AS delivery_instructions, NULL AS alternate_phone, 
        created_at, updated_at
    FROM public.admin_profiles;

-- 7. Storage Buckets Configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('neardairy-avatars', 'neardairy-avatars', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('neardairy-banners', 'neardairy-banners', true, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 15728640;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('neardairy-certificates', 'neardairy-certificates', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 20971520;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('neardairy-products', 'neardairy-products', true, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 15728640;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('neardairy-complaints', 'neardairy-complaints', true, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 15728640;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('neardairy-general', 'neardairy-general', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 20971520;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('neardairy-media', 'neardairy-media', true, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 15728640;

-- 8. Notifications System & Subscriptions Pause Delivery
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL,
    dairy_id UUID REFERENCES public.dairies(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'general',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.subscriptions 
    ADD COLUMN IF NOT EXISTS pause_start_date DATE,
    ADD COLUMN IF NOT EXISTS pause_end_date DATE,
    ADD COLUMN IF NOT EXISTS pause_reason TEXT,
    ADD COLUMN IF NOT EXISTS paused_days_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS adjusted_credit_amount NUMERIC DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS pause_notes TEXT;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public notifications policy" ON public.notifications;
CREATE POLICY "Public notifications policy" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

