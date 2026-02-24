import React, { useState, useEffect, useRef } from 'react';
import { MoreVertical, Edit, MailWarning, Users } from 'lucide-react';
import { format } from 'date-fns';

const ContactItem = ({ mensagem, isSelected, onSelect, statusOptions, onUpdateStatus, getTextColorForBackground}) => {
    const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
    const [activeSubMenu, setActiveSubMenu] = useState(null);
    const [imgError, setImgError] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        setImgError(false);
    }, [mensagem.profilePicUrl]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setIsMainMenuOpen(false);
                setActiveSubMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const lastMessage = (() => {
        try {
            const conversa = JSON.parse(mensagem.conversa || '[]');
            if (conversa.length === 0) return 'Nenhum histórico.';
            const last = conversa[conversa.length - 1];
            const prefix = last.role === 'assistant' ? 'Você: ' : (mensagem.isGroup && last.senderName ? `${last.senderName}: ` : '');
            return prefix + (last.content || `[${last.type || 'Mídia'}]`);
        } catch { return 'Erro ao ler conversa.'; }
    })();

    const formatTime = (dateStr) => {
        try {
            const d = new Date(dateStr);
            const now = new Date();
            return format(d, format(d, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd') ? 'HH:mm' : 'dd/MM/yy');
        } catch { return '...'; }
    };

    return (
        <div className={`flex items-center p-3 cursor-pointer transition-colors ${isSelected ? 'bg-gray-200' : 'bg-white hover:bg-gray-50'}`} onClick={() => onSelect(mensagem)}>
            <div className={`w-12 h-12 rounded-full mr-3 flex-shrink-0 flex items-center justify-center font-bold text-white overflow-hidden ${mensagem.isGroup ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                {mensagem.profilePicUrl && !imgError ? (
                    <img src={mensagem.profilePicUrl} alt="" className="w-full h-full object-cover" onError={() => setImgError(true)} />
                ) : mensagem.isGroup ? (
                    <Users size={20} />
                ) : (
                    (mensagem.nome_contato || '??').substring(0, 2).toUpperCase()
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                    <h3 className="text-md font-semibold text-gray-800 truncate">{mensagem.nome_contato || mensagem.whatsapp}</h3>
                    <span className="text-xs text-brand-green font-bold ml-2">{formatTime(mensagem.updated_at)}</span>
                </div>
                
                {/* NOVO: Linha de Campanha e Situação */}
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {mensagem.campanha && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-50 text-blue-600 border border-blue-100 truncate max-w-[100px]" title={`Campanha: ${mensagem.campanha}`}>
                            {mensagem.campanha.toUpperCase()}
                        </span>
                    )}
                    {mensagem.situacao && (
                        <span 
                            className="px-1.5 py-0.5 text-[9px] font-bold rounded border truncate max-w-[100px]"
                            style={{ 
                                backgroundColor: statusOptions.find(opt => opt.nome === mensagem.situacao)?.cor + '15',
                                color: statusOptions.find(opt => opt.nome === mensagem.situacao)?.cor,
                                borderColor: statusOptions.find(opt => opt.nome === mensagem.situacao)?.cor + '30'
                            }}
                            title={`Situação: ${mensagem.situacao}`}
                        >
                            {mensagem.situacao.toUpperCase()}
                        </span>
                    )}
                </div>

                <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500 truncate">{lastMessage}</p>
                    <div className="flex items-center gap-1.5 ml-2">
                        {mensagem.isGroup && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-600 border border-indigo-200">GRUPO</span>
                        )}
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-600 border border-gray-200 truncate max-w-[80px]" title={mensagem.instanceName}>{mensagem.instanceName}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContactItem;
