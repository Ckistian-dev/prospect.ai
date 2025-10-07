import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { Plus, Play, Pause, Trash2, MoreVertical, Edit, Loader2 } from 'lucide-react';
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
  const [editingProspect, setEditingProspect] = useState(null);
  const logIntervalRef = useRef(null);

  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  const [loadingStates, setLoadingStates] = useState({
    campaigns: true,
    log: false,
  });

  const [actionLoading, setActionLoading] = useState({
    start: false,
    stop: false,
    delete: false,
  });

  const stopLogPolling = useCallback(() => {
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  }, []);

  const fetchLog = useCallback(async (prospectId, isSilent = false) => {
    if (!prospectId) return;

    if (!isSilent) {
      setLoadingStates(prev => ({ ...prev, log: true }));
    }

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
      if (!isSilent) {
        setLoadingStates(prev => ({ ...prev, log: false }));
      }
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
      } else if (prospectsData.length === 0) {
        setSelectedProspect(null);
        setLog({ log: '', status: 'Pendente' });
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
      logIntervalRef.current = setInterval(() => fetchLog(selectedProspect.id, true), 5000);
    }
  }, [selectedProspect, fetchLog, stopLogPolling]);

  useEffect(() => {
    fetchProspects();
  }, []);
  
  useEffect(() => {
    if (selectedProspect) {
      fetchLog(selectedProspect.id, false);
    }
  }, [selectedProspect, fetchLog]);

  useEffect(() => {
    stopLogPolling();
    if (selectedProspect && log.status === 'Em Andamento') {
      startPolling();
    }
    return () => stopLogPolling();
  }, [selectedProspect, log.status, startPolling, stopLogPolling]);
  
  useEffect(() => {
    if (selectedProspect && log.status) {
      setProspects(prevProspects => 
        prevProspects.map(p => 
          p.id === selectedProspect.id ? { ...p, status: log.status } : p
        )
      );
    }
  }, [log.status, selectedProspect]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleStart = async () => {
    if (!selectedProspect) return;
    setActionLoading(prev => ({ ...prev, start: true }));
    try {
      await api.post(`/prospecting/${selectedProspect.id}/start`);
      fetchLog(selectedProspect.id);
    } catch (error) {
      alert(`Erro ao iniciar: ${error.response?.data?.detail || 'Erro desconhecido'}`);
    } finally {
      setActionLoading(prev => ({ ...prev, start: false }));
    }
  };

  const handleStop = async () => {
    if (!selectedProspect) return;
    setActionLoading(prev => ({ ...prev, stop: true }));
    try {
      await api.post(`/prospecting/${selectedProspect.id}/stop`);
      fetchLog(selectedProspect.id);
    } catch (error) {
      alert(`Erro ao parar: ${error.response?.data?.detail || 'Erro desconhecido'}`);
    } finally {
      setActionLoading(prev => ({ ...prev, stop: false }));
    }
  };
  
  const handleDelete = async () => {
    if (!selectedProspect) return;
    const isConfirmed = window.confirm(`Tem certeza que deseja excluir a campanha "${selectedProspect.nome_prospeccao}"? Esta ação não pode ser desfeita.`);
    if (isConfirmed) {
      setActionLoading(prev => ({ ...prev, delete: true }));
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
      } finally {
        setActionLoading(prev => ({ ...prev, delete: false }));
      }
    }
  };

  const handleSelectProspect = (prospect) => {
    if (selectedProspect?.id === prospect.id) return;
    setSelectedProspect(prospect);
  }

  const handleOpenCreateModal = () => {
    setEditingProspect(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (prospect) => {
    if (prospect.status === 'Em Andamento') {
      alert('Pare a campanha antes de editá-la.');
      return;
    }
    setEditingProspect(prospect);
    setIsModalOpen(true);
  };

  const handleSuccess = (updatedOrNewProspect) => {
    if (editingProspect) {
      setProspects(prev => prev.map(p => p.id === updatedOrNewProspect.id ? updatedOrNewProspect : p));
      setSelectedProspect(updatedOrNewProspect);
    } else {
      setProspects(prev => [updatedOrNewProspect, ...prev]);
      setSelectedProspect(updatedOrNewProspect);
    }
    setEditingProspect(null);
    setIsModalOpen(false);
  };

  const isRunning = log.status === 'Em Andamento';
  const isAnyActionLoading = actionLoading.start || actionLoading.stop || actionLoading.delete;

  return (
    <div className="p-4 md:p-8 bg-gray-50 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Prospecção Principal</h1>
          <p className="text-gray-500 mt-1">Crie, gerencie e execute suas campanhas de prospecção.</p>
        </div>
        <button
          onClick={handleOpenCreateModal}
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
                  <li key={p.id} className={`relative rounded-lg flex justify-between items-center group transition-all duration-200 ${selectedProspect?.id === p.id ? 'bg-brand-green text-white font-semibold shadow-sm' : 'hover:bg-gray-100'}`}>
                    <button
                      onClick={() => handleSelectProspect(p)}
                      className="flex-grow text-left p-3 flex items-center"
                    >
                      <span className="truncate pr-2">{p.nome_prospeccao}</span>
                      <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${selectedProspect?.id === p.id ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-700'}`}>
                        {p.status}
                      </span>
                    </button>
                    <div className="relative pr-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === p.id ? null : p.id);
                        }}
                        className={`p-1 rounded-full transition-colors ${selectedProspect?.id === p.id ? 'hover:bg-white/20' : 'hover:bg-gray-200'}`}
                        title="Opções"
                      >
                        <MoreVertical size={20} />
                      </button>
                      
                      {openMenuId === p.id && (
                        <div ref={menuRef} className="absolute right-0 top-full mt-2 z-20 w-48 bg-white rounded-md shadow-lg border animate-in fade-in-5">
                          <ul className="py-1">
                            <li>
                              <button
                                onClick={() => {
                                  handleOpenEditModal(p);
                                  setOpenMenuId(null);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:text-gray-400"
                                disabled={p.status === 'Em Andamento'}
                              >
                                <Edit size={14} /> Editar Campanha
                              </button>
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
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
                  <button onClick={handleStart} disabled={isAnyActionLoading || isRunning || log.status === 'Concluído' || loadingStates.log} className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white font-bold py-3 rounded-lg shadow-md hover:bg-green-600 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                    {actionLoading.start ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                    {actionLoading.start ? 'Iniciando...' : 'Iniciar'}
                  </button>
                  <button onClick={handleStop} disabled={isAnyActionLoading || !isRunning || loadingStates.log} className="flex-1 flex items-center justify-center gap-2 bg-orange-500 text-white font-bold py-3 rounded-lg shadow-md hover:bg-orange-600 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                    {actionLoading.stop ? <Loader2 size={18} className="animate-spin" /> : <Pause size={18} />}
                    {actionLoading.stop ? 'Parando...' : 'Parar'}
                  </button>
                </div>
                <button onClick={handleDelete} disabled={isAnyActionLoading || isRunning || loadingStates.log} className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-semibold py-2 rounded-lg shadow-md hover:bg-red-700 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                  {actionLoading.delete ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16}/>}
                  {actionLoading.delete ? 'Excluindo...' : 'Excluir Campanha'}
                </button>
              </div>
            ) : <p className="text-center text-gray-500">Selecione uma campanha.</p>}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl shadow-lg p-6 flex flex-col border min-h-0">
          {loadingStates.log && !logIntervalRef.current ? (
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
          prospectToEdit={editingProspect}
          onClose={() => {
            setIsModalOpen(false);
            setEditingProspect(null);
          }}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}

export default MainProspecting;