import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../api/axiosConfig';
import {
  Plus, Save, Trash2, FileText, ChevronRight, Loader2, CheckCircle, RefreshCw,
  Link as LinkIcon, Folder, Copy, Share2, Database, ExternalLink, AlertTriangle, Calendar, Info,
  Clock, X, Check, Search, User, Users, Network, Maximize2, Bell, Smartphone, Monitor, Shield, Zap, ArrowRight, Layout
} from 'lucide-react';
import toast from 'react-hot-toast';
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ptBR } from 'date-fns/locale';
import { WorkflowPreview, WorkflowEditorModal } from '../components/configs/WorkflowEditor';
import PageLoader from '../components/common/PageLoader';

registerLocale('pt-BR', ptBR);

// ─── DESIGN SYSTEM ──────────────────────────────────────────────────────────
const DS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
.configs-page { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
.configs-page h1, .configs-page h2, .configs-page h3, .configs-page h4 { font-family: 'Plus Jakarta Sans', sans-serif; }
.ds-surface { background: #ffffff; border-radius: 2rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
.ds-card { background: #ffffff; border-radius: 1.5rem; border: 1px solid rgba(0,0,0,0.05); padding: 1.5rem; transition: all 0.3s ease; }
.ds-card:hover { border-color: rgba(53,104,84,0.1); box-shadow: 0 8px 30px rgba(0,0,0,0.04); }
.config-input {
    width: 100%;
    height: 3.5rem;
    padding: 0 1.25rem;
    font-size: 0.875rem;
    font-weight: 600;
    border-radius: 1rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    color: #1e293b;
    outline: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.config-input:focus { border-color: #356854; background: #ffffff; box-shadow: 0 0 0 4px rgba(53,104,84,0.08); }
.config-tab-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1.25rem 1.5rem;
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.3s;
    border-bottom: 3px solid transparent;
    color: #94a3b8;
}
.config-tab-btn.active {
    color: #356854;
    border-bottom-color: #356854;
    background: rgba(53,104,84,0.02);
}
.config-tab-btn:hover:not(.active) { color: #64748b; background: rgba(0,0,0,0.01); }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
.ai-gradient { background: linear-gradient(135deg, #1b3d2f 0%, #356854 100%); }
`;

const BOT_EMAIL = "integracaoapi@integracaoapi-436218.iam.gserviceaccount.com";

const normalizeJid = (jid) => {
  if (!jid) return '';
  const parts = jid.split('@');
  let id = parts[0];
  if (id.startsWith('55') && id.length === 13 && id[4] === '9') id = id.slice(0, 4) + id.slice(5);
  return parts.length > 1 ? `${id}@${parts[1]}` : id;
};

const Modal = ({ onClose, children, maxWidth = "max-w-2xl" }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
    <div className={`bg-white w-full ${maxWidth} relative overflow-hidden animate-in zoom-in duration-300`} style={{ borderRadius: '2.5rem', boxShadow: '0 40px 100px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="absolute top-8 right-8 w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-slate-600 rounded-xl transition-all z-10"><X size={20} /></button>
      {children}
    </div>
  </div>
);

const ResourceCard = ({ title, desc, id, type, onOpen, onSync, onProvision, isSyncing, selectedConfigId }) => {
  const isSheet = type === 'sheet';
  return (
    <div className="ds-card group">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-5">
          <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all shadow-lg ${id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-300'}`}>
            {isSheet ? <Database size={28} /> : <Folder size={28} />}
          </div>
          <div>
            <h4 className="text-lg font-black text-slate-800 leading-tight">{title}</h4>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">{desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          {id ? (
            <>
              <button onClick={onOpen} className="flex-1 md:flex-none h-12 px-6 bg-slate-100 text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                <ExternalLink size={14} /> Abrir
              </button>
              <button onClick={onSync} disabled={isSyncing} className="flex-1 md:flex-none h-12 px-6 bg-emerald-50 text-emerald-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-emerald-100 transition-all flex items-center justify-center gap-2">
                {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sincronizar
              </button>
            </>
          ) : (
            <button onClick={onProvision} disabled={!selectedConfigId} className="w-full md:w-auto h-12 px-8 bg-[#356854] text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#2d5847] transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              <Plus size={16} /> Criar no Google Drive
            </button>
          )}
        </div>
      </div>
      {id && (
        <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3 truncate">
            <LinkIcon size={14} className="text-slate-400 shrink-0" />
            <span className="text-[11px] font-bold text-slate-400 truncate tracking-tight">{id}</span>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(id); toast.success("ID copiado!"); }} className="p-2 text-slate-400 hover:text-[#356854] transition-all"><Copy size={16} /></button>
        </div>
      )}
    </div>
  );
};

const InfoBox = ({ icon: Icon, title, children }) => (
  <div className="p-8 bg-emerald-50/50 rounded-[2rem] border border-emerald-100/30 flex gap-6 items-start">
    <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-emerald-600 shadow-sm shrink-0 border border-emerald-100/50"><Icon size={24} /></div>
    <div>
      <h4 className="text-sm font-black text-emerald-900 uppercase tracking-widest mb-2">{title}</h4>
      <div className="text-sm text-emerald-800/80 font-medium leading-relaxed">{children}</div>
    </div>
  </div>
);

function Configs() {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [formData, setFormData] = useState({
    nome_config: '', spreadsheet_id: '', spreadsheet_rag_id: '', drive_id: '',
    available_hours: { seg: [], ter: [], qua: [], qui: [], sex: [], sab: [], dom: [] },
    is_calendar_connected: false, is_calendar_active: false,
    workflow_json: { nodes: [], edges: [] }, notification_active: false, notification_destination: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, configId: null });
  const [schedule, setSchedule] = useState({});
  const [exceptions, setExceptions] = useState({});
  const [eventRules, setEventRules] = useState({ duration: 30, buffer_before: 0, buffer_after: 0, increment: 30 });
  const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [destinations, setDestinations] = useState([]);
  const [destSearchTerm, setDestSearchTerm] = useState('');
  const [whatsappInstances, setWhatsappInstances] = useState([]);
  const [selectedWhatsappInstanceId, setSelectedWhatsappInstanceId] = useState(null);
  const dropdownRef = useRef(null);
  const [activeTab, setActiveTab] = useState('system');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [configsRes, whatsappRes] = await Promise.all([api.get('/configs/'), api.get('/whatsapp/')]);
      setConfigs(configsRes.data);
      setWhatsappInstances(whatsappRes.data || []);
      if (!selectedWhatsappInstanceId && whatsappRes.data?.length > 0) setSelectedWhatsappInstanceId(whatsappRes.data[0].id);
    } catch (err) { setError('Falha ao carregar dados de configuração.'); }
    finally { setIsLoading(false); }
  }, [selectedWhatsappInstanceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => { if (configs.length > 0 && !selectedConfig) handleSelectConfig(configs[0]); }, [configs, selectedConfig]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const pendingConfigId = localStorage.getItem('pendingCalendarConfigId');
    const pendingProvisionId = localStorage.getItem('pendingProvisionConfigId');
    const pendingProvisionType = localStorage.getItem('pendingProvisionType');

    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (pendingConfigId) {
        (async () => {
          setIsLoading(true);
          try {
            const redirectUri = localStorage.getItem('pendingCalendarRedirectUri') || (window.location.origin + window.location.pathname);
            await api.post(`/google-contacts/calendar/auth/callback?code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}&config_id=${pendingConfigId}`);
            toast.success('Agenda conectada!');
            localStorage.removeItem('pendingCalendarConfigId');
            fetchData();
          } catch (e) { toast.error('Falha ao conectar Agenda.'); }
          finally { setIsLoading(false); }
        })();
      } else if (pendingProvisionId && pendingProvisionType) {
        (async () => {
          setIsSyncing(true);
          try {
            const redirectUri = window.location.origin + window.location.pathname;
            const res = await api.post('/configs/provision', { config_id: parseInt(pendingProvisionId), resource_type: pendingProvisionType, code, redirect_uri: redirectUri });
            toast.success("Recurso criado com sucesso!");
            if (res.data?.id) setFormData(p => ({ ...p, [pendingProvisionType === 'system' ? 'spreadsheet_id' : pendingProvisionType === 'rag' ? 'spreadsheet_rag_id' : 'drive_id']: res.data.id }));
            localStorage.removeItem('pendingProvisionConfigId');
            fetchData();
          } catch (err) { toast.error('Falha ao criar recurso.'); }
          finally { setIsSyncing(false); }
        })();
      }
    }
  }, [fetchData]);

  const handleSelectConfig = useCallback((config) => {
    setSelectedConfig(config);
    setFormData({
      nome_config: config.nome_config, spreadsheet_id: config.spreadsheet_id || '',
      spreadsheet_rag_id: config.spreadsheet_rag_id || '', drive_id: config.drive_id || '',
      available_hours: config.available_hours || { seg: [], ter: [], qua: [], qui: [], sex: [], sab: [], dom: [] },
      is_calendar_connected: !!config.google_calendar_credentials, is_calendar_active: config.is_calendar_active || false,
      workflow_json: { nodes: config.workflow_json?.nodes || [], edges: (config.workflow_json?.edges || []).map(e => ({ ...e, type: 'customEdge' })) },
      notification_active: config.notification_active || false, notification_destination: config.notification_destination || ''
    });
    const parsedSchedule = {};
    ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].forEach(day => {
      const dayHours = config.available_hours?.[day] || [];
      parsedSchedule[day] = { active: dayHours.length > 0, blocks: dayHours.length > 0 ? dayHours.map(h => ({ start: h.split('-')[0].trim(), end: h.split('-')[1].trim() })) : [{ start: '09:00', end: '18:00' }] };
    });
    setSchedule(parsedSchedule);
    setExceptions(config.date_overrides || {});
    setEventRules(config.event_rules || { duration: 30, buffer_before: 0, buffer_after: 0, increment: 30 });
    setDestSearchTerm(config.notification_destination || '');
    setActiveTab('system');
    setError('');
  }, []);

  const saveConfig = async (overrides = {}) => {
    setIsSaving(true);
    const serializedHours = {};
    Object.keys(schedule).forEach(day => { serializedHours[day] = schedule[day]?.active ? schedule[day].blocks.filter(b => b.start && b.end).map(b => `${b.start}-${b.end}`) : []; });
    const payload = { ...formData, ...overrides, available_hours: serializedHours, date_overrides: exceptions, event_rules: eventRules };
    try {
      const res = selectedConfig?.id ? await api.put(`/configs/${selectedConfig.id}`, payload) : await api.post('/configs/', payload);
      await fetchData();
      handleSelectConfig(res.data);
      toast.success('Configuração salva!');
    } catch (err) { toast.error('Erro ao salvar.'); }
    finally { setIsSaving(false); }
  };

  const handleSyncSheet = async (type) => {
    if (!selectedConfig) return toast.error("Salve antes de sincronizar.");
    const targetId = type === 'rag' ? formData.spreadsheet_rag_id : formData.spreadsheet_id;
    if (!targetId) return toast.error("ID inválido.");
    setIsSyncing(true);
    try {
      const res = await api.post('/configs/sync_sheet', { config_id: selectedConfig.id, spreadsheet_id: targetId, type });
      toast.success(`Sincronizado! ${res.data.sheets_found.length} abas encontradas.`);
    } catch (err) { toast.error('Falha na sincronização.'); }
    finally { setIsSyncing(false); }
  };

  const handleSyncDrive = async () => {
    if (!selectedConfig || !formData.drive_id) return toast.error("Configure o ID da pasta.");
    setIsSyncing(true);
    try {
      const res = await api.post('/configs/sync_drive', { config_id: selectedConfig.id, drive_id: formData.drive_id });
      toast.success(`Sincronizado! ${res.data.files_count} arquivos.`);
    } catch (err) { toast.error('Falha na sincronização.'); }
    finally { setIsSyncing(false); }
  };

  const handleProvision = async (type) => {
    if (!selectedConfig?.id) return toast.error("Salve antes.");
    try {
      localStorage.setItem('pendingProvisionConfigId', selectedConfig.id);
      localStorage.setItem('pendingProvisionType', type);
      const redirectUri = window.location.origin + window.location.pathname;
      const res = await api.get(`/configs/google-auth-url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      if (res.data.authorization_url) window.location.href = res.data.authorization_url;
    } catch (err) { toast.error('Erro Google Auth.'); }
  };

  const fetchDestinations = async () => {
    try {
      const res = selectedWhatsappInstanceId ? await api.get(`/prospecting/whatsapp/destinations/${selectedWhatsappInstanceId}`) : await api.get('/contacts/');
      const normalized = (res.data || []).map(d => ({ ...d, remoteJid: d.remoteJid || (d.whatsapp ? `${normalizeJid(d.whatsapp)}@s.whatsapp.net` : null), name: d.name || d.subject || d.nome || 'Sem nome' })).filter(d => d.remoteJid);
      setDestinations(normalized);
    } catch (e) { }
  };

  const filteredDestinations = useMemo(() => {
    const term = destSearchTerm.toLowerCase().trim();
    if (!term) return destinations;
    return destinations.filter(d => (d.name || '').toLowerCase().includes(term) || (d.remoteJid || '').toLowerCase().includes(term));
  }, [destinations, destSearchTerm]);

  useEffect(() => { if (activeTab === 'notifications') fetchDestinations(); }, [activeTab, selectedWhatsappInstanceId]);

  if (isLoading) return <PageLoader message="Acessando base de conhecimento..." subMessage="Configurando conexões com Google Drive..." />;

  const dayLabels = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };

  return (
    <div className="configs-page p-6 md:p-12 min-h-screen bg-[#f8fafc]">
      <style>{DS_STYLE}</style>
      <div className="max-w-[1600px] mx-auto flex flex-col gap-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">Contexto da IA <Database size={24} className="text-[#356854]" /></h1>
            <p className="text-slate-400 mt-1.5 text-sm font-medium">Personalidade, conhecimento técnico e regras de negócio</p>
          </div>
          <button onClick={() => { setSelectedConfig(null); setFormData({ ...initialFormData, nome_config: 'Nova Persona' }); }} className="h-14 px-8 bg-[#356854] text-white font-black text-xs uppercase tracking-[0.1em] rounded-2xl shadow-xl shadow-emerald-900/10 hover:bg-[#2d5847] transition-all flex items-center gap-3">
            <Plus size={20} /> Nova Configuração
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
          <aside className="lg:col-span-1 ds-surface p-8 flex flex-col gap-6">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Personas Criadas</h3>
            <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-2 max-h-[600px]">
              {configs.map(c => (
                <button key={c.id} onClick={() => handleSelectConfig(c)} className={`w-full group text-left px-5 py-4 rounded-2xl transition-all flex items-center justify-between border ${selectedConfig?.id === c.id ? 'bg-[#356854] border-[#356854] text-white shadow-xl shadow-emerald-900/10' : 'bg-white border-slate-50 hover:border-emerald-100 text-slate-600'}`}>
                  <span className="truncate font-black text-sm tracking-tight">{c.nome_config}</span>
                  <ChevronRight size={16} className={selectedConfig?.id === c.id ? 'text-emerald-300' : 'text-slate-200 group-hover:text-emerald-500'} />
                </button>
              ))}
            </div>
          </aside>

          <main className="lg:col-span-3 ds-surface flex flex-col overflow-hidden border-none shadow-2xl shadow-slate-200/50">
            <div className="p-10 bg-white border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
              <div className="flex items-center gap-6 w-full md:w-auto">
                <div className="w-16 h-16 rounded-[2rem] bg-emerald-50 flex items-center justify-center text-[#356854] shadow-sm shrink-0 border border-emerald-100/50"><Layout size={32} /></div>
                <input type="text" placeholder="Nome da Persona..." name="nome_config" value={formData.nome_config} onChange={(e) => setFormData(p => ({ ...p, nome_config: e.target.value }))} className="w-full text-2xl font-black text-slate-800 placeholder:text-slate-200 focus:outline-none bg-transparent" />
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                {selectedConfig && <button onClick={() => setDeleteConfirmation({ isOpen: true, configId: selectedConfig.id })} className="w-14 h-14 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all border border-slate-100"><Trash2 size={24} /></button>}
                <button onClick={() => saveConfig()} disabled={isSaving} className="flex-1 md:flex-none h-14 px-10 bg-[#356854] text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-900/10 hover:bg-[#2d5847] transition-all flex items-center gap-3 disabled:opacity-50">
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {isSaving ? 'Salvando...' : 'Salvar Persona'}
                </button>
              </div>
            </div>

            <nav className="flex border-b border-slate-50 bg-slate-50/30 overflow-x-auto no-scrollbar">
              {[
                { id: 'system', icon: User, label: 'Instruções' },
                { id: 'rag', icon: Database, label: 'Conhecimento' },
                { id: 'drive', icon: Folder, label: 'Media Center' },
                { id: 'fluxo', icon: Network, label: 'Workflow' },
                { id: 'notifications', icon: Bell, label: 'Transbordo' },
                { id: 'agenda', icon: Calendar, label: 'Agenda' },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} className={`config-tab-btn ${activeTab === t.id ? 'active' : ''}`}><t.icon size={18} /> {t.label}</button>
              ))}
            </nav>

            <div className="p-10 flex-1 overflow-y-auto custom-scrollbar bg-white min-h-[600px]">
              {activeTab === 'system' && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <ResourceCard title="Instruções de Personalidade" desc="Google Sheet contendo tom de voz, gatilhos e regras de comportamento." id={formData.spreadsheet_id} type="sheet" onOpen={() => window.open(`https://docs.google.com/spreadsheets/d/${formData.spreadsheet_id}`, '_blank')} onSync={() => handleSyncSheet('system')} onProvision={() => handleProvision('system')} isSyncing={isSyncing} selectedConfigId={selectedConfig?.id} />
                  <InfoBox icon={Shield} title="Privacidade e Segurança">As instruções são processadas localmente pelo nosso motor de IA e nunca são usadas para treinar modelos públicos. Seus dados estão protegidos sob nossa arquitetura de isolamento por tenant.</InfoBox>
                </div>
              )}

              {activeTab === 'rag' && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <ResourceCard title="Base de Conhecimento Dinâmica" desc="Planilha para alimentar o motor RAG com FAQs, detalhes técnicos e preços." id={formData.spreadsheet_rag_id} type="sheet" onOpen={() => window.open(`https://docs.google.com/spreadsheets/d/${formData.spreadsheet_rag_id}`, '_blank')} onSync={() => handleSyncSheet('rag')} onProvision={() => handleProvision('rag')} isSyncing={isSyncing} selectedConfigId={selectedConfig?.id} />
                  <InfoBox icon={Zap} title="Busca Inteligente">Nossa tecnologia de vetores permite que a IA encontre a resposta exata mesmo que o cliente use termos diferentes dos cadastrados.</InfoBox>
                </div>
              )}

              {activeTab === 'drive' && (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <ResourceCard title="Repositório de Mídia" desc="Pasta no Google Drive contendo fotos, vídeos e PDFs que a IA enviará aos leads." id={formData.drive_id} type="drive" onOpen={() => window.open(`https://drive.google.com/drive/folders/${formData.drive_id}`, '_blank')} onSync={handleSyncDrive} onProvision={() => handleProvision('drive')} isSyncing={isSyncing} selectedConfigId={selectedConfig?.id} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="ds-card p-8 border-none bg-slate-50">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#356854] mb-4 shadow-sm"><Check size={20} /></div>
                      <h4 className="font-black text-slate-800 text-sm mb-2">Compartilhamento</h4>
                      <p className="text-xs text-slate-500 leading-relaxed">Certifique-se de que a pasta esteja compartilhada com o e-mail: <br /><strong className="text-emerald-600 block mt-1">{BOT_EMAIL}</strong></p>
                      <button onClick={() => { navigator.clipboard.writeText(BOT_EMAIL); toast.success("Copiado!"); }} className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase text-[#356854] hover:underline tracking-widest"><Copy size={12} /> Copiar E-mail</button>
                    </div>
                    <div className="ds-card p-8 border-none bg-slate-50">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#356854] mb-4 shadow-sm"><Info size={20} /></div>
                      <h4 className="font-black text-slate-800 text-sm mb-2">Dica de Envio</h4>
                      <p className="text-xs text-slate-500 leading-relaxed">A IA usará o nome do arquivo para entender o contexto. Nomeie seus arquivos como "Tabela_Preços_2024.pdf".</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'fluxo' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col gap-8 h-[600px]">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-black text-slate-800 leading-tight">Visualização do Funil</h3>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Configure o caminho lógico da conversação</p>
                    </div>
                    <button onClick={() => setIsWorkflowModalOpen(true)} className="h-12 px-6 bg-[#356854] text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#2d5847] transition-all flex items-center gap-2"><Maximize2 size={16} /> Abrir Editor</button>
                  </div>
                  <div className="flex-1 bg-slate-50 border border-slate-100 rounded-[2rem] relative overflow-hidden group cursor-pointer" onClick={() => setIsWorkflowModalOpen(true)}>
                    <div className="absolute inset-0 z-10 bg-[#1b3d2f]/10 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-[2px]">
                      <div className="bg-white px-8 py-4 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest text-[#356854] flex items-center gap-3"><Network size={20} /> Clique para Editar</div>
                    </div>
                    <WorkflowPreview workflowJson={formData.workflow_json} />
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Canal de Disparo</label>
                      <select value={selectedWhatsappInstanceId || ''} onChange={(e) => setSelectedWhatsappInstanceId(Number(e.target.value))} className="config-input bg-white">
                        <option value="">Selecione uma instância...</option>
                        {whatsappInstances.map(i => <option key={i.id} value={i.id}>{i.name || `ID: ${i.id}`}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Status do Transbordo</label>
                      <div onClick={() => setFormData(p => ({ ...p, notification_active: !p.notification_active }))} className={`h-14 px-6 rounded-2xl flex items-center justify-between cursor-pointer transition-all border-2 ${formData.notification_active ? 'bg-emerald-50 border-emerald-500' : 'bg-slate-50 border-slate-100'}`}>
                        <span className="text-sm font-black text-slate-700">{formData.notification_active ? 'HABILITADO' : 'DESABILITADO'}</span>
                        <div className={`w-10 h-6 rounded-full relative transition-all ${formData.notification_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all ${formData.notification_active ? 'right-1' : 'left-1'}`} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="relative" ref={dropdownRef}>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Destinatário do Alerta</label>
                    <div className="relative">
                      <input type="text" placeholder="Nome do gerente ou grupo do WhatsApp..." value={destSearchTerm} onChange={(e) => { setDestSearchTerm(e.target.value); setIsDropdownOpen(true); }} onFocus={() => setIsDropdownOpen(true)} className="config-input pl-12 pr-12" />
                      {formData.notification_destination && <CheckCircle size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500" />}
                    </div>
                    {isDropdownOpen && (
                      <div className="absolute z-50 mt-4 w-full bg-white border border-slate-100 rounded-[2rem] shadow-2xl max-h-80 overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2">
                        {filteredDestinations.map(d => (
                          <button key={d.remoteJid} onClick={() => { setFormData(p => ({ ...p, notification_destination: d.remoteJid })); setDestSearchTerm(d.name); setIsDropdownOpen(false); }} className="w-full flex items-center gap-4 p-5 hover:bg-emerald-50/50 transition-all text-left border-b border-slate-50 last:border-0">
                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">{d.remoteJid.includes('g.us') ? <Users size={18} /> : <User size={18} />}</div>
                            <div className="flex-1 truncate">
                              <p className="text-sm font-black text-slate-800 truncate">{d.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{d.remoteJid}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'agenda' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-10">
                  <div className="ds-card ai-gradient border-none p-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div>
                      <h3 className="text-2xl font-black text-white mb-2">Google Agenda</h3>
                      <p className="text-emerald-100/70 text-sm font-medium">Permite que a IA verifique sua disponibilidade e marque reuniões automaticamente.</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {formData.is_calendar_connected ? (
                        <button onClick={async () => { await api.post(`/google-contacts/calendar/${selectedConfig.id}/disconnect`); fetchData(); toast.success("Desconectado."); }} className="h-12 px-6 bg-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white/20 transition-all flex items-center gap-2 border border-white/10 backdrop-blur-md">Desconectar</button>
                      ) : (
                        <button onClick={async () => { const res = await api.get(`/google-contacts/calendar/auth/url?redirect_uri=${encodeURIComponent(window.location.origin + window.location.pathname)}`); localStorage.setItem('pendingCalendarConfigId', selectedConfig.id); window.location.href = res.data.authorization_url; }} className="h-12 px-8 bg-white text-[#1b3d2f] font-black text-[10px] uppercase tracking-widest rounded-xl shadow-xl hover:bg-emerald-50 transition-all flex items-center gap-2">Conectar Agenda</button>
                      )}
                      <div className="flex items-center gap-3 bg-white/10 p-2 rounded-2xl border border-white/10">
                        <span className="text-[10px] font-black text-white uppercase tracking-widest ml-2">Agenda na IA</span>
                        <button onClick={() => setFormData(p => ({ ...p, is_calendar_active: !p.is_calendar_active }))} className={`w-10 h-6 rounded-full relative transition-all ${formData.is_calendar_active ? 'bg-emerald-400' : 'bg-white/20'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all ${formData.is_calendar_active ? 'right-1' : 'left-1'}`} /></button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                    <div className="ds-card border-none bg-slate-50/50">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Disponibilidade Semanal</h4>
                      <div className="space-y-3">
                        {['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map(day => (
                          <div key={day} className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100">
                            <div className="w-28 flex items-center gap-3">
                              <button onClick={() => setSchedule(p => ({ ...p, [day]: { ...p[day], active: !p[day].active } }))} className={`w-10 h-6 rounded-full relative transition-all ${schedule[day]?.active ? 'bg-emerald-500' : 'bg-slate-200'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all ${schedule[day]?.active ? 'right-1' : 'left-1'}`} /></button>
                              <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{dayLabels[day]}</span>
                            </div>
                            {schedule[day]?.active && (
                              <div className="flex-1 flex flex-wrap gap-2">
                                {schedule[day].blocks.map((block, idx) => (
                                  <div key={idx} className="flex items-center gap-2 bg-emerald-50/50 p-2 rounded-xl border border-emerald-100/50">
                                    <input type="time" value={block.start} onChange={(e) => { const nb = [...schedule[day].blocks]; nb[idx].start = e.target.value; setSchedule(p => ({ ...p, [day]: { ...p[day], blocks: nb } })); }} className="bg-transparent text-xs font-black text-[#356854] outline-none w-16" />
                                    <span className="text-[#356854]/40">—</span>
                                    <input type="time" value={block.end} onChange={(e) => { const nb = [...schedule[day].blocks]; nb[idx].end = e.target.value; setSchedule(p => ({ ...p, [day]: { ...p[day], blocks: nb } })); }} className="bg-transparent text-xs font-black text-[#356854] outline-none w-16" />
                                    <button onClick={() => { const nb = schedule[day].blocks.filter((_, i) => i !== idx); setSchedule(p => ({ ...p, [day]: { ...p[day], blocks: nb } })); }} className="text-emerald-400 hover:text-rose-500 transition-all"><X size={14} /></button>
                                  </div>
                                ))}
                                <button onClick={() => setSchedule(p => ({ ...p, [day]: { ...p[day], blocks: [...p[day].blocks, { start: '09:00', end: '18:00' }] } }))} className="w-8 h-8 flex items-center justify-center bg-white border border-slate-100 rounded-lg text-emerald-500 hover:bg-emerald-50 transition-all"><Plus size={16} /></button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="ds-card">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Regras de Agendamento</h4>
                        <div className="grid grid-cols-2 gap-6">
                          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Duração (Min)</label><input type="number" value={eventRules.duration} onChange={(e) => setEventRules(p => ({ ...p, duration: parseInt(e.target.value) }))} className="config-input" /></div>
                          <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Intervalo (Min)</label><input type="number" value={eventRules.increment} onChange={(e) => setEventRules(p => ({ ...p, increment: parseInt(e.target.value) }))} className="config-input" /></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {deleteConfirmation.isOpen && (
        <Modal onClose={() => setDeleteConfirmation({ isOpen: false, configId: null })} maxWidth="max-w-md">
          <div className="p-10 text-center">
            <div className="w-20 h-20 bg-rose-50 rounded-[2rem] flex items-center justify-center text-rose-500 mx-auto mb-6 shadow-sm"><AlertTriangle size={40} /></div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">Excluir Persona?</h3>
            <p className="text-slate-400 text-sm font-medium mb-8">Esta ação irá apagar permanentemente todas as configurações e treinamentos desta persona.</p>
            <div className="flex gap-4">
              <button onClick={() => setDeleteConfirmation({ isOpen: false, configId: null })} className="flex-1 h-14 bg-slate-50 text-slate-400 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all">Cancelar</button>
              <button onClick={async () => { await api.delete(`/configs/${deleteConfirmation.configId}`); fetchData(); setDeleteConfirmation({ isOpen: false, configId: null }); toast.success("Excluído."); }} className="flex-1 h-14 bg-rose-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-rose-900/10 hover:bg-rose-600 transition-all">Sim, Excluir</button>
            </div>
          </div>
        </Modal>
      )}

      {isWorkflowModalOpen && (
        <WorkflowEditorModal
          isOpen={isWorkflowModalOpen}
          onClose={() => setIsWorkflowModalOpen(false)}
          initialWorkflow={formData.workflow_json}
          onSave={async (newWorkflow) => { setFormData(p => ({ ...p, workflow_json: newWorkflow })); await saveConfig({ workflow_json: newWorkflow }); setIsWorkflowModalOpen(false); }}
        />
      )}
    </div>
  );
}

export default Configs;