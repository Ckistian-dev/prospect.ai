import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { Plus, Play, Pause, Trash2, MoreVertical, Edit, Loader2, MessageSquare, Clock, AlertTriangle } from 'lucide-react';
import CreateProspectingModal from '../components/prospecting/CreateProspectingModal';
import { ConversationModal, EditContactModal } from './Prospects'; // Reutilizando os modais

// --- Componentes Internos ---
const CampaignSkeleton = () => (
  <li className="p-3 rounded-lg flex justify-between items-center bg-white animate-pulse border border-gray-100">
    <div className="h-5 bg-gray-200 rounded w-3/5"></div>
    <div className="h-5 bg-gray-200 rounded-full w-1/5"></div>
  </li>
);

const ActivityLogTable = ({ logData, onOpenConversation, onOpenEditContact, isLoading }) => {
  const getStatusClass = (status) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full inline-block text-center";
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

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-2 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-200 rounded w-full"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b-2 border-gray-200">
          <tr>
            <th className="p-3 font-semibold text-gray-600">Contato</th>
            <th className="p-3 font-semibold text-gray-600">Situação</th>
            <th className="p-3 font-semibold text-gray-600">Observações</th>
            <th className="p-3 font-semibold text-gray-600 text-center">Ações</th>
          </tr>
        </thead>
        <tbody>
          {logData.map((item, index) => (
            <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="p-3">
                <div className="font-medium text-gray-800">{item.contact_name}</div>
                <div className="text-gray-500 flex items-center gap-1"><Clock size={12} /> {formatTime(item.updated_at)}</div>
              </td>
              <td className="p-3"><span className={getStatusClass(item.situacao)}>{item.situacao}</span></td>
              <td className="p-3 text-gray-600 max-w-xs truncate" title={item.observacoes}>{item.observacoes || '-'}</td>
              <td className="p-3 text-center">
                <div className="flex justify-center items-center gap-1">
                  <button onClick={() => onOpenConversation(item)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-full transition-colors" title="Ver conversa">
                    <MessageSquare size={16} />
                  </button>
                  <button onClick={() => onOpenEditContact(item)} className="p-2 text-gray-500 hover:text-green-600 hover:bg-gray-100 rounded-full transition-colors" title="Editar Contato"><Edit size={16} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// --- Componente Principal ---
function MainProspecting() {
  const [prospects, setProspects] = useState([]);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [currentStatus, setCurrentStatus] = useState('Pendente');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState(null);
  const logIntervalRef = useRef(null);

  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  // Estado unificado para modais
  const [modal, setModal] = useState({ type: null, data: null });
  const statusOptions = ["Aguardando Início", "Aguardando Resposta", "Resposta Recebida", "Lead Qualificado", "Não Interessado", "Concluído", "Sem Whatsapp", "Falha no Envio", "Erro IA"];

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

  const fetchActivityLog = useCallback(async (prospectId, isSilent = false) => {
    if (!prospectId) return;

    if (!isSilent) {
      setLoadingStates(prev => ({ ...prev, log: true }));
    }
    try {
      const response = await api.get(`/prospecting/${prospectId}/activity-log`);
      setActivityLog(response.data);
      // O status da campanha será atualizado ao buscar a lista de prospecções
      // ou ao selecionar uma nova campanha.
    } catch (error) {
      console.error("Erro ao buscar log:", error);
      stopLogPolling();
    } finally {
      if (!isSilent) {
        setLoadingStates(prev => ({ ...prev, log: false }));
      }
    }
  }, [stopLogPolling]);
  
  const fetchProspects = useCallback(async (keepSelection = false) => {
    setLoadingStates(prev => ({ ...prev, campaigns: true }));
    try {
      const response = await api.get('/prospecting/');
      const prospectsData = response.data;
      setProspects(prospectsData);
      
      if (!selectedProspect && prospectsData.length > 0) {
        setSelectedProspect(prospectsData[0]); // Seleciona o primeiro por padrão
      } else if (prospectsData.length === 0) {
        setSelectedProspect(null);
        setActivityLog([]);
        setCurrentStatus('Pendente');
      }
    } catch (error) {
      console.error("Erro ao buscar prospecções:", error);
    } finally {
      setLoadingStates(prev => ({ ...prev, campaigns: false }));
    }
  }, [selectedProspect]); // A dependência do selectedProspect é intencional para o caso de recarregar a lista

  const startPolling = useCallback(() => {
    stopLogPolling();
    if (selectedProspect) {
      logIntervalRef.current = setInterval(() => fetchActivityLog(selectedProspect.id, true), 5000);
    }
  }, [selectedProspect, fetchActivityLog, stopLogPolling]);

  useEffect(() => {
    fetchProspects();
  }, []);
  
  useEffect(() => {
    if (selectedProspect) {
      fetchActivityLog(selectedProspect.id, false);
      setCurrentStatus(selectedProspect.status); // Garante que o status atual seja o da campanha selecionada
    }
  }, [selectedProspect, fetchActivityLog]);

  useEffect(() => {
    stopLogPolling();
    if (selectedProspect && currentStatus === 'Em Andamento') {
      startPolling();
    }
    return () => stopLogPolling();
  }, [selectedProspect, currentStatus, startPolling, stopLogPolling]);
  
  /*useEffect(() => {
    if (selectedProspect && log.status) {
      setProspects(prevProspects => 
        prevProspects.map(p => 
          p.id === selectedProspect.id ? { ...p, status: log.status } : p
        )
      );
    }
  }, [log.status, selectedProspect]);*/

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
      setCurrentStatus('Em Andamento');
      fetchProspects(true); // Atualiza a lista de campanhas para refletir o novo status
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
      setCurrentStatus('Parado');
      fetchProspects(true); // Atualiza a lista de campanhas para refletir o novo status
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
          setActivityLog([]);
          setCurrentStatus('Pendente');
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
    setCurrentStatus(prospect.status);
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
      setProspects(prev => prev.map(p => p.id === updatedOrNewProspect.id ? { ...p, ...updatedOrNewProspect } : p));
      setSelectedProspect(updatedOrNewProspect);
    } else {
      setProspects(prev => [updatedOrNewProspect, ...prev]);
      setSelectedProspect(updatedOrNewProspect);
    }
    setEditingProspect(null);
    setIsModalOpen(false);
  };

  const handleOpenEditContact = (logItem) => {
    // CORREÇÃO: O modal de edição precisa do ID da relação (prospect_contact_id) para a API.
    // O modal usa a propriedade 'id' para fazer a chamada.
    const contactDataForModal = { ...logItem, id: logItem.prospect_contact_id };
    setModal({ type: 'edit_contact', data: contactDataForModal });
  };

  const handleSaveContactEdit = async (contactId, updates) => {
    try {
      await api.put(`/prospecting/contacts/${contactId}`, updates);
      setModal({ type: null, data: null });
      fetchActivityLog(selectedProspect.id, true); // Atualiza o log silenciosamente
    } catch (err) {
      alert('Erro ao salvar as alterações do contato.');
    }
  };

  const isRunning = currentStatus === 'Em Andamento';
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
                  <button onClick={handleStart} disabled={isAnyActionLoading || isRunning || currentStatus === 'Concluído' || loadingStates.log} className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white font-bold py-3 rounded-lg shadow-md hover:bg-green-600 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
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
          <h2 className="text-xl font-bold text-gray-800 mb-4">Log de Atividades Recentes</h2>
          {selectedProspect ? (
            <ActivityLogTable 
              logData={activityLog} 
              isLoading={loadingStates.log && !logIntervalRef.current}
              onOpenConversation={(item) => setModal({ type: 'conversation', data: { conversa: item.conversa, contactName: item.contact_name }})}
              onOpenEditContact={handleOpenEditContact}
            />
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
    </div>
  );
}

export default MainProspecting;