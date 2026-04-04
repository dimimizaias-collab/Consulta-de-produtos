'use client';

import { useState } from 'react';
import { Search, Bell, User, ImageOff } from 'lucide-react';
import Image from 'next/image';

interface TopNavProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function TopNav({ searchQuery, onSearchChange }: TopNavProps) {
  const [logoError, setLogoError] = useState(false);

  return (
    <nav className="flex items-center justify-between px-6 py-3 w-full sticky top-0 z-50 bg-[#ffeb3b] border-b border-black/5">
      <div className="flex items-center gap-8 flex-1">
        {/* Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 flex items-center justify-center bg-[#ffeb3b] relative">
            <div className="relative w-10 h-10 flex items-center justify-center">
              {!logoError ? (
                <Image 
                  alt="Universo . do Logo" 
                  src="https://lh3.googleusercontent.com/aida/ADBb0ugjk0-01HbCXpsC73FGgWJ6E5-oJfKrxgS6N0QFQhw2S8tNWaHhc1RMzhoNBx40dZ7AlkP5X3FjQJFu9JqoBYWtK1UDgWXwLHBCUO1g7RapTloLFLM60mjunmt1X3UsyPdaCIP9lUQoS5eXbDsupxyruogzBnPveLS0PNkJshQlrNnrpJCg_osPoEWKVo34cRA6r_bkjnfTw5-4xYPiDSgwWjuJW6nDh14ra_5WDj0Yq5zD4oh4V5ih9MnCFIZarnCbrDJxt4_f"
                  fill
                  className="object-contain"
                  referrerPolicy="no-referrer"
                  unoptimized
                  onError={() => setLogoError(true)}
                />
              ) : (
                <ImageOff size={24} className="text-on-surface/20" />
              )}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl w-full">
          <div className="relative group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search size={20} className="text-on-surface/40" />
            </div>
            <input 
              className="w-full h-12 pl-12 pr-4 bg-white border-none rounded shadow-sm focus:ring-2 focus:ring-primary/10 placeholder:text-secondary/40 text-sm font-medium transition-all outline-none" 
              placeholder="Search by EAN, Code, Name, Location" 
              type="text" 
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 rounded-full hover:bg-black/5 transition-colors text-on-surface">
          <Bell size={20} />
        </button>
        <div className="h-8 w-[1px] bg-black/10 mx-2"></div>
        <div className="flex items-center gap-3 cursor-pointer group">
          <div className="text-right">
            <p className="text-xs font-bold leading-none text-on-surface">Universo do R$1,99</p>
            <p className="text-[10px] text-on-surface/70">Acesso Admin.</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center border-2 border-primary text-primary">
            <User size={20} />
          </div>
        </div>
      </div>
    </nav>
  );
}
