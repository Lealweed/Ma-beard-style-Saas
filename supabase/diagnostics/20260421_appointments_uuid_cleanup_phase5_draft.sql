-- Draft de cleanup final apos cobertura UUID > 99.9%
-- Nao executar sem aprovacao explicita.
-- Date: 2026-04-21

-- 1) Validar constraints pendentes
-- ALTER TABLE public.appointments VALIDATE CONSTRAINT appointments_customer_uuid_fkey;
-- ALTER TABLE public.appointments VALIDATE CONSTRAINT appointments_barber_uuid_fkey;

-- 2) Congelar escrita legada no backend antes deste passo
-- 3) Remover colunas legadas somente apos observacao em producao

-- ALTER TABLE public.appointments DROP COLUMN customer_id;
-- ALTER TABLE public.appointments DROP COLUMN barber_id;
-- ALTER TABLE public.appointments DROP COLUMN client_id;
-- ALTER TABLE public.appointments DROP COLUMN professional_id;
