import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
// Adicionados ícones para a nova funcionalidade e melhorias visuais
import { Plus, Play, Pause, Trash2 } from 'lucide-react';
import CreateProspectingModal from '../components/prospecting/CreateProspectingModal';
import LogDisplay from '../components/prospecting/LogDisplay';

function MainProspecting() {
  const [prospects, setProspects] = useState([]);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [log, setLog] = useState({ log: '', status: 'Pendente' });
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const logIntervalRef = useRef(null);

  const stopLogPolling = useCallback(() => {
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  }, []);

  const fetchLog = useCallback(async (prospectId) => {
    if (!prospectId) return;
    try {
      const response = await api.get(`/prospecting/${prospectId}/log`);
      setLog(response.data);
    } catch (error) {
      console.error("Erro ao buscar log:", error);
      if (error.response?.status === 404) {
        stopLogPolling();
      }
    }
  }, [stopLogPolling]);
  
  const fetchProspects = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/prospecting/');
      const prospectsData = response.data;
      setProspects(prospectsData);
      
      // Define a primeira prospecção como selecionada se nenhuma estiver
      if (!selectedProspect && prospectsData.length > 0) {
        setSelectedProspect(prospectsData[0]);
        fetchLog(prospectsData[0].id);
      }
    } catch (error) {
      console.error("Erro ao buscar prospecções:", error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProspect, fetchLog]);

  const startPolling = useCallback(() => {
    stopLogPolling();
    if (selectedProspect) {
      logIntervalRef.current = setInterval(() => fetchLog(selectedProspect.id), 5000);
    }
  }, [selectedProspect, fetchLog, stopLogPolling]);

  useEffect(() => {
    fetchProspects();
    // A intenção é rodar apenas na montagem inicial do componente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    stopLogPolling();
    if (selectedProspect && log.status === 'Em Andamento') {
      startPolling();
    }
    return () => stopLogPolling();
  }, [selectedProspect, log.status, startPolling, stopLogPolling]);

  const handleStart = async () => {
    if (!selectedProspect) return;
    try {
      await api.post(`/prospecting/${selectedProspect.id}/start`);
      fetchLog(selectedProspect.id); // Atualiza o log imediatamente
    } catch (error) {
      alert(`Erro ao iniciar: ${error.response?.data?.detail || 'Erro desconhecido'}`);
    }
  };

  const handleStop = async () => {
    if (!selectedProspect) return;
    try {
      await api.post(`/prospecting/${selectedProspect.id}/stop`);
      fetchLog(selectedProspect.id); // Busca o log para refletir o status 'Parado'
    } catch (error) {
      alert(`Erro ao parar: ${error.response?.data?.detail || 'Erro desconhecido'}`);
    }
  };
  
  // --- FUNÇÃO DE EXCLUSÃO INTEGRADA ---
  const handleDelete = async () => {
    if (!selectedProspect) return;

    const isConfirmed = window.confirm(
      `Tem certeza que deseja excluir a campanha "${selectedProspect.nome_prospeccao}"? Esta ação não pode ser desfeita.`
    );

    if (isConfirmed) {
      try {
        await api.delete(`/prospecting/${selectedProspect.id}`);
        
        // Atualiza a lista de prospecções no estado para remover a excluída
        const updatedProspects = prospects.filter(p => p.id !== selectedProspect.id);
        setProspects(updatedProspects);
        
        // Seleciona a primeira campanha da lista atualizada ou limpa a seleção se a lista ficar vazia
        const newSelected = updatedProspects.length > 0 ? updatedProspects[0] : null;
        setSelectedProspect(newSelected);
        
        if(newSelected) {
          fetchLog(newSelected.id);
        } else {
          setLog({ log: '', status: 'Pendente' }); // Limpa o log se não houver mais campanhas
        }

      } catch (error) {
        alert(`Erro ao excluir: ${error.response?.data?.detail || 'Erro desconhecido'}`);
      }
    }
  };

  const handleSelectProspect = (prospect) => {
    setSelectedProspect(prospect);
    fetchLog(prospect.id);
  }

  const isRunning = log.status === 'Em Andamento';

  return (
    <div className="p-4 md:p-8 bg-gray-50 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Prospecção Principal</h1>
          <p className="text-gray-500 mt-1">Crie, gerencie e execute suas campanhas de prospecção.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="mt-4 md:mt-0 flex items-center gap-2 bg-brand-green text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-brand-green-dark transition-all duration-300"
        >
          <Plus size={20} />
          Nova Prospecção
        </button>
      </div>

      {/* --- MELHORIA DE RESPONSIVIDADE NO GRID --- */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
        
        {/* Coluna Esquerda: Lista e Controles */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border flex flex-col">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Campanhas</h2>
          <div className="flex-grow overflow-y-auto pr-2">
            <ul className="space-y-2">
              {isLoading ? <p className="text-center text-gray-500">Carregando...</p> : 
               prospects.length > 0 ? prospects.map(p => (
                <li key={p.id}>
                  <button
                    onClick={() => handleSelectProspect(p)}
                    className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-all duration-200 ${selectedProspect?.id === p.id ? 'bg-brand-green text-white font-semibold shadow-sm' : 'hover:bg-gray-100 hover:pl-4'}`}
                  >
                    <span className="truncate pr-2">{p.nome_prospeccao}</span>
                    <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${selectedProspect?.id === p.id ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-700'}`}>
                      {selectedProspect?.id === p.id ? log.status : p.status}
                    </span>
                  </button>
                </li>
              )) : <p className="text-center text-gray-500 pt-8">Nenhuma campanha criada ainda.</p>
            }
            </ul>
          </div>
          <div className="mt-auto pt-6 border-t">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Controles da Campanha</h3>
            {selectedProspect ? (
              <div className="space-y-3">
                <div className="flex gap-4">
                  <button onClick={handleStart} disabled={isRunning || log.status === 'Concluído'} className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white font-bold py-3 rounded-lg shadow-md hover:bg-green-600 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                    <Play size={18} /> Iniciar
                  </button>
                  <button onClick={handleStop} disabled={!isRunning} className="flex-1 flex items-center justify-center gap-2 bg-orange-500 text-white font-bold py-3 rounded-lg shadow-md hover:bg-orange-600 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                    <Pause size={18} /> Parar
                  </button>
                </div>
                <button onClick={handleDelete} disabled={isRunning} className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-semibold py-2 rounded-lg shadow-md hover:bg-red-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                  <Trash2 size={16}/> Excluir Campanha
                </button>
              </div>
            ) : <p className="text-center text-gray-500">Selecione uma campanha.</p>}
          </div>
        </div>

        {/* Coluna Direita: Log */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-lg p-6 flex flex-col border min-h-0">
          <LogDisplay logText={log.log} />
        </div>
      </div>
      
      {isModalOpen && (
        <CreateProspectingModal 
          onClose={() => setIsModalOpen(false)}
          onSuccess={(newProspect) => {
            setIsModalOpen(false);
            // Melhora a UX adicionando a nova campanha e selecionando-a imediatamente
            setProspects(prev => [newProspect, ...prev]);
            setSelectedProspect(newProspect);
            fetchLog(newProspect.id);
          }}
        />
      )}
    </div>
  );
}

export default MainProspecting;