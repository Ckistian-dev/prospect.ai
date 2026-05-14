import React, { useState, useEffect, useRef } from 'react';
import { MoreVertical, Tag, CheckCircle2, MailWarning, Edit, Headset } from 'lucide-react';
import { format } from 'date-fns';
import { stripWhatsAppFormatting } from '../../utils/formatters.jsx';

const ContactItem = ({
    mensagem, isSelected, onSelect, statusOptions, onUpdateStatus, getTextColorForBackground,
    allTags, onUpdateTags, onAddNewTag, onSwitchToAtendimentos
}) => {
    const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
    const [activeSubMenu, setActiveSubMenu] = useState(null);

    const menuRef = useRef(null); 

    const [unreadCount, setUnreadCount] = useState(0);
    const [conversa, setConversa] = useState([]);

    useEffect(() => {
        let parsedConversa = [];
        try {
            parsedConversa = JSON.parse(mensagem.conversa || '[]');
        } catch (e) {
            console.error("Erro ao parsear conversa no ContactItem (para unread):", e);
        }

        setConversa(parsedConversa);

        const countLocal = parsedConversa.filter(
            msg => msg.role === 'user' && msg.status === 'unread'
        ).length;
        
        // Se temos não lidas no estado local (conversa recém recebida sem recarregar chats), usa isso.
        // Senão, usa o unreadCount nativo do banco.
        setUnreadCount(countLocal > 0 ? countLocal : (mensagem.unreadCount || 0));

    }, [mensagem.conversa, mensagem.unreadCount]);

    const hasUnreadMessages = unreadCount > 0;

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMainMenuOpen(false);
                setActiveSubMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Prioriza os campos diretos que agora vêm do banco da Evolution via backend
    let lastMessage = mensagem.lastMessage || 'Nenhum histórico de conversa.';
    let lastMessageTime = mensagem.timestamp || mensagem.updated_at;

    // Apenas tenta extrair da conversa se o lastMessage estiver vazio ou for o padrão
    if (!mensagem.lastMessage || mensagem.lastMessage === 'Nenhum histórico de conversa.') {
        try {
            const conversaArr = JSON.parse(mensagem.conversa || '[]');
            if (conversaArr.length > 0) {
                const lastMsgObj = conversaArr[conversaArr.length - 1];
                const msgType = lastMsgObj.type || 'text';
                
                if (msgType === 'image') lastMessage = '[Imagem]';
                else if (msgType === 'audio') lastMessage = '[Áudio]';
                else if (msgType === 'video') lastMessage = '[Vídeo]';
                else if (msgType === 'sticker') lastMessage = '[Figurinha]';
                else if (msgType === 'document') lastMessage = '[Documento]';
                else lastMessage = stripWhatsAppFormatting(lastMsgObj.content) || '[Mídia]';

                if (lastMsgObj.role === 'assistant') lastMessage = `Você: ${lastMessage}`;
                if (lastMsgObj.timestamp) {
                    const ts = lastMsgObj.timestamp;
                    const dateObj = (typeof ts === 'number') ? new Date(ts * 1000) : new Date(ts);
                    lastMessageTime = dateObj.toISOString();
                }
            }
        } catch (e) {}
    }

    const getStatusStyles = (status) => {
        const situacao = statusOptions.find(opt => opt.nome === status);
        if (situacao && situacao.cor) {
            return {
                text: situacao.nome,
                colorHex: situacao.cor 
            };
        }

        switch (status) {
            case 'Atendente Chamado':
                return { text: 'Atendente Chamado', colorHex: '#f97316' };
            case 'Concluído':
                return { text: 'Concluído', colorHex: '#10b981' };
            case 'Aguardando Resposta':
                return { text: 'Aguardando Resposta', colorHex: '#eab308' };
            default:
                return { text: mensagem.instanceName || status || 'WhatsApp', colorHex: '#64748b' };
        }
    };

    const statusInfo = getStatusStyles(mensagem.status);

    const formatTimestamp = (dateStr) => {
        if (!dateStr || dateStr === 0) return '';
        try {
            let date;
            if (typeof dateStr === 'number') {
                date = new Date(dateStr < 10000000000 ? dateStr * 1000 : dateStr);
            } else if (typeof dateStr === 'string') {
                if (/^\d+$/.test(dateStr)) {
                    const num = parseInt(dateStr, 10);
                    date = new Date(num < 10000000000 ? num * 1000 : num);
                } else {
                    date = new Date(dateStr);
                }
            } else {
                date = new Date(dateStr);
            }

            if (isNaN(date.getTime())) return '';
            
            const today = new Date();
            const isMsgToday = date.getDate() === today.getDate() &&
                               date.getMonth() === today.getMonth() &&
                               date.getFullYear() === today.getFullYear();
            
            return isMsgToday ? format(date, 'HH:mm') : format(date, 'dd/MM/yy HH:mm');
        } catch {
            return '';
        }
    };

    const handleMenuClick = (e) => {
        e.stopPropagation(); 
        setIsMainMenuOpen(prev => !prev); 
        setActiveSubMenu(null); 
    };

    const handleStatusChange = (e, newStatus) => {
        e.stopPropagation();
        onUpdateStatus(mensagem.id, { status: newStatus })
        setActiveSubMenu(null); 
    };

    const handlePuxarAtendimento = (e) => {
        e.stopPropagation();
        setIsMainMenuOpen(false); 
        onUpdateStatus(mensagem.id, { status: 'Atendente Chamado' });
        onSelect({ ...mensagem, status: 'Atendente Chamado' });
        if (onSwitchToAtendimentos) {
            onSwitchToAtendimentos();
        }
    };

    const handleMarkAsUnread = (e) => {
        e.stopPropagation();
        setIsMainMenuOpen(false); 

        if (conversa && conversa.length > 0) {
            const lastUserMessageIndex = conversa.map(msg => msg.role).lastIndexOf('user');
            if (lastUserMessageIndex !== -1) {
                const updatedConversa = [...conversa];
                updatedConversa[lastUserMessageIndex] = { ...updatedConversa[lastUserMessageIndex], status: 'unread' };
                onUpdateStatus(mensagem.id, {
                    conversa: JSON.stringify(updatedConversa)
                });
            }
        }
    };

    return (
        <div
            className={`group relative flex items-center p-3 cursor-pointer transition-all duration-300 rounded-2xl mx-1 mb-0.5 border border-transparent ${(isSelected || isMainMenuOpen || activeSubMenu)
                ? 'bg-white shadow-lg shadow-emerald-100/50 border-white/60 scale-[1.01] z-[100]'
                : 'hover:bg-white/40 hover:translate-x-0.5 z-0'
                }`}
            onClick={() => {
                setIsMainMenuOpen(false);
                if (hasUnreadMessages) {
                    const updatedConversa = conversa.map(msg =>
                        (msg.role === 'user' && msg.status === 'unread')
                            ? { ...msg, status: 'read' }
                            : msg
                    );
                    onUpdateStatus(mensagem.id, { conversa: JSON.stringify(updatedConversa) });
                }
                onSelect(mensagem);
            }}
        >
            <div className={`w-11 h-11 rounded-xl mr-3 flex-shrink-0 flex items-center justify-center transition-all shadow-inner overflow-hidden ${isSelected ? 'bg-brand-green text-white shadow-md shadow-emerald-200' : 'bg-slate-100 text-slate-400'
                }`}>
                {mensagem.profilePicUrl ? (
                    <img
                        src={mensagem.profilePicUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                        }}
                    />
                ) : null}
                <span className="text-base font-black executive-title" style={{ display: mensagem.profilePicUrl ? 'none' : 'flex' }}>
                    {mensagem.nome_contato
                        ? (mensagem.nome_contato || '??').substring(0, 2).toUpperCase()
                        : (mensagem.whatsapp || '??').slice(-2)}
                </span>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                    <div className="truncate pr-2 flex-1">
                        <h3 className={`text-[13px] font-black executive-title truncate ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>
                            {mensagem.nome_contato || mensagem.whatsapp}
                        </h3>
                    </div>
                    <span
                        className="flex-shrink-0 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md shadow-sm"
                        style={{
                            backgroundColor: isSelected ? 'rgba(0,0,0,0.05)' : `${statusInfo.colorHex}15`,
                            color: statusInfo.colorHex,
                            border: isSelected ? `1px solid ${statusInfo.colorHex}30` : 'none'
                        }}
                    >
                        {statusInfo.text}
                    </span>
                </div>

                <div className="flex justify-between items-center">
                    <p className={`text-[11.5px] truncate pr-3 flex-1 transition-colors ${hasUnreadMessages
                        ? 'text-slate-800 font-bold'
                        : (isSelected ? 'text-slate-600 font-semibold' : 'text-slate-500 font-medium')
                        }`}>
                        {lastMessage}
                    </p>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {mensagem.tags && mensagem.tags.length > 0 && (
                            <div className="flex items-center mr-1.5">
                                {mensagem.tags.map((tag, idx) => (
                                    <div
                                        key={idx}
                                        className={`w-2.5 h-2.5 rounded-full border border-white shadow-sm ${idx > 0 ? '-ml-1.5' : ''}`}
                                        style={{ backgroundColor: tag.color || '#cbd5e1', zIndex: 10 - idx }}
                                        title={tag.name}
                                    />
                                ))}
                            </div>
                        )}

                        {hasUnreadMessages && (
                            <span className="flex-shrink-0 flex items-center justify-center h-4 min-w-[1rem] px-1 bg-brand-green text-white text-[9px] font-black rounded-full shadow-md shadow-emerald-100">
                                {unreadCount}
                            </span>
                        )}

                        <span className={`text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${isSelected ? 'text-brand-green' : 'text-slate-400'}`}>
                            {formatTimestamp(lastMessageTime)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="relative flex-shrink-0 ml-2" ref={menuRef}>
                <button
                    type="button"
                    onClick={handleMenuClick}
                    className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${isSelected ? 'text-slate-400 hover:bg-slate-50 hover:text-brand-green' : 'text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-600'
                        }`}
                >
                    <MoreVertical size={16} />
                </button>

                {isMainMenuOpen && (
                    <div className="absolute right-0 top-10 mt-1 w-56 bg-white border border-slate-100 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.05)] z-[200] overflow-hidden animate-fade-in p-2">
                        <button onClick={handlePuxarAtendimento} className="w-full text-left p-3 text-[12px] font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-green rounded-2xl flex items-center gap-3 transition-all">
                            <Headset size={16} className="text-brand-green" /> Puxar Atendimento
                        </button>
                        <button onClick={() => { setActiveSubMenu('status'); setIsMainMenuOpen(false); }} className="w-full text-left p-3 text-[12px] font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-green rounded-2xl flex items-center gap-3 transition-all">
                            <CheckCircle2 size={16} className="text-emerald-500" /> Alterar Situação
                        </button>
                        <div className="my-1 border-t border-slate-50"></div>
                        <button onClick={handleMarkAsUnread} className="w-full text-left p-3 text-[12px] font-bold text-red-500 hover:bg-red-50 rounded-2xl flex items-center gap-3 transition-all">
                            <MailWarning size={16} /> Não lido
                        </button>
                    </div>
                )}

                {activeSubMenu === 'status' && (
                    <div className="absolute right-0 top-10 mt-1 w-64 bg-white border border-slate-100 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.05)] z-[200] overflow-hidden p-2">
                        <div className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1">Situação</div>
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                            {(statusOptions || []).map(opt => {
                                const isStatusActive = mensagem.status === opt.nome;
                                return (
                                    <button
                                        key={opt.nome}
                                        onClick={(e) => handleStatusChange(e, opt.nome)}
                                        className={`w-full text-left p-3 text-[12px] font-bold transition-all rounded-2xl flex items-center gap-3 ${isStatusActive ? 'bg-slate-50 text-slate-900 shadow-inner' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: opt.cor }}></span>
                                        {opt.nome}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ContactItem;
