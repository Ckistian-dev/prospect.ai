import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { Play, Pause, Trash2, Edit, Loader2, Search, MessageSquare, ChevronDown, Table as TableIcon, AlertTriangle, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Image as ImageIcon, Download, Target, Filter, Star, Phone, MoreVertical, Layout, Database, CheckCircle, Activity, User } from 'lucide-react';
import toast from 'react-hot-toast';
import PageLoader from '../components/common/PageLoader';

// ─── DESIGN SYSTEM ──────────────────────────────────────────────────────────
const DS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
.prospects-page { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
.prospects-page h1, .prospects-page h2, .prospects-page h3, .prospects-page h4 { font-family: 'Plus Jakarta Sans', sans-serif; }
.ds-surface { background: #ffffff; border-radius: 2.5rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 30px rgba(0,0,0,0.02); }
.ds-card { background: #ffffff; border-radius: 1.5rem; border: 1px solid rgba(0,0,0,0.05); transition: all 0.3s ease; }
.status-pill { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
.lead-score-badge {
    width: 3rem;
    height: 3rem;
    border-radius: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 0.875rem;
    box-shadow: 0 4px 15px rgba(0,0,0,0.03);
}
.chat-bubble-ai { background: #356854; color: white; border-radius: 1.5rem 1.5rem 0.25rem 1.5rem; }
.chat-bubble-user { background: #f1f5f9; color: #1e293b; border-radius: 1.5rem 1.5rem 1.5rem 0.25rem; }
`;

const Modal = ({ onClose, children, maxWidth = "max-w-2xl" }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
        <div className={`bg-white w-full ${maxWidth} relative overflow-hidden animate-in zoom-in duration-300`} style={{ borderRadius: '2.5rem', boxShadow: '0 40px 100px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-8 right-8 w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-slate-600 rounded-xl transition-all z-10">✕</button>
            {children}
        </div>
    </div>
);

const ImageMessage = ({ messageId, mimeType, fallbackContent }) => {
    const [imageUrl, setImageUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get(`/prospecting/messages/${messageId}/media`);
                if (res.data.base64) setImageUrl(res.data.base64.startsWith('data:') ? res.data.base64 : `data:${mimeType || 'image/jpeg'};base64,${res.data.base64}`);
                else setError(true);
            } catch (err) { setError(true); }
            finally { setLoading(false); }
        })();
    }, [messageId, mimeType]);
    if (loading) return <div className="p-4 flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest"><Loader2 size={12} className="animate-spin" /> Carregando...</div>;
    if (error) return <p className="text-xs text-slate-400 italic p-4">{fallbackContent}</p>;
    return <img src={imageUrl} alt="" className="rounded-2xl w-full h-auto max-h-80 object-cover p-1 shadow-sm" />;
};

export const ConversationModal = ({ onClose, conversation, contactIdentifier }) => {
    const chatRef = useRef(null);
    useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [conversation]);
    let messages = [];
    try { const parsed = JSON.parse(conversation); if (Array.isArray(parsed)) messages = parsed; } catch (e) { }
    return (
        <Modal onClose={onClose} maxWidth="max-w-3xl">
            <div className="h-[80vh] flex flex-col">
                <header className="p-10 bg-white border-b border-slate-50">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-2">Histórico de Atendimento</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">{contactIdentifier}</p>
                </header>
                <div ref={chatRef} className="flex-1 overflow-y-auto p-10 space-y-6 bg-slate-50/30 custom-scrollbar">
                    {messages.length > 0 ? messages.map((msg, i) => {
                        const isAi = msg.role === 'assistant';
                        const isImg = msg.mediaType === 'image' || (msg.content?.includes('[Análise de Mídia]'));
                        return (
                            <div key={i} className={`flex ${isAi ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-6 shadow-sm ${isAi ? 'chat-bubble-ai' : 'chat-bubble-user'}`}>
                                    {!isAi && msg.senderName && <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">{msg.senderName}</div>}
                                    {isImg ? <ImageMessage messageId={msg.id} mimeType={msg.mimeType} fallbackContent={msg.content} /> : <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</p>}
                                    <div className={`text-[9px] font-bold mt-2 text-right opacity-40 uppercase tracking-tight ${isAi ? 'text-white' : 'text-slate-400'}`}>
                                        {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-20"><MessageSquare size={64} className="mb-6" /><h3 className="text-sm font-black uppercase tracking-widest">Sem mensagens registradas</h3></div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export const EditContactModal = ({ contact, statusOptions, onSave, onClose }) => {
    const [situacao, setSituacao] = useState(contact.situacao);
    const [observacoes, setObservacoes] = useState(contact.observacoes || '');
    return (
        <Modal onClose={onClose} maxWidth="max-w-xl">
            <div className="p-10">
                <header className="mb-10 text-center">
                    <div className="w-20 h-20 bg-emerald-50 rounded-[2rem] flex items-center justify-center text-[#356854] mx-auto mb-6 shadow-sm"><User size={40} /></div>
                    <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-none mb-2">Qualificar Lead</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{contact.nome}</p>
                </header>
                <div className="space-y-8">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Estágio no Funil</label>
                        <div className="relative">
                            <select value={situacao} onChange={e => setSituacao(e.target.value)} className="h-14 w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 text-sm font-black text-slate-700 appearance-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/30 transition-all outline-none">
                                {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Notas Estratégicas</label>
                        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows="5" className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-6 text-sm font-medium text-slate-700 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/30 transition-all outline-none resize-none" placeholder="Adicione observações sobre este lead..." />
                    </div>
                </div>
                <footer className="mt-10 flex gap-4">
                    <button onClick={onClose} className="flex-1 h-14 bg-slate-50 text-slate-400 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all">Cancelar</button>
                    <button onClick={() => { onSave(contact.id, { situacao, observacoes }); onClose(); }} className="flex-1 h-14 bg-[#356854] text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-900/10 hover:bg-[#2d5847] transition-all">Salvar Qualificação</button>
                </footer>
            </div>
        </Modal>
    );
};

export const DeleteConfirmationModal = ({ title, message, onConfirm, onClose }) => (
    <Modal onClose={onClose} maxWidth="max-w-md">
        <div className="p-10 text-center">
            <div className="mx-auto w-20 h-20 bg-rose-50 text-rose-500 rounded-[2rem] flex items-center justify-center mb-6 shadow-sm"><AlertTriangle size={40} /></div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">{title}</h3>
            <p className="text-slate-400 text-sm font-medium mb-10 px-4" dangerouslySetInnerHTML={{ __html: message }} />
            <div className="flex gap-4">
                <button onClick={onClose} className="flex-1 h-14 bg-slate-50 text-slate-400 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all">Cancelar</button>
                <button onClick={onConfirm} className="flex-1 h-14 bg-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-rose-900/10 hover:bg-rose-600 transition-all">Sim, Remover</button>
            </div>
        </div>
    </Modal>
);

function Prospects() {
    const navigate = useNavigate();
    const [prospectsList, setProspectsList] = useState([]);
    const [selectedProspect, setSelectedProspect] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [filteredContacts, setFilteredContacts] = useState([]);
    const [isLoading, setIsLoading] = useState({ list: true, data: false });
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [minScore, setMinScore] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [modal, setModal] = useState({ type: null, data: null });
    const contactsPerPage = 12;
    const statusOptions = ["Aguardando Início", "Aguardando Resposta", "Resposta Recebida", "Lead Qualificado", "Não Interessado", "Concluído", "Sem Whatsapp", "Falha no Envio", "Erro IA", "Conversa Manual", "Fechado", "Atendente Chamado"];

    const fetchProspectsList = useCallback(async (selectFirst = false) => {
        setIsLoading(p => ({ ...p, list: true }));
        try {
            const res = await api.get('/prospecting/');
            const actives = res.data.filter(p => p.status !== 'Concluído');
            setProspectsList(actives);
            if (selectFirst && actives.length > 0) setSelectedProspect(actives[0]);
            else if (actives.length === 0) { setSelectedProspect(null); setContacts([]); }
        } catch (e) { setError('Falha ao carregar campanhas.'); }
        finally { setIsLoading(p => ({ ...p, list: false })); }
    }, []);

    const fetchProspectData = useCallback(async () => {
        if (!selectedProspect) { setContacts([]); setFilteredContacts([]); return; }
        setIsLoading(p => ({ ...p, data: true }));
        try {
            const res = await api.get(`/prospecting/sheet/${selectedProspect.id}`);
            const data = res.data.data.map(row => ({ ...row, contactName: row.nome }));
            setContacts(data || []);
            setCurrentPage(1);
        } catch (e) { setContacts([]); }
        finally { setIsLoading(p => ({ ...p, data: false })); }
    }, [selectedProspect]);

    useEffect(() => { fetchProspectsList(true); }, [fetchProspectsList]);
    useEffect(() => { if (selectedProspect) fetchProspectData(); }, [selectedProspect, fetchProspectData]);

    useEffect(() => {
        const lower = searchTerm.toLowerCase();
        setFilteredContacts(contacts.filter(item => {
            const matchesSearch = Object.values(item).some(v => String(v).toLowerCase().includes(lower));
            const matchesScore = (item.lead_score || 0) >= minScore;
            return matchesSearch && matchesScore;
        }));
        setCurrentPage(1);
    }, [searchTerm, minScore, contacts]);

    const getStatusClass = (s) => {
        const map = {
            'Resposta Recebida': "bg-sky-50 text-sky-600 border-sky-100",
            'Lead Qualificado': "bg-emerald-50 text-emerald-600 border-emerald-100",
            'Concluído': "bg-emerald-50 text-emerald-600 border-emerald-100",
            'Aguardando Resposta': "bg-amber-50 text-amber-600 border-amber-100",
            'Falha no Envio': "bg-rose-50 text-rose-600 border-rose-100",
            'Erro IA': "bg-rose-50 text-rose-600 border-rose-100",
            'Sem Whatsapp': "bg-slate-50 text-slate-400 border-slate-100",
            'Não Interessado': "bg-rose-50 text-rose-600 border-rose-100",
            'Aguardando Início': "bg-indigo-50 text-indigo-600 border-indigo-100",
            'Conversa Manual': "bg-orange-50 text-orange-600 border-orange-100",
            'Fechado': "bg-emerald-50 text-emerald-600 border-emerald-100",
            'Atendente Chamado': "bg-[#356854] text-white border-[#356854]",
        };
        return `status-pill px-3 py-1.5 rounded-xl border ${map[s] || 'bg-slate-50 text-slate-400 border-slate-100'}`;
    };

    const currentContacts = filteredContacts.slice((currentPage - 1) * contactsPerPage, currentPage * contactsPerPage);
    const totalPages = Math.ceil(filteredContacts.length / contactsPerPage);

    if (isLoading.list && prospectsList.length === 0) return <PageLoader message="Mapeando base de leads..." subMessage="Cruzando dados com motor de qualificação..." />;

    return (
        <div className="prospects-page p-6 md:p-12 min-h-screen bg-[#f8fafc]">
            <style>{DS_STYLE}</style>
            <div className="max-w-[1600px] mx-auto flex flex-col gap-10">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">Gestão de Leads <Activity size={24} className="text-[#356854]" /></h1>
                        <p className="text-slate-400 mt-1.5 text-sm font-medium">Qualificação profunda e monitoramento de performance</p>
                    </div>
                    {selectedProspect && (
                        <button onClick={async () => { setIsExporting(true); try { const res = await api.get(`/prospecting/${selectedProspect.id}/export/csv`, { responseType: 'blob' }); const url = window.URL.createObjectURL(new Blob([res.data])); const link = document.createElement('a'); link.href = url; link.setAttribute('download', `leads_${selectedProspect.nome_prospeccao.replace(/\s+/g, '_')}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); } finally { setIsExporting(false); } }} disabled={isLoading.data || contacts.length === 0 || isExporting} className="h-14 px-8 bg-white text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-2xl border border-slate-100 shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-30">
                            {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} Exportar Leads
                        </button>
                    )}
                </header>

                <div className="ds-surface p-10 flex flex-col gap-10 border-none shadow-2xl shadow-slate-200/50">
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-end">
                        <div className="xl:col-span-3">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Campanha</label>
                            <div className="relative">
                                <select value={selectedProspect?.id || ''} onChange={e => setSelectedProspect(prospectsList.find(p => p.id === parseInt(e.target.value)))} className="h-14 w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 text-sm font-black text-slate-700 appearance-none focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none">
                                    {prospectsList.map(p => <option key={p.id} value={p.id}>{p.nome_prospeccao}</option>)}
                                </select>
                                <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20} />
                            </div>
                        </div>
                        <div className="xl:col-span-6 relative">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Busca Rápida</label>
                            <div className="relative">
                                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                <input type="text" placeholder="Filtrar leads, WhatsApp ou estágio..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-14 w-full pl-14 pr-6 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                            </div>
                        </div>
                        <div className="xl:col-span-3">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Score Mínimo</label>
                            <div className="relative">
                                <Star className="absolute left-6 top-1/2 -translate-y-1/2 text-amber-400" size={20} />
                                <input type="number" min="0" max="10" value={minScore} onChange={e => setMinScore(Number(e.target.value))} className="h-14 w-full pl-14 pr-6 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left min-w-[1000px]">
                            <thead>
                                <tr className="border-b border-slate-50">
                                    {['Identificação', 'WhatsApp', 'Qualificação', 'Situação', 'Resumo', 'Ações'].map((h, i) => (
                                        <th key={i} className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {isLoading.data ? (
                                    <tr><td colSpan="6" className="text-center py-32"><Loader2 size={40} className="animate-spin text-emerald-500 mx-auto" /></td></tr>
                                ) : currentContacts.length > 0 ? currentContacts.map((row) => (
                                    <tr key={row.id} className="transition-all hover:bg-emerald-50/20 group cursor-pointer" onDoubleClick={() => navigate('/mensagens', { state: { selectContactId: row.id } })}>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 font-black text-sm group-hover:bg-[#356854] group-hover:text-white transition-all">{(row.nome || '?')[0].toUpperCase()}</div>
                                                <div className="text-sm font-black text-slate-800">{row.nome}</div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-sm font-bold text-slate-500 tracking-tight">{row.whatsapp}</td>
                                        <td className="px-8 py-6">
                                            <div className={`lead-score-badge border ${row.lead_score >= 8 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : row.lead_score >= 5 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                {row.lead_score || 0}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6"><span className={getStatusClass(row.situacao)}>{row.situacao}</span></td>
                                        <td className="px-8 py-6 max-w-xs"><p className="text-xs text-slate-400 font-medium italic truncate" title={row.observacoes}>{row.observacoes || 'Sem observações.'}</p></td>
                                        <td className="px-8 py-6 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                <button onClick={() => setModal({ type: 'conversation', data: row })} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-[#356854] hover:border-emerald-100 rounded-xl transition-all shadow-sm"><MessageSquare size={18} /></button>
                                                <button onClick={() => setModal({ type: 'edit_contact', data: row })} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-[#356854] hover:border-emerald-100 rounded-xl transition-all shadow-sm"><Edit size={18} /></button>
                                                <button onClick={() => setModal({ type: 'delete_contact', data: row })} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-rose-500 hover:border-rose-100 rounded-xl transition-all shadow-sm"><Trash2 size={18} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="6" className="text-center py-40 opacity-20"><Target size={64} className="mx-auto mb-6" /><h3 className="text-sm font-black uppercase tracking-widest">Nenhum lead encontrado</h3></td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <footer className="pt-10 border-t border-slate-50 flex justify-between items-center bg-white">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Página {currentPage} de {totalPages}</span>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="w-10 h-10 flex items-center justify-center border border-slate-100 rounded-xl text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronsLeft size={18} /></button>
                                <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="w-10 h-10 flex items-center justify-center border border-slate-100 rounded-xl text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronLeft size={18} /></button>
                                <div className="h-10 px-6 bg-emerald-50 rounded-xl flex items-center text-[#356854] font-black text-[10px] uppercase tracking-widest border border-emerald-100">{currentPage}</div>
                                <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages} className="w-10 h-10 flex items-center justify-center border border-slate-100 rounded-xl text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronRight size={18} /></button>
                                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="w-10 h-10 flex items-center justify-center border border-slate-100 rounded-xl text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronsRight size={18} /></button>
                            </div>
                        </footer>
                    )}
                </div>
            </div>

            {modal.type === 'conversation' && <ConversationModal onClose={() => setModal({ type: null, data: null })} conversation={modal.data.conversa} contactIdentifier={modal.data.contactName} />}
            {modal.type === 'edit_contact' && <EditContactModal contact={modal.data} statusOptions={statusOptions} onSave={async (cid, up) => { try { await api.put(`/prospecting/contacts/${cid}`, up); fetchProspectData(); toast.success('Lead qualificado!'); } catch (e) { toast.error('Erro ao salvar.'); } }} onClose={() => setModal({ type: null, data: null })} />}
            {modal.type === 'delete_contact' && <DeleteConfirmationModal title="Remover Lead" message={`Deseja remover <strong>${modal.data?.nome}</strong> desta campanha?`} onConfirm={async () => { try { await api.delete(`/prospecting/contacts/${modal.data.id}`); fetchProspectData(); toast.success('Lead removido.'); setModal({ type: null, data: null }); } catch (e) { toast.error('Erro ao remover.'); } }} onClose={() => setModal({ type: null, data: null })} />}
        </div>
    );
}

export default Prospects;
