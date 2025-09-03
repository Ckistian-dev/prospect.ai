import React, { useState, useEffect } from 'react';
import api from '../api/axiosConfig';
import { ChevronDown, Loader2, Table as TableIcon, MessageSquare } from 'lucide-react';
import ConversationModal from '../components/prospecting/ConversationModal';

function Prospects() {
  // 1. O estado agora armazena os objetos completos, não apenas os nomes
  const [prospectsList, setProspectsList] = useState([]); 
  // 2. O estado agora guarda o ID da prospecção selecionada
  const [selectedProspectId, setSelectedProspectId] = useState(''); 
  
  const [tableHeaders, setTableHeaders] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [error, setError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState({ name: '', text: '' });

  const handleOpenModal = (contactName, conversationText) => {
    setSelectedConversation({ name: contactName, text: conversationText });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // Busca a lista de campanhas
  useEffect(() => {
    const fetchProspectsList = async () => {
      setIsLoading(true);
      try {
        const response = await api.get('/prospecting/');
        setProspectsList(response.data); // Armazena os objetos completos
        // Se houver campanhas, seleciona o ID da primeira por padrão
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

  // Busca os dados da campanha selecionada sempre que o ID mudar
  useEffect(() => {
    if (!selectedProspectId) return; // Não faz nada se nenhum ID estiver selecionado

    const fetchSheetData = async () => {
      setIsDataLoading(true);
      setError('');
      try {
        // 4. A chamada da API agora usa o ID, como esperado pelo backend
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
  }, [selectedProspectId, prospectsList]); // Depende do ID selecionado

  const filteredHeaders = tableHeaders.filter(h => h && h.toLowerCase() !== 'conversa');

  return (
    <div className="p-6 md:p-10 bg-gray-50 min-h-full">
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
              className="w-full appearance-none bg-white border border-gray-300 rounded-lg py-2 px-4 pr-10 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-brand-green"
            >
              {isLoading && <option>Carregando...</option>}
              {!isLoading && prospectsList.length === 0 && <option>Nenhuma campanha encontrada</option>}
              {/* 3. O <select> agora usa o ID como valor, mas mostra o nome para o usuário */}
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
          <div className="text-center py-10"><Loader2 size={32} className="animate-spin text-brand-green mx-auto" /></div>
        ) : error ? (
          <div className="text-center py-10 text-red-500">{error}</div>
        ) : tableRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b-2 border-gray-200">
                <tr>
                  {filteredHeaders.map(header => <th key={header} className="p-4 text-sm font-semibold text-gray-600 uppercase">{header}</th>)}
                  <th className="p-4 text-sm font-semibold text-gray-600 uppercase text-center">Conversa</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    {filteredHeaders.map(header => <td key={header} className="p-4 text-gray-700 whitespace-pre-wrap">{row[header]}</td>)}
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => handleOpenModal(row.nome, row.conversa)}
                        className="p-2 text-gray-500 hover:text-brand-green hover:bg-gray-100 rounded-full transition-colors"
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
