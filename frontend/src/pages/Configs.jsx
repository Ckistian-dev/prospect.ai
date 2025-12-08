import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
import {
    Plus, Save, Trash2, FileText, ChevronRight, Loader2,
    Link as LinkIcon, Star, CheckCircle, Folder, Copy, Share2
} from 'lucide-react';

// --- CONFIGURAÇÃO ---
// Substitua pelo client_email do seu JSON de credenciais do service account
const BOT_EMAIL = "integracaoapi@integracaoapi-436218.iam.gserviceaccount.com";

const initialFormData = {
  nome_config: '',
  contexto_sheets: null,
  arquivos_drive: null,
  spreadsheet_id: '',
  drive_id: ''
};

function Configs() {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [formData, setFormData] = useState(initialFormData);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('contexto'); // 'contexto' ou 'drive'

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
      contexto_sheets: config.contexto_sheets || null,
      arquivos_drive: config.arquivos_drive || null,
      spreadsheet_id: config.spreadsheet_id || '',
      drive_id: config.drive_id || ''
    });
    setActiveTab('contexto');
    setError('');
  };

  const handleNewConfig = () => {
    setSelectedConfig(null);
    setFormData(initialFormData);
    setActiveTab('contexto');
    setError('');
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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
    } catch (err) {
      setError('Erro ao salvar. Verifique os campos.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir esta configuração?')) {
      try {
        await api.delete(`/configs/${id}`);
        await fetchData();
        handleNewConfig();
      } catch (err) {
        setError('Erro ao excluir. Esta configuração pode estar em uso.');
      }
    }
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(BOT_EMAIL);
    alert("Email copiado para a área de transferência!");
  };

  const handleSyncSheet = async () => {
    if (!selectedConfig) return alert("Salve a configuração antes de sincronizar.");
    if (!formData.spreadsheet_id) return alert("Insira o ID ou Link da planilha.");

    setIsSyncing(true);
    setError('');
    try {
      const payload = { config_id: selectedConfig.id, spreadsheet_id: formData.spreadsheet_id };
      const response = await api.post('/configs/sync_sheet', payload);
      setFormData(prev => ({ ...prev, contexto_sheets: response.data.contexto_sheets }));
      alert(`Sucesso! ${response.data.sheets_found.length} abas encontradas.`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Falha ao sincronizar. Verifique se compartilhou a planilha com o e-mail do robô.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncDrive = async () => {
    if (!selectedConfig) return alert("Salve a configuração antes de sincronizar.");
    if (!formData.drive_id) return alert("Insira o ID da pasta do Drive.");

    setIsSyncing(true);
    setError('');
    try {
      const payload = { config_id: selectedConfig.id, drive_id: formData.drive_id };
      const response = await api.post('/configs/sync_drive', payload);
      setFormData(prev => ({ ...prev, arquivos_drive: response.data.arquivos_drive }));
      alert(`Sucesso! ${response.data.files_count} arquivos encontrados.`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Falha ao sincronizar Drive. Verifique o ID e o compartilhamento.');
    } finally {
      setIsSyncing(false);
    }
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
                <button type="button" onClick={() => setActiveTab('contexto')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'contexto' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                    <LinkIcon size={18} /> Contexto (Sheets)
                </button>
                <button type="button" onClick={() => setActiveTab('drive')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'drive' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                    <Folder size={18} /> Arquivos (Drive)
                </button>
              </div>

              {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded border border-red-200 text-sm">{error}</div>}
              
              {activeTab === 'contexto' && (
                <div className="animate-fade-in space-y-6">
                  <div>
                    <label htmlFor="spreadsheet_id" className={labelClass}>Link ou ID da Planilha</label>
                    <div className="flex items-center gap-4">
                      <input id="spreadsheet_id" name="spreadsheet_id" value={formData.spreadsheet_id} onChange={handleFormChange} className={inputClass} placeholder="Ex: 1a2b3c-4d5e6f... (ID ou link completo)" />
                      <button type="button" onClick={handleSyncSheet} disabled={isSyncing || !selectedConfig} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {isSyncing ? <Loader2 className="animate-spin" size={20} /> : "Sincronizar"}
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
                        <span className="text-xs text-gray-500">Ex: .../spreadsheets/d/<strong>1a2b3c-4d5e6f...</strong>/edit</span>
                      </li>
                    </ol>
                  </div>

                  {formData.contexto_sheets && Object.keys(formData.contexto_sheets).length > 0 && (
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200 animate-fade-in">
                      <div className="flex items-center gap-2"><CheckCircle className="text-green-600" size={20} /><p className="font-semibold text-green-800">Contexto Sincronizado!</p></div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {Object.keys(formData.contexto_sheets).map(sheetName => (
                          <span key={sheetName} className="px-3 py-1 bg-green-200 text-green-900 text-xs font-medium rounded-full">{sheetName}</span>
                        ))}
                      </div>
                    </div>
                  )}
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

                  {formData.arquivos_drive && (formData.arquivos_drive.arquivos?.length > 0 || formData.arquivos_drive.subpastas?.length > 0) ? (
                    <div className="p-4 bg-green-50 rounded-lg border border-gray-200 animate-fade-in">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100"><CheckCircle className="text-green-600" size={20} /><p className="font-semibold text-gray-700">Arquivos Sincronizados</p></div>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-2 text-sm"><RenderDriveTree node={formData.arquivos_drive} /></div>
                    </div>
                  ) : (
                    formData.drive_id && !isSyncing && (
                      <div className="text-center py-6 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                        <Folder size={32} className="mx-auto mb-2 opacity-20" /><p className="text-sm">Nenhum arquivo sincronizado ainda.</p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end items-center gap-4 pt-6 mt-auto">
              {selectedConfig && (<button type="button" onClick={() => handleDelete(selectedConfig.id)} className="font-semibold text-red-600 hover:text-red-800 flex items-center gap-2 mr-auto mb-6"><Trash2 size={16} /> Excluir</button>)}
              <button type="submit" disabled={isSaving} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400 disabled:shadow-none mb-6">
                {isSaving ? <><Loader2 className="animate-spin" size={20} /> Salvando...</> : <><Save size={20} /> Salvar</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const RenderDriveTree = ({ node }) => {
  if (!node || (!node.arquivos?.length && !node.subpastas?.length)) {
    return null;
  }

  return (
    <div className="pl-4 border-l border-gray-200">
      {node.arquivos?.map(file => (
        <div key={file.id} className="flex items-center gap-2 py-1">
          <FileText size={14} className="text-gray-400 flex-shrink-0" />
          <span className="text-gray-700">{file.nome}</span>
        </div>
      ))}
      {node.subpastas?.map(subfolder => (
        <div key={subfolder.nome} className="mt-2">
          <div className="flex items-center gap-2 font-semibold text-gray-800">
            <Folder size={16} className="text-gray-800" />
            {subfolder.nome}
          </div>
          <RenderDriveTree node={subfolder} />
        </div>
      ))}
    </div>
  );
};

export default Configs;