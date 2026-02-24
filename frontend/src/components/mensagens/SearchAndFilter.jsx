import React from 'react';
import { Search, Users, Bot, Filter } from 'lucide-react';

const SearchAndFilter = ({ searchTerm, setSearchTerm, activeButtonGroup, toggleFilter, onFilterIconClick, hasActiveFilters }) => {
    const baseButtonClass = "px-3 py-2 text-xs font-bold rounded-xl transition-all flex-1 flex items-center justify-center gap-2 border-2";
    const activeButtonClass = "bg-brand-green border-brand-green text-white shadow-md";
    const inactiveButtonClass = "bg-white border-gray-100 text-gray-500 hover:border-brand-green/30 hover:text-brand-green";

    return (
        <div className="flex-shrink-0 p-4 bg-white border-b border-gray-200 flex flex-col gap-4">
            {/* Barra de Busca */}
            <div className="relative w-full group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand-green transition-colors" size={18} />
                <input
                    type="text"
                    placeholder="Pesquisar contatos..."
                    className="w-full pl-10 pr-12 py-2.5 bg-gray-100 border-2 border-transparent rounded-xl focus:outline-none focus:ring-0 focus:border-brand-green focus:bg-white transition-all text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Botões de Filtro */}
            <div className="flex items-center justify-center gap-3 w-full">
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