import React, { useRef, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, AlertCircle, Clock, MessageSquare, Wand2, Loader2, Sparkles, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';
import MessageContent from './MessageContent';

const ChatBody = ({ mensagem, onViewMedia, onDownloadDocument, isDownloadingMedia }) => {
    const chatContainerRef = useRef(null);
    const [messages, setMessages] = useState([]);

    const prevAtendimentoIdRef = useRef(null);
    const userWasAtBottomRef = useRef(true);
    const [highlightedMessageId, setHighlightedMessageId] = useState(null);

    const prevMessagesLengthRef = useRef(0);
    const initialScrollDoneRef = useRef(null);

    useEffect(() => {
        let parsedMessages = [];
        try {
            parsedMessages = mensagem ? JSON.parse(mensagem.conversa || '[]') : [];
        } catch (e) {
            console.error("Erro ao analisar JSON da conversa:", e);
        }

        const chatElement = chatContainerRef.current;
        if (chatElement) {
            const { scrollTop, scrollHeight, clientHeight } = chatElement;
            const currentAtendimentoId = mensagem?.id;
            const prevAtendimentoId = prevAtendimentoIdRef.current;
            
            // Se mudou o atendimento, resetamos o estado de "estava no fundo"
            if (currentAtendimentoId !== prevAtendimentoId) {
                userWasAtBottomRef.current = true;
            } else {
                // Senão, verificamos se o usuário ESTÁ no fundo no momento da atualização
                userWasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
            }
        } else {
            userWasAtBottomRef.current = true;
        }

        setMessages(parsedMessages);
    }, [mensagem]);

    useEffect(() => {
        const chatElement = chatContainerRef.current;
        if (chatElement) {
            const currentAtendimentoId = mensagem?.id;
            
            // Se mudou o atendimento, resetamos o controle do scroll inicial
            if (currentAtendimentoId !== initialScrollDoneRef.current) {
                // Se temos mensagens carregadas, fazemos o scroll
                if (messages.length > 0) {
                    const scrollTimeout = setTimeout(() => {
                        chatElement.scrollTo({
                            top: chatElement.scrollHeight,
                            behavior: 'auto'
                        });
                        initialScrollDoneRef.current = currentAtendimentoId;
                    }, 100);
                    
                    return () => clearTimeout(scrollTimeout);
                }
            }
            
            prevAtendimentoIdRef.current = currentAtendimentoId;
            prevMessagesLengthRef.current = messages.length;
        }
    }, [messages, mensagem?.id]);

    const formatTimestamp = (timestamp) => {
        try {
            const date = (typeof timestamp === 'number') ? new Date(timestamp * 1000) : new Date(timestamp);
            const now = new Date();
            if (format(date, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')) {
                return format(date, 'HH:mm');
            }
            return format(date, 'HH:mm dd/MM/yy');
        } catch {
            return '';
        }
    }

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
            className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden space-y-6 custom-scrollbar bg-slate-50/20"
        >
            {messages.map((msg, index) => {
                const isAssistant = msg.role === 'assistant';
                const nextMsg = messages[index + 1];
                const isLastInGroup = !nextMsg || nextMsg.role !== msg.role;

                return (
                    <div
                        key={msg.id}
                        className={`flex flex-col transition-all duration-500 ${isAssistant ? 'items-end' : 'items-start'} ${isLastInGroup ? 'mb-4' : 'mb-1'}`}
                    >
                        <div
                            id={`msg-${msg.id}`}
                            className={`relative max-w-[78%] md:max-w-[70%] transition-all duration-300 ${isAssistant ? 'chat-bubble-user' : 'chat-bubble-ia shadow-sm border border-white/40'
                                } ${highlightedMessageId === msg.id ? 'highlight-message' : ''}`}
                        >
                            {msg.is_template && (
                                <div className={`text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 pb-2 border-b ${isAssistant ? 'border-white/20 text-white/80' : 'border-slate-100 text-brand-green'}`}>
                                    <Sparkles size={12} /> Template Inteligente
                                </div>
                            )}

                            {mensagem.isGroup && !isAssistant && (msg.senderName || msg.participant) && (
                                <div className="text-[11px] font-bold text-emerald-600/80 mb-1.5 pb-1 border-b border-slate-100/50">
                                    ~ {msg.senderName || (msg.participant ? msg.participant.split('@')[0] : 'Desconhecido')}
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

                            <div className={`flex items-center gap-2 mt-3 ${isAssistant ? 'justify-end text-white/60' : 'justify-start text-slate-400'}`}>
                                {msg.is_ai && (
                                    <span className={`text-[9px] font-black uppercase flex items-center gap-1 ${isAssistant ? 'text-white/80' : 'text-brand-green'}`}>
                                        <Wand2 size={10} /> IA
                                    </span>
                                )}
                                <span className="text-[10px] font-bold uppercase tracking-tight">{formatTimestamp(msg.timestamp)}</span>
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
