import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/axiosConfig';
import toast from 'react-hot-toast';
import { Loader2, Search, Database, MoreHorizontal } from 'lucide-react';
import MediaModal from '../components/mensagens/MediaModal';
import ProfileSidebar from '../components/mensagens/ProfileSidebar';
import SearchAndFilter from '../components/mensagens/SearchAndFilter';
import ContactItem from '../components/mensagens/ContactItem';
import ChatBody from '../components/mensagens/ChatBody';
import ChatFooter from '../components/mensagens/ChatFooter';
import ChatPlaceholder from '../components/mensagens/ChatPlaceholder';
import PageLoader from '../components/common/PageLoader';
import FilterPopover from '../components/mensagens/FilterPopover';

// ─── DESIGN SYSTEM ──────────────────────────────────────────────────────────
const DS_STYLE = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800&display=swap');

    :root {
        --ds-bg: #f0fdf4;
        --ds-surface: rgba(255, 255, 255, 0.6);
        --ds-accent: #356854;
        --ds-text-main: #064e3b;
        --ds-text-muted: #6b7280;
        --ds-radius-lg: 3rem;
        --ds-shadow-premium: 0 25px 50px -12px rgba(53, 104, 84, 0.12);
    }

    .mensagens-loft {
        font-family: 'Inter', sans-serif;
        background: white;
        position: absolute;
        inset: 0;
        overflow: hidden;
        display: flex;
        z-index: 10;
    }

    .contact-list-container {
        background: white;
        border-right: 1px solid #f1f5f9 !important;
        border-radius: 0;
        box-shadow: none;
        margin: 0;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .chat-center-card {
        background: #f8fafc;
        border: none;
        border-radius: 0;
        box-shadow: none;
        margin: 0;
        height: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        flex: 1;
        position: relative;
    }

    .chat-bubble-user {
        background: linear-gradient(135deg, #356854, #2a5242);
        color: white;
        border-radius: 1.25rem 0 1.25rem 1.25rem;
        padding: 0.85rem 1.1rem;
        box-shadow: 0 10px 15px -3px rgba(53, 104, 84, 0.2);
        font-size: 0.9rem;
        line-height: 1.5;
        position: relative;
    }

    .chat-bubble-user::before {
        content: "";
        position: absolute;
        top: 0;
        right: -10px;
        width: 20px;
        height: 15px;
        background: #356854;
        clip-path: polygon(0 0, 0 100%, 100% 0);
        z-index: 1;
    }

    .chat-bubble-ia {
        background: white;
        color: var(--ds-text-main);
        border-radius: 0 1.25rem 1.25rem 1.25rem;
        padding: 0.85rem 1.1rem;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        font-size: 0.9rem;
        line-height: 1.5;
        border: 1px solid #f1f5f9;
        position: relative;
    }

    .chat-bubble-ia::before {
        content: "";
        position: absolute;
        top: -1px;
        left: -10px;
        width: 20px;
        height: 15px;
        background: white;
        clip-path: polygon(100% 0, 100% 100%, 0 0);
        z-index: 1;
    }

    /* Adiciona a bordinha na ponta do balão da IA */
    .chat-bubble-ia::after {
        content: "";
        position: absolute;
        top: -1px;
        left: -11px;
        width: 21px;
        height: 16px;
        background: #f1f5f9;
        clip-path: polygon(100% 0, 100% 100%, 0 0);
        z-index: 0;
    }

    .editorial-label {
        font-family: 'Plus Jakarta Sans', sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.15em;
        font-weight: 800;
        font-size: 0.65rem;
        color: var(--ds-text-muted);
    }

    .executive-title {
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-weight: 900;
        letter-spacing: -0.02em;
    }

    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

    .custom-scrollbar::-webkit-scrollbar { width: 8px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); border: 2px solid transparent; background-clip: padding-box; }

    .animate-fade-in { animation: fadeIn 0.5s ease-out; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .animate-fade-in-up { animation: fadeInUp 0.5s ease-out; }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    
    .footer-loft {
        padding: 1.5rem;
        background: transparent;
    }
`;

function Mensagens() {
    const location = useLocation();

    // ── State ─────────────────────────────────────────────────────────────────
    const [instances, setInstances] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [filteredContacts, setFilteredContacts] = useState([]);
    const [selectedContact, setSelectedContact] = useState(null);
    const [messages, setMessages] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);

    const [isLoadingContacts, setIsLoadingContacts] = useState(true);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeButtonGroup, setActiveButtonGroup] = useState('atendimentos');
    const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
    const [limit] = useState(50);

    const [modalMedia, setModalMedia] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDownloadingMedia, setIsDownloadingMedia] = useState(false);
    const [isProfileSidebarOpen, setIsProfileSidebarOpen] = useState(false);
    const [headerImgError, setHeaderImgError] = useState(false);

    const [sendingQueue, setSendingQueue] = useState({});
    const [isProcessing, setIsProcessing] = useState({});
    const messagesPollingRef = useRef(null);
    const selectedContactIdRef = useRef(null);

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

    const [isLoadingMoreContacts, setIsLoadingMoreContacts] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // ── 1. Carrega instâncias + usuário e depois carrega contatos ─────────────
    const loadContacts = useCallback(async (currentOffset = 0, append = false) => {
        if (currentOffset === 0) {
            setIsLoadingContacts(true);
        } else {
            setIsLoadingMoreContacts(true);
        }

        try {
            let activeInstances = instances;
            if (!activeInstances || activeInstances.length === 0) {
                const [userRes, instancesRes] = await Promise.all([
                    api.get('/auth/me'),
                    api.get('/whatsapp/')
                ]);
                setCurrentUser(userRes.data);
                activeInstances = instancesRes.data.filter(inst => inst.is_active);
                setInstances(activeInstances);
            }

            const newContacts = [];
            let someInstanceMightHaveMore = false;

            await Promise.all(activeInstances.map(async (inst) => {
                try {
                    const limitPerRequest = 20;
                    const chatsRes = await api.get(`/whatsapp/${inst.id}/chats?limit=${limitPerRequest}&offset=${currentOffset}`);
                    const chats = chatsRes.data || [];

                    if (chats.length === limitPerRequest) {
                        someInstanceMightHaveMore = true;
                    }

                    const normalized = chats.map(c => ({
                        id: `${inst.id}-${c.remoteJid}`,
                        remoteJid: c.remoteJid,
                        instanceId: inst.id,
                        instanceName: inst.instance_name || inst.name,
                        nome_contato: c.name || c.remoteJid.split('@')[0],
                        profilePicUrl: c.profilePicUrl,
                        whatsapp: c.remoteJid.split('@')[0],
                        isGroup: c.isGroup || c.remoteJid.includes('@g.us'),
                        situacao: c.situacao || null,
                        campanha: c.campanha || null,
                        prospect_contact_id: c.prospect_contact_id || null,
                        observacoes: c.observacoes || null,
                        conversa: '[]',
                        lastMessage: c.lastMessage || null,
                        timestamp: c.timestamp || 0,
                        last_message_ts: c.timestamp || 0,
                        unreadCount: c.unreadCount || 0,
                        updated_at: null,
                    }));

                    newContacts.push(...normalized);
                } catch (err) {
                    console.warn(`Falha ao carregar conversas da instância ${inst.id}`, err);
                }
            }));

            setHasMore(someInstanceMightHaveMore);

            setContacts(prev => {
                const combined = append ? [...prev, ...newContacts] : newContacts;
                const uniqueMap = new Map();

                combined.forEach(c => {
                    if (uniqueMap.has(c.id)) {
                        const existing = uniqueMap.get(c.id);
                        uniqueMap.set(c.id, {
                            ...c,
                            // Mantém o histórico de mensagens se ele já existir localmente
                            conversa: (existing.conversa && existing.conversa !== '[]') ? existing.conversa : c.conversa,
                            unreadCount: Math.max(existing.unreadCount || 0, c.unreadCount || 0)
                        });
                    } else {
                        uniqueMap.set(c.id, c);
                    }
                });

                return Array.from(uniqueMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            });
        } catch (err) {
            setError('Falha ao conectar com servidor de mensagens.');
        } finally {
            setIsLoadingContacts(false);
            setIsLoadingMoreContacts(false);
        }
    }, [instances]);

    useEffect(() => {
        loadContacts(offset, offset > 0);
    }, [offset, loadContacts]);

    const handleScrollContacts = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            if (!isLoadingContacts && !isLoadingMoreContacts && hasMore) {
                setOffset(prev => prev + 20);
            }
        }
    };

    // ── 2. Carrega mensagens quando um contato é selecionado ──────────────────
    const loadMessages = useCallback(async (contact, showLoading = true) => {
        if (!contact) return;
        if (showLoading) setIsLoadingMessages(true);
        try {
            const res = await api.get(
                `/whatsapp/${contact.instanceId}/messages-api/${encodeURIComponent(contact.remoteJid)}`,
                { params: { count: 1000 } }
            );

            // Segurança: Ignora se o usuário já trocou de contato
            if (selectedContactIdRef.current !== contact.id) return;

            const fetched = res.data || [];
            console.log(`[Mensagens] ${fetched.length} mensagens carregadas para ${contact.remoteJid}`);
            const latestMsg = fetched.length > 0 ? fetched[fetched.length - 1] : null;
            const nc = JSON.stringify(fetched);

            setMessages(fetched);
            setSelectedContact(prev => prev ? { ...prev, conversa: nc } : prev);

            setContacts(prev => {
                const updated = prev.map(c => {
                    if (c.id === contact.id) {
                        return {
                            ...c,
                            conversa: nc,
                            lastMessage: latestMsg ? latestMsg.content : c.lastMessage,
                            timestamp: latestMsg ? latestMsg.timestamp : c.timestamp
                        };
                    }
                    return c;
                });
                // Mantém a lista sempre ordenada pelos mais recentes
                return [...updated].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            });
        } catch (e) {
            // silencioso
        } finally {
            if (showLoading && selectedContactIdRef.current === contact.id) {
                setIsLoadingMessages(false);
            }
        }
    }, [limit]);

    // Quando seleciona um contato: para polling anterior, carrega mensagens, inicia novo polling
    const handleSelectContact = useCallback((contact) => {
        setSelectedContact(contact);
        selectedContactIdRef.current = contact.id;
        setHeaderImgError(false);
        setIsProfileSidebarOpen(false);
        
        // Tenta carregar o que já temos em memória (cache) para resposta instantânea
        try {
            const existing = contact.conversa && contact.conversa !== '[]' ? JSON.parse(contact.conversa) : [];
            setMessages(existing);
        } catch (e) {
            setMessages([]);
        }

        if (messagesPollingRef.current) clearInterval(messagesPollingRef.current);

        loadMessages(contact, true);

        messagesPollingRef.current = setInterval(() => {
            loadMessages(contact, false);
        }, 5000);
    }, [loadMessages]);

    // Limpa polling ao desmontar
    useEffect(() => {
        return () => {
            if (messagesPollingRef.current) clearInterval(messagesPollingRef.current);
        };
    }, []);

    // ── 3. Navegação por parâmetro de rota ────────────────────────────────────
    useEffect(() => {
        if (location.state?.selectContactId && contacts.length > 0) {
            const found = contacts.find(c => String(c.prospect_contact_id) === String(location.state.selectContactId));
            if (found) {
                handleSelectContact(found);
                if (found.situacao || found.campanha) {
                    setActiveButtonGroup('bot_ia');
                }
            }
            window.history.replaceState({}, document.title);
        }
    }, [location.state, contacts, handleSelectContact]);

    // ── 4. Filtro de contatos ──────────────────────────────────────────────────
    useEffect(() => {
        setFilteredContacts(contacts.filter(c => {
            const matches =
                (c.nome_contato || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.whatsapp || '').includes(searchTerm) ||
                (c.lastMessage || '').toLowerCase().includes(searchTerm.toLowerCase());

            if (!matches) return false;

            // Debug para entender por que contatos individuais podem estar sumindo
            const isBotIA = !!(c.campanha || c.situacao);
            const isGroup = c.isGroup || (c.remoteJid && c.remoteJid.includes('@g.us'));

            // Se estiver na aba Atendimentos, mostra quem NÃO é Bot IA
            // Se estiver na aba Bot IA, mostra quem É Bot IA
            const shouldShow = activeButtonGroup === 'bot_ia' ? isBotIA : !isBotIA;

            return shouldShow;
        }));

    }, [contacts, searchTerm, activeButtonGroup]);

    // ── 5. Envio de mensagens ──────────────────────────────────────────────────
    const handleSendMessage = (text) => {
        if (!selectedContact) return;
        const oid = `local-${Date.now()}`;
        const msg = { id: oid, role: 'assistant', type: 'sending', content: text, timestamp: Math.floor(Date.now() / 1000) };

        setMessages(prev => [...prev, msg]);
        setSelectedContact(prev => {
            if (!prev) return prev;
            const c = JSON.parse(prev.conversa || '[]');
            c.push(msg);
            const nc = JSON.stringify(c);

            setContacts(l => {
                const updated = l.map(at =>
                    at.id === prev.id
                        ? { ...at, conversa: nc, lastMessage: text, timestamp: msg.timestamp }
                        : at
                );
                return [...updated].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            });

            return { ...prev, conversa: nc };
        });

        setSendingQueue(p => ({
            ...p,
            [selectedContact.id]: [...(p[selectedContact.id] || []), {
                id: oid,
                instanceId: selectedContact.instanceId,
                remoteJid: selectedContact.remoteJid,
                payload: { text }
            }]
        }));
    };

    // Processa fila de envio
    useEffect(() => {
        Object.keys(sendingQueue).forEach(aid => {
            if (sendingQueue[aid]?.length > 0 && !isProcessing[aid]) {
                setIsProcessing(p => ({ ...p, [aid]: true }));
                const item = sendingQueue[aid][0];
                (async () => {
                    try {
                        await api.post(`/whatsapp/${item.instanceId}/send`, {
                            remoteJid: item.remoteJid,
                            text: item.payload.text
                        });
                        const res = await api.get(
                            `/whatsapp/${item.instanceId}/messages-api/${encodeURIComponent(item.remoteJid)}`,
                            { params: { count: limit } }
                        );
                        const fetched = res.data || [];
                        const nc = JSON.stringify(fetched);
                        setMessages(fetched);
                        setContacts(p => p.map(at => at.id === aid ? { ...at, conversa: nc } : at));
                        setSelectedContact(p => p?.id === aid ? { ...p, conversa: nc } : p);
                    } catch (e) {
                        toast.error("Falha ao enviar mensagem.");
                    } finally {
                        setSendingQueue(p => ({ ...p, [aid]: p[aid].slice(1) }));
                        setIsProcessing(p => ({ ...p, [aid]: false }));
                    }
                })();
            }
        });
    }, [sendingQueue, isProcessing, limit]);

    // ── Render ────────────────────────────────────────────────────────────────
    if (isLoadingContacts && !currentUser) {
        return <PageLoader message="Sincronizando central de mensagens..." subMessage="Carregando contatos via Evolution API..." />;
    }

    const chatBodyContact = selectedContact
        ? { ...selectedContact, conversa: JSON.stringify(messages) }
        : null;

    return (
        <div className="mensagens-loft">
            <style>{DS_STYLE}</style>

            {/* Sidebar de Contatos */}
            <aside className="contact-list-container w-full md:w-[450px] z-20">
                <header className="flex-shrink-0">
                    <SearchAndFilter
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        activeButtonGroup={activeButtonGroup}
                        toggleFilter={setActiveButtonGroup}
                        onFilterIconClick={() => setIsFilterPopoverOpen(!isFilterPopoverOpen)}
                        hasActiveFilters={false}
                    />
                </header>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-10 space-y-1" onScroll={handleScrollContacts}>
                    {isLoadingContacts ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-40">
                            <Loader2 size={32} className="animate-spin mb-3 text-emerald-600" />
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Carregando contatos...</p>
                        </div>
                    ) : filteredContacts.length > 0 ? (
                        <>
                            {filteredContacts.map(c => (
                                <ContactItem
                                    key={c.id}
                                    mensagem={c}
                                    isSelected={selectedContact?.id === c.id}
                                    onSelect={handleSelectContact}
                                    statusOptions={statusOptions}
                                    onUpdateStatus={() => { }}
                                    getTextColorForBackground={() => '#fff'}
                                />
                            ))}
                            {isLoadingMoreContacts && (
                                <div className="flex justify-center py-4">
                                    <Loader2 size={24} className="animate-spin text-emerald-600" />
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20">
                            <Search size={48} className="mb-4" />
                            <p className="text-[11px] font-black uppercase tracking-widest">Vazio</p>
                        </div>
                    )}
                </div>
            </aside>

            {/* Central de Chat */}
            <main className="chat-center-card relative min-w-0">
                {selectedContact ? (
                    <>
                        <header className="flex-shrink-0 flex items-center h-20 px-8 bg-white/40 backdrop-blur-xl border-b border-white/40 sticky top-0 z-10">
                            <div className="flex items-center gap-4 flex-1">
                                <div className="relative group cursor-pointer" onClick={() => setIsProfileSidebarOpen(true)}>
                                    {selectedContact.profilePicUrl && !headerImgError ? (
                                        <img
                                            src={selectedContact.profilePicUrl}
                                            alt=""
                                            className="w-12 h-12 rounded-2xl object-cover shadow-lg border-2 border-white group-hover:scale-105 transition-transform"
                                            onError={() => setHeaderImgError(true)}
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center font-black text-white text-lg group-hover:scale-105 transition-transform">
                                            {(selectedContact.nome_contato || '??').substring(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></div>
                                </div>
                                <div className="cursor-pointer" onClick={() => setIsProfileSidebarOpen(true)}>
                                    <h3 className="executive-title text-[15px] text-slate-900 leading-none mb-1">
                                        {selectedContact.nome_contato || selectedContact.whatsapp}
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        {isLoadingMessages ? (
                                            <span className="flex items-center gap-1.5 text-[9px] font-black text-amber-500 uppercase tracking-widest">
                                                <Loader2 size={10} className="animate-spin" /> Carregando...
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                {messages.length} mensagens
                                            </span>
                                        )}
                                        <span className="h-2 w-[1px] bg-slate-200"></span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                            <Database size={10} /> {selectedContact.instanceName}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsProfileSidebarOpen(!isProfileSidebarOpen)}
                                    className="w-10 h-10 flex items-center justify-center bg-white/50 hover:bg-white text-slate-400 hover:text-brand-green rounded-xl transition-all shadow-sm border border-white"
                                >
                                    <MoreHorizontal size={20} />
                                </button>
                            </div>
                        </header>

                        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/30">
                            {isLoadingMessages ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-3 opacity-40">
                                        <Loader2 size={32} className="animate-spin text-emerald-600" />
                                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Carregando mensagens...</p>
                                    </div>
                                </div>
                            ) : (
                                <ChatBody
                                    key={selectedContact.id}
                                    mensagem={chatBodyContact}
                                    onViewMedia={async (mid, type, fname) => {
                                        setIsDownloadingMedia(true);
                                        try {
                                            const res = await api.get(`/whatsapp/${selectedContact.instanceId}/media/${mid}`, { responseType: 'blob' });
                                            setModalMedia({ url: URL.createObjectURL(res.data), type, filename: fname });
                                            setIsModalOpen(true);
                                        } catch (e) {
                                            toast.error("Erro ao carregar mídia.");
                                        } finally {
                                            setIsDownloadingMedia(false);
                                        }
                                    }}
                                    onDownloadDocument={async (mid, fname) => {
                                        setIsDownloadingMedia(true);
                                        try {
                                            const res = await api.get(`/whatsapp/${selectedContact.instanceId}/media/${mid}`, { responseType: 'blob' });
                                            const url = URL.createObjectURL(res.data);
                                            const link = document.createElement('a');
                                            link.href = url;
                                            link.download = fname || 'documento';
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                            URL.revokeObjectURL(url);
                                        } catch (e) {
                                            toast.error("Erro ao baixar documento.");
                                        } finally {
                                            setIsDownloadingMedia(false);
                                        }
                                    }}
                                    isDownloadingMedia={isDownloadingMedia}
                                />
                            )}

                            <ChatFooter onSendMessage={handleSendMessage} onSendMedia={() => { }} />
                        </div>

                        {isProfileSidebarOpen && (
                            <div className="absolute inset-y-0 right-0 w-[380px] bg-white/95 backdrop-blur-2xl border-l border-white/40 shadow-2xl z-30 animate-fade-in-up">
                                <ProfileSidebar
                                    atendimento={chatBodyContact}
                                    onClose={() => setIsProfileSidebarOpen(false)}
                                    statusOptions={statusOptions}
                                    getTextColorForBackground={() => '#fff'}
                                    isOpen={isProfileSidebarOpen}
                                    onUpdateStatus={() => { }}
                                />
                            </div>
                        )}
                    </>
                ) : (
                    <ChatPlaceholder />
                )}
            </main>

            <MediaModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                mediaUrl={modalMedia?.url}
                mediaType={modalMedia?.type}
                filename={modalMedia?.filename}
            />

            {isFilterPopoverOpen && (
                <FilterPopover
                    isOpen={isFilterPopoverOpen}
                    onClose={() => setIsFilterPopoverOpen(false)}
                    statusOptions={statusOptions}
                    allTags={[]}
                    selectedStatus={null}
                    onStatusChange={() => { }}
                    selectedTags={null}
                    onTagChange={() => { }}
                    onClearFilters={() => { }}
                    limit={limit}
                    onLimitChange={() => { }}
                    timeStart={null}
                    onTimeStartChange={() => { }}
                    timeEnd={null}
                    onTimeEndChange={() => { }}
                />
            )}
        </div>
    );
}

export default Mensagens;