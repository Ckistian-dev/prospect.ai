import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/axiosConfig';
import Modal from '../Modal';
import { Loader2, Check, ChevronDown, Clock } from 'lucide-react';

function CreateProspectingModal({ onClose, onSuccess, prospectToEdit }) {
  const isEditMode = Boolean(prospectToEdit);

  const [formData, setFormData] = useState({
    nome_prospeccao: '',
    categorias_selecionadas: [],
    config_id: '',
    horario_inicio: '',
    horario_fim: '',
  });

  const [initialIntervalValue, setInitialIntervalValue] = useState(90);
  const [initialIntervalUnit, setInitialIntervalUnit] = useState('seconds');

  const [followupEnabled, setFollowupEnabled] = useState(false);
  const [followupValue, setFollowupValue] = useState(1);
  const [followupUnit, setFollowupUnit] = useState('days');

  const [categories, setCategories] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isEditMode && prospectToEdit) {
      setFormData({
        nome_prospeccao: prospectToEdit.nome_prospeccao,
        config_id: prospectToEdit.config_id,
        categorias_selecionadas: [],
        horario_inicio: prospectToEdit.horario_inicio || '',
        horario_fim: prospectToEdit.horario_fim || '',
      });

      if (prospectToEdit.followup_interval_minutes > 0) {
        setFollowupEnabled(true);
        const totalMinutes = prospectToEdit.followup_interval_minutes;
        if (totalMinutes % 1440 === 0) {
          setFollowupValue(totalMinutes / 1440);
          setFollowupUnit('days');
        } else if (totalMinutes % 60 === 0) {
          setFollowupValue(totalMinutes / 60);
          setFollowupUnit('hours');
        } else {
          setFollowupValue(totalMinutes);
          setFollowupUnit('minutes');
        }
      } else {
        setFollowupEnabled(false);
      }

      const initialSeconds = prospectToEdit.initial_message_interval_seconds;
      if (initialSeconds >= 60 && initialSeconds % 60 === 0) {
        setInitialIntervalValue(initialSeconds / 60);
        setInitialIntervalUnit('minutes');
      } else {
        setInitialIntervalValue(initialSeconds);
        setInitialIntervalUnit('seconds');
      }
    }
  }, [isEditMode, prospectToEdit]);

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

        if (!isEditMode && configsRes.data.length > 0) {
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
  }, [isEditMode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (category) => {
    setFormData(prev => {
      const currentSelection = prev.categorias_selecionadas;
      if (currentSelection.includes(category)) {
        return { ...prev, categorias_selecionadas: currentSelection.filter(cat => cat !== category) };
      } else {
        return { ...prev, categorias_selecionadas: [...currentSelection, category] };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    if (!isEditMode && formData.categorias_selecionadas.length === 0) {
      setError("Por favor, selecione pelo menos uma categoria de contatos para criar uma campanha.");
      setIsSaving(false);
      return;
    }

    try {
      let contact_ids_to_process = [];
      if (formData.categorias_selecionadas.length > 0) {
          const allContactsResponse = await api.get('/contacts/');
          
          const filteredContacts = allContactsResponse.data.filter(contact => 
              Array.isArray(contact.categoria) && 
              formData.categorias_selecionadas.some(selectedCat => contact.categoria.includes(selectedCat))
          );
        
          if(isEditMode) {
              const existingContactIds = new Set(prospectToEdit.contact_ids);
              contact_ids_to_process = filteredContacts.map(c => c.id).filter(id => !existingContactIds.has(id));
          } else {
              contact_ids_to_process = filteredContacts.map(c => c.id);
          }

          if (!isEditMode && contact_ids_to_process.length === 0) {
            setError(`Nenhum contato encontrado para as categorias selecionadas.`);
            setIsSaving(false); return;
          }
      }
      
      let followup_interval_minutes = 0;
      if (followupEnabled && followupValue > 0) {
        const value = parseInt(followupValue, 10);
        if (followupUnit === 'minutes') followup_interval_minutes = value;
        else if (followupUnit === 'hours') followup_interval_minutes = value * 60;
        else if (followupUnit === 'days') followup_interval_minutes = value * 60 * 24;
      }
      
      let initial_message_interval_seconds = 0;
      const intervalValue = parseInt(initialIntervalValue, 10);
      if(initialIntervalUnit === 'seconds') {
        initial_message_interval_seconds = intervalValue;
      } else if (initialIntervalUnit === 'minutes') {
        initial_message_interval_seconds = intervalValue * 60;
      }
      
      if (isEditMode) {
        const updatePayload = {
          nome_prospeccao: formData.nome_prospeccao,
          config_id: parseInt(formData.config_id, 10),
          followup_interval_minutes,
          initial_message_interval_seconds,
          contact_ids_to_add: contact_ids_to_process,
          horario_inicio: formData.horario_inicio || null,
          horario_fim: formData.horario_fim || null,
        };
        const response = await api.put(`/prospecting/${prospectToEdit.id}`, updatePayload);
        onSuccess(response.data);
      } else {
        const createPayload = {
          nome_prospeccao: formData.nome_prospeccao,
          config_id: parseInt(formData.config_id, 10),
          contact_ids: contact_ids_to_process,
          followup_interval_minutes,
          initial_message_interval_seconds,
          horario_inicio: formData.horario_inicio || null,
          horario_fim: formData.horario_fim || null,
        };
        const response = await api.post('/prospecting/', createPayload);
        onSuccess(response.data);
      }
      
      onClose();

    } catch (err) {
      console.error("Erro ao salvar prospecção:", err);
      setError(err.response?.data?.detail || `Ocorreu um erro ao ${isEditMode ? 'editar' : 'criar'} a campanha.`);
    } finally {
      setIsSaving(false);
    }
  };

  const getCategoryButtonText = () => {
    const count = formData.categorias_selecionadas.length;
    if (count === 0) return "Selecione as categorias...";
    if (count === 1) return formData.categorias_selecionadas[0];
    return `${count} categorias selecionadas`;
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          {isEditMode ? 'Editar Campanha' : 'Criar Nova Prospecção'}
        </h2>
        
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">{error}</div>}

        {isLoading ? (
          <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin text-brand-green" size={32} /></div>
        ) : (
          <div className="space-y-6">
            <div>
              <label htmlFor="nome_prospeccao" className="block text-sm font-medium text-gray-600 mb-1">Nome da Campanha</label>
              <input type="text" name="nome_prospeccao" value={formData.nome_prospeccao} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" placeholder='Prospecção de Clientes'/>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                {isEditMode ? 'Adicionar Contatos de Novas Categorias' : 'Categorias dos Contatos'}
              </label>
              <div className="relative" ref={categoryDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-brand-green"
                >
                  <span className="text-gray-700 truncate">{getCategoryButtonText()}</span>
                  <ChevronDown size={20} className={`text-gray-400 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isCategoryDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {categories.length > 0 ? (
                      <div className="p-2 space-y-1">
                        {categories.map(cat => (
                          <label key={cat} className="flex items-center space-x-3 cursor-pointer p-2 rounded-md hover:bg-gray-100">
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
                      <p className="p-4 text-sm text-gray-500">Nenhuma categoria encontrada.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="config_id" className="block text-sm font-medium text-gray-600 mb-1">Modelo de Mensagem</label>
              <select name="config_id" value={formData.config_id} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" disabled={configs.length === 0}>
                {configs.map(conf => <option key={conf.id} value={conf.id}>{conf.nome_config}</option>)}
              </select>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="horario_inicio" className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-1">
                        <Clock size={14}/> Início do Expediente
                    </label>
                    <input type="time" name="horario_inicio" value={formData.horario_inicio} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" />
                </div>
                <div>
                    <label htmlFor="horario_fim" className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-1">
                        <Clock size={14}/> Fim do Expediente
                    </label>
                    <input type="time" name="horario_fim" value={formData.horario_fim} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" />
                </div>
            </div>
            <p className="text-xs text-gray-500 -mt-4">
                O agente só enviará mensagens iniciais e follow-ups dentro do expediente. Deixe em branco para operar 24h.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Intervalo entre Novas Conversas</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input 
                    type="number"
                    id="initial_interval_value"
                    value={initialIntervalValue}
                    onChange={(e) => setInitialIntervalValue(e.target.value)}
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
                <div>
                  <select 
                    id="initial_interval_unit"
                    value={initialIntervalUnit}
                    onChange={(e) => setInitialIntervalUnit(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green"
                  >
                    <option value="seconds">Segundos</option>
                    <option value="minutes">Minutos</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">Define o tempo mínimo de espera antes de iniciar a próxima conversa.</p>
            </div>

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
          <button type="submit" disabled={isSaving || isLoading || (!isEditMode && formData.categorias_selecionadas.length === 0)} className="px-4 py-2 bg-brand-green text-white rounded-md hover:bg-brand-green-dark transition flex items-center gap-2 disabled:bg-brand-green-light disabled:cursor-not-allowed">
            {isSaving && <Loader2 className="animate-spin" size={18} />}
            {isSaving ? 'Salvando...' : (isEditMode ? 'Salvar Alterações' : 'Criar Campanha')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default CreateProspectingModal;