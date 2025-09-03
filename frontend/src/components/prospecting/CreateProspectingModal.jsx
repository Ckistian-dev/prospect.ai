import React, { useState, useEffect } from 'react';
import api from '../../api/axiosConfig';
import Modal from '../Modal';
import { Loader2 } from 'lucide-react';

function CreateProspectingModal({ onClose, onSuccess }) {
  // Seus estados existentes
  const [categories, setCategories] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [formData, setFormData] = useState({
    nome_prospeccao: '',
    categoria_contatos: '',
    config_id: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // Novo estado para exibir erros de forma mais amigável
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

        // Define valores iniciais para os selects para evitar que fiquem vazios
        if (categoriesRes.data.length > 0) {
          setFormData(prev => ({ ...prev, categoria_contatos: categoriesRes.data[0] }));
        }
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

  // --- LÓGICA DE SUBMISSÃO CORRIGIDA ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(''); // Limpa erros anteriores

    try {
      // 1. Busca todos os contatos
      const allContactsResponse = await api.get('/contacts/');
      const allContacts = allContactsResponse.data;

      // 2. Filtra os contatos pela categoria selecionada no formulário
      const filteredContacts = allContacts.filter(contact => 
        Array.isArray(contact.categoria) && contact.categoria.includes(formData.categoria_contatos)
      );

      // 3. Extrai apenas os IDs dos contatos encontrados
      const contact_ids = filteredContacts.map(contact => contact.id);

      // 4. Valida se existem contatos para a categoria
      if (contact_ids.length === 0) {
        setError(`Nenhum contato encontrado para a categoria "${formData.categoria_contatos}".`);
        setIsSaving(false);
        return; // Interrompe a submissão
      }

      // 5. Monta o payload final com os dados corretos que a API espera
      const payload = {
        nome_prospeccao: formData.nome_prospeccao,
        config_id: parseInt(formData.config_id, 10),
        contact_ids: contact_ids,
      };

      // 6. Envia o payload correto para a API
      await api.post('/prospecting/', payload);
      
      onSuccess('Campanha criada com sucesso!'); // Chama o callback de sucesso
      onClose(); // Fecha o modal

    } catch (err) {
      console.error("Erro ao criar prospecção:", err);
      // Mostra uma mensagem de erro mais informativa
      setError(err.response?.data?.detail || 'Não foi possível criar a prospecção.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Criar Nova Prospecção</h2>
        
        {/* Exibe o erro de forma mais visível */}
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">{error}</div>}

        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <Loader2 className="animate-spin text-brand-green" size={32} />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="nome_prospeccao" className="block text-sm font-medium text-gray-600 mb-1">Nome da Campanha</label>
              <input type="text" name="nome_prospeccao" value={formData.nome_prospeccao} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" />
            </div>
            <div>
              <label htmlFor="categoria_contatos" className="block text-sm font-medium text-gray-600 mb-1">Categoria dos Contatos</label>
              <select name="categoria_contatos" value={formData.categoria_contatos} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" disabled={categories.length === 0}>
                {categories.length === 0 ? (
                  <option>Nenhuma categoria encontrada</option>
                ) : (
                  categories.map(cat => <option key={cat} value={cat}>{cat}</option>)
                )}
              </select>
            </div>
            <div>
              <label htmlFor="config_id" className="block text-sm font-medium text-gray-600 mb-1">Modelo de Mensagem (Persona/Prompt)</label>
              <select name="config_id" value={formData.config_id} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" disabled={configs.length === 0}>
                {configs.length === 0 ? (
                  <option>Nenhuma configuração encontrada</option>
                ) : (
                  configs.map(conf => <option key={conf.id} value={conf.id}>{conf.nome_config}</option>)
                )}
              </select>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-4 mt-8">
          <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition">Cancelar</button>
          <button type="submit" disabled={isSaving || isLoading} className="px-4 py-2 bg-brand-green text-white rounded-md hover:bg-brand-green-dark transition flex items-center gap-2 disabled:bg-brand-green-light disabled:cursor-not-allowed">
            {isSaving && <Loader2 className="animate-spin" size={18} />}
            {isSaving ? 'Criando...' : 'Criar Campanha'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default CreateProspectingModal;

