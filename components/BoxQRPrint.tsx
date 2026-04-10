'use client';

/**
 * BoxQRPrint — Geração e impressão de adesivos QR Code para caixas
 *
 * Como usar: adicione o botão "Imprimir QR Code" na página /boxes ou /box/[code],
 * importando este componente:
 *
 *   import BoxQRPrint from '@/components/BoxQRPrint';
 *
 * Dependência: instale a biblioteca qrcode.react no projeto:
 *   npm install qrcode.react
 */

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X } from 'lucide-react';

// -------------------------------------------------------
// Tipos
// -------------------------------------------------------
interface BoxInfo {
  qr_code: string;   // ex: "CAIXA-001"
  label: string;     // ex: "Caixa 01 - Limpeza"
  location?: string; // ex: "Prateleira A3"
}

interface BoxQRPrintProps {
  /** Caixa única (botão na tela de detalhe) ou lista (seleção múltipla) */
  boxes: BoxInfo[];
  /** Chamado ao fechar o modal */
  onClose: () => void;
}

// -------------------------------------------------------
// URL base do app — usada como destino do QR Code
// Quando o celular escanear, abre /box/CAIXA-001
// -------------------------------------------------------
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://consulta-de-produtos.vercel.app';

// -------------------------------------------------------
// Adesivo individual (visualização + impressão)
// -------------------------------------------------------
function QRLabel({ box }: { box: BoxInfo }) {
  const url = `${APP_URL}/box/${box.qr_code}`;

  return (
    <div
      className="qr-label"
      style={{
        width: '8cm',
        height: '5cm',
        border: '1px solid #555',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '10px',
        background: '#fff',
        color: '#000',
        pageBreakInside: 'avoid',
        fontFamily: 'sans-serif',
      }}
    >
      <QRCodeSVG
        value={url}
        size={120}
        bgColor="#ffffff"
        fgColor="#000000"
        level="M"
      />
      <p
        style={{
          fontSize: '13px',
          fontWeight: 700,
          textAlign: 'center',
          margin: 0,
          lineHeight: 1.3,
        }}
      >
        {box.label}
      </p>
      <p
        style={{
          fontSize: '10px',
          color: '#555',
          margin: 0,
          fontFamily: 'monospace',
        }}
      >
        {box.qr_code}
      </p>
      {box.location && (
        <p style={{ fontSize: '10px', color: '#777', margin: 0 }}>
          📍 {box.location}
        </p>
      )}
    </div>
  );
}

// -------------------------------------------------------
// Modal principal
// -------------------------------------------------------
export default function BoxQRPrint({ boxes, onClose }: BoxQRPrintProps) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>QR Codes — Caixas</title>
          <style>
            @page { size: A4; margin: 1cm; }
            body { margin: 0; background: #fff; }
            .grid {
              display: flex;
              flex-wrap: wrap;
              gap: 12px;
              padding: 10px;
            }
            .qr-label {
              width: 8cm;
              height: 5cm;
              border: 1px solid #555;
              border-radius: 8px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 6px;
              padding: 10px;
              background: #fff;
              color: #000;
              page-break-inside: avoid;
              font-family: sans-serif;
              box-sizing: border-box;
            }
          </style>
        </head>
        <body>
          <div class="grid">
            ${content.innerHTML}
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-full max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-[#1a1a2e] shadow-xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-bold text-white">
            QR Codes para impressão ({boxes.length} adesivo{boxes.length !== 1 ? 's' : ''})
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-white/10">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Pré-visualização */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="mb-4 text-xs text-gray-400">
            Pré-visualização dos adesivos. Cada QR Code abre diretamente a página da caixa no app.
          </p>
          <div ref={printRef} className="flex flex-wrap gap-4">
            {boxes.map((box) => (
              <QRLabel key={box.qr_code} box={box} />
            ))}
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          <p className="text-xs text-gray-500">
            Tamanho do adesivo: 8 × 5 cm (A4 comporta ~6 por página)
          </p>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
          >
            <Printer size={16} />
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
