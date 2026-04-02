import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    console.log('Iniciando upload de arquivo:', file.name, file.type, file.size);
    
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Ensure uploads directory exists
    const uploadDir = join(process.cwd(), 'public', 'uploads');
    console.log('Diretório de upload:', uploadDir);
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch (err) {
      console.error('Erro ao criar diretório:', err);
    }

    const fileExtension = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    const path = join(uploadDir, fileName);

    console.log('Salvando arquivo em:', path);
    await writeFile(path, buffer);
    
    const url = `/uploads/${fileName}`;
    console.log('Upload concluído com sucesso. URL:', url);
    return NextResponse.json({ url });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ 
      error: 'Error uploading file', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
