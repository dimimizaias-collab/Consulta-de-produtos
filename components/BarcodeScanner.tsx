'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, RefreshCw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function BarcodeScanner({ onScan, onClose, isOpen }: BarcodeScannerProps) {
  const [scannerId] = useState(`scanner-${Math.random().toString(36).substr(2, 9)}`);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => { stopScanner(); };
  }, [isOpen]);

  const startScanner = async () => {
    setIsInitializing(true);
    setError(null);
    
    try {
      // Small delay to ensure the container is rendered
      await new Promise(resolve => setTimeout(resolve, 300));

      const scanner = new Html5Qrcode(scannerId, {
          verbose: false,
          formatsToSupport: [
              Html5QrcodeSupportedFormats.EAN_13,
              Html5QrcodeSupportedFormats.EAN_8,
              Html5QrcodeSupportedFormats.CODE_128,
              Html5QrcodeSupportedFormats.UPC_A,
              Html5QrcodeSupportedFormats.UPC_E
          ]
      });
      
      scannerRef.current = scanner;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 150 }, // Barcode shaped box
        aspectRatio: 1.0
      };

      await scanner.start(
        { facingMode: "environment" }, // Use back camera
        config,
        (decodedText) => {
          onScan(decodedText);
          stopScanner();
          onClose();
        },
        (errorMessage) => {
          // Failure to find code is normal, we don't show it as an error
        }
      );
      
      setIsInitializing(false);
    } catch (err: any) {
      console.error("Scanner initialization failed:", err);
      setError("Não foi possível acessar a câmera. Verifique as permissões.");
      setIsInitializing(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error("Failed to stop scanner:", err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Camera size={20} />
             </div>
             <div>
                <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Leitor de Código</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Aponte para o código de barras</p>
             </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-400"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scanner Viewport */}
        <div className="relative aspect-square bg-black overflow-hidden flex items-center justify-center">
           <div id={scannerId} className="w-full h-full" />
           
           {/* Overlay UI */}
           {isInitializing && (
             <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black text-white px-8 text-center">
                <RefreshCw size={48} className="animate-spin opacity-20" />
                <p className="text-xs font-black uppercase tracking-widest opacity-40">Iniciando Câmera...</p>
             </div>
           )}

           {error && (
             <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900 text-white px-8 text-center">
                <AlertCircle size={48} className="text-red-500" />
                <p className="text-sm font-bold leading-relaxed">{error}</p>
                <button 
                    onClick={startScanner}
                    className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold transition-all"
                >
                    Tentar Novamente
                </button>
             </div>
           )}

           {/* Custom Scanning Animation (Overlay) */}
           {!isInitializing && !error && (
               <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-[250px] h-[150px] border-2 border-primary/50 relative">
                        <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-primary rounded-tl-sm" />
                        <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-primary rounded-tr-sm" />
                        <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-primary rounded-bl-sm" />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-primary rounded-br-sm" />
                        
                        {/* Scanning Line */}
                        <motion.div 
                            animate={{ top: ['0%', '100%'] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.8)]"
                        />
                    </div>
               </div>
           )}
        </div>

        {/* Footer */}
        <div className="p-8 text-center bg-slate-50/50">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em]">
                Suporta EAN-13, EAN-8, UPC e Code 128
            </p>
        </div>
      </motion.div>
    </div>
  );
}
