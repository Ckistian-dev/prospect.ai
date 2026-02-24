import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import toast from 'react-hot-toast';
import { Loader2, MoreVertical } from 'lucide-react';
import MediaModal from '../components/mensagens/MediaModal';
import ProfileSidebar from '../components/mensagens/ProfileSidebar';
import SearchAndFilter from '../components/mensagens/SearchAndFilter';
import ContactItem from '../components/mensagens/ContactItem';
import ChatBody from '../components/mensagens/ChatBody';
import ChatFooter from '../components/mensagens/ChatFooter';
import ChatPlaceholder from '../components/mensagens/ChatPlaceholder';

const getTextColorForBackground = (hexColor) => '#FFFFFF';

function Mensagens() {
    const [mensagens, setAtendimentos] = useState([]);
    const [instances, setInstances] = useState([]);
    const [filteredAtendimentos, setFilteredAtendimentos] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [statusOptions] = useState([
        { nome: "Aguardando Início", cor: "#a855f7" },
        { nome: "Aguardando Resposta", cor: "#eab308" },
        { nome: "Resposta Recebida", cor: "#3b82f6" },
        { nome: "Lead Qualificado", cor: "#22c55e" },
        { nome: "Não Interessado", cor: "#ef4444" },
        { nome: "Concluído", cor: "#10b981" },
        { nome: "Sem WhatsApp", cor: "#6b7280" },
        { nome: "Falha no Envio", cor: "#dc2626" },
        { nome: "Erro IA", cor: "#b91c1c" },
        { nome: "Conversa Manual", cor: "#f97316" },
        { nome: "Fechado", cor: "#059669" },
        { nome: "Atendente Chamado", cor: "#f97316" }
    ]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeButtonGroup, setActiveButtonGroup] = useState('atendimentos');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
    const [statusFilters, setStatusFilters] = useState(null);
    const [tagFilters, setTagFilters] = useState(null);
    const [timeStart, setTimeStart] = useState(null);
    const [timeEnd, setTimeEnd] = useState(null);
    const [selectedAtendimento, setSelectedAtendimento] = useState(null);
    const [limit, setLimit] = useState(20);
    const [modalMedia, setModalMedia] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [isDownloadingMedia, setIsDownloadingMedia] = useState(false);
    const currentBlobUrl = useRef(null);
    const [isProfileSidebarOpen, setIsProfileSidebarOpen] = useState(false);
    const [headerImgError, setHeaderImgError] = useState(false);
    const sidebarRef = useRef(null);
    const [allTags, setAllTags] = useState([]);
    const loaderRef = useRef(null);
    const [sendingQueue, setSendingQueue] = useState({});
    const [isProcessing, setIsProcessing] = useState({});
    const isFirstLoad = useRef(true);

    // Busca inicial de instâncias
    useEffect(() => {
        const fetchInstances = async () => {
            try {
                const res = await api.get('/whatsapp/');
                setInstances(res.data);
            } catch (err) {
                console.error("Erro ao carregar instâncias:", err);
            }
        };
        fetchInstances();
    }, []);

    const fetchData = useCallback(async (isInitialLoad = false, isLoadMore = false) => {
        if (isInitialLoad) setIsLoading(true);
        if (isLoadMore) setIsFetchingMore(true);

        try {
            const [userRes, instancesRes] = await Promise.all([
                api.get('/auth/me'),
                api.get('/whatsapp/')
            ]);
            setCurrentUser(userRes.data);
            setInstances(instancesRes.data);

            const activeInstances = instancesRes.data.filter(inst => inst.is_active);
            const allChats = [];
            let someInstanceHasMore = false;

            const chatPromises = activeInstances.map(async (inst) => {
                try {
                    const chatsRes = await api.get(`/whatsapp/${inst.id}/chats`, { params: { limit } });
                    if (chatsRes.data.length === limit) someInstanceHasMore = true;

                    return chatsRes.data.map(chat => ({
                        id: `${inst.id}-${chat.remoteJid}`,
                        remoteJid: chat.remoteJid,
                        instanceId: inst.id,
                        instanceName: inst.name,
                        nome_contato: chat.name,
                        profilePicUrl: chat.profilePicUrl,
                        whatsapp: chat.remoteJid.split('@')[0],
                        isGroup: chat.isGroup,
                        status: chat.status,
                        situacao: chat.situacao,
                        campanha: chat.campanha,
                        prospect_contact_id: chat.prospect_contact_id,
                        updated_at: new Date(chat.timestamp * 1000).toISOString(),
                        last_message_ts: chat.timestamp * 1000,
                        conversa: JSON.stringify([{
                            role: chat.fromMe ? 'assistant' : 'user',
                            senderName: chat.lastMessageSender,
                            content: chat.lastMessage,
                            timestamp: chat.timestamp
                        }])
                    }));
                } catch (err) {
                    console.error(`Erro ao buscar chats para instância ${inst.name}:`, err);
                    return [];
                }
            });

            const results = await Promise.all(chatPromises);
            results.forEach(chats => allChats.push(...chats));

            // Sort by timestamp desc
            allChats.sort((a, b) => b.last_message_ts - a.last_message_ts);

            setAtendimentos(allChats);
            setHasMore(someInstanceHasMore);
            setError('');
        } catch (err) {
            console.error("Erro ao carregar dados:", err);
            if (isInitialLoad) setError('Não foi possível carregar os dados.');
        } finally {
            if (isInitialLoad) setIsLoading(false);
            if (isLoadMore) setIsFetchingMore(false);
        }
    }, [limit]);

    useEffect(() => {
        let isMounted = true;
        let timeoutId;
        const poll = async () => {
            if (!document.hidden) await fetchData(false);
            if (isMounted) timeoutId = setTimeout(poll, 10000);
        };

        const initial = isFirstLoad.current;
        const loadMore = !initial && limit > 20;

        fetchData(initial, loadMore).then(() => {
            isFirstLoad.current = false;
            if (isMounted) timeoutId = setTimeout(poll, 10000);
        });
        return () => { isMounted = false; clearTimeout(timeoutId); };
    }, [fetchData, limit]);

    // Infinite Scroll Observer
    useEffect(() => {
        if (isLoading || isFetchingMore || !hasMore) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setLimit(prev => prev + 20);
            }
        }, { threshold: 0.1 });

        const currentLoader = loaderRef.current;
        if (currentLoader) observer.observe(currentLoader);
        return () => { if (currentLoader) observer.unobserve(currentLoader); };
    }, [isLoading, isFetchingMore, hasMore]);

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 500);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    // Busca mensagens quando um chat é selecionado
    useEffect(() => {
        if (!selectedAtendimento) return;
        const currentId = selectedAtendimento.id;
        const instanceId = selectedAtendimento.instanceId;
        const remoteJid = selectedAtendimento.remoteJid;

        setHeaderImgError(false);

        const fetchMessages = async () => {
            try {
                const res = await api.get(`/whatsapp/${instanceId}/messages/${remoteJid}`);
                setSelectedAtendimento(prev => {
                    // Só atualiza se ainda estivermos no mesmo chat
                    if (prev?.id !== currentId) return prev;
                    
                    const newConversa = JSON.stringify(res.data);
                    // Evita atualizações de estado desnecessárias se a conversa não mudou
                    if (prev.conversa === newConversa) return prev;
                    
                    return { ...prev, conversa: newConversa };
                });
            } catch (err) {
                console.error("Erro ao carregar mensagens:", err);
            }
        };

        fetchMessages();

        const intervalId = setInterval(() => {
            if (!document.hidden) fetchMessages();
        }, 5000); // Polling a cada 5 segundos para a conversa ativa

        return () => clearInterval(intervalId);
    }, [selectedAtendimento?.id]);

    useEffect(() => {
        const filtered = mensagens.filter(at => {
            const matchesSearch = at.nome_contato?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                 at.whatsapp?.includes(searchTerm);
            
            if (!matchesSearch) return false;

            if (activeButtonGroup === 'atendimentos') {
                return !at.campanha && !at.situacao;
            }
            return !!(at.campanha || at.situacao);
        });
        setFilteredAtendimentos(filtered);
    }, [mensagens, searchTerm, activeButtonGroup]);

    const handleViewMedia = async (mediaId, type, filename) => {
        if (!selectedAtendimento || isDownloadingMedia) return;
        if (currentBlobUrl.current) URL.revokeObjectURL(currentBlobUrl.current);
        setIsDownloadingMedia(true);
        try {
            const response = await api.get(`/whatsapp/${selectedAtendimento.instanceId}/media/${mediaId}`, { responseType: 'blob', timeout: 60000 });
            const blobUrl = URL.createObjectURL(response.data);
            currentBlobUrl.current = blobUrl;
            setModalMedia({ url: blobUrl, type, filename });
            setIsModalOpen(true);
        } catch (error) {
            console.error("Erro ao carregar mídia:", error);
            toast.error("Não foi possível carregar a mídia.");
        } finally {
            setIsDownloadingMedia(false);
        }
    };

    const handleDownloadDocument = async (mediaId, filename) => {
        if (!selectedAtendimento || isDownloadingMedia) return;
        setIsDownloadingMedia(true);
        try {
            const response = await api.get(`/whatsapp/${selectedAtendimento.instanceId}/media/${mediaId}`, { responseType: 'blob', timeout: 60000 });
            const blobUrl = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename || 'documento';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error("Erro ao baixar documento:", error);
            toast.error("Não foi possível baixar o documento.");
        } finally {
            setIsDownloadingMedia(false);
        }
    };

    const addOptimisticMessage = (atendimentoId, msg) => {
        if (selectedAtendimento?.id === atendimentoId) {
            setSelectedAtendimento(prev => {
                const conversa = JSON.parse(prev.conversa || '[]');
                conversa.push(msg);
                return { ...prev, conversa: JSON.stringify(conversa) };
            });
        }
    };

    const handleUpdateAtendimento = useCallback(async (atendimentoId, updates) => {
        try {
            // Se for uma atualização de situação (vinda do menu do ContactItem)
            if (updates.status) {
                const atendimento = mensagens.find(at => at.id === atendimentoId);
                if (atendimento && atendimento.prospect_contact_id) {
                    await api.put(`/prospecting/contacts/${atendimento.prospect_contact_id}`, { situacao: updates.status });
                    toast.success('Situação atualizada!');
                }
            }

            setAtendimentos(prev => prev.map(at => 
                at.id === atendimentoId ? { ...at, ...updates, situacao: updates.status || at.situacao } : at
            ));
            if (selectedAtendimento?.id === atendimentoId) {
                setSelectedAtendimento(prev => ({ ...prev, ...updates, situacao: updates.status || prev.situacao }));
            }
        } catch (err) {
            console.error("Erro ao atualizar atendimento:", err);
            toast.error("Erro ao atualizar situação.");
        }
    }, [selectedAtendimento]);

    const setMessageToError = useCallback((atendimentoId, msgId, errorMessage) => {
        setAtendimentos(prev => prev.map(at => {
            if (at.id === atendimentoId) {
                const conversa = JSON.parse(at.conversa || '[]');
                const updatedConversa = conversa.map(msg => 
                    msg.id === msgId ? { ...msg, type: 'error', status: 'error', content: errorMessage } : msg
                );
                const updatedAt = { ...at, conversa: JSON.stringify(updatedConversa) };
                if (selectedAtendimento?.id === atendimentoId) setSelectedAtendimento(updatedAt);
                return updatedAt;
            }
            return at;
        }));
    }, [selectedAtendimento]);

    useEffect(() => {
        Object.keys(sendingQueue).forEach(atendimentoId => {
            const queue = sendingQueue[atendimentoId] || [];
            if (queue.length > 0 && !isProcessing[atendimentoId]) {
                setIsProcessing(prev => ({ ...prev, [atendimentoId]: true }));
                const itemToProcess = queue[0];
                const processItem = async () => {
                    try {
                        if (itemToProcess.type === 'text') {
                            await api.post(`/whatsapp/${itemToProcess.instanceId}/send`, {
                                remoteJid: itemToProcess.remoteJid,
                                text: itemToProcess.payload.text
                            });
                        } else if (itemToProcess.type === 'media') {
                            const formData = new FormData();
                            formData.append('file', itemToProcess.payload.file, itemToProcess.payload.filename);
                            formData.append('remoteJid', itemToProcess.remoteJid);
                            formData.append('mediaType', itemToProcess.payload.mediaType);

                            await api.post(`/whatsapp/${itemToProcess.instanceId}/send-media`, formData, {
                                headers: { 'Content-Type': 'multipart/form-data' }
                            });
                        }
                        // Recarrega mensagens para atualizar o histórico real
                        const res = await api.get(`/whatsapp/${itemToProcess.instanceId}/messages/${itemToProcess.remoteJid}`);
                        const newConversa = JSON.stringify(res.data);
                        setAtendimentos(prev => prev.map(at => 
                            at.id === atendimentoId ? { ...at, conversa: newConversa } : at
                        ));
                        // Atualiza o atendimento selecionado imediatamente se for o mesmo que acabou de enviar
                        setSelectedAtendimento(prev => {
                            if (prev?.id !== atendimentoId) return prev;
                            return { ...prev, conversa: newConversa };
                        });
                    } catch (error) {
                        setMessageToError(atendimentoId, itemToProcess.id, error.response?.data?.detail || "Falha no envio.");
                    } finally {
                        if (itemToProcess.payload?.localUrl) URL.revokeObjectURL(itemToProcess.payload.localUrl);
                        setSendingQueue(prev => ({ ...prev, [atendimentoId]: (prev[atendimentoId] || []).slice(1) }));
                        setIsProcessing(prev => ({ ...prev, [atendimentoId]: false }));
                    }
                };
                processItem();
            }
        });
    }, [sendingQueue, isProcessing, setMessageToError]);

    const handleSendMessage = (text) => {
        if (!selectedAtendimento) return;
        const optimisticId = `local-${Date.now()}`;
        addOptimisticMessage(selectedAtendimento.id, { id: optimisticId, role: 'assistant', type: 'sending', content: text, timestamp: Math.floor(Date.now() / 1000) });
        setSendingQueue(prev => ({ ...prev, [selectedAtendimento.id]: [...(prev[selectedAtendimento.id] || []), { id: optimisticId, type: 'text', instanceId: selectedAtendimento.instanceId, remoteJid: selectedAtendimento.remoteJid, payload: { text } }] }));
    };

    const handleSendMedia = (file, type, filename) => {
        if (!selectedAtendimento) return;
        const optimisticId = `local-${Date.now()}`;
        const localUrl = URL.createObjectURL(file);
        addOptimisticMessage(selectedAtendimento.id, { id: optimisticId, role: 'assistant', type: 'sending', content: `Enviando ${type}...`, localUrl, filename, timestamp: Math.floor(Date.now() / 1000) });
        setSendingQueue(prev => ({ ...prev, [selectedAtendimento.id]: [...(prev[selectedAtendimento.id] || []), { id: optimisticId, type: 'media', instanceId: selectedAtendimento.instanceId, remoteJid: selectedAtendimento.remoteJid, payload: { file, mediaType: type, filename, localUrl } }] }));
    };

    if (isLoading && !currentUser) return <div className="flex h-screen items-center justify-center">Carregando...</div>;
    if (error) return <div className="flex h-screen items-center justify-center text-red-600">{error}</div>;

    const hasActiveFilters = !!(statusFilters || tagFilters || timeStart || timeEnd);

    return (
        <div className="flex h-[93vh] bg-white">
            <aside className="w-full md:w-[30%] lg:w-[25%] flex flex-col border-r border-gray-200 relative">
                <SearchAndFilter
                    searchTerm={searchTerm} setSearchTerm={setSearchTerm}
                    activeButtonGroup={activeButtonGroup} toggleFilter={setActiveButtonGroup}
                    onFilterIconClick={() => setIsFilterPopoverOpen(!isFilterPopoverOpen)}
                    hasActiveFilters={hasActiveFilters}
                />
                <div className="flex-1 overflow-y-auto">
                    {isLoading && mensagens.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full"><Loader2 className="animate-spin" /></div>
                    ) : (
                        <>
                            {filteredAtendimentos.slice(0, limit).map(at => (
                                <ContactItem
                                    key={at.id} mensagem={at} isSelected={selectedAtendimento?.id === at.id}
                                    onSelect={setSelectedAtendimento} statusOptions={statusOptions}
                                    onUpdateStatus={handleUpdateAtendimento} getTextColorForBackground={getTextColorForBackground}
                                />
                            ))}
                            {hasMore && (
                                <div ref={loaderRef} className="p-6 flex justify-center">
                                    {(isFetchingMore || isLoading) ? (
                                        <Loader2 className="animate-spin text-brand-green" size={24} />
                                    ) : (
                                        <div className="h-1" />
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </aside>
            <main className="flex-1 flex min-h-0">
                {selectedAtendimento ? (
                    <>
                        <div className="flex-1 flex flex-col min-h-0">
                            <header className="flex-shrink-0 flex items-center p-3 bg-white border-b border-gray-200">
                                {selectedAtendimento.profilePicUrl && !headerImgError ? (
                                    <img 
                                        src={selectedAtendimento.profilePicUrl} 
                                        alt="" 
                                        className="w-10 h-10 rounded-full mr-3 object-cover"
                                        onError={() => setHeaderImgError(true)}
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full mr-3 bg-gray-300 flex items-center justify-center font-bold text-white">
                                        {(selectedAtendimento.nome_contato || '??').substring(0, 2).toUpperCase()}
                                    </div>
                                )}
                                <h2 className="text-md font-semibold">{selectedAtendimento.nome_contato || selectedAtendimento.whatsapp}</h2>
                                <button onClick={() => setIsProfileSidebarOpen(!isProfileSidebarOpen)} className="ml-auto p-2"><MoreVertical /></button>
                            </header>
                            <ChatBody
                                mensagem={selectedAtendimento} onViewMedia={handleViewMedia}
                                onDownloadDocument={handleDownloadDocument} isDownloadingMedia={isDownloadingMedia}
                            />
                            <ChatFooter onSendMessage={handleSendMessage} onSendMedia={handleSendMedia} />
                        </div>
                        {isProfileSidebarOpen && (
                            <div ref={sidebarRef} className="w-full md:w-80 border-l border-gray-200 bg-gray-50">
                                <ProfileSidebar
                                    atendimento={selectedAtendimento} onClose={() => setIsProfileSidebarOpen(false)}
                                    statusOptions={statusOptions} getTextColorForBackground={getTextColorForBackground}
                                    isOpen={isProfileSidebarOpen}
                                    onUpdateStatus={handleUpdateAtendimento}
                                />
                            </div>
                        )}
                    </>
                ) : <ChatPlaceholder />}
            </main>
            <MediaModal
                isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}
                mediaUrl={modalMedia?.url} mediaType={modalMedia?.type} filename={modalMedia?.filename}
            />
        </div>
    );
}

export default Mensagens;