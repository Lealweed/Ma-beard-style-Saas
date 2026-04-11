-- Garantir que a coluna 'category' exista na tabela services_catalog.
DO $$ BEGIN
  ALTER TABLE services_catalog ADD COLUMN category TEXT DEFAULT 'Avulso';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Inserir os novos serviços na tabela. Em caso de conflito (se houver), 
-- poderíamos usar ON CONFLICT, mas como não há constraint unique nativa
-- na coluna 'name' em services_catalog, faremos inserção normal.
INSERT INTO services_catalog (name, duration_minutes, price, category)
VALUES
  ('Cabelo e sobrancelha', 35, 50.00, 'Pacote'),
  ('Cabelo, barboterapia e sobrancelha', 75, 90.00, 'Pacote'),
  ('Cone hindu', 20, 25.00, 'Avulso'),
  ('Corte', 30, 40.00, 'Avulso'),
  ('Depilação de nariz com cera', 5, 15.00, 'Avulso'),
  ('Hidratação capilar', 20, 20.00, 'Avulso'),
  ('Máscara negra', 20, 25.00, 'Avulso'),
  ('Selagem', 80, 100.00, 'Avulso'),
  ('Sobrancelha na pinça', 10, 15.00, 'Avulso'),
  ('Sobrancelha navalha', 10, 10.00, 'Avulso'),
  ('Barboterapia', 30, 40.00, 'Avulso'),
  ('Botox', 80, 100.00, 'Avulso'),
  ('Cabelo', 60, 40.00, 'Avulso'),
  ('Cabelo e barboterapia', 60, 80.00, 'Pacote');
