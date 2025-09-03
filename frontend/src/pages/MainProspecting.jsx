import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { Plus, Rocket, Square, Play, Pause } from 'lucide-react';
import CreateProspectingModal from '../components/prospecting/CreateProspectingModal';
import LogDisplay from '../components/prospecting/LogDisplay';

function MainProspecting() {
  const [prospects, setProspects] = useState([]);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [log, setLog] = useState({ log: '', status: 'Pendente' });
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const logIntervalRef = useRef(null);

  const fetchProspects = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/prospecting/');
      setProspects(response.data);
      if (!selectedProspect && response.data.length > 0) {
        setSelectedProspect(response.data[0]);
      }
    } catch (error) {
      console.error("Erro ao buscar prospecções:", error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedProspect]);

  const fetchLog = useCallback(async () => {
    if (!selectedProspect) return;
    try {
      const response = await api.get(`/prospecting/${selectedProspect.id}/log`);
      setLog(response.data);
    } catch (error) {
      console.error("Erro ao buscar log:", error);
      if (error.response?.status === 404) {
        stopLogPolling();
      }
    }
  }, [selectedProspect]);

  // A função startPolling precisa ser definida para que o handleStart possa usá-la
  const startPolling = useCallback(() => {
      stopLogPolling();
      if (selectedProspect) {
          logIntervalRef.current = setInterval(fetchLog, 5000);
      }
  }, [selectedProspect, fetchLog]);

  const stopLogPolling = () => {
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  };

  useEffect(() => {
    fetchProspects();
  }, []);

  useEffect(() => {
    stopLogPolling();
    if (selectedProspect) {
      fetchLog();
      // O status para iniciar o polling vem do objeto 'log', não do 'selectedProspect'
      if (['Em Andamento', 'Pendente'].includes(log.status)) {
        startPolling();
      }
    }
    return () => stopLogPolling();
  }, [selectedProspect, fetchLog, startPolling, log.status]);


  const handleStart = async () => {
    if (!selectedProspect) return;
    try {
      await api.post(`/prospecting/${selectedProspect.id}/start`);
      fetchLog(); // Atualiza o log imediatamente
      startPolling(); // Garante que o polling comece
    } catch (error) {
      alert(`Erro ao iniciar: ${error.response?.data?.detail || 'Erro desconhecido'}`);
    }
  };

  const handleStop = async () => {
    if (!selectedProspect) return;
    try {
      await api.post(`/prospecting/${selectedProspect.id}/stop`);
      // Não precisa fazer mais nada, o polling vai pegar a mudança de status
    } catch (error) {
      alert(`Erro ao parar: ${error.response?.data?.detail || 'Erro desconhecido'}`);
    }
  };

  const isRunning = log.status === 'Em Andamento';

  return (
    <div className="p-6 md:p-10 bg-gray-50 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Prospecção Principal</h1>
          <p className="text-gray-500 mt-1">Crie, gerencie e execute suas campanhas de prospecção.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-brand-green text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-brand-green-dark transition-all duration-300"
        >
          <Plus size={20} />
          Nova Prospecção
        </button>
      </div>

      {/* A classe 'min-h-0' aqui permite que o grid encolha */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
        {/* Coluna Esquerda: Lista e Controles */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-md border border-gray-200 flex flex-col">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Campanhas</h2>
          <ul className="space-y-2 mb-6 overflow-y-auto">
            {isLoading ? <p>Carregando...</p> : prospects.map(p => (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedProspect(p)}
                  className={`w-full text-left p-3 rounded-md flex justify-between items-center transition-colors ${selectedProspect?.id === p.id ? 'bg-brand-green-light/20 text-brand-green-dark font-semibold' : 'hover:bg-gray-100'}`}
                >
                  <span>{p.nome_prospeccao}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${selectedProspect?.id === p.id && log.status === 'Concluído' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>{selectedProspect?.id === p.id ? log.status : p.status}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6 border-t">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Controles da Campanha</h3>
            {selectedProspect ? (
              <div className="flex gap-4">
                <button onClick={handleStart} disabled={isRunning} className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white font-bold py-3 rounded-lg shadow-md hover:bg-green-600 transition-all disabled:bg-gray-400">
                  <Play size={18} /> Iniciar
                </button>
                <button onClick={handleStop} disabled={!isRunning} className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white font-bold py-3 rounded-lg shadow-md hover:bg-red-600 transition-all disabled:bg-gray-400">
                  <Pause size={18} /> Parar
                </button>
              </div>
            ) : <p className="text-center text-gray-500">Selecione uma campanha para iniciar.</p>}
          </div>
        </div>

        {/* Coluna Direita: Log */}
        {/* A classe 'min-h-0' aqui também é crucial */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-md p-6 flex flex-col border border-gray-200 min-h-0">
          <LogDisplay logText={log.log} />
        </div>
      </div>
      
      {isModalOpen && (
        <CreateProspectingModal 
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchProspects();
          }}
        />
      )}
    </div>
  );
}

export default MainProspecting;

