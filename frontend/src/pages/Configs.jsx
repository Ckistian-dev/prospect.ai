import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { Plus, Save, Trash2, FileText, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react';

const availableVariables = [
  { name: 'Nome do Contato', value: '{{nome_contato}}' },
  { name: 'Observações do Contato', value: '{{observacoes_contato}}' },
  { name: 'Data Atual', value: '{{data_atual}}' },
  { name: 'Dia da Semana', value: '{{dia_semana}}' },
];

function Configs() {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [formData, setFormData] = useState({ nome_config: '', persona: '', prompt: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const promptRef = useRef(null);

  const fetchConfigs = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/configs/');
      setConfigs(response.data);
    } catch (err) {
      setError('Não foi possível carregar as configurações.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleSelectConfig = (config) => {
    setSelectedConfig(config);
    setFormData({
      nome_config: config.nome_config,
      persona: config.persona,
      prompt: config.prompt
    });
  };

  const handleNewConfig = () => {
    setSelectedConfig(null);
    setFormData({ nome_config: '', persona: '', prompt: '' });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleInsertVariable = (variable) => {
    const { current: textarea } = promptRef;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const newText = text.substring(0, start) + variable + text.substring(end);
    
    setFormData(prev => ({ ...prev, prompt: newText }));

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    }, 0);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      if (selectedConfig && selectedConfig.id) {
        await api.put(`/configs/${selectedConfig.id}`, formData);
      } else {
        await api.post('/configs/', formData);
      }
      fetchConfigs();
      handleNewConfig();
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
        fetchConfigs();
        handleNewConfig();
      } catch (err) {
        setError('Erro ao excluir configuração.');
      }
    }
  };

  // A CORREÇÃO PRINCIPAL ESTÁ AQUI: Tornamos o container principal um flexbox de coluna
  return (
    <div className="p-6 md:p-10 bg-gray-50 h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Configurações de Persona e Prompt</h1>
        <p className="text-gray-500 mt-1">Crie e gerencie os modelos de mensagens para suas prospecções.</p>
      </div>

      {/* Este container agora cresce e permite que seus filhos rolem */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
        {/* Coluna da Esquerda: Lista de Configurações */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-md border border-gray-200 flex flex-col">
          <button
            onClick={handleNewConfig}
            className="w-full flex items-center justify-center gap-2 bg-brand-green text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-brand-green-dark transition-all duration-300 mb-4 flex-shrink-0"
          >
            <Plus size={20} />
            Nova Configuração
          </button>
          <h2 className="text-lg font-semibold text-gray-700 mb-2 flex-shrink-0">Modelos Salvos</h2>
          {isLoading ? <p>Carregando...</p> : (
            // A lista agora tem sua própria barra de rolagem se necessário
            <ul className="space-y-2 overflow-y-auto">
              {configs.map(config => (
                <li key={config.id}>
                  <button 
                    onClick={() => handleSelectConfig(config)}
                    className={`w-full text-left p-3 rounded-md flex justify-between items-center transition-colors ${selectedConfig?.id === config.id ? 'bg-brand-green-light/20 text-brand-green-dark font-semibold' : 'hover:bg-gray-100'}`}
                  >
                    <span>{config.nome_config}</span>
                    <ChevronRight size={16} />
                  </button>
                </li>
              ))}
               {configs.length === 0 && <p className="text-center text-gray-500 py-4">Nenhum modelo salvo.</p>}
            </ul>
          )}
        </div>

        {/* Coluna da Direita: Formulário de Edição */}
        <div className="lg:col-span-2 bg-white p-8 rounded-xl shadow-md border border-gray-200 overflow-y-auto">
          <form onSubmit={handleSave} className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
              <FileText />
              {selectedConfig ? 'Editar Configuração' : 'Criar Nova Configuração'}
            </h2>
            
            {error && <p className="text-red-500 text-sm">{error}</p>}
            
            <div>
              <label htmlFor="nome_config" className="block text-sm font-medium text-gray-700 mb-1">Nome da Configuração</label>
              <input type="text" name="nome_config" value={formData.nome_config} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" />
            </div>

            <div>
              <label htmlFor="persona" className="block text-sm font-medium text-gray-700 mb-1">Descrição da Persona</label>
              <textarea name="persona" value={formData.persona} onChange={handleChange} required rows="4" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green"></textarea>
              <p className="text-xs text-gray-500 mt-1">Descreva em detalhes como a IA deve se comportar (tom de voz, objetivo, etc.).</p>
            </div>
            
            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-1">Texto do Prompt</label>
              <textarea ref={promptRef} name="prompt" value={formData.prompt} onChange={handleChange} required rows="8" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green"></textarea>
              <p className="text-xs text-gray-500 mt-1">Esta é a mensagem inicial que será enviada. Use as variáveis abaixo.</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Variáveis Disponíveis</label>
              <div className="flex flex-wrap gap-2">
                {availableVariables.map(v => (
                  <button type="button" key={v.value} onClick={() => handleInsertVariable(v.value)} className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition-colors">
                    {v.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end items-center gap-4 pt-4 border-t">
              {selectedConfig && (
                <button type="button" onClick={() => handleDelete(selectedConfig.id)} className="text-red-600 hover:text-red-800 font-semibold flex items-center gap-2">
                  <Trash2 size={16} /> Excluir
                </button>
              )}
              <button type="submit" disabled={isSaving} className="flex items-center gap-2 bg-brand-green text-white font-semibold py-2 px-5 rounded-lg shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400">
                {isSaving ? <><Loader2 className="animate-spin" size={20} /> Salvando...</> : <><Save size={20} /> Salvar</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Configs;

