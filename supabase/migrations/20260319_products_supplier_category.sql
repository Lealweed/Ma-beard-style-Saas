-- Migration: fornecedor, categoria e data de entrada em produtos
-- Date: 2026-03-19

DO $$ BEGIN
  ALTER TABLE products ADD COLUMN supplier TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'Geral';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE products ADD COLUMN entry_date DATE DEFAULT CURRENT_DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Movimentação de estoque (histórico de entradas e saídas)
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'saida', 'ajuste')),
  quantity INTEGER NOT NULL,
  reason TEXT,
  unit_cost NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
