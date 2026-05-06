import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportedItem {
  supplierCode: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  confidence: number;
  linkedProduct: {
    id: string;
    name: string;
    sku: string;
    ean: string;
  } | null;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `Você é especialista em extrair itens de notas fiscais e romaneios brasileiros.

Retorne APENAS um JSON válido no formato abaixo, sem texto adicional, sem markdown:
{
  "items": [
    {
      "supplierCode": "código do produto do fornecedor ou string vazia",
      "description": "descrição exatamente como aparece no documento",
      "unit": "unidade de medida (UN, KG, CX, SC, FD, PC, etc.) ou UN se não identificar",
      "quantity": número,
      "unitPrice": número ou 0 se não identificar,
      "confidence": número entre 0 e 1 indicando certeza da extração
    }
  ]
}

Regras:
- Ignorar cabeçalhos, totais gerais, impostos, observações, dados do emitente/destinatário
- Incluir apenas linhas de produto/mercadoria
- Se não conseguir identificar a quantidade, usar 1
- Se o preço unitário não aparecer mas o total sim, calcular: total / quantidade
- Manter a descrição em maiúsculas como no documento original
- Se o documento estiver ilegível ou sem produtos, retornar { "items": [] }`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseGeminiResponse(text: string): ImportedItem[] {
  // Strip markdown fences if present
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: { items?: unknown[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from surrounding text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed?.items)) return [];

  return parsed.items
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map(item => ({
      supplierCode: String(item.supplierCode ?? '').trim(),
      description: String(item.description ?? '').trim(),
      unit: String(item.unit ?? 'UN').trim() || 'UN',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.5)),
      linkedProduct: null,
    }))
    .filter(item => item.description.length > 0);
}

async function lookupMapping(
  supplierId: string,
  supplierCode: string,
  description: string,
): Promise<ImportedItem['linkedProduct']> {
  if (!supplierId) return null;

  let query = supabaseAdmin
    .from('supplier_mappings')
    .select('internal_product_id, products(id, name, sku, ean)')
    .eq('supplier_id', supplierId);

  if (supplierCode.trim()) {
    query = query.eq('supplier_sku', supplierCode.trim());
  } else if (description.trim()) {
    query = query.ilike('supplier_description', `%${description.trim()}%`);
  } else {
    return null;
  }

  const { data } = await query.limit(1).maybeSingle();

  if (!data?.products) return null;
  const p = data.products as unknown as { id: string; name: string; sku: string; ean: string | null };
  return { id: p.id, name: p.name, sku: p.sku, ean: p.ean ?? '' };
}

// ─── Route ────────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  if (!process.env.GOOGLE_API_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_API_KEY não configurada. Adicione ao .env.local e reinicie o servidor.' },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const supplierId = (formData.get('supplierId') as string) ?? '';

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Arquivo muito grande. Tamanho máximo: 10MB (recebido: ${(file.size / 1024 / 1024).toFixed(1)}MB).` },
        { status: 400 },
      );
    }

    const mimeType = file.type || 'application/octet-stream';
    if (!ACCEPTED_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Tipo de arquivo não suportado: ${mimeType}. Use PDF, JPG, PNG ou WebP.` },
        { status: 400 },
      );
    }

    // Convert to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');

    // Call Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const items = parseGeminiResponse(rawText);

    // Enrich with supplier dictionary mappings (best-effort, never throws)
    const enriched = await Promise.all(
      items.map(async item => {
        try {
          const linkedProduct = await lookupMapping(supplierId, item.supplierCode, item.description);
          return { ...item, linkedProduct };
        } catch {
          return item;
        }
      }),
    );

    return NextResponse.json({ items: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido.';
    console.error('[import-invoice] Erro:', message);
    return NextResponse.json({ error: `Erro ao processar documento: ${message}` }, { status: 500 });
  }
}
