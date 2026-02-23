import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
import {
    Plus, Save, Trash2, FileText, ChevronRight, Loader2,
    Link as LinkIcon, Folder, Copy, Share2, Database, ExternalLink, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';

// --- CONFIGURAÇÃO ---
// Substitua pelo client_email do seu JSON de credenciais do service account
const BOT_EMAIL = "integracaoapi@integracaoapi-436218.iam.gserviceaccount.com";

const initialFormData = {
  nome_config: '',
  spreadsheet_id: '',
  spreadsheet_rag_id: '',
  drive_id: ''
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

  const [activeTab, setActiveTab] = useState('system'); // 'system', 'rag', 'drive'

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [configsRes] = await Promise.all([
        api.get('/configs/'),
      ]);
      setConfigs(configsRes.data);
    } catch (err) {
      setError('Não foi possível carregar os dados.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectConfig = (config) => {
    setSelectedConfig(config);
    setFormData({
      nome_config: config.nome_config,
      spreadsheet_id: config.spreadsheet_id || '',
      spreadsheet_rag_id: config.spreadsheet_rag_id || '',
      drive_id: config.drive_id || ''
    });
    setActiveTab('system');
    setError('');
  };

  const handleNewConfig = () => {
    setSelectedConfig(null);
    setFormData(initialFormData);
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

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    const payload = { ...formData };
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

  const labelClass = "block text-sm font-semibold text-gray-700 mb-1";
  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green resize-none";

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
                  <FileText className="text-brand-green" size={32}/>
                  <input type="text" placeholder="Dê um nome para esta Configuração..." name="nome_config" value={formData.nome_config} onChange={handleFormChange} required className="w-full text-2xl font-bold text-gray-800 border-b-2 border-gray-200 focus:border-brand-green focus:outline-none py-2 bg-transparent"/>
              </div>

              <div className="flex border-b border-gray-200 mb-6">
                <button type="button" onClick={() => setActiveTab('system')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'system' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                    <LinkIcon size={18} /> Instruções (System)
                </button>
                <button type="button" onClick={() => setActiveTab('rag')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'rag' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                    <Database size={18} /> Conhecimento (RAG)
                </button>
                <button type="button" onClick={() => setActiveTab('drive')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'drive' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                    <Folder size={18} /> Arquivos (Drive)
                </button>
              </div>

              {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded border border-red-200 text-sm">{error}</div>}
              
              {activeTab === 'system' && (
                <div className="animate-fade-in space-y-6">
                  <div>
                    <label htmlFor="spreadsheet_id" className={labelClass}>Link da Planilha de Instruções</label>
                    <div className="flex items-center gap-4">
                      <input id="spreadsheet_id" name="spreadsheet_id" value={formData.spreadsheet_id} onChange={handleFormChange} className={inputClass} placeholder="Ex: 1a2b3c-4d5e6f... (ID ou link completo)" />
                      <button type="button" onClick={() => handleSyncSheet('system')} disabled={isSyncing || !selectedConfig} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {isSyncing ? <Loader2 className="animate-spin" size={20} /> : "Sincronizar"}
                      </button>
                      <button type="button" onClick={() => openResource(formData.spreadsheet_id, 'sheet')} disabled={!formData.spreadsheet_id} className="p-2 text-gray-500 hover:text-brand-green transition-colors disabled:opacity-50" title="Abrir no Navegador">
                        <ExternalLink size={24} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-gray-700 space-y-4">
                    <div className="flex items-center gap-2 font-semibold text-blue-800"><Share2 size={18} /><h4>Como conectar sua planilha</h4></div>
                    <ol className="list-decimal list-inside space-y-2 text-gray-600">
                      <li>Abra sua planilha no Google Sheets e clique em <strong>Compartilhar</strong>.</li>
                      <li>Cole o e-mail: <button type="button" onClick={handleCopyEmail} className="inline-flex items-center gap-1.5 ml-1 px-1 py-0.5 font-bold align-middle" title="Clique para copiar">{BOT_EMAIL} <Copy size={14} strokeWidth={3} /></button></li>
                      <li>Defina o acesso como <strong>Leitor</strong> e salve.</li>
                      <li>
                        Copie o ID da planilha (o trecho longo no meio da URL).<br/>
                        <span className="text-xs text-gray-500">Use esta planilha para definir Persona, Regras de Negócio e Etapas de Venda.</span>
                      </li>
                    </ol>
                  </div>
                </div>
              )}

              {activeTab === 'rag' && (
                <div className="animate-fade-in space-y-6">
                  <div>
                    <label htmlFor="spreadsheet_rag_id" className={labelClass}>Link da Planilha de Conhecimento</label>
                    <div className="flex items-center gap-4">
                      <input id="spreadsheet_rag_id" name="spreadsheet_rag_id" value={formData.spreadsheet_rag_id} onChange={handleFormChange} className={inputClass} placeholder="Ex: 1a2b3c-4d5e6f... (ID ou link completo)" />
                      <button type="button" onClick={() => handleSyncSheet('rag')} disabled={isSyncing || !selectedConfig} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {isSyncing ? <Loader2 className="animate-spin" size={20} /> : "Sincronizar"}
                      </button>
                      <button type="button" onClick={() => openResource(formData.spreadsheet_rag_id, 'sheet')} disabled={!formData.spreadsheet_rag_id} className="p-2 text-gray-500 hover:text-brand-green transition-colors disabled:opacity-50" title="Abrir no Navegador">
                        <ExternalLink size={24} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-gray-700 space-y-4">
                    <div className="flex items-center gap-2 font-semibold text-brand-green">
                        <Database size={18} />
                        <h4>Base de Conhecimento (RAG)</h4>
                    </div>
                    <ol className="list-decimal list-inside space-y-2 text-gray-600">
                        <li>Siga o mesmo processo de compartilhamento com o email do bot.</li>
                        <li>Use esta planilha para dados volumosos: <strong>Catálogo de Produtos, Tabela de Preços, FAQ, Lista de Serviços.</strong></li>
                        <li>O sistema irá ler todas as abas e transformar em vetores de busca.</li>
                        <li>Isso permite que a IA encontre informações específicas sem sobrecarregar o prompt principal.</li>
                    </ol>
                  </div>
                </div>
              )}

              {activeTab === 'drive' && (
                <div className="animate-fade-in space-y-6">
                  <div>
                    <label htmlFor="drive_id" className={labelClass}>ID da Pasta do Google Drive</label>
                    <div className="flex items-center gap-4">
                      <input id="drive_id" name="drive_id" value={formData.drive_id} onChange={handleFormChange} className={inputClass} placeholder="Ex: 1BxiMVs0XRA5nFMdKVBdBNj..." />
                      <button type="button" onClick={handleSyncDrive} disabled={isSyncing || !selectedConfig} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {isSyncing ? <Loader2 className="animate-spin" size={20} /> : "Sincronizar"}
                      </button>
                      <button type="button" onClick={() => openResource(formData.drive_id, 'drive')} disabled={!formData.drive_id} className="p-2 text-gray-500 hover:text-brand-green transition-colors disabled:opacity-50" title="Abrir no Navegador">
                        <ExternalLink size={24} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100 text-sm text-gray-700 space-y-4">
                    <div className="flex items-center gap-2 font-semibold text-indigo-800"><Share2 size={18} /><h4>Como conectar sua pasta</h4></div>
                    <ol className="list-decimal list-inside space-y-2 text-gray-600">
                      <li>No Google Drive, clique com o botão direito na pasta e em <strong>Compartilhar</strong>.</li>
                      <li>Cole o e-mail: <button type="button" onClick={handleCopyEmail} className="inline-flex items-center gap-1.5 ml-1 px-1 py-0.5 font-bold align-middle" title="Clique para copiar">{BOT_EMAIL} <Copy size={14} strokeWidth={3} /></button></li>
                      <li>Defina o acesso como <strong>Leitor</strong> e salve.</li>
                      <li>
                        Copie o ID da pasta (o trecho final da URL).<br/>
                        <span className="text-xs text-gray-500">Ex: .../drive/folders/<strong>1BxiMVs0XRA5nFMdKVBdBNj...</strong></span>
                      </li>
                    </ol>
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
      {deleteConfirmation.isOpen && (
        <DeleteConfirmationModal onClose={() => setDeleteConfirmation({ isOpen: false, configId: null })} onConfirm={confirmDelete} />
      )}
    </div>
  );
}

export default Configs;