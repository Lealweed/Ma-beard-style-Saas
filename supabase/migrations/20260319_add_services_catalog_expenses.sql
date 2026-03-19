-- Migration: Catálogo de Serviços, Despesas e Forma de Pagamento
-- Date: 2026-03-19

-- Catálogo de Serviços (ex: Corte R$45, Barba R$30, Combo R$65)
CREATE TABLE IF NOT EXISTS services_catalog (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Despesas operacionais
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Outros',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adiciona forma de pagamento nas tabelas de serviços e vendas
DO $$ BEGIN
  ALTER TABLE services ADD COLUMN payment_method TEXT DEFAULT 'dinheiro';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE sales ADD COLUMN payment_method TEXT DEFAULT 'dinheiro';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Seed de serviços iniciais
INSERT INTO services_catalog (name, price, duration_minutes, description) VALUES
  ('Corte Masculino', 45.00, 30, 'Corte clássico ou moderno'),
  ('Barba', 30.00, 20, 'Aparar e modelar barba'),
  ('Corte + Barba', 65.00, 50, 'Combo corte e barba completo'),
  ('Sobrancelha', 15.00, 10, 'Design de sobrancelha'),
  ('Pigmentação', 80.00, 60, 'Pigmentação capilar ou de barba')
ON CONFLICT DO NOTHING;
