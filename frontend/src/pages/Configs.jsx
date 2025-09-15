import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
// PASSO 2.1: Importar a nova biblioteca
import TextareaAutosize from 'react-textarea-autosize';
import { 
    Plus, Save, Trash2, FileText, ChevronRight, Loader2, X, 
    User, MessageCircle, ArrowDownCircle, Info
} from 'lucide-react';

const availableVariables = [
  { name: 'Nome do Contato', value: '{{nome_contato}}' },
  { name: 'Observações do Contato', value: '{{observacoes_contato}}' },
  { name: 'Data Atual', value: '{{data_atual}}' },
  { name: 'Dia da Semana', value: '{{dia_semana}}' },
];

const initialFormData = {
  nome_config: '',
  prompt_config: {
    nome_persona: '',
    empresa_persona: '',
    perfil_persona: '',
    objetivo_persona: '',
    informacoes_essenciais: '',
    fluxo_conversa: [
      { etapa: 1, descricao: 'Inicie a conversa de forma amigável e se apresente.' },
      { etapa: 2, descricao: 'Apresente o motivo do contato e o principal benefício.' },
    ],
  },
};

// Componente para um único cartão de etapa no fluxo
const FlowStepCard = ({ step, index, onFlowChange, onRemoveStep, isLast }) => (
    <>
        <div className="bg-gray-50/80 border border-gray-200 p-4 rounded-xl shadow-sm relative transition-all hover:shadow-md">
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-brand-green-dark">Etapa {step.etapa}</h4>
                <button 
                    type="button" 
                    onClick={() => onRemoveStep(index)} 
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Remover Etapa"
                >
                    <X size={18} />
                </button>
            </div>
            {/* PASSO 2.2: Substituir textarea por TextareaAutosize */}
            <TextareaAutosize
                value={step.descricao}
                onChange={(e) => onFlowChange(index, e.target.value)}
                minRows={2} // Define uma altura mínima de 2 linhas
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green text-sm resize-none"
                placeholder={`Descreva a ação ou mensagem para a etapa ${step.etapa}...`}
            />
        </div>
        {!isLast && (
            <div className="flex justify-center my-2">
                <ArrowDownCircle size={24} className="text-gray-300" />
            </div>
        )}
    </>
);

function Configs() {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('persona');

  const fetchConfigs = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/configs/');
      setConfigs(response.data);
    } catch (err) { setError('Não foi possível carregar as configurações.'); } 
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const handleSelectConfig = (config) => {
    setSelectedConfig(config);
    const newPromptConfig = { ...initialFormData.prompt_config, ...(config.prompt_config || {}), };
    setFormData({ nome_config: config.nome_config, prompt_config: newPromptConfig });
    setActiveTab('persona');
  };

  const handleNewConfig = () => {
    setSelectedConfig(null);
    setFormData(initialFormData);
    setActiveTab('persona');
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, prompt_config: { ...prev.prompt_config, [name]: value } }));
  };
  
  const handleFlowChange = (index, value) => {
    const currentFlow = formData.prompt_config?.fluxo_conversa || [];
    const updatedFlow = [...currentFlow];
    updatedFlow[index].descricao = value;
    setFormData(prev => ({ ...prev, prompt_config: { ...prev.prompt_config, fluxo_conversa: updatedFlow } }));
  };

  const addFlowStep = () => {
    const currentFlow = formData.prompt_config?.fluxo_conversa || [];
    const newStep = { etapa: currentFlow.length + 1, descricao: '' };
    setFormData(prev => ({ ...prev, prompt_config: { ...prev.prompt_config, fluxo_conversa: [...currentFlow, newStep] } }));
  };
  
  const removeFlowStep = (index) => {
    const currentFlow = formData.prompt_config?.fluxo_conversa || [];
    const updatedFlow = currentFlow.filter((_, i) => i !== index).map((step, i) => ({ ...step, etapa: i + 1 })); 
    setFormData(prev => ({ ...prev, prompt_config: { ...prev.prompt_config, fluxo_conversa: updatedFlow } }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    const payload = { nome_config: formData.nome_config, prompt_config: formData.prompt_config };
    try {
      if (selectedConfig && selectedConfig.id) { await api.put(`/configs/${selectedConfig.id}`, payload); } 
      else { await api.post('/configs/', payload); }
      fetchConfigs();
      handleNewConfig();
    } catch (err) { setError('Erro ao salvar. Verifique os campos.'); } 
    finally { setIsSaving(false); }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza?')) {
      try {
        await api.delete(`/configs/${id}`);
        fetchConfigs();
        handleNewConfig();
      } catch (err) { setError('Erro ao excluir.'); }
    }
  };

  const labelClass = "block text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2";
  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green resize-none";

  return (
    <div className="p-6 md:p-10 bg-gray-50 h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Configurações da IA</h1>
        <p className="text-gray-500 mt-1">Crie e gerencie as personalidades e fluxos de conversa da sua IA.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg border flex flex-col">
           <button onClick={handleNewConfig} className="w-full flex items-center justify-center gap-2 bg-brand-green text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-brand-green-dark transition mb-6">
             <Plus size={20} /> Nova Configuração
           </button>
           <h2 className="text-lg font-semibold text-gray-700 mb-3 px-1">Modelos Salvos</h2>
           {isLoading ? <p className="text-center text-gray-500">Carregando...</p> : (
             <ul className="space-y-2 overflow-y-auto">
               {configs.map(config => (
                 <li key={config.id}>
                   <button onClick={() => handleSelectConfig(config)} className={`w-full text-left p-3 rounded-lg flex justify-between items-center transition-all duration-200 ${selectedConfig?.id === config.id ? 'bg-brand-green text-white font-semibold shadow-sm' : 'hover:bg-gray-100 hover:pl-4'}`}>
                     <span>{config.nome_config}</span>
                     <ChevronRight size={18} />
                   </button>
                 </li>
               ))}
                {configs.length === 0 && <p className="text-center text-gray-500 py-4">Nenhum modelo salvo.</p>}
             </ul>
           )}
        </div>

        <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-xl shadow-lg border overflow-y-auto">
          <form onSubmit={handleSave} className="flex flex-col h-full">
            <div className="flex-grow">
              <div className="flex items-center gap-4 mb-6">
                  <FileText className="text-brand-green" size={32}/>
                  <input type="text" placeholder="Dê um nome para esta configuração..." name="nome_config" value={formData.nome_config} onChange={e => setFormData({...formData, nome_config: e.target.value})} required className="w-full text-2xl font-bold text-gray-800 border-b-2 border-gray-200 focus:border-brand-green focus:outline-none py-2 bg-transparent"/>
              </div>

              <div className="flex border-b border-gray-200 mb-6">
                <button type="button" onClick={() => setActiveTab('persona')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'persona' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                    <User size={18} /> Persona
                </button>
                <button type="button" onClick={() => setActiveTab('fluxo')} className={`flex items-center gap-2 px-4 py-3 font-semibold transition-all ${activeTab === 'fluxo' ? 'border-b-2 border-brand-green text-brand-green' : 'text-gray-500 hover:text-gray-800'}`}>
                    <MessageCircle size={18} /> Fluxo de Conversa
                </button>
              </div>

              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              
              {activeTab === 'persona' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="nome_persona" className={labelClass}>Nome da Persona</label>
                      <input id="nome_persona" name="nome_persona" value={formData.prompt_config.nome_persona} onChange={handleFormChange} required className={inputClass} placeholder="Ex: Alex, especialista em vendas"/>
                    </div>
                    <div>
                      <label htmlFor="empresa_persona" className={labelClass}>Empresa da Persona</label>
                      <input id="empresa_persona" name="empresa_persona" value={formData.prompt_config.empresa_persona} onChange={handleFormChange} required className={inputClass} placeholder="Ex: Soluções Inovadoras LTDA"/>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="perfil_persona" className={labelClass}>Perfil e Tom de Voz</label>
                    {/* PASSO 2.3: Substituir textarea por TextareaAutosize */}
                    <TextareaAutosize id="perfil_persona" name="perfil_persona" value={formData.prompt_config.perfil_persona} onChange={handleFormChange} required minRows={3} className={inputClass} placeholder="Descreva a personalidade: amigável, formal, direto..."/>
                  </div>
                  <div>
                    <label htmlFor="objetivo_persona" className={labelClass}>Objetivo Principal</label>
                    {/* PASSO 2.4: Substituir textarea por TextareaAutosize */}
                    <TextareaAutosize id="objetivo_persona" name="objetivo_persona" value={formData.prompt_config.objetivo_persona} onChange={handleFormChange} required minRows={3} className={inputClass} placeholder="O que a IA quer alcançar? Ex: Agendar uma demonstração..."/>
                  </div>
                  
                  <div>
                    <label htmlFor="informacoes_essenciais" className={labelClass}>
                        <Info size={16} className="text-gray-500"/>
                        Informações Essenciais
                    </label>
                     {/* PASSO 2.5: Substituir textarea por TextareaAutosize */}
                    <TextareaAutosize id="informacoes_essenciais" name="informacoes_essenciais" value={formData.prompt_config.informacoes_essenciais} onChange={handleFormChange} required minRows={4} className={inputClass} placeholder="Dados cruciais para a conversa: produto, preço, diferenciais..."/>
                  </div>

                   <div className="p-4 bg-gray-50 rounded-lg border">
                      <h4 className="font-semibold text-gray-600 mb-2">Variáveis Disponíveis</h4>
                      <div className="flex flex-wrap gap-2">
                        {availableVariables.map(v => ( <span key={v.value} className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded-md font-mono">{v.value}</span> ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">Use estas variáveis nos campos de texto para personalizar as mensagens.</p>
                   </div>
                </div>
              )}

              {activeTab === 'fluxo' && (
                <div className="animate-fade-in">
                  {(formData.prompt_config?.fluxo_conversa || []).map((step, index, arr) => (
                      <FlowStepCard 
                          key={index} 
                          step={step} 
                          index={index} 
                          onFlowChange={handleFlowChange} 
                          onRemoveStep={removeFlowStep}
                          isLast={index === arr.length - 1}
                      />
                  ))}
                  <div className="mt-4 flex justify-center">
                      <button type="button" onClick={addFlowStep} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 text-gray-500 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 hover:text-gray-700 transition">
                          <Plus size={20} /> Adicionar Etapa
                      </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end items-center gap-4 pt-6 mt-6 border-t">
              {selectedConfig && (<button type="button" onClick={() => handleDelete(selectedConfig.id)} className="font-semibold text-red-600 hover:text-red-800 flex items-center gap-2 mb-6"><Trash2 size={16} /> Excluir</button>)}
              <button type="submit" disabled={isSaving} className="flex items-center gap-2 bg-brand-green text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-brand-green-dark transition-all disabled:bg-gray-400 disabled:shadow-none mb-6">
                {isSaving ? <><Loader2 className="animate-spin" size={20} /> Salvando...</> : <><Save size={20} /> Salvar Configuração</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Configs;