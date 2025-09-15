import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { Plus, Play, Pause, Trash2 } from 'lucide-react';
import CreateProspectingModal from '../components/prospecting/CreateProspectingModal';
import LogDisplay from '../components/prospecting/LogDisplay';

// --- Componentes de Skeleton Internos ---
const CampaignSkeleton = () => (
  <li className="p-3 rounded-lg flex justify-between items-center bg-white animate-pulse border border-gray-100">
    <div className="h-5 bg-gray-200 rounded w-3/5"></div>
    <div className="h-5 bg-gray-200 rounded-full w-1/5"></div>
  </li>
);

const LogSkeleton = () => (
  <div className="space-y-3 p-2 animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-11/12"></div>
    <div className="h-4 bg-gray-200 rounded w-full"></div>
    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
    <div className="h-4 bg-gray-200 rounded w-full"></div>
    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
  </div>
);


// --- Componente Principal ---
function MainProspecting() {
  const [prospects, setProspects] = useState([]);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [log, setLog] = useState({ log: '', status: 'Pendente' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const logIntervalRef = useRef(null);

  const [loadingStates, setLoadingStates] = useState({
    campaigns: true,
    log: false,
  });

  // A função setProspects será usada no novo useEffect, então a adicionamos ao useCallback
  // para manter a estabilidade da referência da função.
  const stopLogPolling = useCallback(() => {
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  }, []);

  const fetchLog = useCallback(async (prospectId) => {
    if (!prospectId) return;
    setLoadingStates(prev => ({ ...prev, log: true }));
    try {
      const response = await api.get(`/prospecting/${prospectId}/log`);
      setLog(response.data);
    } catch (error) {
      console.error("Erro ao buscar log:", error);
      if (error.response?.status === 404) {
        stopLogPolling();
        setLog({ log: 'Log não encontrado para esta campanha.', status: 'Erro' });
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, log: false }));
    }
  }, [stopLogPolling]);
  
  const fetchProspects = useCallback(async () => {
    setLoadingStates(prev => ({ ...prev, campaigns: true }));
    try {
      const response = await api.get('/prospecting/');
      const prospectsData = response.data;
      setProspects(prospectsData);
      
      if (!selectedProspect && prospectsData.length > 0) {
        setSelectedProspect(prospectsData[0]);
      }
    } catch (error) {
      console.error("Erro ao buscar prospecções:", error);
    } finally {
      setLoadingStates(prev => ({ ...prev, campaigns: false }));
    }
  }, [selectedProspect]);

  const startPolling = useCallback(() => {
    stopLogPolling();
    if (selectedProspect) {
      logIntervalRef.current = setInterval(() => fetchLog(selectedProspect.id), 5000);
    }
  }, [selectedProspect, fetchLog, stopLogPolling]);

  useEffect(() => {
    fetchProspects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedProspect) {
      fetchLog(selectedProspect.id);
    }
  }, [selectedProspect, fetchLog]);

  useEffect(() => {
    stopLogPolling();
    if (selectedProspect && log.status === 'Em Andamento') {
      startPolling();
    }
    return () => stopLogPolling();
  }, [selectedProspect, log.status, startPolling, stopLogPolling]);
  
  // ==================================================================
  // ✨ MUDANÇA PRINCIPAL: EFEITO PARA SINCRONIZAR O STATUS DA LISTA ✨
  // Este efeito garante que a lista `prospects` sempre reflita o status 
  // mais recente que obtemos do `log` da campanha selecionada.
  // ==================================================================
  useEffect(() => {
    if (selectedProspect && log.status) {
      // Cria uma nova lista mapeando sobre a anterior
      const updatedProspects = prospects.map(p => {
        // Se o ID da campanha na lista for o mesmo da campanha selecionada...
        if (p.id === selectedProspect.id) {
          // ...retorna um novo objeto para essa campanha com o status atualizado do log.
          return { ...p, status: log.status };
        }
        // Caso contrário, retorna a campanha como estava.
        return p;
      });
      // Atualiza o estado da lista de campanhas.
      setProspects(updatedProspects);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log.status, selectedProspect]); // Roda sempre que o status do log ou a seleção mudar


  const handleStart = async () => {
    if (!selectedProspect) return;
    try {
      await api.post(`/prospecting/${selectedProspect.id}/start`);
      fetchLog(selectedProspect.id);
    } catch (error) {
      alert(`Erro ao iniciar: ${error.response?.data?.detail || 'Erro desconhecido'}`);
    }
  };

  const handleStop = async () => {
    if (!selectedProspect) return;
    try {
      await api.post(`/prospecting/${selectedProspect.id}/stop`);
      fetchLog(selectedProspect.id);
    } catch (error) {
      alert(`Erro ao parar: ${error.response?.data?.detail || 'Erro desconhecido'}`);
    }
  };
  
  const handleDelete = async () => {
    if (!selectedProspect) return;
    const isConfirmed = window.confirm(`Tem certeza que deseja excluir a campanha "${selectedProspect.nome_prospeccao}"?`);
    if (isConfirmed) {
      try {
        await api.delete(`/prospecting/${selectedProspect.id}`);
        const updatedProspects = prospects.filter(p => p.id !== selectedProspect.id);
        setProspects(updatedProspects);
        const newSelected = updatedProspects.length > 0 ? updatedProspects[0] : null;
        
        setSelectedProspect(newSelected);
        
        if(!newSelected) {
          setLog({ log: '', status: 'Pendente' });
        }
      } catch (error) {
        alert(`Erro ao excluir: ${error.response?.data?.detail || 'Erro desconhecido'}`);
      }
    }
  };

  const handleSelectProspect = (prospect) => {
    if (selectedProspect?.id === prospect.id) return;
    setSelectedProspect(prospect);
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 flex-1 min-h-0">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border flex flex-col">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Campanhas</h2>
          <div className="flex-grow overflow-y-auto pr-2">
            <ul className="space-y-2">
              {loadingStates.campaigns ? (
                Array.from({ length: 5 }).map((_, index) => <CampaignSkeleton key={index} />)
              ) : prospects.length > 0 ? (
                prospects.map(p => (
                  <li key={p.id}>
                    <button
                      onClick={() => handleSelectProspect(p)}
                      className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-all duration-200 ${selectedProspect?.id === p.id ? 'bg-brand-green text-white font-semibold shadow-sm' : 'hover:bg-gray-100 hover:pl-4'}`}
                    >
                      <span className="truncate pr-2">{p.nome_prospeccao}</span>
                      {/* ✨ LÓGICA SIMPLIFICADA ✨ 
                        Agora que a lista `prospects` está sempre sincronizada, 
                        podemos simplesmente exibir `p.status` para todas as campanhas. 
                        Não precisamos mais da verificação ternária.
                      */}
                      <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${selectedProspect?.id === p.id ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-700'}`}>
                        {p.status}
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <p className="text-center text-gray-500 pt-8">Nenhuma campanha criada ainda.</p>
              )}
            </ul>
          </div>
          <div className="mt-auto pt-6 border-t">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Controles da Campanha</h3>
            {selectedProspect ? (
              <div className="space-y-3">
                <div className="flex gap-4">
                  <button onClick={handleStart} disabled={isRunning || log.status === 'Concluído' || loadingStates.log} className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white font-bold py-3 rounded-lg shadow-md hover:bg-green-600 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                    <Play size={18} /> Iniciar
                  </button>
                  <button onClick={handleStop} disabled={!isRunning || loadingStates.log} className="flex-1 flex items-center justify-center gap-2 bg-orange-500 text-white font-bold py-3 rounded-lg shadow-md hover:bg-orange-600 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                    <Pause size={18} /> Parar
                  </button>
                </div>
                <button onClick={handleDelete} disabled={isRunning || loadingStates.log} className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-semibold py-2 rounded-lg shadow-md hover:bg-red-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                  <Trash2 size={16}/> Excluir Campanha
                </button>
              </div>
            ) : <p className="text-center text-gray-500">Selecione uma campanha.</p>}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl shadow-lg p-6 flex flex-col border min-h-0">
          {loadingStates.log ? (
            <LogSkeleton />
          ) : selectedProspect ? (
            <LogDisplay logText={log.log} />
          ) : (
            <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">Selecione uma campanha para ver o log.</p>
            </div>
          )}
        </div>
      </div>
      
      {isModalOpen && (
        <CreateProspectingModal 
          onClose={() => setIsModalOpen(false)}
          onSuccess={(newProspect) => {
            setIsModalOpen(false);
            // Ao criar uma nova campanha, a adicionamos no topo da lista.
            setProspects(prev => [newProspect, ...prev]);
            // E a selecionamos imediatamente.
            setSelectedProspect(newProspect);
          }}
        />
      )}
    </div>
  );
}

export default MainProspecting;