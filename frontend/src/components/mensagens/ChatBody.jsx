import React, { useRef, useEffect, useState } from 'react';
import { format } from 'date-fns';
import MessageContent from './MessageContent';

const ChatBody = ({ mensagem, pcId, onViewMedia, onDownloadDocument, isDownloadingMedia }) => {
    const chatContainerRef = useRef(null);
    const [messages, setMessages] = useState([]);
    const prevAtendimentoIdRef = useRef(null);
    const userWasAtBottomRef = useRef(true);

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
            userWasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
        } else {
            userWasAtBottomRef.current = true;
        }

        setMessages(parsedMessages);
    }, [mensagem]);

    useEffect(() => {
        const chatElement = chatContainerRef.current;
        if (chatElement) {
            const currentAtendimentoId = mensagem?.id;
            const prevAtendimentoId = prevAtendimentoIdRef.current;
            const shouldScroll = currentAtendimentoId !== prevAtendimentoId || userWasAtBottomRef.current;

            if (shouldScroll) chatElement.scrollTop = chatElement.scrollHeight;
            prevAtendimentoIdRef.current = currentAtendimentoId;
        }
    }, [messages, mensagem?.id]);

    const formatTimestamp = (timestamp) => {
        try {
            const date = (typeof timestamp === 'number') ? new Date(timestamp * 1000) : new Date(timestamp);
            const now = new Date();
            if (format(date, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')) return format(date, 'HH:mm');
            return format(date, 'HH:mm dd/MM/yy');
        } catch { return ''; }
    }

    return (
        <div
            ref={chatContainerRef}
            className="flex-1 p-4 md:p-6 overflow-y-auto space-y-3 bg-gray-100"
            style={{
                backgroundImage: `linear-gradient(rgba(243, 244, 246, 0.8), rgba(243, 244, 246, 0.9)), url('https://static.vecteezy.com/system/resources/previews/021/736/713/non_2x/doodle-lines-arrows-circles-and-curves-hand-drawn-design-elements-isolated-on-white-background-for-infographic-illustration-vector.jpg')`,
                backgroundSize: 'cover', backgroundPosition: 'center', backgroundBlendMode: 'overlay'
            }}
        >
            {messages.map((msg, idx) => {
                const isAssistant = msg.role === 'assistant';
                return (
                    <div key={msg.id || idx} className={`flex ${isAssistant ? 'justify-end' : 'justify-start'}`}>
                        <div className={`relative max-w-xs md:max-w-md py-2 px-3 rounded-lg shadow-sm break-words ${isAssistant ? 'bg-[#d9fdd3] text-gray-800' : 'bg-white text-gray-800'}`}>
                            {mensagem.isGroup && !isAssistant && msg.senderName && (
                                <div className="text-[11px] font-bold text-brand-green mb-1 opacity-80">
                                    {msg.senderName}
                                </div>
                            )}
                            <MessageContent msg={msg} pcId={pcId || mensagem.id} onViewMedia={onViewMedia} onDownloadDocument={onDownloadDocument} isDownloading={isDownloadingMedia} />
                            <span className="text-xs text-gray-400 float-right ml-2 mt-1">{formatTimestamp(msg.timestamp)}</span>
                        </div>
                    </div>
                );
            })}
            {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                    <p className="text-center text-gray-600 bg-white/70 backdrop-blur-sm p-3 rounded-lg italic">Nenhuma mensagem neste contato.</p>
                </div>
            )}
        </div>
    );
};

export default ChatBody;
