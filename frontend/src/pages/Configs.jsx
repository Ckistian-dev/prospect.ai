import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../api/axiosConfig';
import {
  Plus, Save, Trash2, FileText, ChevronRight, Loader2, CheckCircle, RefreshCw,
  Link as LinkIcon, Folder, Copy, Share2, Database, ExternalLink, AlertTriangle, Calendar, Info,
  Clock, X, Check, Search, User, Users, Network, Maximize2, Bell
} from 'lucide-react';
import toast from 'react-hot-toast';
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ptBR } from 'date-fns/locale';
registerLocale('pt-BR', ptBR);
import { WorkflowPreview, WorkflowEditorModal } from '../components/configs/WorkflowEditor';

// --- CONFIGURAÇÃO ---
// Substitua pelo client_email do seu JSON de credenciais do service account
const BOT_EMAIL = "integracaoapi@integracaoapi-436218.iam.gserviceaccount.com";

// Helper para normalizar JIDs brasileiros
const normalizeJid = (jid) => {
  if (!jid) return '';
  const parts = jid.split('@');
  let id = parts[0];
  if (id.startsWith('55') && id.length === 13 && id[4] === '9') {
    id = id.slice(0, 4) + id.slice(5);
  }
  return parts.length > 1 ? `${id}@${parts[1]}` : id;
};

const initialFormData = {
  nome_config: '',
  spreadsheet_id: '',
  spreadsheet_rag_id: '',
  drive_id: '',
  available_hours: { seg: [], ter: [], qua: [], qui: [], sex: [], sab: [], dom: [] },
  is_calendar_connected: false,
  is_calendar_active: false,
  workflow_json: { nodes: [], edges: [] },
  notification_active: false,
  notification_destination: ''
};

const Modal = ({ onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
      {children}
    </div>
  </div>
);

const DeleteConfirmationModal = ({ onClose, onConfirm }) => (
  <Modal onClose={onClose}>
    <div className="p-6 text-center">
      <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
        <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">Excluir Configuração</h3>
      <p className="mt-2 text-sm text-gray-500">Tem certeza que deseja excluir esta configuração?</p>
      <div className="mt-6 flex justify-center gap-4">
        <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition">Cancelar</button>
        <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition">Sim, Excluir</button>
      </div>
    </div>
  </Modal>
);

function Configs() {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [formData, setFormData] = useState(initialFormData);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, configId: null });

  // Agenda Logic States
  const [schedule, setSchedule] = useState({});
  const [exceptions, setExceptions] = useState({});
  const [eventRules, setEventRules] = useState({ duration: 30, buffer_before: 0, buffer_after: 0, increment: 30 });

  // Estados do Workflow e Notificações
  const [isWorkflowModalOpen, setIsWorkflowModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [destinations, setDestinations] = useState([]);
  const [destSearchTerm, setDestSearchTerm] = useState('');
  const [whatsappInstances, setWhatsappInstances] = useState([]);
  const [selectedWhatsappInstanceId, setSelectedWhatsappInstanceId] = useState(null);
  const dropdownRef = useRef(null);

  const [activeTab, setActiveTab] = useState('system'); // 'system', 'rag', 'drive', 'agenda'

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [configsRes, whatsappRes] = await Promise.all([
        api.get('/configs/'),
        api.get('/whatsapp/'),
      ]);
      setConfigs(configsRes.data);
      setWhatsappInstances(whatsappRes.data || []);
      if (!selectedWhatsappInstanceId && whatsappRes.data && whatsappRes.data.length > 0) {
        setSelectedWhatsappInstanceId(whatsappRes.data[0].id);
      }
    } catch (err) {
      setError('Não foi possível carregar os dados.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedWhatsappInstanceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (configs.length > 0 && !selectedConfig) {
      handleSelectConfig(configs[0]);
    }
  }, [configs, selectedConfig]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const pendingConfigId = localStorage.getItem('pendingCalendarConfigId');
    const storedRedirectUri = localStorage.getItem('pendingCalendarRedirectUri');

    const pendingProvisionId = localStorage.getItem('pendingProvisionConfigId');
    const pendingProvisionType = localStorage.getItem('pendingProvisionType');

    if (code) {
      window.history.replaceState({}, document.title, window.location.pathname);

      if (pendingConfigId) {
        const handleCallback = async () => {
          setIsLoading(true);
          try {
            const redirectUri = storedRedirectUri || (window.location.origin + window.location.pathname);
            await api.post(`/google-contacts/calendar/auth/callback?code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}&config_id=${pendingConfigId}`);
            toast.success('Google Agenda conectado com sucesso!');
            localStorage.removeItem('pendingCalendarConfigId');
            localStorage.removeItem('pendingCalendarRedirectUri');

            const res = await api.get('/configs/');
            setConfigs(res.data);
            const updated = res.data.find(c => c.id === parseInt(pendingConfigId));
            if (updated) {
              handleSelectConfig(updated);
              setActiveTab('agenda');
            }
          } catch (error) {
            console.error(error);
            toast.error('Falha ao conectar Google Agenda.');
          } finally {
            setIsLoading(false);
          }
        };
        handleCallback();
      } else if (pendingProvisionId && pendingProvisionType) {
        const handleProvisionCallback = async () => {
          setIsSyncing(true);
          try {
            const redirectUri = window.location.origin + window.location.pathname;
            const response = await api.post('/configs/provision', {
              config_id: parseInt(pendingProvisionId),
              resource_type: pendingProvisionType,
              code: code,
              redirect_uri: redirectUri
            });
            toast.success("Recurso criado e compartilhado com sucesso!");

            const newId = response.data?.id;
            if (newId) {
              setFormData(prev => ({
                ...prev,
                [pendingProvisionType === 'system' ? 'spreadsheet_id' : pendingProvisionType === 'rag' ? 'spreadsheet_rag_id' : 'drive_id']: newId
              }));
            }
            localStorage.removeItem('pendingProvisionConfigId');
            localStorage.removeItem('pendingProvisionType');
            fetchData();
          } catch (err) {
            toast.error(err.response?.data?.detail || 'Falha ao criar o recurso no Google.');
          } finally {
            setIsSyncing(false);
          }
        };
        handleProvisionCallback();
      }
    }
  }, [fetchData]);

  const handleSelectConfig = useCallback((config) => {
    setSelectedConfig(config);
    setFormData({
      nome_config: config.nome_config,
      spreadsheet_id: config.spreadsheet_id || '',
      spreadsheet_rag_id: config.spreadsheet_rag_id || '',
      drive_id: config.drive_id || '',
      available_hours: config.available_hours || { seg: [], ter: [], qua: [], qui: [], sex: [], sab: [], dom: [] },
      is_calendar_connected: !!config.google_calendar_credentials,
      is_calendar_active: config.is_calendar_active || false,
      workflow_json: {
        nodes: config.workflow_json?.nodes || [],
        edges: (config.workflow_json?.edges || []).map(e => ({ ...e, type: 'customEdge' }))
      },
      notification_active: config.notification_active || false,
      notification_destination: config.notification_destination || ''
    });

    // Parse Weekly Schedule for UI
    const parsedSchedule = {};
    const days = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
    days.forEach(day => {
      const dayHours = config.available_hours?.[day] || [];
      parsedSchedule[day] = {
        active: dayHours.length > 0,
        blocks: dayHours.length > 0
          ? dayHours.map(h => {
            const [start, end] = h.split('-');
            return { start: start?.trim(), end: end?.trim() };
          })
          : [{ start: '09:00', end: '18:00' }]
      };
    });
    setSchedule(parsedSchedule);
    setExceptions(config.date_overrides || {});
    setEventRules(config.event_rules || { duration: 30, buffer_before: 0, buffer_after: 0, increment: 30 });
    setDestSearchTerm(config.notification_destination || '');

    setActiveTab('system');
    setError('');
  }, []);

  const handleNewConfig = () => {
    setSelectedConfig(null);
    setFormData(initialFormData);

    // Reset Schedule UI
    const defaultSchedule = {};
    ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].forEach(day => {
      defaultSchedule[day] = { active: false, blocks: [{ start: '09:00', end: '18:00' }] };
    });
    setSchedule(defaultSchedule);
    setExceptions({});
    setEventRules({ duration: 30, buffer_before: 0, buffer_after: 0, increment: 30 });
    setDestSearchTerm('');

    setActiveTab('system');
    setError('');
  };

  const extractId = (value) => {
    if (!value) return "";
    const sheetMatch = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (sheetMatch) return sheetMatch[1];
    const folderMatch = value.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (folderMatch) return folderMatch[1];
    return value;
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    let finalValue = value;

    if (['spreadsheet_id', 'spreadsheet_rag_id', 'drive_id'].includes(name)) {
      finalValue = extractId(value);
    }

    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  // --- Agenda Logic Handlers ---
  const toggleDay = (day) => {
    setSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], active: !prev[day].active }
    }));
  };

  const addTimeBlock = (day) => {
    setSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day], blocks: [...prev[day].blocks, { start: '09:00', end: '18:00' }] }
    }));
  };

  const removeTimeBlock = (day, index) => {
    setSchedule(prev => {
      const newBlocks = [...prev[day].blocks];
      newBlocks.splice(index, 1);
      return { ...prev, [day]: { ...prev[day], blocks: newBlocks } };
    });
  };

  const updateTimeBlock = (day, index, field, value) => {
    setSchedule(prev => {
      const newBlocks = [...prev[day].blocks];
      newBlocks[index] = { ...newBlocks[index], [field]: value };
      return { ...prev, [day]: { ...prev[day], blocks: newBlocks } };
    });
  };

  const saveConfig = async (overrides = {}) => {
    setIsSaving(true);
    setError('');

    // Serialize Schedule
    const serializedHours = {};
    Object.keys(schedule).forEach(day => {
      if (schedule[day]?.active) {
        serializedHours[day] = schedule[day].blocks
          .filter(b => b.start && b.end)
          .map(b => `${b.start}-${b.end}`);
      } else {
        serializedHours[day] = [];
      }
    });

    const payload = {
      ...formData,
      ...overrides,
      available_hours: serializedHours,
      date_overrides: exceptions,
      event_rules: eventRules
    };

    try {
      let updatedConfig;
      if (selectedConfig?.id) {
        const response = await api.put(`/configs/${selectedConfig.id}`, payload);
        updatedConfig = response.data;
      } else {
        const response = await api.post('/configs/', payload);
        updatedConfig = response.data;
      }
      await fetchData();
      handleSelectConfig(updatedConfig);
      toast.success('Configuração salva com sucesso!');
    } catch (err) {
      toast.error('Erro ao salvar. Verifique os campos.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    await saveConfig();
  };

  const handleDeleteClick = (id) => {
    setDeleteConfirmation({ isOpen: true, configId: id });
  };

  const confirmDelete = async () => {
    const { configId } = deleteConfirmation;
    try {
      await api.delete(`/configs/${configId}`);
      await fetchData();
      handleNewConfig();
      toast.success('Configuração excluída com sucesso!');
    } catch (err) {
      toast.error('Erro ao excluir. Esta configuração pode estar em uso.');
    } finally {
      setDeleteConfirmation({ isOpen: false, configId: null });
    }
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(BOT_EMAIL);
    toast.success("Email copiado para a área de transferência!");
  };

  // --- Criar Recursos Automaticamente (Provision) ---
  const handleProvision = async (type) => {
    if (!selectedConfig?.id) return toast.error("Salve a configuração antes de criar os recursos.");

    try {
      localStorage.setItem('pendingProvisionConfigId', selectedConfig.id);
      localStorage.setItem('pendingProvisionType', type);
      const redirectUri = window.location.origin + window.location.pathname;
      const response = await api.get(`/configs/google-auth-url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      if (response.data.authorization_url) {
        window.location.href = response.data.authorization_url;
      }
    } catch (err) {
      toast.error('Erro ao iniciar login com o Google.');
    }
  };

  const handleSyncSheet = async (type) => {
    if (!selectedConfig) return toast.error("Salve a configuração antes de sincronizar.");
    const targetId = type === 'rag' ? formData.spreadsheet_rag_id : formData.spreadsheet_id;
    if (!targetId) return toast.error("Insira o ID ou Link da planilha.");

    setIsSyncing(true);
    setError('');
    try {
      const payload = { config_id: selectedConfig.id, spreadsheet_id: targetId, type };
      const response = await api.post('/configs/sync_sheet', payload);

      toast.success(`Sucesso! ${response.data.sheets_found.length} abas processadas (${type.toUpperCase()}). Vetores criados: ${response.data.vectors_created}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Falha ao sincronizar. Verifique se compartilhou a planilha com o e-mail do robô.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncDrive = async () => {
    if (!selectedConfig) return toast.error("Salve a configuração antes de sincronizar.");
    if (!formData.drive_id) return toast.error("Insira o ID da pasta do Drive.");

    setIsSyncing(true);
    setError('');
    try {
      const payload = { config_id: selectedConfig.id, drive_id: formData.drive_id };
      const response = await api.post('/configs/sync_drive', payload);
      toast.success(`Sucesso! ${response.data.files_count} arquivos encontrados. Vetores criados: ${response.data.vectors_created}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Falha ao sincronizar Drive. Verifique o ID e o compartilhamento.');
    } finally {
      setIsSyncing(false);
    }
  };

  const openResource = (id, type) => {
    if (!id) return;
    const baseUrl = type === 'drive'
      ? 'https://drive.google.com/drive/folders/'
      : 'https://docs.google.com/spreadsheets/d/';
    window.open(`${baseUrl}${id}`, '_blank');
  };

  const handleConnectCalendar = async () => {
    if (!selectedConfig?.id) {
      toast.error("Salve a configuração antes de conectar a agenda.");
      return;
    }

    try {
      localStorage.setItem('pendingCalendarConfigId', selectedConfig.id);
      const redirectUri = window.location.origin + window.location.pathname;
      localStorage.setItem('pendingCalendarRedirectUri', redirectUri);
      const response = await api.get(`/google-contacts/calendar/auth/url?redirect_uri=${encodeURIComponent(redirectUri)}`);

      if (response.data.authorization_url) {
        window.location.href = response.data.authorization_url;
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao iniciar conexão com Google.");
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!selectedConfig?.id) return;

    try {
      await api.post(`/google-contacts/calendar/${selectedConfig.id}/disconnect`);
      toast.success("Agenda desconectada.");
      setFormData(prev => ({ ...prev, is_calendar_connected: false }));
      fetchData();
    } catch (error) {
      console.error(error);
      toast.error("Erro ao desconectar agenda.");
    }
  };

  // --- Funcionalidades de Notificações ---
  const fetchDestinations = async () => {
    try {
      let responseData = [];

      if (selectedWhatsappInstanceId) {
        const response = await api.get(`/prospecting/whatsapp/destinations/${selectedWhatsappInstanceId}`);
        responseData = response.data || [];
      } else {
        // Fallback para contatos tradicionais caso não exista instância configurada
        const response = await api.get('/contacts/');
        responseData = (response.data || []).map(contact => ({
          id: contact.id,
          name: contact.nome || contact.name || 'Contato sem nome',
          type: 'contact',
          remoteJid: contact.whatsapp ? `${normalizeJid(contact.whatsapp)}@s.whatsapp.net` : null,
        }));
      }

      // Normaliza cada destino para ter 'remoteJid' e tipo
      const normalized = (responseData || []).map(dest => {
        const remoteJid = dest.remoteJid ? normalizeJid(dest.remoteJid) : (dest.id ? normalizeJid(dest.id) : null);
        return {
          ...dest,
          remoteJid,
          type: dest.type || 'contact',
          name: dest.name || dest.subject || dest.nome || 'Sem nome',
        };
      }).filter(dest => dest.remoteJid);

      setDestinations(normalized);
    } catch (err) {
      console.error("Erro ao buscar destinos:", err);
      toast.error("Não foi possível carregar a lista de contatos e grupos.");
    }
  };

  const manualJid = useMemo(() => {
    let digits = destSearchTerm.replace(/\D/g, '');
    if (digits.length >= 10) {
      if (!digits.startsWith('55')) digits = `55${digits}`;
      return normalizeJid(`${digits}@s.whatsapp.net`);
    }
    return null;
  }, [destSearchTerm]);

  const filteredDestinations = useMemo(() => {
    const term = destSearchTerm.toLowerCase().trim();
    const termDigits = term.replace(/\D/g, '');

    const uniqueMap = new Map();
    destinations.forEach(d => {
      const rawJid = d.remoteJid || (d.whatsapp ? `${normalizeJid(d.whatsapp)}@s.whatsapp.net` : null);
      const jid = rawJid ? normalizeJid(rawJid) : null;
      if (jid && !uniqueMap.has(jid)) {
        uniqueMap.set(jid, { ...d, remoteJid: jid });
      }
    });

    const uniqueList = Array.from(uniqueMap.values()).sort((a, b) => {
      const nameA = (a.name || a.nome || a.subject || 'Sem nome').toLowerCase();
      const nameB = (b.name || b.nome || b.subject || 'Sem nome').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    if (!term) return uniqueList;

    return uniqueList.filter(dest => {
      const name = (dest.name || dest.nome || dest.subject || '').toLowerCase();
      const fullJid = (dest.remoteJid || '').toLowerCase();

      if (name.includes(term)) return true;

      const jidPrefix = fullJid.split('@')[0];

      if (termDigits.length >= 8) {
        const normalizedJid = normalizeJid(jidPrefix);
        let searchVal = termDigits;
        if (termDigits.length === 10 || termDigits.length === 11) {
          searchVal = termDigits.startsWith('55') ? termDigits : `55${termDigits}`;
        }
        const normalizedTerm = normalizeJid(searchVal);
        if (normalizedJid.includes(normalizedTerm)) return true;
      }

      return term.includes('@') ? fullJid.includes(term) : jidPrefix.includes(term);
    });
  }, [destinations, destSearchTerm]);

  useEffect(() => {
    if (activeTab === 'notifications') {
      fetchDestinations();
    }
  }, [activeTab, selectedWhatsappInstanceId]);

const labelClass = "block text-sm font-semibold text-gray-700 mb-1";
const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green resize-none";

const dayLabels = {
  seg: 'Segunda-feira', ter: 'Terça-feira', qua: 'Quarta-feira', qui: 'Quinta-feira',
  sex: 'Sexta-feira', sab: 'Sábado', dom: 'Domingo'
};

const formatDateKey = (date) => date.toISOString().split('T')[0];

return (
  <div className="p-6 md:p-10 bg-gray-50 h-full flex flex-col">
    <div className="mb-8">
      <h1 className="text-3xl font-bold text-gray-800">Configurações de Contexto</h1>
      <p className="text-gray-500 mt-1">Crie e gerencie as fontes de conhecimento para a sua IA.</p>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
      <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg border flex flex-col">
        <button onClick={handleNewConfig} className="w-full flex items-center justify-center gap-2 bg-brand-green text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-brand-green-dark transition mb-6">
          <Plus size={20} /> Nova Configuração
        </button>
        <h2 className="text-lg font-semibold text-gray-700 mb-3 px-1">Configurações Salvas</h2>
        {isLoading ? <p className="text-center text-gray-500">Carregando...</p> : (
          <ul className="space-y-2 overflow-y-auto">
            {configs.map(config => (
              <li key={config.id}>
                <button onClick={() => handleSelectConfig(config)} className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-all duration-200 ${selectedConfig?.id === config.id ? 'bg-brand-green text-white font-semibold shadow-sm' : 'hover:bg-gray-100 hover:pl-4'}`}>
                  <span className="truncate pr-2">{config.nome_config}</span>
                  <ChevronRight size={18} />
                </button>
              </li>
            ))}
            {configs.length === 0 && <p className="text-center text-gray-500 py-4">Nenhuma configuração salva.</p>}
          </ul>
        )}
      </div>

      <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-xl shadow-lg border overflow-y-auto">
        <form onSubmit={handleSave} className="flex flex-col h-full">
          <div className="flex-grow">
            <div className="flex items-center gap-4 mb-6">
              <FileText className="text-brand-green" size={32} />
              <input type="text" placeholder="Dê um nome para esta Configuração..." name="nome_config" value={formData.nome_config} onChange={handleFormChange} required className="w-full text-2xl font-bold text-gray-800 border-b-2 border-gray-200 focus:border-brand-green focus:outline-none py-2 bg-transparent" />
            </div>

            <div className="flex border-b border-gray-200 mb-6">
              <button type="button" onClick={() => setActiveTab('system')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'system' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                <LinkIcon size={18} /> Persona
              </button>
              <button type="button" onClick={() => setActiveTab('rag')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'rag' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                <Database size={18} /> Dados
              </button>
              <button type="button" onClick={() => setActiveTab('drive')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'drive' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                <Folder size={18} /> Arquivos
              </button>
              <button type="button" onClick={() => setActiveTab('fluxo')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'fluxo' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                <Network size={18} /> Fluxo
              </button>
              <button type="button" onClick={() => setActiveTab('notifications')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'notifications' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                <Bell size={18} /> Notificações
              </button>
              <button type="button" onClick={() => setActiveTab('agenda')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'agenda' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                <Calendar size={18} /> Agenda
              </button>
            </div>

            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded border border-red-200 text-sm">{error}</div>}

            {activeTab === 'system' && (
              <div className="animate-fade-in space-y-6">
                {!formData.spreadsheet_id ? (
                  <div className="p-6 bg-blue-50 border border-blue-100 rounded-lg shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-brand-green mb-1">
                        <FileText size={20} />
                        <h3>Criar Planilha de Instruções</h3>
                      </div>
                      <p className="text-sm text-gray-700">Conecte sua conta do Google para criar a planilha automaticamente.</p>
                    </div>
                    <div className="flex-shrink-0">
                      <button type="button" onClick={() => handleProvision('system')} disabled={isSyncing || !selectedConfig?.id} className="flex items-center gap-3 bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-md font-bold whitespace-nowrap hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm">
                        {isSyncing ? <Loader2 className="animate-spin mx-auto" size={20} /> : (
                          <>
                            <img src="https://img.icons8.com/color/24/000000/google-logo.png" alt="Google" className="w-5 h-5" />
                            Conectar e Criar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-brand-green flex items-center gap-2"><CheckCircle size={20} /> Planilha de Instruções Ativa</h3>
                      <p className="text-sm text-gray-500 mt-1">A planilha já foi gerada e está conectada a esta configuração.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => openResource(formData.spreadsheet_id, 'sheet')} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors font-medium text-gray-700">
                        <ExternalLink size={18} /> Abrir Planilha
                      </button>
                      <button type="button" onClick={() => handleSyncSheet('system')} disabled={isSyncing} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400">
                        {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />} Sincronizar
                      </button>
                    </div>
                  </div>
                )}

                {/* Instruções System */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-gray-700 space-y-4 mt-6">
                  <div className="flex items-center gap-2 font-semibold text-brand-green">
                    <Info size={18} />
                    <h4>Como funciona a Planilha de Instruções (System Prompt)</h4>
                  </div>
                  <p className="text-gray-600">
                    Esta planilha define a personalidade, as regras de negócio e o comportamento geral da sua Inteligência Artificial.
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-gray-600">
                    <li><strong>Persona:</strong> Defina o tom de voz, o nome do assistente e como ele deve se comportar.</li>
                    <li><strong>Regras:</strong> Crie categorias com diretrizes claras do que a IA deve ou não fazer (ex: "Sempre ofereça um desconto à vista", "Nunca passe informações de concorrentes").</li>
                    <li><strong>Sincronização:</strong> Sempre que alterar algo na planilha no Google Sheets, clique em <strong>Sincronizar</strong> aqui para que a IA aprenda as novas regras e passe a utilizá-las.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'rag' && (
              <div className="animate-fade-in space-y-6">
                {!formData.spreadsheet_rag_id ? (
                  <div className="p-6 bg-blue-50 border border-blue-100 rounded-lg shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-brand-green mb-1">
                        <Database size={20} />
                        <h3>Criar Base de Conhecimento</h3>
                      </div>
                      <p className="text-sm text-gray-700">Conecte sua conta do Google para criar a base de conhecimento automaticamente.</p>
                    </div>
                    <div className="flex-shrink-0">
                      <button type="button" onClick={() => handleProvision('rag')} disabled={isSyncing || !selectedConfig?.id} className="flex items-center gap-3 bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-md font-bold whitespace-nowrap hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm">
                        {isSyncing ? <Loader2 className="animate-spin mx-auto" size={20} /> : (
                          <>
                            <img src="https://img.icons8.com/color/24/000000/google-logo.png" alt="Google" className="w-5 h-5" />
                            Conectar e Criar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-brand-green flex items-center gap-2"><CheckCircle size={20} /> Base RAG Ativa</h3>
                      <p className="text-sm text-gray-500 mt-1">Sua base de conhecimento já está conectada.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => openResource(formData.spreadsheet_rag_id, 'sheet')} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors font-medium text-gray-700">
                        <ExternalLink size={18} /> Abrir Planilha
                      </button>
                      <button type="button" onClick={() => handleSyncSheet('rag')} disabled={isSyncing} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400">
                        {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />} Sincronizar
                      </button>
                    </div>
                  </div>
                )}

                {/* Instruções RAG */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-gray-700 space-y-4 mt-6">
                  <div className="flex items-center gap-2 font-semibold text-brand-green">
                    <Info size={18} />
                    <h4>Como funciona a Base de Conhecimento (RAG)</h4>
                  </div>
                  <p className="text-gray-600">
                    Esta planilha atua como a memória estendida da sua IA, permitindo que ela consulte informações volumosas e dados estruturados em tempo real.
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-gray-600">
                    <li><strong>Catálogo de Produtos:</strong> Liste seus produtos, serviços, preços, links e descrições detalhadas. A IA pesquisará nesta base antes de responder perguntas de vendas ou técnicas.</li>
                    <li><strong>Perguntas Frequentes (FAQ):</strong> Adicione as dúvidas mais recorrentes dos seus clientes com as respostas exatas que a IA deve fornecer.</li>
                    <li><strong>Sincronização:</strong> Toda vez que adicionar novos produtos ou alterar preços, lembre-se de clicar em <strong>Sincronizar</strong>.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'drive' && (
              <div className="animate-fade-in space-y-6">
                {!formData.drive_id ? (
                  <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-lg shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-green-800 mb-1">
                        <Folder size={20} />
                        <h3>Criar Pasta no Google Drive</h3>
                      </div>
                      <p className="text-sm text-gray-700">Conecte sua conta do Google para criar a pasta automaticamente.</p>
                    </div>
                    <div className="flex-shrink-0">
                      <button type="button" onClick={() => handleProvision('drive')} disabled={isSyncing || !selectedConfig?.id} className="flex items-center gap-3 bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-md font-bold whitespace-nowrap hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm">
                        {isSyncing ? <Loader2 className="animate-spin mx-auto" size={20} /> : (
                          <>
                            <img src="https://img.icons8.com/color/24/000000/google-logo.png" alt="Google" className="w-5 h-5" />
                            Conectar e Criar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-brand-green flex items-center gap-2"><CheckCircle size={20} /> Pasta Conectada</h3>
                      <p className="text-sm text-gray-500 mt-1">Pasta no Drive configurada e pronta para receber ficheiros.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => openResource(formData.drive_id, 'drive')} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors font-medium text-gray-700">
                        <ExternalLink size={18} /> Abrir Pasta
                      </button>
                      <button type="button" onClick={handleSyncDrive} disabled={isSyncing} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400">
                        {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />} Sincronizar
                      </button>
                    </div>
                  </div>
                )}

                {/* Instruções Drive */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-gray-700 space-y-4 mt-6">
                  <div className="flex items-center gap-2 font-semibold text-brand-green">
                    <Info size={18} />
                    <h4>Como funciona a integração com o Google Drive</h4>
                  </div>
                  <p className="text-gray-600">
                    Conecte uma pasta do Google Drive para que a IA consiga buscar e enviar arquivos de mídia (fotos, vídeos, PDFs) diretamente aos seus clientes durante o atendimento.
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-gray-600">
                    <li><strong>Organização:</strong> É recomendado criar subpastas dentro da pasta principal para categorizar seus arquivos (ex: /Tabelas de Preços, /Fotos de Produtos). A IA reconhece toda a estrutura.</li>
                    <li><strong>Nomes Claros e Descritivos:</strong> Dê nomes explicativos aos arquivos (ex: "Foto_Painel_Ripado_Freijo.jpg" ou "Catalogo_Servicos_2025.pdf"). A IA utiliza o nome dos arquivos para entender qual conteúdo enviar quando o cliente solicitar.</li>
                    <li><strong>Sincronização:</strong> Ao subir novos arquivos para a pasta ou renomear arquivos existentes, clique sempre no botão <strong>Sincronizar</strong> nesta tela para a IA catalogar as novidades.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* CONTEÚDO ABA: FLUXO VISUAL */}
            {activeTab === 'fluxo' && (
              <div className="animate-fade-in space-y-6 h-[400px] flex flex-col">
                <div className="flex justify-between items-end">
                  <div>
                    <h3 className="font-bold text-gray-800">Mapeamento de Fluxo da Conversa</h3>
                    <p className="text-sm text-gray-500">Desenhe os passos que a IA deve seguir durante a interação com o cliente.</p>
                  </div>
                  <button type="button" onClick={() => setIsWorkflowModalOpen(true)} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-4 rounded-md shadow-sm hover:bg-brand-green-dark transition-all">
                    <Maximize2 size={16} /> Editar Fluxo
                  </button>
                </div>

                {/* Preview do Canvas */}
                <div className="flex-1 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl relative overflow-hidden group">
                  <div className="absolute inset-0 z-10 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer backdrop-blur-[1px]" onClick={() => setIsWorkflowModalOpen(true)}>
                    <div className="bg-white px-6 py-3 rounded-full shadow-lg font-bold text-brand-green flex items-center gap-2">
                      <Network size={20} /> Clique para expandir e editar
                    </div>
                  </div>
                  <WorkflowPreview workflowJson={formData.workflow_json} />
                </div>
              </div>
            )}

            {/* CONTEÚDO ABA: NOTIFICAÇÕES */}
            {activeTab === 'notifications' && (
              <div className="animate-fade-in space-y-6">
                <div>
                  <label className={labelClass}>Instância WhatsApp</label>
                  <select
                    className={`${inputClass} w-full`}
                    value={selectedWhatsappInstanceId || ''}
                    onChange={(e) => setSelectedWhatsappInstanceId(Number(e.target.value) || null)}
                  >
                    <option value="">Selecione a instância</option>
                    {whatsappInstances.map(inst => (
                      <option key={inst.id} value={inst.id}>{inst.name || inst.instance_name || `#${inst.id}`}</option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <label className={labelClass}>Destino das Notificações (WhatsApp)</label>
                  <div className="flex items-center gap-4">
                    <div className="relative flex-grow" ref={dropdownRef}>
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        placeholder="Pesquisar contato ou grupo..."
                        value={destSearchTerm}
                        onChange={(e) => {
                          setDestSearchTerm(e.target.value);
                          setIsDropdownOpen(true);
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                        className={`${inputClass} pl-10 pr-16`}
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, notification_active: !prev.notification_active }))}
                          title={formData.notification_active ? "Desativar Notificações" : "Ativar Notificações"}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 ${formData.notification_active ? 'bg-brand-green' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.notification_active ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      {/* Dropdown de Destinos */}
                      {isDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar divide-y divide-gray-100">
                          {filteredDestinations.map(dest => {
                            const isGroup = dest.remoteJid?.endsWith('@g.us');
                            const isSelected = normalizeJid(formData.notification_destination) === normalizeJid(dest.remoteJid);
                            return (
                              <button
                                key={dest.id || dest.remoteJid}
                                type="button"
                                onClick={() => {
                                  const normalized = normalizeJid(dest.remoteJid);
                                  setFormData(prev => ({ ...prev, notification_destination: normalized }));
                                  setDestSearchTerm(normalized);
                                  setIsDropdownOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 p-3 text-left transition-colors hover:bg-gray-50 ${isSelected ? 'bg-green-50' : ''}`}
                              >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isGroup ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-brand-green'}`}>
                                  {isGroup ? <Users size={20} /> : <User size={20} />}
                                </div>
                                <div className="flex-grow min-w-0">
                                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-brand-green-dark' : 'text-gray-800'}`}>
                                    {dest.nome || dest.name || dest.subject || (isGroup ? "Grupo sem nome" : "Contato sem nome")}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">{dest.remoteJid || dest.whatsapp}</p>
                                </div>
                                {isSelected && <CheckCircle size={18} className="text-brand-green flex-shrink-0" />}
                              </button>
                            );
                          })}

                          {/* Opção Manual */}
                          {manualJid && !filteredDestinations.some(d => normalizeJid(d.remoteJid || d.whatsapp) === manualJid) && (
                            <button
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({ ...prev, notification_destination: manualJid }));
                                setDestSearchTerm(manualJid);
                                setIsDropdownOpen(false);
                              }}
                              className={`w-full flex items-center gap-3 p-3 text-left transition-colors hover:bg-green-50 ${formData.notification_destination === manualJid ? 'bg-green-50' : ''}`}
                            >
                              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-green-100 text-brand-green">
                                <Plus size={20} />
                              </div>
                              <div className="flex-grow min-w-0">
                                <p className="text-sm font-semibold text-gray-800">Adicionar número manualmente</p>
                                <p className="text-xs text-gray-500 truncate">{manualJid}</p>
                              </div>
                              {formData.notification_destination === manualJid && <CheckCircle size={18} className="text-brand-green flex-shrink-0" />}
                            </button>
                          )}

                          {destinations.length === 0 && !manualJid && (
                            <div className="p-8 text-center text-gray-500 italic text-sm">Nenhum contato carregado.</div>
                          )}
                          {destSearchTerm && filteredDestinations.length === 0 && !manualJid && (
                            <div className="p-8 text-center text-gray-500 italic text-sm">Nenhum contato encontrado.</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Instruções Notificações */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-gray-700 space-y-4 mt-6">
                  <div className="flex items-center gap-2 font-semibold text-brand-green">
                    <Info size={18} />
                    <h4>Como funcionam as Notificações</h4>
                  </div>
                  <p className="text-gray-600">
                    Ao habilitar esta opção, o sistema enviará alertas automáticos para o contato ou grupo selecionado sempre que a IA transferir um atendimento.
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-gray-600">
                    <li><strong>Destinos:</strong> É possível mandar as notificações tanto para um contato individual quanto para um grupo.</li>
                    <li><strong>Contato não listado:</strong> Se não estiver aparecendo o contato desejado na busca, você pode digitar o seu número completo (com DDD) e adicionar manualmente. Lembre-se de salvar a configuração depois.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'agenda' && (
              <div className="animate-fade-in space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className={labelClass}>Integração com Google Agenda</label>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`flex-grow px-3 py-2 border rounded-md flex items-center justify-between gap-2 ${formData.is_calendar_connected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-300 text-gray-500'}`}>
                      <div className="flex items-center gap-4">
                        {formData.is_calendar_connected ? <Check size={18} /> : <Calendar size={18} />}
                        <span className="text-sm font-medium">
                          {formData.is_calendar_connected ? "Agenda conectada" : "Nenhuma agenda conectada"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">Ativar Agenda na IA</span>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, is_calendar_active: !prev.is_calendar_active }))}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 ${formData.is_calendar_active ? 'bg-brand-green' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_calendar_active ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>

                    {formData.is_calendar_connected ? (
                      <button type="button" onClick={handleDisconnectCalendar} className="flex items-center gap-2 bg-red-100 text-red-700 font-bold py-2 px-6 rounded-lg shadow-md hover:bg-red-200 transition-all">
                        <Trash2 size={20} /> Desconectar
                      </button>
                    ) : (
                      <button type="button" onClick={handleConnectCalendar} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-brand-green-dark transition-all">
                        <LinkIcon size={20} /> Conectar
                      </button>
                    )}
                  </div>
                </div>

                {/* --- AGENDA LOGIC LAYERS --- */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-gray-700 flex items-center gap-2">
                        <Clock size={18} className="text-brand-green" />
                        Horários de Atendimento
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">Defina seu padrão semanal de disponibilidade.</p>
                    </div>
                  </div>

                  <div className="p-4">
                    {/* CAMADA 1: PADRÃO SEMANAL */}
                    <div className="space-y-2">
                      {['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map(day => (
                        <div key={day} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                          <div className="w-24 pt-1.5 flex-shrink-0">
                            <label className="flex items-center cursor-pointer">
                              <div className="relative">
                                <input type="checkbox" className="sr-only" checked={schedule[day]?.active || false} onChange={() => toggleDay(day)} />
                                <div className={`block w-8 h-5 rounded-full transition-colors ${schedule[day]?.active ? 'bg-brand-green' : 'bg-gray-300'}`}></div>
                                <div className={`dot absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${schedule[day]?.active ? 'transform translate-x-3' : ''}`}></div>
                              </div>
                              <span className="ml-2 text-sm font-medium text-gray-700">{dayLabels[day].split('-')[0]}</span>
                            </label>
                          </div>

                          <div className="flex-1 flex flex-wrap gap-2 items-center">
                            {!schedule[day]?.active ? (
                              <span className="text-sm text-gray-400 italic py-1"></span>
                            ) : (
                              <>
                                {schedule[day].blocks.map((block, idx) => (
                                  <div key={idx} className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                    <input type="time" value={block.start} onChange={(e) => updateTimeBlock(day, idx, 'start', e.target.value)} className="bg-transparent text-sm outline-none w-20 text-center" />
                                    <span className="text-gray-400 text-xs">-</span>
                                    <input type="time" value={block.end} onChange={(e) => updateTimeBlock(day, idx, 'end', e.target.value)} className="bg-transparent text-sm outline-none w-20 text-center" />
                                    <button type="button" onClick={() => removeTimeBlock(day, idx)} className="text-gray-400 hover:text-red-500 ml-1"><X size={14} /></button>
                                  </div>
                                ))}
                                <button type="button" onClick={() => addTimeBlock(day)} className="p-1 text-brand-green hover:bg-green-50 rounded transition-colors" title="Adicionar intervalo">
                                  <Plus size={18} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

          <div className="flex justify-end items-center gap-4 pt-6 mt-auto">
            {selectedConfig && (<button type="button" onClick={() => handleDeleteClick(selectedConfig.id)} className="font-semibold text-red-600 hover:text-red-800 flex items-center gap-2 mr-auto mb-6"><Trash2 size={16} /> Excluir</button>)}
            <button type="submit" disabled={isSaving} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400 disabled:shadow-none mb-6">
              {isSaving ? <><Loader2 className="animate-spin" size={20} /> Salvando...</> : <><Save size={20} /> Salvar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
    {/* MODAL DE CONSTRUÇÃO DE FLUXO */}
    <WorkflowEditorModal
      isOpen={isWorkflowModalOpen}
      onClose={() => setIsWorkflowModalOpen(false)}
      initialWorkflow={formData.workflow_json}
      onSave={(currentWorkflow) => {
        setFormData(prev => ({ ...prev, workflow_json: currentWorkflow }));
      }}
      onSaveAndPersist={(currentWorkflow) => saveConfig({ workflow_json: currentWorkflow })}
    />
    {deleteConfirmation.isOpen && (
      <DeleteConfirmationModal onClose={() => setDeleteConfirmation({ isOpen: false, configId: null })} onConfirm={confirmDelete} />
    )}
  </div>
);
}

export default Configs;