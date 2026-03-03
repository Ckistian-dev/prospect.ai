import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/axiosConfig';
import Modal from '../Modal';
import { Loader2, Check, ChevronDown, Clock, Bell } from 'lucide-react';

function CreateProspectingModal({ onClose, onSuccess, prospectToEdit }) {
  const isEditMode = Boolean(prospectToEdit);

  const [formData, setFormData] = useState({
    nome_prospeccao: '',
    categorias_selecionadas: [],
    config_id: '',
    horario_inicio: '',
    horario_fim: '',
    notification_number: '',
    notification_instance_id: null,
    whatsapp_instance_ids: [],
  });

  const [followupEnabled, setFollowupEnabled] = useState(false);
  const [followupValue, setFollowupValue] = useState(1);
  const [followupUnit, setFollowupUnit] = useState('days');

  const [categories, setCategories] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [whatsappInstances, setWhatsappInstances] = useState([]);
  const [notificationDestinations, setNotificationDestinations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);
  const [isInstanceDropdownOpen, setIsInstanceDropdownOpen] = useState(false);
  const instanceDropdownRef = useRef(null);
  const [isNotificationDropdownOpen, setIsNotificationDropdownOpen] = useState(false);
  const [currentNotificationInstanceId, setCurrentNotificationInstanceId] = useState(null);
  const [notificationSearch, setNotificationSearch] = useState('');

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setIsCategoryDropdownOpen(false);
      }
      if (instanceDropdownRef.current && !instanceDropdownRef.current.contains(event.target)) {
        setIsInstanceDropdownOpen(false);
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
        categorias_selecionadas: prospectToEdit.categorias || [],
        horario_inicio: prospectToEdit.horario_inicio || '',
        horario_fim: prospectToEdit.horario_fim || '',
        notification_number: prospectToEdit.notification_number || '',
        notification_instance_id: prospectToEdit.notification_instance_id || null,
        whatsapp_instance_ids: prospectToEdit.whatsapp_instance_ids || [],
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
    }
  }, [isEditMode, prospectToEdit]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [categoriesRes, configsRes, instancesRes] = await Promise.all([
          api.get('/contacts/categories'),
          api.get('/configs/'),
          api.get('/whatsapp/')
        ]);
        
        setCategories(categoriesRes.data);
        setConfigs(configsRes.data);
        setWhatsappInstances(instancesRes.data);

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

  useEffect(() => {
    const loadDestinations = async () => {
      let instanceId = null;
      if (formData.whatsapp_instance_ids && formData.whatsapp_instance_ids.length > 0) {
        instanceId = formData.whatsapp_instance_ids[0];
      } else if (whatsappInstances.length > 0) {
        instanceId = whatsappInstances[0].id;
      }

      if (instanceId) {
        setCurrentNotificationInstanceId(instanceId);
        api.get(`/prospecting/whatsapp/destinations/${instanceId}`)
           .then(res => setNotificationDestinations(res.data))
           .catch(console.error);
      }
    };
    loadDestinations();
  }, [whatsappInstances, formData.whatsapp_instance_ids]);

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

  const handleInstanceChange = (instanceId) => {
    setFormData(prev => {
      const currentSelection = prev.whatsapp_instance_ids || [];
      if (currentSelection.includes(instanceId)) {
        return { ...prev, whatsapp_instance_ids: currentSelection.filter(id => id !== instanceId) };
      } else {
        return { ...prev, whatsapp_instance_ids: [...currentSelection, instanceId] };
      }
    });
  };

  const getInstanceButtonText = () => {
    const count = (formData.whatsapp_instance_ids || []).length;
    if (count === 0) return "Selecione as instâncias...";
    if (count === 1) {
        const id = formData.whatsapp_instance_ids[0];
        const inst = whatsappInstances.find(i => i.id === id);
        return inst ? inst.name : "1 instância selecionada";
    }
    return `${count} instâncias selecionadas`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    if (!formData.config_id) {
      setError("Por favor, selecione um Modelo de Mensagem (Persona) para a campanha.");
      setIsSaving(false);
      return;
    }

    if (!isEditMode && formData.categorias_selecionadas.length === 0) {
      setError("Por favor, selecione pelo menos uma categoria de contatos para criar uma campanha.");
      setIsSaving(false);
      return;
    }

    try {
      let contact_ids_to_process = [];
      if (formData.categorias_selecionadas.length > 0) {
          // Busca todos os contatos com um limite muito alto para garantir a filtragem correta de toda a base
          const allContactsResponse = await api.get('/contacts/?limit=1000000');
          
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
      
      if (isEditMode) {
        const updatePayload = {
          nome_prospeccao: formData.nome_prospeccao,
          config_id: parseInt(formData.config_id, 10),
          followup_interval_minutes,
          contact_ids_to_add: contact_ids_to_process,
          horario_inicio: formData.horario_inicio || null,
          horario_fim: formData.horario_fim || null,
          notification_number: formData.notification_number || null,
          notification_instance_id: formData.notification_instance_id,
          whatsapp_instance_ids: formData.whatsapp_instance_ids,
          categorias: formData.categorias_selecionadas,
        };
        const response = await api.put(`/prospecting/${prospectToEdit.id}`, updatePayload);
        onSuccess(response.data);
      } else {
        const createPayload = {
          nome_prospeccao: formData.nome_prospeccao,
          config_id: parseInt(formData.config_id, 10),
          contact_ids: contact_ids_to_process,
          followup_interval_minutes,
          horario_inicio: formData.horario_inicio || null,
          horario_fim: formData.horario_fim || null,
          notification_number: formData.notification_number || null,
          notification_instance_id: formData.notification_instance_id,
          whatsapp_instance_ids: formData.whatsapp_instance_ids,
          categorias: formData.categorias_selecionadas,
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

  const filteredDestinations = notificationDestinations.filter(dest => 
    dest.name?.toLowerCase().includes(notificationSearch.toLowerCase()) || 
    dest.id?.toLowerCase().includes(notificationSearch.toLowerCase())
  );

  const selectedDestinationName = notificationDestinations.find(d => d.id === formData.notification_number)?.name || formData.notification_number;

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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Instâncias de Envio (WhatsApp)
              </label>
              <div className="relative" ref={instanceDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsInstanceDropdownOpen(!isInstanceDropdownOpen)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-brand-green"
                >
                  <span className="text-gray-700 truncate">{getInstanceButtonText()}</span>
                  <ChevronDown size={20} className={`text-gray-400 transition-transform ${isInstanceDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isInstanceDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {whatsappInstances.length > 0 ? (
                      <div className="p-2 space-y-1">
                        {whatsappInstances.map(inst => (
                          <label key={inst.id} className="flex items-center space-x-3 cursor-pointer p-2 rounded-md hover:bg-gray-100">
                            <input
                              type="checkbox"
                              checked={(formData.whatsapp_instance_ids || []).includes(inst.id)}
                              onChange={() => handleInstanceChange(inst.id)}
                              className="h-4 w-4 rounded border-gray-300 text-brand-green focus:ring-brand-green"
                            />
                            <span className="text-gray-700">{inst.name}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="p-4 text-sm text-gray-500">Nenhuma instância conectada.</p>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">Selecione quais números enviarão as mensagens desta campanha.</p>
            </div>

            <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-1">
                    <Bell size={14}/> Notificar Atualizações (Leads/Atendentes)
                </label>
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsNotificationDropdownOpen(!isNotificationDropdownOpen)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-brand-green"
                    >
                        <span className="text-gray-700 truncate">{selectedDestinationName || "Selecione um número ou grupo..."}</span>
                        <ChevronDown size={20} className="text-gray-400" />
                    </button>
                    
                    {isNotificationDropdownOpen && (
                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            <div className="p-2 sticky top-0 bg-white border-b">
                                <input 
                                    type="text" 
                                    placeholder="Buscar..." 
                                    className="w-full px-2 py-1 border rounded text-sm"
                                    value={notificationSearch}
                                    onChange={(e) => setNotificationSearch(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="p-1">
                                <div className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-gray-500 italic" onClick={() => { setFormData(prev => ({...prev, notification_number: '', notification_instance_id: null})); setIsNotificationDropdownOpen(false); }}>
                                    Nenhuma notificação
                                </div>
                                {filteredDestinations.map(dest => (
                                    <div key={dest.id} className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center" onClick={() => { setFormData(prev => ({...prev, notification_number: dest.id, notification_instance_id: currentNotificationInstanceId})); setIsNotificationDropdownOpen(false); }}>
                                        <span className="text-gray-800">{dest.name}</span>
                                        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{dest.type === 'group' ? 'Grupo' : 'Contato'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Enviaremos um aviso quando um lead for qualificado ou solicitar atendente.</p>
            </div>
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