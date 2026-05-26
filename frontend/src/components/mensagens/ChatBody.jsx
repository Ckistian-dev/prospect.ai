import React, { useRef, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, AlertCircle, Clock, MessageSquare, Wand2, Loader2, Sparkles, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';
import MessageContent from './MessageContent';

const ChatBody = ({ mensagem, onViewMedia, onDownloadDocument, isDownloadingMedia, onLoadMoreMessages, hasMoreMessages, isLoadingMore }) => {
    const chatContainerRef = useRef(null);
    const [messages, setMessages] = useState([]);

    const prevAtendimentoIdRef = useRef(null);
    const userWasAtBottomRef = useRef(true);
    const [highlightedMessageId, setHighlightedMessageId] = useState(null);

    const prevMessagesLengthRef = useRef(0);
    const initialScrollDoneRef = useRef(null);
    const [isInitialScrolling, setIsInitialScrolling] = useState(true);

    const [isPreventingScrollJump, setIsPreventingScrollJump] = useState(false);
    const [savedScrollHeight, setSavedScrollHeight] = useState(0);

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight } = e.target;
        if (scrollTop <= 5 && !isLoadingMore && hasMoreMessages && onLoadMoreMessages) {
            setSavedScrollHeight(scrollHeight);
            setIsPreventingScrollJump(true);
            onLoadMoreMessages();
        }
    };

    // 1. Detectar troca de chat e limpar estado imediatamente
    useEffect(() => {
        if (mensagem?.id !== prevAtendimentoIdRef.current) {
            setIsInitialScrolling(true);
            setMessages([]); 
            initialScrollDoneRef.current = null;
        }
    }, [mensagem?.id]);

    // 2. Processar mensagens quando a 'conversa' mudar
    useEffect(() => {
        if (!mensagem) return;

        let processedMessages = [];
        try {
            const rawMessages = JSON.parse(mensagem.conversa || '[]');
            
            const reactionsMap = {};
            rawMessages.forEach(msg => {
                if (msg.type === 'reaction' && msg.target_message_id) {
                    if (!reactionsMap[msg.target_message_id]) {
                        reactionsMap[msg.target_message_id] = [];
                    }
                    reactionsMap[msg.target_message_id].push(msg);
                }
            });

            processedMessages = rawMessages
                .filter(msg => msg.type !== 'reaction')
                .map(msg => ({
                    ...msg,
                    reactions: reactionsMap[msg.id] || []
                }));
        } catch (e) {
            console.error("Erro ao analisar JSON da conversa:", e);
        }

        const chatElement = chatContainerRef.current;
        if (chatElement) {
            const { scrollTop, scrollHeight, clientHeight } = chatElement;
            const currentAtendimentoId = mensagem?.id;
            const prevAtendimentoId = prevAtendimentoIdRef.current;
            
            if (currentAtendimentoId !== prevAtendimentoId) {
                userWasAtBottomRef.current = true;
            } else {
                userWasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
            }
        } else {
            userWasAtBottomRef.current = true;
        }

        setMessages(processedMessages);
    }, [mensagem?.conversa, mensagem?.id]);

    // 3. Efeito de Scroll e Revelação (com preservação de Scroll para Lazy Loading)
    useEffect(() => {
        const chatElement = chatContainerRef.current;
        if (!chatElement) return;

        const currentAtendimentoId = mensagem?.id;
        
        // Caso de Troca de Chat ou Primeiro Carregamento
        if (currentAtendimentoId !== initialScrollDoneRef.current) {
            if (messages.length > 0) {
                const performScroll = () => {
                    if (chatElement) {
                        chatElement.scrollTop = chatElement.scrollHeight;
                    }
                };

                // Executa scroll imediatamente (enquanto ainda está invisível)
                performScroll();

                // Timeout para garantir que o layout dos balões e mídias foi processado pelo browser
                const timer = setTimeout(() => {
                    performScroll();
                    setIsInitialScrolling(false);
                    initialScrollDoneRef.current = currentAtendimentoId;
                }, 100);

                return () => clearTimeout(timer);
            } else if (mensagem) {
                // Se não há mensagens, apenas revela o estado vazio
                setIsInitialScrolling(false);
                initialScrollDoneRef.current = currentAtendimentoId;
            }
        } else {
            // Se estamos carregando mensagens mais antigas (Lazy Loading), preserva a posição do Scroll
            if (isPreventingScrollJump && savedScrollHeight > 0) {
                chatElement.scrollTop = chatElement.scrollHeight - savedScrollHeight;
                setIsPreventingScrollJump(false);
                setSavedScrollHeight(0);
            } else if (userWasAtBottomRef.current) {
                // Scroll para novas mensagens (mantém no fim se o usuário já estiver lá)
                chatElement.scrollTop = chatElement.scrollHeight;
            }
        }

        prevAtendimentoIdRef.current = currentAtendimentoId;
        prevMessagesLengthRef.current = messages.length;
    }, [messages, mensagem?.id, isPreventingScrollJump, savedScrollHeight]);

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

    const handleScrollToMessage = (targetId) => {
        if (!targetId) return;
        const element = document.getElementById(`msg-${targetId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedMessageId(targetId);
            setTimeout(() => setHighlightedMessageId(null), 2000);
        } else {
            toast.error("Mensagem original não encontrada nesta conversa.");
        }
    };

    return (
        <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className={`flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden space-y-6 custom-scrollbar bg-slate-50/20 ${
                isInitialScrolling 
                    ? 'opacity-0 pointer-events-none invisible' 
                    : 'opacity-100 visible transition-opacity duration-500'
            }`}
        >
            {hasMoreMessages && (
                <div className="flex justify-center py-2">
                    <button
                        onClick={() => {
                            const chatElement = chatContainerRef.current;
                            if (chatElement) {
                                setSavedScrollHeight(chatElement.scrollHeight);
                                setIsPreventingScrollJump(true);
                            }
                            onLoadMoreMessages();
                        }}
                        disabled={isLoadingMore}
                        className="text-[11px] font-black uppercase tracking-widest text-[#356854] bg-[#356854]/10 hover:bg-[#356854]/20 disabled:opacity-50 px-4 py-2 rounded-xl transition-all flex items-center gap-2 border border-[#356854]/20"
                    >
                        {isLoadingMore ? (
                            <>
                                <Loader2 size={12} className="animate-spin text-[#356854]" /> Carregando...
                            </>
                        ) : (
                            "Carregar mensagens anteriores"
                        )}
                    </button>
                </div>
            )}
            {messages.map((msg, index) => {
                const isAssistant = msg.role === 'assistant';
                const nextMsg = messages[index + 1];
                const hasReactions = msg.reactions && msg.reactions.length > 0;
                const isLastInGroup = !nextMsg || nextMsg.role !== msg.role;

                return (
                    <div
                        key={msg.id}
                        className={`flex flex-col transition-all duration-500 ${isAssistant ? 'items-end' : 'items-start'} ${
                            isLastInGroup 
                                ? (hasReactions ? 'mb-8' : 'mb-4') 
                                : (hasReactions ? 'mb-6' : 'mb-1')
                        }`}
                    >
                        <div className={`flex gap-3 max-w-[85%] md:max-w-[75%] ${isAssistant ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* Foto do Remetente (Apenas para Grupos) */}
                            {mensagem.isGroup && !isAssistant && (
                                <div className="flex-shrink-0 mt-1">
                                    {msg.senderPhoto ? (
                                        <img 
                                            src={msg.senderPhoto} 
                                            alt="" 
                                            className="w-10 h-10 rounded-full object-cover shadow-premium border-2 border-white transition-transform hover:scale-110 cursor-pointer"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border-2 border-white flex items-center justify-center text-[12px] font-black text-slate-400 shadow-sm">
                                            {(msg.senderName || '??').substring(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div
                                id={`msg-${msg.id}`}
                                className={`relative transition-all duration-300 ${isAssistant ? 'chat-bubble-user' : 'chat-bubble-ia shadow-sm border border-white/40'
                                    } ${highlightedMessageId === msg.id ? 'highlight-message' : ''}`}
                            >
                                {msg.is_template && (
                                    <div className={`text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 pb-2 border-b ${isAssistant ? 'border-white/20 text-white/80' : 'border-slate-100 text-brand-green'}`}>
                                        <Sparkles size={12} /> Template Inteligente
                                    </div>
                                )}

                                {mensagem.isGroup && !isAssistant && (msg.senderName || msg.participant) && (
                                    <div className="text-[11px] font-bold text-emerald-600/80 mb-1.5 pb-1 border-b border-slate-100/50 flex items-center justify-between gap-4">
                                        <span>~ {msg.senderName || (msg.participant ? msg.participant.split('@')[0] : 'Desconhecido')}</span>
                                        {msg.participant && (
                                            <span className="text-[9px] font-medium opacity-40">{msg.participant.split('@')[0]}</span>
                                        )}
                                    </div>
                                )}

                                <MessageContent
                                    msg={msg}
                                    atendimentoId={mensagem.id}
                                    onViewMedia={onViewMedia}
                                    onDownloadDocument={onDownloadDocument}
                                    isDownloading={isDownloadingMedia}
                                    onQuotedClick={handleScrollToMessage}
                                />

                                {/* Rodapé da Mensagem (Timestamp e Status) */}
                                <div className={`flex items-center justify-end gap-1.5 mt-1.5 select-none ${isAssistant ? 'text-white/60' : 'text-slate-400'}`}>
                                    {msg.is_ai && (
                                        <span className={`text-[8px] font-black uppercase flex items-center gap-1 ${isAssistant ? 'text-white/80' : 'text-brand-green'}`}>
                                            <Wand2 size={10} /> IA
                                        </span>
                                    )}
                                    <span className="text-[9px] font-bold uppercase tracking-tight">{formatTimestamp(msg.timestamp)}</span>
                                    {isAssistant && (
                                        <div className="flex items-center">
                                            {msg.type === 'sending' && <Loader2 size={12} className="animate-spin" />}
                                            {msg.status === 'sent' && <Check size={14} />}
                                            {msg.status === 'delivered' && <CheckCheck size={14} />}
                                            {msg.status === 'read' && <CheckCheck size={16} className="text-cyan-300 drop-shadow-[0_0_2px_rgba(0,0,0,0.5)]" />}
                                            {msg.status === 'failed' && <AlertCircle size={14} className="text-red-300" title={msg.error_title || "Falha no envio"} />}
                                        </div>
                                    )}
                                </div>

                                {/* Reações (Novo) */}
                                {msg.reactions && msg.reactions.length > 0 && (
                                    <div className={`absolute -bottom-3 ${isAssistant ? 'right-2' : 'left-2'} flex items-center -space-x-1 group/reactions z-20`}>
                                        {msg.reactions.map((reaction, ridx) => (
                                            <div 
                                                key={ridx} 
                                                className={`flex items-center justify-center w-6 h-6 rounded-full bg-white shadow-premium border border-slate-100 text-[12px] hover:scale-125 transition-transform cursor-default`}
                                                title={`${reaction.senderName || 'Alguém'} reagiu: ${reaction.reaction_text}`}
                                            >
                                                {reaction.reaction_text}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        </div>
                );
            })}
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full opacity-40">
                    <div className="w-20 h-20 rounded-[2rem] bg-slate-100 flex items-center justify-center mb-4">
                        <MessageSquare size={32} className="text-slate-300" />
                    </div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                        Início da Transmissão
                    </p>
                </div>
            )}
        </div>
    );
};

export default ChatBody;
