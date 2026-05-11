import React, { useState, useEffect, useRef } from 'react';
import { Phone, FileText, Tag, Edit, Cpu, X, Check, Plus, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosConfig';

const ProfileSidebar = ({
    atendimento, onClose, statusOptions, getTextColorForBackground, isOpen,
    allTags, onUpdateTags, onAddNewTag, onUpdateStatus
}) => {
    const [activeSubMenu, setActiveSubMenu] = useState(null);
    const [isEditingObs, setIsEditingObs] = useState(false);
    const [obsText, setObsText] = useState(atendimento.observacoes || '');

    const textareaRef = useRef(null);
    const statusRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (statusRef.current && !statusRef.current.contains(event.target)) {
                if (activeSubMenu === 'status') setActiveSubMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeSubMenu]);

    useEffect(() => {
        setIsEditingObs(false);
        setObsText(atendimento.observacoes || '');
        setActiveSubMenu(null);
    }, [atendimento.id]);

    useEffect(() => {
        if (!isEditingObs) setObsText(atendimento.observacoes || '');
    }, [atendimento.observacoes]);

    useEffect(() => {
        if (isEditingObs && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [obsText, isEditingObs]);

    const getStatusStyle = (status) => {
        const situacao = statusOptions.find(opt => opt.nome === status);
        if (situacao && situacao.cor) {
            return {
                backgroundColor: situacao.cor,
                color: '#FFFFFF',
                boxShadow: `0 4px 12px ${situacao.cor}40`
            };
        }
        return { backgroundColor: '#64748b', color: '#FFFFFF' };
    };

    const handleStatusChange = (e, newStatus) => {
        e.stopPropagation();
        onUpdateStatus(atendimento.id, { status: newStatus });
        setActiveSubMenu(null);
    };

    const handleSaveObs = async () => {
        const newObs = obsText.trim() || null;
        if (onUpdateStatus) onUpdateStatus(atendimento.id, { observacoes: newObs });
        setIsEditingObs(false);
        try {
            await api.put(`/whatsapp/${atendimento.instanceId}/chats/${atendimento.remoteJid}`, {
                observacoes: newObs
            });
            toast.success('Nota salva');
        } catch (error) { toast.error('Erro ao salvar'); }
    };

    const statusStyle = getStatusStyle(atendimento.status);

    return (
        <div className="h-full flex flex-col bg-transparent overflow-hidden">
            <header className="px-6 py-8 flex-shrink-0">
                <div className="flex items-center justify-between mb-6">
                    <p className="editorial-label">Informações do Contato</p>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/40 hover:bg-white transition-all text-slate-400">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex flex-col items-center">
                    <div className="w-24 h-24 rounded-[2.5rem] bg-gradient-to-br from-brand-green to-emerald-700 flex items-center justify-center text-white shadow-xl shadow-emerald-200 mb-4 executive-title text-4xl">
                        {(atendimento.nome_contato || atendimento.whatsapp || '??').substring(0, 2).toUpperCase()}
                    </div>

                    <div className="relative group text-center">
                        <h2 className="executive-title text-xl text-slate-900 transition-colors">
                            {atendimento.nome_contato || 'Identificar Lead'}
                        </h2>
                        <p className="text-[12px] font-bold text-slate-400 mt-0.5 flex items-center justify-center gap-2">
                            <Phone size={10} className="text-brand-green" /> {atendimento.whatsapp}
                        </p>
                    </div>

                    <div className="mt-8 relative" ref={statusRef}>
                        <button
                            onClick={() => setActiveSubMenu(activeSubMenu === 'status' ? null : 'status')}
                            className="px-6 py-2 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all hover:scale-105"
                            style={statusStyle}
                        >
                            {atendimento.status}
                        </button>

                        {activeSubMenu === 'status' && (
                            <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 w-64 bg-white border border-slate-100 rounded-3xl shadow-2xl z-50 p-2">
                                <p className="editorial-label p-3 border-b border-slate-50 mb-1">Mudar Lead Para</p>
                                <div className="max-h-60 overflow-y-auto no-scrollbar">
                                    {(statusOptions || []).map(opt => (
                                        <button key={opt.nome} onClick={(e) => handleStatusChange(e, opt.nome)} className="w-full text-left p-3 text-[12px] font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-green rounded-2xl transition-all flex items-center gap-3">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.cor }}></span>
                                            {opt.nome}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-8 space-y-6">
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <Cpu size={18} className="text-brand-green" />
                            <p className="editorial-label pt-1 text-slate-900">Resumo IA</p>
                        </div>
                    </div>
                    <div className="p-5 bg-emerald-50/50 rounded-3xl border border-emerald-50">
                        <p className="text-[13px] leading-relaxed text-slate-600 font-bold italic">
                            {atendimento.resumo || "Aguardando análise de interação significativa..."}
                        </p>
                    </div>
                </section>

                <section>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <FileText size={18} className="text-emerald-600" />
                            <p className="editorial-label pt-1">Notas de Campo</p>
                        </div>
                        {!isEditingObs && (
                            <button onClick={() => setIsEditingObs(true)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all">
                                <Edit size={14} />
                            </button>
                        )}
                    </div>

                    {isEditingObs ? (
                        <div className="space-y-3">
                            <textarea
                                ref={textareaRef}
                                value={obsText}
                                onChange={(e) => setObsText(e.target.value)}
                                className="w-full p-5 text-[13px] bg-white rounded-3xl border border-emerald-100 focus:ring-2 focus:ring-emerald-100 outline-none resize-none no-scrollbar font-medium"
                                placeholder="Insira dados críticos do lead..."
                            />
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setIsEditingObs(false)} className="px-4 py-2 text-[10px] font-black uppercase text-slate-400">Cancelar</button>
                                <button onClick={handleSaveObs} className="px-5 py-2 text-[10px] font-black uppercase bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-100">Atualizar</button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-5 bg-emerald-50/50 rounded-3xl border border-emerald-50">
                            <p className="text-[13px] text-slate-600 leading-relaxed font-bold italic">
                                {obsText || "Nenhuma nota específica foi registrada por operadores."}
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export default ProfileSidebar;
