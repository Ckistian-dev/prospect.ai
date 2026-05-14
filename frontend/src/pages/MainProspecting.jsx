import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { 
    Plus, Play, Pause, Trash2, Edit, Loader2, MessageSquare, Clock, 
    AlertTriangle, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
    Zap, Activity, Target, Shield, ArrowRight, Settings, Filter, MoreVertical, Layout, Database, CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import CreateProspectingModal from '../components/prospecting/CreateProspectingModal';
import { ConversationModal, EditContactModal, DeleteConfirmationModal } from './Prospects';
import PageLoader from '../components/common/PageLoader';

// ─── DESIGN SYSTEM ──────────────────────────────────────────────────────────
const DS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
.main-prospecting-page { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
.main-prospecting-page h1, .main-prospecting-page h2, .main-prospecting-page h3, .main-prospecting-page h4 { font-family: 'Plus Jakarta Sans', sans-serif; }
.ds-surface { background: #ffffff; border-radius: 2rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
.ds-card { background: #ffffff; border-radius: 1.5rem; border: 1px solid rgba(0,0,0,0.05); padding: 1.5rem; transition: all 0.3s ease; }
.sidebar-item { border-radius: 1.25rem; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid transparent; }
.sidebar-item.active { background: #356854; color: white; border-color: #356854; box-shadow: 0 15px 30px rgba(53, 104, 84, 0.2); }
.sidebar-item:not(.active):hover { background: #f1f5f9; border-color: #e2e8f0; }
.status-pill { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
.campaign-btn {
    height: 4rem;
    border-radius: 1.25rem;
    font-weight: 800;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
}
`;

const CampaignSkeleton = () => (
  <div className="p-6 rounded-2xl flex items-center gap-4 bg-white animate-pulse border border-slate-100">
    <div className="w-12 h-12 bg-slate-100 rounded-xl"></div>
    <div className="flex-1 space-y-3">
        <div className="h-4 bg-slate-100 rounded w-3/4"></div>
        <div className="h-2 bg-slate-100 rounded w-1/4"></div>
    </div>
  </div>
);

const StatusBadge = ({ status, active }) => {
    const configs = {
        'Em Andamento': active ? 'bg-white/20 text-white border-white/20' : 'bg-emerald-50 text-emerald-600 border-emerald-100',
        'Pendente': active ? 'bg-white/20 text-white border-white/20' : 'bg-amber-50 text-amber-600 border-amber-100',
        'Concluído': active ? 'bg-white/20 text-white border-white/20' : 'bg-slate-50 text-slate-400 border-slate-100',
        'Parado': active ? 'bg-white/20 text-white border-white/20' : 'bg-rose-50 text-rose-600 border-rose-100',
    };
    return (
        <span className={`status-pill px-3 py-1 rounded-lg border ${configs[status] || 'bg-slate-50 text-slate-400 border-slate-100'}`}>
            {status}
        </span>
    );
};

const ActivityLogTable = ({ logData, onOpenConversation, onOpenEditContact, isLoading }) => {
  const getStatusClass = (status) => {
    const statusMap = {
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
    return `status-pill px-3 py-1.5 rounded-xl border ${statusMap[status] || 'bg-slate-50 text-slate-400 border-slate-100'}`;
  };

  if (isLoading) return <div className="space-y-4 p-8">{[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-slate-50 rounded-[1.5rem] animate-pulse border border-slate-100"></div>)}</div>;

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-left min-w-[800px]">
        <thead>
          <tr className="border-b border-slate-50">
            {['Contato Interagindo', 'Situação IA', 'Insight do Agente', 'Ações'].map((h, i) => (
                <th key={i} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {logData.map((item, index) => (
            <tr key={index} className="group hover:bg-emerald-50/20 transition-all">
              <td className="px-6 py-3">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 font-bold group-hover:bg-emerald-500 group-hover:text-white transition-all text-xs">{(item.contact_name || '?')[0].toUpperCase()}</div>
                    <div>
                        <div className="text-sm font-black text-slate-800 leading-tight">{item.contact_name}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">{new Date(item.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • Sincronizado</div>
                    </div>
                </div>
              </td>
              <td className="px-6 py-3"><span className={getStatusClass(item.situacao)}>{item.situacao}</span></td>
              <td className="px-6 py-3 max-w-sm"><p className="text-xs text-slate-400 font-medium italic truncate" title={item.observacoes}>{item.observacoes || 'Nenhum insight disponível.'}</p></td>
              <td className="px-6 py-3">
                <div className="flex justify-end items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => onOpenConversation(item)} className="w-8 h-8 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-[#356854] hover:border-emerald-100 rounded-lg transition-all shadow-sm"><MessageSquare size={16} /></button>
                  <button onClick={() => onOpenEditContact(item)} className="w-8 h-8 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-[#356854] hover:border-emerald-100 rounded-lg transition-all shadow-sm"><Edit size={16} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function MainProspecting() {
  const [prospects, setProspects] = useState([]);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [currentStatus, setCurrentStatus] = useState('Pendente');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProspect, setEditingProspect] = useState(null);
  const logIntervalRef = useRef(null);
  const campaignsIntervalRef = useRef(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, prospect: null });
  const [modal, setModal] = useState({ type: null, data: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingStates, setLoadingStates] = useState({ campaigns: true, log: false });
  const [actionLoading, setActionLoading] = useState({ start: false, stop: false, delete: false });
  const logsPerPage = 20;

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingStates(p => ({ ...p, campaigns: true }));
    try {
      const res = await api.get('/prospecting/');
      setProspects(res.data);
      if (!selectedProspect && res.data.length > 0) setSelectedProspect(res.data[0]);
    } catch (e) {} finally { setLoadingStates(p => ({ ...p, campaigns: false })); }
  }, [selectedProspect]);

  const fetchLogs = useCallback(async (prospectId, isSilent = false) => {
    if (!prospectId) return;
    if (!isSilent) setLoadingStates(p => ({ ...p, log: true }));
    try {
      const res = await api.get(`/prospecting/${prospectId}/activity-log`);
      setActivityLog(res.data);
    } catch (e) {} finally { setLoadingStates(p => ({ ...p, log: false })); }
  }, []);

  useEffect(() => {
    fetchData();
    campaignsIntervalRef.current = setInterval(() => fetchData(true), 10000);
    return () => clearInterval(campaignsIntervalRef.current);
  }, [fetchData]);

  useEffect(() => {
    if (selectedProspect) {
      fetchLogs(selectedProspect.id);
      setCurrentStatus(selectedProspect.status);
      if (selectedProspect.status === 'Em Andamento') {
        logIntervalRef.current = setInterval(() => fetchLogs(selectedProspect.id, true), 5000);
      } else {
        clearInterval(logIntervalRef.current);
      }
    }
    return () => clearInterval(logIntervalRef.current);
  }, [selectedProspect, fetchLogs]);

  const handleAction = async (action) => {
    if (!selectedProspect) return;
    setActionLoading(p => ({ ...p, [action]: true }));
    try {
      await api.post(`/prospecting/${selectedProspect.id}/${action}`);
      const res = await api.get('/prospecting/');
      setProspects(res.data);
      const updated = res.data.find(p => p.id === selectedProspect.id);
      if (updated) { setSelectedProspect(updated); setCurrentStatus(updated.status); }
      toast.success(action === 'start' ? 'Prospecção iniciada!' : 'Prospecção pausada.');
    } catch (e) { toast.error('Falha na operação.'); }
    finally { setActionLoading(p => ({ ...p, [action]: false })); }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation.prospect) return;
    setActionLoading(p => ({ ...p, delete: true }));
    try {
      await api.delete(`/prospecting/${deleteConfirmation.prospect.id}`);
      toast.success('Campanha excluída.');
      const res = await api.get('/prospecting/');
      setProspects(res.data);
      setSelectedProspect(res.data[0] || null);
    } catch (e) { toast.error('Erro ao excluir.'); }
    finally { setActionLoading(p => ({ ...p, delete: false })); setDeleteConfirmation({ isOpen: false, prospect: null }); }
  };

  const currentLogs = activityLog.slice((currentPage - 1) * logsPerPage, currentPage * logsPerPage);
  const totalPages = Math.ceil(activityLog.length / logsPerPage);

  if (loadingStates.campaigns && prospects.length === 0) return <PageLoader message="Acessando torre de controle..." subMessage="Sincronizando logs de atividade do WhatsApp..." />;

  return (
    <div className="main-prospecting-page p-6 md:p-12 min-h-screen bg-[#f8fafc]">
      <style>{DS_STYLE}</style>
      <div className="max-w-[1600px] mx-auto flex flex-col gap-12">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">Painel de Prospecção <Zap size={24} className="text-[#356854]" /></h1>
            <p className="text-slate-400 mt-1.5 text-sm font-medium">Controle de disparos inteligentes e monitoramento real-time</p>
          </div>
          <button onClick={() => { setEditingProspect(null); setIsModalOpen(true); }} className="h-14 px-8 bg-[#356854] text-white font-black text-xs uppercase tracking-[0.1em] rounded-2xl shadow-xl shadow-emerald-900/10 hover:bg-[#2d5847] transition-all flex items-center gap-3">
            <Plus size={20} /> Criar Campanha
          </button>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-12">
          {/* Sidebar */}
          <aside className="xl:col-span-4 flex flex-col gap-8">
            <div className="ds-surface p-12 flex flex-col min-h-[750px]">
              <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Campanhas Ativas</h3>
                  <div className="h-6 px-3 bg-slate-50 text-slate-400 font-black text-[10px] rounded-lg flex items-center">{prospects.length}</div>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar max-h-[550px]">
                {loadingStates.campaigns ? Array.from({ length: 4 }).map((_, i) => <CampaignSkeleton key={i} />) : 
                 prospects.map(p => (
                  <div key={p.id} onClick={() => { setSelectedProspect(p); setCurrentStatus(p.status); }} className={`sidebar-item group p-6 cursor-pointer ${selectedProspect?.id === p.id ? 'active' : ''}`}>
                      <div className="flex justify-between items-start gap-4">
                          <div className="flex-grow overflow-hidden">
                              <h3 className="font-black text-sm tracking-tight truncate mb-2">{p.nome_prospeccao}</h3>
                              <StatusBadge status={p.status} active={selectedProspect?.id === p.id} />
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); if (p.status === 'Em Andamento') return toast.error('Pause a campanha para editar.'); setEditingProspect(p); setIsModalOpen(true); }} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${selectedProspect?.id === p.id ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50'}`}>
                              <Edit size={16} />
                          </button>
                      </div>
                  </div>
                ))}
              </div>

              {selectedProspect && (
                  <div className="mt-10 pt-8 border-t border-slate-50 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                          <button onClick={() => handleAction('start')} disabled={actionLoading.start || currentStatus === 'Em Andamento' || currentStatus === 'Concluído'} className="campaign-btn bg-emerald-500 text-white shadow-xl shadow-emerald-500/10 hover:bg-emerald-600 disabled:opacity-30">
                              {actionLoading.start ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />} Iniciar
                          </button>
                          <button onClick={() => handleAction('stop')} disabled={actionLoading.stop || currentStatus !== 'Em Andamento'} className="campaign-btn bg-rose-500 text-white shadow-xl shadow-rose-500/10 hover:bg-rose-600 disabled:opacity-30">
                              {actionLoading.stop ? <Loader2 size={20} className="animate-spin" /> : <Pause size={20} />} Pausar
                          </button>
                      </div>
                      <button onClick={() => setDeleteConfirmation({ isOpen: true, prospect: selectedProspect })} disabled={currentStatus === 'Em Andamento'} className="w-full h-14 flex items-center justify-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-rose-500 transition-all disabled:opacity-20"><Trash2 size={16} /> Excluir Permanentemente</button>
                  </div>
              )}
            </div>
          </aside>

          {/* Main Monitor */}
          <main className="xl:col-span-8 flex flex-col gap-12">
            <div className="ds-surface overflow-hidden border-none shadow-2xl shadow-slate-200/50 flex flex-col min-h-[750px]">
              <div className="px-8 py-6 border-b border-slate-50 bg-white sticky top-0 z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                <div>
                  <h2 className="text-xl font-black text-slate-800 flex items-center gap-3">Log de Monitoramento <Activity size={20} className="text-emerald-500" /></h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Status de processamento em tempo real</p>
                </div>
                <div className={`px-4 py-2 rounded-xl flex items-center gap-3 border ${currentStatus === 'Em Andamento' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${currentStatus === 'Em Andamento' ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{currentStatus === 'Em Andamento' ? 'Torre Ativa' : 'Sistema Standby'}</span>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                {selectedProspect ? (
                  <ActivityLogTable 
                      logData={currentLogs} 
                      isLoading={loadingStates.log && !logIntervalRef.current}
                      onOpenConversation={(item) => setModal({ type: 'conversation', data: { conversa: item.conversa, contactName: item.contact_name }})}
                      onOpenEditContact={(item) => setModal({ type: 'edit_contact', data: { ...item, id: item.prospect_contact_id }})}
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-20 opacity-20"><Layout size={64} className="mb-6" /><h3 className="text-sm font-black uppercase tracking-widest">Selecione uma campanha</h3></div>
                )}
              </div>

              {totalPages > 1 && (
                <footer className="px-8 py-4 border-t border-slate-50 bg-white flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Página {currentPage} de {totalPages}</span>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center border border-slate-100 rounded-lg text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronsLeft size={16} /></button>
                        <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center border border-slate-100 rounded-lg text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronLeft size={16} /></button>
                        <div className="h-8 px-4 bg-emerald-50 rounded-lg flex items-center text-[#356854] font-black text-[10px] uppercase tracking-widest border border-emerald-100">{currentPage}</div>
                        <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center border border-slate-100 rounded-lg text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronRight size={16} /></button>
                        <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center border border-slate-100 rounded-lg text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronsRight size={16} /></button>
                    </div>
                </footer>
              )}
            </div>
          </main>
        </div>
      </div>
      
      {isModalOpen && <CreateProspectingModal prospectToEdit={editingProspect} onClose={() => { setIsModalOpen(false); setEditingProspect(null); }} onSuccess={(res) => { fetchData(true); setIsModalOpen(false); }} />}
      {modal.type === 'conversation' && <ConversationModal onClose={() => setModal({ type: null, data: null })} conversation={modal.data.conversa} contactIdentifier={modal.data.contactName} />}
      {modal.type === 'edit_contact' && <EditContactModal contact={modal.data} statusOptions={["Aguardando Início", "Aguardando Resposta", "Resposta Recebida", "Lead Qualificado", "Não Interessado", "Concluído", "Sem Whatsapp", "Falha no Envio", "Erro IA", "Conversa Manual", "Fechado", "Atendente Chamado"]} onSave={async (id, up) => { await api.put(`/prospecting/contacts/${id}`, up); fetchLogs(selectedProspect.id, true); setModal({ type: null, data: null }); toast.success('Atualizado!'); }} onClose={() => setModal({ type: null, data: null })} />}
      {deleteConfirmation.isOpen && <DeleteConfirmationModal title="Excluir Campanha" message={`Deseja mesmo excluir "<strong>${deleteConfirmation.prospect?.nome_prospeccao}</strong>"?`} onConfirm={confirmDelete} onClose={() => setDeleteConfirmation({ isOpen: false, prospect: null })} />}
    </div>
  );
}

export default MainProspecting;