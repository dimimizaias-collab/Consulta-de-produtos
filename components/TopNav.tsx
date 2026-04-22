'use client';

import { useState } from 'react';
import { Search, Bell, User, ImageOff } from 'lucide-react';
import Image from 'next/image';
import { motion } from 'motion/react';

interface TopNavProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function TopNav({ searchQuery, onSearchChange }: TopNavProps) {
  const [logoError, setLogoError] = useState(false);

  return (
    <nav className="flex items-center justify-between px-4 md:px-8 py-3 md:py-4 w-full sticky top-0 z-50 bg-background/80 backdrop-blur-xl transition-all duration-300">
      <div className="flex items-center gap-3 md:gap-12 flex-1">
        {/* Brand logo — hidden on mobile to save space */}
        {!searchQuery && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="hidden md:flex items-center gap-4"
          >
             <div className="relative w-12 h-12 flex items-center justify-center">
              {!logoError ? (
                <Image
                  alt="Universo . do Logo"
                  src="https://lh3.googleusercontent.com/aida/ADBb0ugjk0-01HbCXpsC73FGgWJ6E5-oJfKrxgS6N0QFQhw2S8tNWaHhc1RMzhoNBx40dZ7AlkP5X3FjQJFu9JqoBYWtK1UDgWXwLHBCUO1g7RapTloLFLM60mjunmt1X3UsyPdaCIP9lUQoS5eXbDsupxyruogzBnPveLS0PNkJshQlrNnrpJCg_osPoEWKVo34cRA6r_bkjnfTw5-4xYPiDSgwWjuJW6nDh14ra_5WDj0Yq5zD4oh4V5ih9MnCFIZarnCbrDJxt4_f"
                  fill
                  className="object-contain grayscale brightness-50 contrast-125 opacity-20"
                  referrerPolicy="no-referrer"
                  unoptimized
                  onError={() => setLogoError(true)}
                />
              ) : (
                <ImageOff size={24} className="text-on-surface/10" />
              )}
            </div>
          </motion.div>
        )}

        {/* Search Bar */}
        <div className="max-w-3xl w-full">
          <div className="relative group">
            <div className="absolute inset-y-0 left-4 md:left-5 flex items-center pointer-events-none">
              <Search size={18} className="text-primary md:w-[22px] md:h-[22px]" />
            </div>
            <input
              className="w-full h-11 md:h-14 pl-11 md:pl-14 pr-4 md:pr-6 bg-surface-container-lowest border border-on-surface/5 rounded-xl md:rounded-2xl shadow-md md:shadow-xl shadow-on-surface/[0.02] focus:ring-2 md:focus:ring-4 focus:ring-primary/5 placeholder:text-on-surface/30 text-sm md:text-base font-medium transition-all outline-none"
              placeholder="EAN, SKU..."
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-6 ml-2 md:ml-0">
        <button className="p-2.5 md:p-3 rounded-full bg-surface-container-lowest/50 hover:bg-surface-container-lowest transition-all text-on-surface/60 hover:text-primary shadow-sm">
          <Bell size={18} className="md:w-5 md:h-5" />
        </button>
        {/* Desktop: full user card — Mobile: avatar icon only */}
        <div className="hidden md:flex items-center gap-4 bg-surface-container-low px-4 py-2 rounded-2xl border border-on-surface/[0.03]">
          <div className="text-right">
            <p className="text-[10px] font-extrabold leading-none text-on-surface uppercase tracking-tight">Universo Curator</p>
            <p className="text-[10px] text-primary font-bold mt-1">Admin Mode</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <User size={20} />
          </div>
        </div>
        <div className="flex md:hidden">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <User size={16} />
          </div>
        </div>
      </div>
    </nav>
  );
}
