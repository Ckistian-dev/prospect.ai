import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Loader2, Table as TableIcon, MessageSquare } from 'lucide-react';
import api from '../api/axiosConfig';

// --- COMPONENTE MODAL BASE ---
const Modal = ({ onClose, children }) => {
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 transform transition-all"
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
};

// --- COMPONENTE MESSAGEBUBBLE ---
const MessageBubble = ({ message }) => {
    const isMe = message.sender === 'me';
    return (
        <div className={`flex items-end gap-2 w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-xs md:max-w-md p-3 rounded-2xl shadow-sm break-words ${
                    isMe
                        ? 'bg-[#005c4b] text-white rounded-br-none'
                        : 'bg-white text-gray-800 rounded-bl-none'
                }`}
            >
                <p className="whitespace-pre-wrap text-sm">{message.text}</p>
            </div>
        </div>
    );
};


// --- COMPONENTE CONVERSATIONMODAL ---
const ConversationModal = ({ onClose, conversation }) => {
    const chatContainerRef = useRef(null);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [conversation]);

    const formattedMessages = Array.isArray(conversation.messages)
        ? conversation.messages.map(msg => ({
            sender: msg.role === 'assistant' ? 'me' : 'contact',
            text: msg.content
        }))
        : [];

    return (
        <Modal onClose={onClose}>
            <div className="flex flex-col h-[80vh] max-h-[80vh]">
                <div className="p-4 border-b bg-gray-50 rounded-t-lg">
                    <h2 className="text-lg font-semibold text-gray-800">Conversa com {conversation.name}</h2>
                </div>
                <div
                    ref={chatContainerRef}
                    className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 bg-[#E5DDD5] bg-[url('https://i.redd.it/qwd83nc4xxf41.jpg')]"
                >
                    {formattedMessages.map((msg, index) => (
                        <MessageBubble key={index} message={msg} />
                    ))}
                    {formattedMessages.length === 0 && (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-center text-gray-500 bg-white/50 backdrop-blur-sm p-3 rounded-lg italic">
                                Nenhum histórico de conversa encontrado.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

function Prospects() {
    const [prospectsList, setProspectsList] = useState([]);
    const [selectedProspectId, setSelectedProspectId] = useState('');
    const [tableHeaders, setTableHeaders] = useState([]);
    const [tableRows, setTableRows] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDataLoading, setIsDataLoading] = useState(false);
    const [error, setError] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedConversation, setSelectedConversation] = useState({ name: '', messages: [] });

    const handleOpenModal = (contactName, conversationData) => {
        let messages = [];
        if (typeof conversationData === 'string') {
            try {
                const parsedData = JSON.parse(conversationData);
                if (Array.isArray(parsedData)) {
                    messages = parsedData;
                }
            } catch (e) {
                console.error("Erro ao processar o histórico da conversa:", e);
                messages = [{ role: 'assistant', content: 'Não foi possível carregar o histórico desta conversa.' }];
            }
        } else if (Array.isArray(conversationData)) {
            messages = conversationData;
        }

        setSelectedConversation({ name: contactName, messages });
        setIsModalOpen(true);
    };


    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    useEffect(() => {
        const fetchProspectsList = async () => {
            setIsLoading(true);
            try {
                const response = await api.get('/prospecting/');
                setProspectsList(response.data);
                if (response.data.length > 0) {
                    setSelectedProspectId(response.data[0].id);
                }
            } catch (err) {
                setError('Não foi possível carregar a lista de campanhas.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchProspectsList();
    }, []);

    useEffect(() => {
        if (!selectedProspectId) return;

        const fetchSheetData = async () => {
            setIsDataLoading(true);
            setError('');
            try {
                const response = await api.get(`/prospecting/sheet/${selectedProspectId}`);
                setTableHeaders(response.data.headers || []);
                setTableRows(response.data.data || []);
            } catch (err) {
                const prospectName = prospectsList.find(p => p.id === parseInt(selectedProspectId))?.nome_prospeccao || '';
                setError(`Não foi possível carregar os dados de "${prospectName}".`);
            } finally {
                setIsDataLoading(false);
            }
        };

        fetchSheetData();
    }, [selectedProspectId, prospectsList]);

    const filteredHeaders = tableHeaders.filter(h => h && h.toLowerCase() !== 'conversa');

    return (
        <div className="p-6 md:p-10 bg-gray-50 min-h-screen">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Resultados da Prospecção</h1>
                <p className="text-gray-500 mt-1">Selecione e visualize os dados de uma campanha.</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                <div className="mb-6">
                    <label htmlFor="prospect-select" className="block text-sm font-medium text-gray-700 mb-2">
                        Selecione a Campanha:
                    </label>
                    <div className="relative">
                        <select
                            id="prospect-select"
                            value={selectedProspectId}
                            onChange={(e) => setSelectedProspectId(e.target.value)}
                            disabled={isLoading || prospectsList.length === 0}
                            className="w-full appearance-none bg-white border border-gray-300 rounded-lg py-2 px-4 pr-10 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                            {isLoading && <option>Carregando...</option>}
                            {!isLoading && prospectsList.length === 0 && <option>Nenhuma campanha encontrada</option>}
                            {prospectsList.map(prospect => (
                                <option key={prospect.id} value={prospect.id}>
                                    {prospect.nome_prospeccao}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                            <ChevronDown size={20} />
                        </div>
                    </div>
                </div>

                {isDataLoading ? (
                    <div className="text-center py-10"><Loader2 size={32} className="animate-spin text-green-600 mx-auto" /></div>
                ) : error ? (
                    <div className="text-center py-10 text-red-500">{error}</div>
                ) : tableRows.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b-2 border-gray-200">
                                <tr>
                                    {filteredHeaders.map(header => <th key={header} className="p-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">{header}</th>)}
                                    <th className="p-4 text-sm font-semibold text-gray-600 uppercase tracking-wider text-center">Conversa</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((row, index) => (
                                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                        {filteredHeaders.map(header => <td key={header} className="p-4 text-gray-700">{row[header]}</td>)}
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={() => handleOpenModal(row.nome, row.conversa)}
                                                className="p-2 text-gray-500 hover:text-green-600 hover:bg-gray-100 rounded-full transition-colors"
                                                title="Ver conversa"
                                            >
                                                <MessageSquare size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-center py-10 text-gray-500">
                        <TableIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum dado encontrado</h3>
                        <p className="mt-1 text-sm text-gray-500">Esta campanha ainda não possui contatos ou dados para exibir.</p>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <ConversationModal
                    onClose={handleCloseModal}
                    conversation={selectedConversation}
                />
            )}
        </div>
    );
}

export default Prospects;


