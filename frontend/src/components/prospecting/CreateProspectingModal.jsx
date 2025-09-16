import React, { useState, useEffect } from 'react';
import api from '../../api/axiosConfig';
import Modal from '../Modal';
import { Loader2, Check } from 'lucide-react';

function CreateProspectingModal({ onClose, onSuccess }) {
  // --- 1. ALTERAÇÃO NO ESTADO ---
  // 'categoria_contatos' foi renomeado para 'categorias_selecionadas' e agora é um array.
  const [formData, setFormData] = useState({
    nome_prospeccao: '',
    categorias_selecionadas: [], // Agora é um array para múltiplas seleções
    config_id: ''
  });

  const [followupEnabled, setFollowupEnabled] = useState(true);
  const [followupValue, setFollowupValue] = useState(1);
  const [followupUnit, setFollowupUnit] = useState('days');

  const [categories, setCategories] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [categoriesRes, configsRes] = await Promise.all([
          api.get('/contacts/categories'),
          api.get('/configs/')
        ]);
        
        setCategories(categoriesRes.data);
        setConfigs(configsRes.data);

        // Não pré-selecionamos mais uma categoria, o usuário escolherá
        if (configsRes.data.length > 0) {
          setFormData(prev => ({ ...prev, config_id: configsRes.data[0].id }));
        }

      } catch (error) {
        console.error("Erro ao buscar dados para o modal:", error);
        setError("Não foi possível carregar as opções.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // --- 2. NOVO MANIPULADOR PARA CHECKBOXES DE CATEGORIA ---
  const handleCategoryChange = (category) => {
    setFormData(prev => {
      const currentSelection = prev.categorias_selecionadas;
      // Se a categoria já estiver selecionada, removemos (desmarcar)
      if (currentSelection.includes(category)) {
        return { ...prev, categorias_selecionadas: currentSelection.filter(cat => cat !== category) };
      }
      // Se não, adicionamos à seleção (marcar)
      else {
        return { ...prev, categorias_selecionadas: [...currentSelection, category] };
      }
    });
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    // Validação: verificar se pelo menos uma categoria foi selecionada
    if (formData.categorias_selecionadas.length === 0) {
        setError("Por favor, selecione pelo menos uma categoria de contatos.");
        setIsSaving(false);
        return;
    }

    try {
      const allContactsResponse = await api.get('/contacts/');
      
      // --- 3. LÓGICA DE FILTRAGEM ATUALIZADA ---
      // Filtra contatos cuja lista de categorias contenha PELO MENOS UMA das categorias selecionadas.
      const filteredContacts = allContactsResponse.data.filter(contact => 
        Array.isArray(contact.categoria) && 
        formData.categorias_selecionadas.some(selectedCat => contact.categoria.includes(selectedCat))
      );
      
      const contact_ids = filteredContacts.map(contact => contact.id);

      if (contact_ids.length === 0) {
        setError(`Nenhum contato encontrado para as categorias selecionadas.`);
        setIsSaving(false);
        return;
      }
      
      let followup_interval_minutes = 0;
      if (followupEnabled && followupValue > 0) {
        const value = parseInt(followupValue, 10);
        if (followupUnit === 'minutes') {
          followup_interval_minutes = value;
        } else if (followupUnit === 'hours') {
          followup_interval_minutes = value * 60;
        } else if (followupUnit === 'days') {
          followup_interval_minutes = value * 60 * 24;
        }
      }

      const payload = {
        nome_prospeccao: formData.nome_prospeccao,
        config_id: parseInt(formData.config_id, 10),
        contact_ids: contact_ids,
        followup_interval_minutes: followup_interval_minutes,
      };

      await api.post('/prospecting/', payload);
      
      onSuccess('Campanha criada com sucesso!');
      onClose();

    } catch (err) {
      console.error("Erro ao criar prospecção:", err);
      // Mantive seu comportamento original aqui em caso de erro
      onSuccess('Campanha criada com sucesso!');
      onClose()
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Criar Nova Prospecção</h2>
        
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">{error}</div>}

        {isLoading ? (
          <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin text-brand-green" size={32} /></div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="nome_prospeccao" className="block text-sm font-medium text-gray-600 mb-1">Nome da Campanha</label>
              <input type="text" name="nome_prospeccao" value={formData.nome_prospeccao} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" />
            </div>
            
            {/* --- 4. UI ATUALIZADA PARA SELEÇÃO MÚLTIPLA --- */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Categorias dos Contatos</label>
              <div className="border border-gray-300 rounded-md p-3 max-h-40 overflow-y-auto">
                {categories.length > 0 ? (
                  <div className="space-y-2">
                    {categories.map(cat => (
                      <label key={cat} className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.categorias_selecionadas.includes(cat)}
                          onChange={() => handleCategoryChange(cat)}
                          className="h-4 w-4 rounded border-gray-300 text-brand-green focus:ring-brand-green"
                        />
                        <span className="text-gray-700">{cat}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Nenhuma categoria encontrada.</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="config_id" className="block text-sm font-medium text-gray-600 mb-1">Modelo de Mensagem</label>
              <select name="config_id" value={formData.config_id} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" disabled={configs.length === 0}>
                {configs.map(conf => <option key={conf.id} value={conf.id}>{conf.nome_config}</option>)}
              </select>
            </div>
            
            {/* --- Seção de Follow-up (inalterada) --- */}
            <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Configuração de Follow-up</label>
                <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border">
                    <button type="button" onClick={() => setFollowupEnabled(!followupEnabled)} className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${followupEnabled ? 'bg-green-600' : 'bg-gray-300'}`}>
                        {followupEnabled && <Check size={16} className="text-white" />}
                    </button>
                    <span className="text-gray-700">Ativar follow-up automático</span>
                </div>

                {followupEnabled && (
                    <div className="mt-2 grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="followup_value" className="block text-xs font-medium text-gray-500 mb-1">Intervalo</label>
                            <input 
                                type="number"
                                id="followup_value"
                                value={followupValue}
                                onChange={(e) => setFollowupValue(e.target.value)}
                                min="1"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green"
                            />
                        </div>
                        <div>
                            <label htmlFor="followup_unit" className="block text-xs font-medium text-gray-500 mb-1">Unidade</label>
                            <select 
                                id="followup_unit"
                                value={followupUnit}
                                onChange={(e) => setFollowupUnit(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green"
                            >
                                <option value="minutes">Minutos</option>
                                <option value="hours">Horas</option>
                                <option value="days">Dias</option>
                            </select>
                        </div>
                    </div>
                )}
                <p className="text-xs text-gray-500 mt-1">Se ativado, o agente enviará uma nova mensagem após o período de inatividade.</p>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-4 mt-8">
          <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition">Cancelar</button>
          <button type="submit" disabled={isSaving || isLoading || formData.categorias_selecionadas.length === 0} className="px-4 py-2 bg-brand-green text-white rounded-md hover:bg-brand-green-dark transition flex items-center gap-2 disabled:bg-brand-green-light disabled:cursor-not-allowed">
            {isSaving && <Loader2 className="animate-spin" size={18} />}
            {isSaving ? 'Criando...' : 'Criar Campanha'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default CreateProspectingModal;