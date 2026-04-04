'use client';

import { 
  LayoutDashboard, 
  Package2, 
  MapPin, 
  BarChart3, 
  ArrowLeftRight, 
  Settings,
  Pin,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ activeTab, setActiveTab, isCollapsed, onToggleCollapse }: SidebarProps) {
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard' },
    { icon: Package2, label: 'Inventory' },
    { icon: MapPin, label: 'Stock Locations' },
    { icon: BarChart3, label: 'Requisições' },
    { icon: ArrowLeftRight, label: 'Internal Orders' },
    { icon: Settings, label: 'Settings' },
  ];

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-full bg-white flex flex-col pt-6 border-r border-black/5 z-40 transition-all duration-300",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className={cn("px-4 mb-8 flex flex-col", isCollapsed ? "items-center" : "")}>
        <div className={cn("flex items-center gap-3 mb-10 relative", isCollapsed ? "justify-center" : "")}>
          <div className="w-11 h-11 rounded bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/10 shrink-0">
            <Package2 size={24} />
          </div>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <h2 className="text-base font-manrope font-extrabold tracking-tight text-on-surface leading-tight">Mizumoto.inc</h2>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest leading-tight">Loja 01</p>
            </motion.div>
          )}
          
          <button 
            onClick={onToggleCollapse}
            className={cn(
              "absolute -right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-primary transition-all shadow-sm z-50",
              isCollapsed ? "right-[-12px]" : ""
            )}
            title={isCollapsed ? "Expandir" : "Recolher"}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <Pin size={14} className="rotate-45" />}
          </button>
        </div>

        <nav className="flex flex-col gap-1.5 w-full">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => setActiveTab(item.label)}
              className={cn(
                "flex items-center rounded-lg transition-all duration-200 group text-left w-full",
                isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
                activeTab === item.label 
                  ? "text-primary bg-white border-l-4 border-primary rounded-r-lg shadow-sm" 
                  : "text-secondary hover:text-primary hover:bg-white"
              )}
              title={isCollapsed ? item.label : ""}
            >
              <item.icon 
                size={20} 
                className={cn(
                  "transition-transform shrink-0",
                  activeTab !== item.label && "group-hover:scale-110"
                )} 
              />
              {!isCollapsed && (
                <span className={cn(
                  "text-sm font-body overflow-hidden whitespace-nowrap",
                  activeTab === item.label ? "font-bold" : "font-semibold"
                )}>
                  {item.label}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {!isCollapsed && (
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
      )}
    </aside>
  );
}
