import React, { useState, useEffect, useRef } from 'react';
import { Check, X, User } from 'lucide-react';

const NameEditor = ({ currentName, onSave, onClose }) => {
    const [name, setName] = useState(currentName);
    const editorRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (editorRef.current && !editorRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const handleSave = () => {
        if (name.trim()) {
            onSave(name.trim());
        }
    };

    return (
        <div 
            ref={editorRef}
            className="w-full bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.05)] border border-white p-4 animate-fade-in-up-fast"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-brand-green flex items-center justify-center">
                    <User size={16} />
                </div>
                <p className="editorial-label text-slate-900">Editar Identificação</p>
            </div>

            <div className="space-y-3">
                <input
                    autoFocus
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome do contato..."
                    className="w-full px-4 py-3 text-[13px] bg-slate-50 rounded-xl border border-transparent focus:bg-white focus:border-emerald-100 focus:ring-4 focus:ring-emerald-50/50 outline-none transition-all font-bold text-slate-700"
                    onKeyPress={(e) => e.key === 'Enter' && handleSave()}
                />
                
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 rounded-xl transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!name.trim() || name === currentName}
                        className="flex-1 py-2.5 bg-brand-green text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-100 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
                    >
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NameEditor;
