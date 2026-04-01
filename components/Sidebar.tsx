'use client';

import { 
  LayoutDashboard, 
  Package2, 
  MapPin, 
  BarChart3, 
  ArrowLeftRight, 
  Settings 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', active: false },
  { icon: Package2, label: 'Inventory', active: true },
  { icon: MapPin, label: 'Stock Locations', active: false },
  { icon: BarChart3, label: 'Reports', active: false },
  { icon: ArrowLeftRight, label: 'Internal Orders', active: false },
  { icon: Settings, label: 'Settings', active: false },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-white flex flex-col pt-24 border-r border-black/5 z-40">
      <div className="px-6 mb-8">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-11 h-11 rounded bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/10">
            <Package2 size={24} />
          </div>
          <div>
            <h2 className="text-base font-manrope font-extrabold tracking-tight text-on-surface leading-tight">Mizumoto.inc</h2>
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest leading-tight">Loja 01</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5">
          {navItems.map((item) => (
            <a
              key={item.label}
              href="#"
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group",
                item.active 
                  ? "text-primary bg-white border-l-4 border-primary rounded-r-lg shadow-sm" 
                  : "text-secondary hover:text-primary hover:bg-white"
              )}
            >
              <item.icon 
                size={20} 
                className={cn(
                  "transition-transform",
                  !item.active && "group-hover:scale-110"
                )} 
              />
              <span className={cn(
                "text-sm font-body",
                item.active ? "font-bold" : "font-semibold"
              )}>
                {item.label}
              </span>
            </a>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-6 border-t border-black/5">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-black/5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-extrabold text-secondary uppercase">Warehouse Load</p>
            <span className="text-[10px] font-bold text-primary">75%</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: '75%' }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="h-full bg-primary rounded-full" 
            />
          </div>
          <p className="text-[9px] text-secondary/60 mt-2 font-medium">Approaching full capacity</p>
        </div>
      </div>
    </aside>
  );
}
