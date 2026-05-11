import React from 'react';
import { Search, Users, Bot, Filter } from 'lucide-react';

const SearchAndFilter = ({ searchTerm, setSearchTerm, activeButtonGroup, toggleFilter, onFilterIconClick, hasActiveFilters }) => {
    const baseButtonClass = "px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all flex-1 flex items-center justify-center gap-2 border-2";
    const activeButtonClass = "bg-brand-green border-brand-green text-white shadow-xl shadow-emerald-200 scale-[1.02]";
    const inactiveButtonClass = "bg-white/50 border-white/80 text-slate-400 hover:border-brand-green/30 hover:text-brand-green backdrop-blur-sm";

    return (
        <div className="flex-shrink-0 p-6 flex flex-col gap-6">
            {/* Barra de Busca */}
            <div className="relative w-full group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-brand-green transition-colors" size={18} />
                <input
                    type="text"
                    placeholder="Pesquisar contatos..."
                    className="w-full pl-12 pr-12 py-3.5 bg-white/50 border-2 border-transparent rounded-xl focus:outline-none focus:ring-0 focus:border-brand-green focus:bg-white transition-all text-[14px] font-bold text-slate-700 placeholder:text-slate-300 shadow-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                
                <button
                    onClick={onFilterIconClick}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-xl transition-all ${hasActiveFilters ? 'bg-brand-green text-white' : 'text-slate-300 hover:text-brand-green'}`}
                >
                    <Filter size={16} />
                </button>
            </div>

            {/* Botões de Filtro - Restaurando Layout Original (Dois Botões com Gap) */}
            <div className="flex items-center justify-center gap-4 w-full">
                <button
                    onClick={() => toggleFilter('atendimentos')}
                    className={`${baseButtonClass} ${activeButtonGroup === 'atendimentos' ? activeButtonClass : inactiveButtonClass}`}
                >
                    <Users size={16} />
                    Contatos
                </button>
                <button
                    onClick={() => toggleFilter('bot_ia')}
                    className={`${baseButtonClass} ${activeButtonGroup === 'bot_ia' ? activeButtonClass : inactiveButtonClass}`}
                >
                    <Bot size={16} />
                    Bot IA
                </button>
            </div>
        </div>
    );
};

export default SearchAndFilter;