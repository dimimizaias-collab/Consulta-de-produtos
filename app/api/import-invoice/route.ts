import { NextRequest, NextResponse } from 'next/server';

const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function cleanLines(raw: string): string[] {
  return raw
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 2);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Arquivo muito grande. Máximo: 10MB.` },
        { status: 400 },
      );
    }

    const mimeType = file.type || '';
    if (!ACCEPTED_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: `Tipo não suportado: ${mimeType}. Use PDF, JPG, PNG ou WebP.` },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (mimeType === 'application/pdf') {
      // Digital PDF: extract text directly
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
      const data = await pdfParse(buffer);
      const lines = cleanLines(data.text);
      return NextResponse.json({ lines, source: 'pdf' });
    } else {
      // Image: run Tesseract OCR
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('por+eng');
      const { data: { text } } = await worker.recognize(buffer);
      await worker.terminate();
      const lines = cleanLines(text);
      return NextResponse.json({ lines, source: 'ocr' });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido.';
    console.error('[import-invoice]', message);
    return NextResponse.json({ error: `Erro ao processar documento: ${message}` }, { status: 500 });
  }
}
