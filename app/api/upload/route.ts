import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Check if Supabase is configured
    const isSupabaseConfigured = 
      process.env.NEXT_PUBLIC_SUPABASE_URL && 
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

    if (!isSupabaseConfigured) {
      return NextResponse.json({ 
        error: 'Supabase não está configurado', 
        details: 'Por favor, configure as variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no menu Settings.' 
      }, { status: 500 });
    }

    console.log('Iniciando upload de arquivo para Supabase:', file.name, file.type, file.size);
    
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileExtension = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    // We use a simple path in the 'images' bucket
    const filePath = fileName;

    // Upload to Supabase Storage using supabaseAdmin
    // Note: The 'images' bucket must exist for this to work
    const { data, error } = await supabaseAdmin.storage
      .from('images')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (error) {
      console.error('Erro no upload do Supabase:', error);
      
      // If bucket doesn't exist, provide a helpful message
      if (error.message.includes('bucket not found')) {
        return NextResponse.json({ 
          error: 'Bucket "images" não encontrado no Supabase', 
          details: 'Por favor, crie um bucket chamado "images" no console do Supabase e defina-o como público.' 
        }, { status: 500 });
      }

      return NextResponse.json({ 
        error: 'Erro no upload do Supabase', 
        details: error.message 
      }, { status: 500 });
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('images')
      .getPublicUrl(filePath);

    console.log('Upload concluído com sucesso. URL:', publicUrl);
    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ 
      error: 'Error uploading file', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
