-- ============================================================
-- MASTER AUDIT FIX v2 — MA Beard Style SaaS
-- Gerado em: 2026-03-19  |  Atualizado: 2026-03-19
-- Seguro para rodar múltiplas vezes (idempotente)
-- Cobre: tabelas, colunas, triggers, RLS, índices de performance
-- ============================================================

-- ============================================================
-- SEÇÃO 1 — TABELAS
-- ============================================================

-- 1. config (chave-valor do sistema: horários, nome, tokens Google)
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adiciona updated_at caso a tabela existisse sem ela
DO $$ BEGIN ALTER TABLE config ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 2. plans (planos de assinatura, sincronizados com Stripe)
CREATE TABLE IF NOT EXISTS plans (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL DEFAULT '',
  price             NUMERIC(10,2) NOT NULL DEFAULT 0,
  description       TEXT DEFAULT '',
  benefits          JSONB DEFAULT '[]',
  stripe_product_id TEXT,
  stripe_price_id   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adiciona colunas Stripe caso a tabela já existisse sem elas
DO $$ BEGIN ALTER TABLE plans ADD COLUMN stripe_product_id TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE plans ADD COLUMN stripe_price_id   TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE plans ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Índice único para upsert via stripe_product_id
CREATE UNIQUE INDEX IF NOT EXISTS plans_stripe_product_id_uidx
  ON plans (stripe_product_id)
  WHERE stripe_product_id IS NOT NULL;

-- 3. customers (clientes da barbearia)
CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  cpf        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_email_uidx
  ON customers (email) WHERE email IS NOT NULL AND email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_uidx
  ON customers (phone) WHERE phone IS NOT NULL AND phone <> '';

-- 4. barbers (equipe de barbeiros)
CREATE TABLE IF NOT EXISTS barbers (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  specialty       TEXT,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.30,
  phone           TEXT,
  cpf             TEXT,
  address         TEXT,
  photo_url       TEXT,
  hired_at        DATE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adiciona hired_at caso a tabela existisse antes
DO $$ BEGIN
  ALTER TABLE barbers ADD COLUMN hired_at DATE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 5. products (estoque de produtos)
CREATE TABLE IF NOT EXISTS products (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  cost       NUMERIC(10,2) NOT NULL DEFAULT 0,
  price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock      INTEGER NOT NULL DEFAULT 0,
  min_stock  INTEGER NOT NULL DEFAULT 5,
  supplier   TEXT,
  category   TEXT DEFAULT 'Geral',
  entry_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Colunas adicionadas na fase 10 — seguro re-executar
DO $$ BEGIN ALTER TABLE products ADD COLUMN supplier   TEXT;                      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN category   TEXT DEFAULT 'Geral';      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN entry_date DATE DEFAULT CURRENT_DATE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE products ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 6. stock_movements (histórico de entradas/saídas de estoque)
CREATE TABLE IF NOT EXISTS stock_movements (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('entrada', 'saida', 'ajuste')),
  quantity   INTEGER NOT NULL,
  reason     TEXT,
  unit_cost  NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. services_catalog (catálogo de serviços disponíveis)
CREATE TABLE IF NOT EXISTS services_catalog (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  price            NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  description      TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Colunas que podem estar faltando em instâncias antigas
DO $$ BEGIN ALTER TABLE services_catalog ADD COLUMN description      TEXT;                          EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE services_catalog ADD COLUMN active           BOOLEAN NOT NULL DEFAULT TRUE;  EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE services_catalog ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60;    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE services_catalog ADD COLUMN updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Seed padrão — só insere se tabela estiver vazia
INSERT INTO services_catalog (name, price, duration_minutes)
SELECT name, price, duration_minutes FROM (VALUES
  ('Corte Simples',      35.00, 30),
  ('Corte + Barba',      55.00, 60),
  ('Barba Tradicional',  30.00, 30),
  ('Hidratação Capilar', 40.00, 45),
  ('Sobrancelha',        15.00, 15)
) AS v(name, price, duration_minutes)
WHERE NOT EXISTS (SELECT 1 FROM services_catalog LIMIT 1);

-- 8. services (serviços realizados — PDV/caixa)
CREATE TABLE IF NOT EXISTS services (
  id                SERIAL PRIMARY KEY,
  barber_id         INTEGER REFERENCES barbers(id) ON DELETE SET NULL,
  customer_name     TEXT,
  service_type      TEXT,
  price             NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method    TEXT DEFAULT 'dinheiro',
  date              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN ALTER TABLE services ADD COLUMN payment_method TEXT DEFAULT 'dinheiro'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE services ADD COLUMN date TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
-- Retroativo: garante que linhas antigas com date NULL não quebrem queries de range
UPDATE services SET date = NOW() WHERE date IS NULL;

-- 9. sales (vendas de produtos — PDV/caixa)
CREATE TABLE IF NOT EXISTS sales (
  id             SERIAL PRIMARY KEY,
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  quantity       INTEGER NOT NULL DEFAULT 1,
  total_price    NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'dinheiro',
  date           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN ALTER TABLE sales ADD COLUMN payment_method TEXT DEFAULT 'dinheiro'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE sales ADD COLUMN date TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
-- Retroativo: garante que linhas antigas com date NULL não quebrem queries de range
UPDATE sales SET date = NOW() WHERE date IS NULL;

-- 10. subscriptions (assinaturas de clientes — Stripe ou manual)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     TEXT PRIMARY KEY,
  customer_email         TEXT NOT NULL,
  plan_id                TEXT REFERENCES plans(id) ON DELETE SET NULL,
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','cancelled','past_due','trialing')),
  stripe_subscription_id TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN ALTER TABLE subscriptions ADD COLUMN stripe_subscription_id TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE subscriptions ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 11. appointments (agendamentos — sincronizados com Google Calendar)
CREATE TABLE IF NOT EXISTS appointments (
  id               SERIAL PRIMARY KEY,
  customer_id      INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  barber_id        INTEGER REFERENCES barbers(id)   ON DELETE SET NULL,
  service_type     TEXT,
  appointment_date TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','confirmed','completed','cancelled','no_show')),
  google_event_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN ALTER TABLE appointments ADD COLUMN google_event_id TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE appointments ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE appointments ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 12. expenses (despesas operacionais — DRE)
CREATE TABLE IF NOT EXISTS expenses (
  id          SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  category    TEXT DEFAULT 'Geral',
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SEÇÃO 2 — FUNÇÃO + TRIGGERS updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN CREATE TRIGGER set_updated_at_config        BEFORE UPDATE ON config         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER set_updated_at_plans          BEFORE UPDATE ON plans          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER set_updated_at_customers      BEFORE UPDATE ON customers      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER set_updated_at_barbers        BEFORE UPDATE ON barbers        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER set_updated_at_products       BEFORE UPDATE ON products       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER set_updated_at_services_cat   BEFORE UPDATE ON services_catalog FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER set_updated_at_appointments   BEFORE UPDATE ON appointments   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER set_updated_at_subscriptions  BEFORE UPDATE ON subscriptions  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SEÇÃO 3 — ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Estratégia: habilitar RLS em todas as tabelas e criar políticas
-- que permitem acesso total às roles 'anon' e 'authenticated'.
-- O servidor Express usa SUPABASE_ANON_KEY (role=anon) para todas
-- as operações back-end. Se migrar para SUPABASE_SERVICE_ROLE_KEY,
-- remova as políticas 'anon' e o service_role bypassa RLS.
-- ============================================================

ALTER TABLE config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE barbers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE services_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE services         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales            ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses         ENABLE ROW LEVEL SECURITY;

-- Helper: drop-then-create para cada policy (evita duplicate_object)

-- config
DROP POLICY IF EXISTS "ma_anon_all"  ON config; CREATE POLICY "ma_anon_all"  ON config FOR ALL TO anon          USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON config; CREATE POLICY "ma_auth_all"  ON config FOR ALL TO authenticated  USING (true) WITH CHECK (true);

-- plans
DROP POLICY IF EXISTS "ma_anon_all"  ON plans;  CREATE POLICY "ma_anon_all"  ON plans  FOR ALL TO anon          USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON plans;  CREATE POLICY "ma_auth_all"  ON plans  FOR ALL TO authenticated  USING (true) WITH CHECK (true);

-- customers
DROP POLICY IF EXISTS "ma_anon_all"  ON customers; CREATE POLICY "ma_anon_all"  ON customers FOR ALL TO anon         USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON customers; CREATE POLICY "ma_auth_all"  ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- barbers
DROP POLICY IF EXISTS "ma_anon_all"  ON barbers; CREATE POLICY "ma_anon_all"  ON barbers FOR ALL TO anon         USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON barbers; CREATE POLICY "ma_auth_all"  ON barbers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- products
DROP POLICY IF EXISTS "ma_anon_all"  ON products; CREATE POLICY "ma_anon_all"  ON products FOR ALL TO anon         USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON products; CREATE POLICY "ma_auth_all"  ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- stock_movements
DROP POLICY IF EXISTS "ma_anon_all"  ON stock_movements; CREATE POLICY "ma_anon_all"  ON stock_movements FOR ALL TO anon         USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON stock_movements; CREATE POLICY "ma_auth_all"  ON stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- services_catalog
DROP POLICY IF EXISTS "ma_anon_all"  ON services_catalog; CREATE POLICY "ma_anon_all"  ON services_catalog FOR ALL TO anon         USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON services_catalog; CREATE POLICY "ma_auth_all"  ON services_catalog FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- services
DROP POLICY IF EXISTS "ma_anon_all"  ON services; CREATE POLICY "ma_anon_all"  ON services FOR ALL TO anon         USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON services; CREATE POLICY "ma_auth_all"  ON services FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- sales
DROP POLICY IF EXISTS "ma_anon_all"  ON sales; CREATE POLICY "ma_anon_all"  ON sales FOR ALL TO anon         USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON sales; CREATE POLICY "ma_auth_all"  ON sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- subscriptions
DROP POLICY IF EXISTS "ma_anon_all"  ON subscriptions; CREATE POLICY "ma_anon_all"  ON subscriptions FOR ALL TO anon         USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON subscriptions; CREATE POLICY "ma_auth_all"  ON subscriptions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- appointments
DROP POLICY IF EXISTS "ma_anon_all"  ON appointments; CREATE POLICY "ma_anon_all"  ON appointments FOR ALL TO anon         USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON appointments; CREATE POLICY "ma_auth_all"  ON appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- expenses
DROP POLICY IF EXISTS "ma_anon_all"  ON expenses; CREATE POLICY "ma_anon_all"  ON expenses FOR ALL TO anon         USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ma_auth_all"  ON expenses; CREATE POLICY "ma_auth_all"  ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- SEÇÃO 4 — ÍNDICES DE PERFORMANCE
-- Baseados nas queries reais do server.ts (range, eq, filtros)
-- ============================================================

-- appointments: queries por barbeiro + data (agenda diária/semanal)
CREATE INDEX IF NOT EXISTS appointments_barber_date_idx
  ON appointments (barber_id, appointment_date);

-- appointments: queries por status + google_event_id (sync GCal)
CREATE INDEX IF NOT EXISTS appointments_status_gcal_idx
  ON appointments (status, google_event_id)
  WHERE google_event_id IS NOT NULL;

-- subscriptions: filtro por status (booking gate e painel admin)
CREATE INDEX IF NOT EXISTS subscriptions_status_idx
  ON subscriptions (status);

-- subscriptions: lookup por email no booking gate
CREATE INDEX IF NOT EXISTS subscriptions_email_idx
  ON subscriptions (customer_email);

-- services: queries de range por data (DRE e relatórios)
CREATE INDEX IF NOT EXISTS services_date_idx
  ON services (date);

-- sales: queries de range por data (DRE e relatórios)
CREATE INDEX IF NOT EXISTS sales_date_idx
  ON sales (date);

-- stock_movements: lookup por produto (histórico de movimentação)
CREATE INDEX IF NOT EXISTS stock_movements_product_idx
  ON stock_movements (product_id);

-- ============================================================
-- SEÇÃO 5 — BUCKET DE STORAGE (instruções)
-- ============================================================
-- Execute no painel Storage do Supabase:
--   Criar bucket público chamado: videos
--   Policy: allow anon/authenticated INSERT, UPDATE, SELECT
-- Não pode ser feito via SQL puro — use o painel web.
-- ============================================================
