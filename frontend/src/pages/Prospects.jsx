import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { Play, Pause, Trash2, Edit, Loader2, Search, MessageSquare, ChevronDown, Table as TableIcon, AlertTriangle } from 'lucide-react';

// --- COMPONENTES INTERNOS DE MODAL ---

const Modal = ({ onClose, children }) => {
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
};

const ConversationModal = ({ onClose, conversation, contactIdentifier }) => {
    const chatContainerRef = useRef(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [conversation]);

    let messages = [];
    try {
        const parsedData = JSON.parse(conversation);
        if (Array.isArray(parsedData)) {
            messages = parsedData;
        }
    } catch (e) {
        console.error("Erro ao analisar JSON da conversa:", e);
    }

    return (
        <Modal onClose={onClose}>
            <div className="h-[80vh] flex flex-col">
                <div className="p-4 border-b bg-gray-50 rounded-t-lg">
                    <h2 className="text-lg font-semibold text-gray-800">Conversa com {contactIdentifier}</h2>
                </div>
                <div ref={chatContainerRef} className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 bg-[url('https://i.redd.it/qwd83nc4xxf41.jpg')] bg-cover bg-center">
                    {messages.map((msg, index) => {
                        const isAssistant = msg.role === 'assistant';
                        return (
                            <div key={index} className={`flex items-end gap-2 w-full ${isAssistant ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-xs md:max-w-md p-3 rounded-2xl shadow-sm break-words ${isAssistant ? 'bg-[#005c4b] text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none'}`}>
                                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                                </div>
                            </div>
                        );
                    })}
                    {messages.length === 0 && (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-center text-gray-500 bg-white/50 backdrop-blur-sm p-3 rounded-lg italic">
                                Nenhum histórico de conversa.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

const EditContactModal = ({ contact, statusOptions, onSave, onClose }) => {
    const [situacao, setSituacao] = useState(contact.situacao);
    const [observacoes, setObservacoes] = useState(contact.observacoes || '');

    const handleSave = () => {
        onSave(contact.id, { situacao, observacoes });
        onClose();
    };

    return (
        <Modal onClose={onClose}>
            <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Editar Contato</h3>
                <p className="text-sm text-gray-500 mb-6">A alterar o contato: <strong className="text-gray-700">{contact.nome}</strong> ({contact.whatsapp})</p>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Situação</label>
                        <select value={situacao} onChange={e => setSituacao(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm">
                            {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Observações</label>
                        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows="3" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"></textarea>
                    </div>
                </div>
                <div className="mt-8 flex justify-end gap-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition">Cancelar</button>
                    <button type="button" onClick={handleSave} className="px-4 py-2 bg-brand-green text-white rounded-md hover:bg-brand-green-dark transition">Salvar Alterações</button>
                </div>
            </div>
        </Modal>
    );
};

const DeleteConfirmationModal = ({ title, message, onConfirm, onClose }) => (
    <Modal onClose={onClose}>
        <div className="p-6 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-2 text-sm text-gray-500" dangerouslySetInnerHTML={{ __html: message }} />
            <div className="mt-6 flex justify-center gap-4">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition">Cancelar</button>
                <button type="button" onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition">Sim, Remover</button>
            </div>
        </div>
    </Modal>
);

// --- COMPONENTE PRINCIPAL ---

function Prospects() {
    const [prospectsList, setProspectsList] = useState([]);
    const [selectedProspect, setSelectedProspect] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [filteredContacts, setFilteredContacts] = useState([]);
    
    const [isLoading, setIsLoading] = useState({ list: true, data: false });
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const [modal, setModal] = useState({ type: null, data: null });
    
    const statusOptions = ["Aguardando Início", "Aguardando Resposta", "Resposta Recebida", "Lead Qualificado", "Não Interessado", "Concluído", "Sem Whatsapp", "Falha no Envio", "Erro IA"];

    const fetchProspectsList = useCallback(async (selectFirst = false) => {
        setIsLoading(prev => ({ ...prev, list: true }));
        try {
            const response = await api.get('/prospecting/');
            const activeCampaigns = response.data.filter(p => p.status !== 'Concluído');
            setProspectsList(activeCampaigns);

            if (selectFirst && activeCampaigns.length > 0) {
                setSelectedProspect(activeCampaigns[0]);
            } else if (activeCampaigns.length === 0) {
                setSelectedProspect(null);
                setContacts([]);
            }
        } catch (err) {
            setError('Não foi possível carregar a lista de campanhas.');
        } finally {
            setIsLoading(prev => ({ ...prev, list: false }));
        }
    }, []);

    useEffect(() => {
        fetchProspectsList(true);
    }, [fetchProspectsList]);

    const fetchProspectData = useCallback(async () => {
        if (!selectedProspect) {
            setContacts([]);
            setFilteredContacts([]);
            return;
        };
        setIsLoading(prev => ({ ...prev, data: true }));
        setError('');
        try {
            const response = await api.get(`/prospecting/sheet/${selectedProspect.id}`);
            const enrichedData = response.data.data.map(row => ({
                ...row,
                contactName: row.nome 
            }));
            setContacts(enrichedData || []);
        } catch (err) {
            setError(`Não foi possível carregar os dados de "${selectedProspect.nome_prospeccao}".`);
            setContacts([]);
        } finally {
            setIsLoading(prev => ({ ...prev, data: false }));
        }
    }, [selectedProspect]);
    
    useEffect(() => {
        if (selectedProspect) {
            fetchProspectData(); // Busca inicial quando a campanha muda
        }
    }, [selectedProspect, fetchProspectData]);
    

    useEffect(() => {
        const lowercasedFilter = searchTerm.toLowerCase();
        const filtered = contacts.filter(item =>
            Object.values(item).some(value =>
                String(value).toLowerCase().includes(lowercasedFilter)
            )
        );
        setFilteredContacts(filtered);
    }, [searchTerm, contacts]);
    
    const handleSaveContactEdit = async (contactId, updates) => {
        try {
            await api.put(`/prospecting/contacts/${contactId}`, updates);
            setModal({ type: null, data: null });
            fetchProspectData();
        } catch (err) {
            alert('Erro ao salvar as alterações do contato.');
        }
    };

    const handleConfirmContactDelete = async (contactId) => {
        try {
            await api.delete(`/prospecting/contacts/${contactId}`);
            setModal({ type: null, data: null });
            fetchProspectData();
        } catch (err) {
            alert('Erro ao remover o contato da campanha.');
        }
    };
    
    const getStatusClass = (status) => {
        const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full inline-block text-center min-w-[140px]";
        const statusMap = {
            'Resposta Recebida': "bg-blue-100 text-blue-800",
            'Lead Qualificado': "bg-green-100 text-green-800",
            'Concluído': "bg-green-100 text-green-800",
            'Aguardando Resposta': "bg-yellow-100 text-yellow-800",
            'Falha no Envio': "bg-red-200 text-red-800",
            'Erro IA': "bg-red-200 text-red-800",
            'Sem Whatsapp': "bg-gray-200 text-gray-700",
            'Não Interessado': "bg-red-100 text-red-700",
            'Aguardando Início': "bg-purple-100 text-purple-800",
        };
        return `${baseClasses} ${statusMap[status] || 'bg-gray-100 text-gray-600'}`;
    };

    return (
        <div className="p-6 md:p-10 bg-gray-50 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Contatos da Prospecção</h1>
                    <p className="text-gray-500 mt-1">Gerencie os contatos de suas campanhas ativas.</p>
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 items-end">
                    <div>
                        <label htmlFor="prospect-select" className="block text-sm font-medium text-gray-700 mb-2">
                            Campanha Ativa:
                        </label>
                        <div className="relative">
                            <select
                                id="prospect-select"
                                value={selectedProspect?.id || ''}
                                onChange={(e) => {
                                    const newSelected = prospectsList.find(p => p.id === parseInt(e.target.value));
                                    setSelectedProspect(newSelected);
                                }}
                                disabled={isLoading.list || prospectsList.length === 0}
                                className="w-full appearance-none bg-white border border-gray-300 rounded-lg py-2 px-4 pr-10 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500"
                            >
                                {isLoading.list && <option>Carregando...</option>}
                                {!isLoading.list && prospectsList.length === 0 && <option>Nenhuma campanha ativa</option>}
                                {prospectsList.map(prospect => (
                                    <option key={prospect.id} value={prospect.id}>{prospect.nome_prospeccao}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                <ChevronDown size={20} />
                            </div>
                        </div>
                    </div>
                    <div className="relative">
                        <label htmlFor="search-input" className="block text-sm font-medium text-gray-700 mb-2">
                            Filtrar Contatos:
                        </label>
                        <Search className="absolute left-3 top-1/2 mt-3 -translate-y-1/2 text-gray-400" size={20} />
                        <input 
                            id="search-input"
                            type="text" 
                            placeholder="Pesquisar por nome, telefone, situação..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b-2 border-gray-200">
                            <tr>
                                <th className="p-4 text-sm font-semibold text-gray-600 uppercase">Nome</th>
                                <th className="p-4 text-sm font-semibold text-gray-600 uppercase">WhatsApp</th>
                                <th className="p-4 text-sm font-semibold text-gray-600 uppercase">Situação</th>
                                <th className="p-4 text-sm font-semibold text-gray-600 uppercase">Observações</th>
                                <th className="p-4 text-sm font-semibold text-gray-600 uppercase text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading.data ? (
                                <tr><td colSpan="5" className="text-center p-8"><Loader2 size={32} className="animate-spin text-green-600 mx-auto" /></td></tr>
                            ) : error ? (
                                <tr><td colSpan="5" className="text-center p-8 text-red-500">{error}</td></tr>
                            ) : filteredContacts.length > 0 ? (
                                filteredContacts.map((row) => (
                                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="p-4 font-medium text-gray-800">{row.nome}</td>
                                        <td className="p-4 text-gray-700">{row.whatsapp}</td>
                                        <td className="p-4"><span className={getStatusClass(row.situacao)}>{row.situacao}</span></td>
                                        <td className="p-4 text-sm text-gray-600 max-w-screen-2xl" title={row.observacoes}>{row.observacoes}</td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-center items-center gap-2">
                                                <button onClick={() => setModal({ type: 'conversation', data: row })} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-full transition-colors" title="Ver conversa"><MessageSquare size={18} /></button>
                                                <button onClick={() => setModal({ type: 'edit_contact', data: row })} className="p-2 text-gray-500 hover:text-green-600 hover:bg-gray-100 rounded-full transition-colors" title="Editar Contato"><Edit size={18} /></button>
                                                <button onClick={() => setModal({ type: 'delete_contact', data: row })} className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-full transition-colors" title="Remover Contato"><Trash2 size={18} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="text-center py-10 text-gray-500">
                                        <TableIcon className="mx-auto h-12 w-12 text-gray-400" />
                                        <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum contato nesta campanha</h3>
                                        <p className="mt-1 text-sm text-gray-500">Selecione uma campanha para ver os contatos.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {modal.type === 'conversation' && (
                <ConversationModal
                    onClose={() => setModal({ type: null, data: null })}
                    conversation={modal.data.conversa}
                    contactIdentifier={modal.data.contactName}
                />
            )}

            {modal.type === 'edit_contact' && (
                <EditContactModal
                    contact={modal.data}
                    statusOptions={statusOptions}
                    onSave={handleSaveContactEdit}
                    onClose={() => setModal({ type: null, data: null })}
                />
            )}
            
            {modal.type === 'delete_contact' && (
                <DeleteConfirmationModal
                    title="Remover Contato"
                    message={`Tem certeza que deseja remover o contato <strong class="text-gray-700">${modal.data?.nome}</strong> desta campanha?`}
                    onConfirm={() => handleConfirmContactDelete(modal.data.id)}
                    onClose={() => setModal({ type: null, data: null })}
                />
            )}
        </div>
    );
}

export default Prospects;

