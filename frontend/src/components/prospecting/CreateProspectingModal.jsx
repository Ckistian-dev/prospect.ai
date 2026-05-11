import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/axiosConfig';
import Modal from '../Modal';
import { 
  Loader2, Check, ChevronDown, Clock, Bell, Target, 
  MessageSquare, Layout, Sparkles, Smartphone, Save, X 
} from 'lucide-react';

const DS_STYLE = `
.modal-input {
  width: 100%;
  height: 3.5rem;
  padding: 0 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 1.25rem;
  background: #ffffff;
  border: 1.5px solid #edf2f7;
  color: #1e293b;
  outline: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.modal-input:focus {
  border-color: #356854;
  box-shadow: 0 0 0 4px rgba(53,104,84,0.08);
}
.modal-label {
  display: block;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #94a3b8;
  margin-bottom: 0.75rem;
  margin-left: 0.5rem;
}
.dropdown-btn {
  width: 100%;
  height: 3.5rem;
  padding: 0 1.25rem;
  background: #ffffff;
  border: 1.5px solid #edf2f7;
  border-radius: 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s;
}
.dropdown-btn:hover {
  border-color: #e2e8f0;
}
.premium-toggle {
  height: 1.5rem;
  width: 2.75rem;
  border-radius: 1rem;
  position: relative;
  transition: all 0.3s;
  cursor: pointer;
}
`;

function CreateProspectingModal({ onClose, onSuccess, prospectToEdit }) {
  const isEditMode = Boolean(prospectToEdit);

  const [formData, setFormData] = useState({
    nome_prospeccao: '',
    categorias_selecionadas: [],
    config_id: '',
    horario_inicio: '',
    horario_fim: '',
    whatsapp_instance_ids: [],
  });

  const [followupEnabled, setFollowupEnabled] = useState(false);
  const [followupValue, setFollowupValue] = useState(1);
  const [followupUnit, setFollowupUnit] = useState('days');

  const [categories, setCategories] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [whatsappInstances, setWhatsappInstances] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);
  const [isInstanceDropdownOpen, setIsInstanceDropdownOpen] = useState(false);
  const instanceDropdownRef = useRef(null);

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
        const allContactsResponse = await api.get('/contacts/?limit=1000000');

        const filteredContacts = allContactsResponse.data.filter(contact =>
          Array.isArray(contact.categoria) &&
          formData.categorias_selecionadas.some(selectedCat => contact.categoria.includes(selectedCat))
        );

        if (isEditMode) {
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

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <style>{DS_STYLE}</style>
      <div className="flex flex-col h-full">
        {/* Header Section */}
        <header className="px-10 py-10 pr-24 bg-white border-b border-slate-100 relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none text-slate-900">
            <Target size={180} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-[#356854]">
                {isEditMode ? <Layout size={20} /> : <Target size={20} />}
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                {isEditMode ? 'Editar Campanha' : 'Nova Prospecção'}
              </h2>
            </div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] ml-[52px]">
              {isEditMode ? 'Ajuste de Parâmetros Operacionais' : 'Configuração de Torre de Disparo'}
            </p>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#f8fafc] px-10 py-8 space-y-10">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-bold animate-in fade-in slide-in-from-top-2">
              <Bell size={18} /> {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-40">
              <Loader2 className="animate-spin text-[#356854]" size={40} />
              <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Opções...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-10 pb-8">
              {/* Basic Info Section */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 px-2">
                  <div className="w-1.5 h-6 bg-[#356854] rounded-full" />
                  <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.15em]">Identificação e Alvo</h4>
                </div>
                
                <div className="grid gap-6">
                  <div>
                    <label className="modal-label">Nome da Campanha</label>
                    <input 
                      type="text" 
                      name="nome_prospeccao" 
                      value={formData.nome_prospeccao} 
                      onChange={handleChange} 
                      required 
                      className="modal-input" 
                      placeholder='Ex: Leads Qualificados Maio' 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="modal-label">Categorias de Contato</label>
                      <div className="relative" ref={categoryDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                          className={`dropdown-btn ${isCategoryDropdownOpen ? 'border-[#356854] ring-4 ring-[#356854]/5' : ''}`}
                        >
                          <span className="text-sm font-bold text-slate-700 truncate">{getCategoryButtonText()}</span>
                          <ChevronDown size={18} className={`text-slate-400 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isCategoryDropdownOpen && (
                          <div className="absolute z-[100] w-full mt-3 bg-white border border-slate-100 rounded-2xl shadow-2xl p-3 space-y-1 max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2">
                            {categories.length > 0 ? (
                              categories.map(cat => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => handleCategoryChange(cat)}
                                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${formData.categorias_selecionadas.includes(cat) ? 'bg-emerald-50 text-[#356854]' : 'hover:bg-slate-50 text-slate-600'}`}
                                >
                                  <span className="text-xs font-bold">{cat}</span>
                                  {formData.categorias_selecionadas.includes(cat) && <Check size={14} />}
                                </button>
                              ))
                            ) : (
                              <p className="p-4 text-xs text-slate-400 font-bold text-center">Nenhuma categoria...</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="modal-label">Modelo de Mensagem (Persona)</label>
                      <div className="relative">
                        <select 
                          name="config_id" 
                          value={formData.config_id} 
                          onChange={handleChange} 
                          required 
                          className="modal-input appearance-none pr-12"
                          disabled={configs.length === 0}
                        >
                          {configs.map(conf => <option key={conf.id} value={conf.id}>{conf.nome_config}</option>)}
                        </select>
                        <ChevronDown size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Channels Section */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 px-2">
                  <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                  <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.15em]">Canais de Saída</h4>
                </div>

                <div className="ds-card bg-white p-6 border border-slate-100 rounded-[2rem]">
                  <label className="modal-label">Instâncias WhatsApp</label>
                  <div className="relative" ref={instanceDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsInstanceDropdownOpen(!isInstanceDropdownOpen)}
                      className={`dropdown-btn ${isInstanceDropdownOpen ? 'border-[#356854] ring-4 ring-[#356854]/5' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone size={16} className="text-slate-400" />
                        <span className="text-sm font-bold text-slate-700 truncate">{getInstanceButtonText()}</span>
                      </div>
                      <ChevronDown size={18} className={`text-slate-400 transition-transform ${isInstanceDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isInstanceDropdownOpen && (
                      <div className="absolute z-[100] w-full mt-3 bg-white border border-slate-100 rounded-2xl shadow-2xl p-3 space-y-1 max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2">
                        {whatsappInstances.length > 0 ? (
                          whatsappInstances.map(inst => (
                            <button
                              key={inst.id}
                              type="button"
                              onClick={() => handleInstanceChange(inst.id)}
                              className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${formData.whatsapp_instance_ids?.includes(inst.id) ? 'bg-emerald-50 text-[#356854]' : 'hover:bg-slate-50 text-slate-600'}`}
                            >
                              <span className="text-xs font-bold">{inst.name}</span>
                              {formData.whatsapp_instance_ids?.includes(inst.id) && <Check size={14} />}
                            </button>
                          ))
                        ) : (
                          <p className="p-4 text-xs text-slate-400 font-bold text-center">Nenhuma instância conectada.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Schedule and Followup Section */}
              <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-2">
                    <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
                    <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.15em]">Expediente</h4>
                  </div>
                  
                  <div className="p-6 bg-white rounded-[2rem] border border-slate-100 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block ml-2">Início</label>
                        <div className="relative">
                          <Clock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                          <input type="time" name="horario_inicio" value={formData.horario_inicio} onChange={handleChange} className="modal-input !h-12 !pl-10 !text-xs" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block ml-2">Término</label>
                        <div className="relative">
                          <Clock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                          <input type="time" name="horario_fim" value={formData.horario_fim} onChange={handleChange} className="modal-input !h-12 !pl-10 !text-xs" />
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold leading-relaxed px-2 italic">A IA respeitará estes horários para envios e follow-ups automáticos.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-2">
                    <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                    <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.15em]">Follow-up IA</h4>
                  </div>

                  <div className="p-6 bg-white rounded-[2rem] border border-slate-100 space-y-6">
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-3">
                        <Sparkles size={16} className="text-indigo-500" />
                        <span className="text-sm font-bold text-slate-700">Retomada Automática</span>
                      </div>
                      <div 
                        onClick={() => setFollowupEnabled(!followupEnabled)} 
                        className={`premium-toggle ${followupEnabled ? 'bg-indigo-500' : 'bg-slate-200'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${followupEnabled ? 'right-1' : 'left-1'}`} />
                      </div>
                    </div>

                    {followupEnabled && (
                      <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                        <input
                          type="number"
                          value={followupValue}
                          onChange={(e) => setFollowupValue(e.target.value)}
                          min="1"
                          className="modal-input !h-12 !text-xs"
                        />
                        <div className="relative">
                          <select
                            value={followupUnit}
                            onChange={(e) => setFollowupUnit(e.target.value)}
                            className="modal-input !h-12 !text-xs appearance-none"
                          >
                            <option value="minutes">Minutos</option>
                            <option value="hours">Horas</option>
                            <option value="days">Dias</option>
                          </select>
                          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 font-bold leading-relaxed px-2 italic">Reengajamento inteligente após inatividade do lead.</p>
                  </div>
                </div>
              </section>

              {/* Hidden trigger to handle form submission */}
              <button type="submit" className="hidden" id="modal-submit-trigger" />
            </form>
          )}
        </div>

        {/* Footer Section */}
        <footer className="px-10 py-8 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            disabled={isSaving} 
            className="h-14 px-8 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
          >
            Cancelar
          </button>
          <button 
            type="button" 
            onClick={() => document.getElementById('modal-submit-trigger').click()}
            disabled={isSaving || isLoading || (!isEditMode && formData.categorias_selecionadas.length === 0)} 
            className="h-14 px-10 bg-[#356854] text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-emerald-900/10 hover:bg-[#2d5847] transition-all flex items-center gap-3 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {isSaving ? 'Processando...' : (isEditMode ? 'Salvar Alterações' : 'Criar Campanha')}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

export default CreateProspectingModal;