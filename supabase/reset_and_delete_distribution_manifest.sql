-- ============================================================
-- Exclui um manifesto de Distribuição com dado corrompido (ex.: DIST-000004,
-- que perdeu itens pelo bug corrigido em 132bdf6 — sobrescrita da lista ao
-- reabrir o manifesto) e, se ele tiver sido gerado automaticamente a partir
-- de uma nota (source_note_id preenchido), reseta a Situação da Distribuição
-- dessa nota pra NULL — libera o botão "Enviar Distribuição" de novo, sem
-- mexer nas quantidades já preenchidas na coluna Distribuição da nota.
--
-- distribution_manifest_items tem ON DELETE CASCADE em manifest_id, então
-- apagar o manifesto já apaga os itens dele junto — não precisa de DELETE
-- separado.
--
-- Troque o número abaixo e execute no SQL Editor do Supabase.
-- ============================================================

DO $$
DECLARE
  v_manifest_number TEXT := 'DIST-000004';
  v_manifest_id UUID;
  v_note_id TEXT;
BEGIN
  SELECT id, source_note_id INTO v_manifest_id, v_note_id
  FROM distribution_manifests
  WHERE manifest_number = v_manifest_number;

  IF v_manifest_id IS NULL THEN
    RAISE EXCEPTION 'Manifesto % não encontrado.', v_manifest_number;
  END IF;

  IF v_note_id IS NOT NULL THEN
    UPDATE review_notes
    SET distribution_status = NULL,
        distribution_sent_at = NULL,
        distribution_sent_by_id = NULL,
        distribution_sent_by_name = NULL
    WHERE id = v_note_id;
    RAISE NOTICE 'Nota % resetada (Situação da Distribuição voltou para vazia).', v_note_id;
  ELSE
    RAISE NOTICE 'Manifesto % não tem nota de origem (foi criado manualmente) — nada a resetar em review_notes.', v_manifest_number;
  END IF;

  DELETE FROM distribution_manifests WHERE id = v_manifest_id;
  RAISE NOTICE 'Manifesto % excluído.', v_manifest_number;
END $$;
