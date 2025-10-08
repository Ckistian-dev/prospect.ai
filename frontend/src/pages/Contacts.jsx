import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import Modal from '../components/Modal';
import { Plus, Edit, Trash2, Search, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, AlertTriangle, Upload, Download, Loader2, RefreshCw } from 'lucide-react';

// --- COMPONENTE SYNC SHEET MODAL (NOVO) ---
const SyncSheetModal = ({ onClose, onSuccess }) => {
    const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState('');

    const handleSync = async () => {
        if (!spreadsheetUrl) {
            setSyncError("Por favor, insira o link de publicação da planilha.");
            return;
        }
        setIsSyncing(true);
        setSyncError('');
        try {
            const response = await api.post('/contacts/sync/csv', { url: spreadsheetUrl });
            onSuccess(response.data.message || 'Planilha sincronizada com sucesso!');
            onClose();
        } catch (err) {
            setSyncError(err.response?.data?.detail || 'Falha ao sincronizar. Verifique o link e as permissões.');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <Modal onClose={onClose}>
            <div className="p-6">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">Sincronizar com Google Sheets</h2>
                <div className="space-y-6">
                    <div>
                        <label htmlFor="spreadsheet_url" className="block text-sm font-medium text-gray-700 mb-1">Link de Publicação da Planilha (.csv)</label>
                        <input
                            type="url"
                            id="spreadsheet_url"
                            value={spreadsheetUrl}
                            onChange={(e) => setSpreadsheetUrl(e.target.value)}
                            placeholder="Cole aqui o link de publicação .csv..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green"
                        />
                        {syncError && <p className="text-red-500 text-sm mt-2">{syncError}</p>}
                    </div>

                    <div className="p-4 bg-gray-50 rounded-lg border text-sm text-gray-600 space-y-4">
                        <div>
                            <h4 className="font-semibold text-gray-800">Passo 1: Publicar a Planilha como CSV</h4>
                            <ol className="list-decimal list-inside space-y-1 mt-1">
                                <li>Na sua Planilha Google, vá em <strong>Arquivo</strong> → <strong>Compartilhar</strong> → <strong>Publicar na web</strong>.</li>
                                <li>Na janela que abre, em <strong>"Link"</strong>, selecione a aba (página) que contém seus contatos.</li>
                                <li>No segundo menu, selecione o formato <strong>"Valores separados por vírgula (.csv)"</strong>.</li>
                                <li>Clique no botão verde <strong>Publicar</strong> e confirme.</li>
                            </ol>
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-800">Passo 2: Copiar o Link Publicado</h4>
                            <p className="mt-1">
                                Após publicar, o Google irá gerar um link. <strong>Copie este link completo</strong> e cole-o no campo acima.
                            </p>
                        </div>
                         <div>
                            <h4 className="font-semibold text-gray-800">Estrutura da Planilha</h4>
                            <p className="mt-1">
                                Sua planilha deve ter as colunas com os cabeçalhos: <strong>nome</strong>, <strong>whatsapp</strong>, <strong>categoria</strong>, e <strong>observacoes</strong>.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-4 mt-8">
                    <button type="button" onClick={onClose} disabled={isSyncing} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition">Cancelar</button>
                    <button
                        type="button"
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-green text-white rounded-md hover:bg-brand-green-dark transition disabled:bg-brand-green-light"
                    >
                        {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                        {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

// --- COMPONENTE DO FORMULÁRIO ---
function ContactForm({ contact, onSave, onCancel, apiError }) {
  const [formData, setFormData] = useState({
    nome: '',
    whatsapp: '',
    categoria: '',
    observacoes: ''
  });

  useEffect(() => {
    if (contact) {
      setFormData({
        nome: contact.nome || '',
        whatsapp: contact.whatsapp || '',
        categoria: Array.isArray(contact.categoria) ? contact.categoria.join(', ') : (contact.categoria || ''),
        observacoes: contact.observacoes || ''
      });
    } else {
      setFormData({ nome: '', whatsapp: '', categoria: '', observacoes: '' });
    }
  }, [contact]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const dataToSave = {
      ...formData,
      categoria: formData.categoria.split(',').map(cat => cat.trim()).filter(Boolean),
      id: contact?.id
    };
    onSave(dataToSave);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="text-2xl font-bold mb-6 text-gray-800">{contact?.id ? 'Editar Contato' : 'Adicionar Contato'}</h2>
      {apiError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">{apiError}</div>}

      <div className="space-y-4">
        <div>
          <label htmlFor="nome" className="block text-sm font-medium text-gray-600 mb-1">Nome</label>
          <input type="text" name="nome" value={formData.nome} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" />
        </div>
        <div>
          <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-600 mb-1">WhatsApp</label>
          <input type="text" name="whatsapp" value={formData.whatsapp} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" />
        </div>
        <div>
          <label htmlFor="categoria" className="block text-sm font-medium text-gray-600 mb-1">Categorias</label>
          <input type="text" name="categoria" value={formData.categoria} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" placeholder="Cliente, Fornecedor, VIP" />
          <p className="text-xs text-gray-500 mt-1">Separe as categorias por vírgula.</p>
        </div>
        <div>
          <label htmlFor="observacoes" className="block text-sm font-medium text-gray-600 mb-1">Observações</label>
          <textarea name="observacoes" value={formData.observacoes} onChange={handleChange} rows="3" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green" placeholder="Ex: Prefere contato pela manhã, tem interesse no produto X..."></textarea>
          <p className="text-xs text-gray-500 mt-1">Esta informação pode ser usada como variável ({"{{observacoes_contato}}"}) nos prompts.</p>
        </div>
      </div>
      <div className="flex justify-end gap-4 mt-8">
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition">Cancelar</button>
        <button type="submit" className="px-4 py-2 bg-brand-green text-white rounded-md hover:bg-brand-green-dark transition">Salvar</button>
      </div>
    </form>
  );
}


// --- Componente Principal da Página de Contatos ---
function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formApiError, setFormApiError] = useState('');

  const [success, setSuccess] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  const [editingContact, setEditingContact] = useState(null);
  const [contactToDelete, setContactToDelete] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const contactsPerPage = 10;

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/contacts/');
      setContacts(response.data);
    } catch (err) {
      setError('Não foi possível carregar os contatos. Tente recarregar a página.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filteredData = contacts.filter(item =>
      Object.values(item).some(val =>
        String(val).toLowerCase().includes(lowercasedFilter)
      )
    );
    setFilteredContacts(filteredData);
    setCurrentPage(1);
  }, [searchTerm, contacts]);

  const handleOpenAddModal = () => {
    setEditingContact(null);
    setFormApiError('');
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (contact) => {
    setEditingContact(contact);
    setFormApiError('');
    setIsFormModalOpen(true);
  };

  const handleOpenDeleteModal = (contact) => {
    setContactToDelete(contact);
    setIsDeleteModalOpen(true);
  };

  const handleCloseModals = () => {
    setIsFormModalOpen(false);
    setIsDeleteModalOpen(false);
    setIsSyncModalOpen(false);
    setEditingContact(null);
    setContactToDelete(null);
  };

  const handleSave = async (contactData) => {
    setFormApiError('');
    setSuccess('');
    try {
      if (contactData.id) {
        await api.put(`/contacts/${contactData.id}`, contactData);
      } else {
        await api.post('/contacts/', contactData);
      }
      setSuccess('Contato salvo com sucesso!');
      fetchContacts();
      handleCloseModals();
    } catch (err) {
      console.error('Erro ao salvar contato:', err);
      setFormApiError(err.response?.data?.detail || 'Não foi possível salvar. Verifique os dados e a conexão.');
    }
  };

  const confirmDelete = async () => {
    if (!contactToDelete) return;
    setSuccess('');
    try {
      await api.delete(`/contacts/${contactToDelete.id}`);
      setSuccess('Contato excluído com sucesso!');
      fetchContacts();
      handleCloseModals();
    } catch (err) {
      console.error('Erro ao excluir contato:', err);
      setError('Não foi possível excluir o contato.');
      handleCloseModals();
    }
  };

  const handleExport = async () => {
    setIsProcessing(true);
    setSuccess('');
    setError('');
    try {
      const response = await api.get('/contacts/export/csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'contatos.csv');
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      setSuccess('Contatos exportados com sucesso!');
    } catch (err) {
      setError('Falha ao exportar contatos.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setSuccess('');
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/contacts/import/csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess(response.data.message);
      fetchContacts();
    } catch (err) {
      setError(err.response?.data?.detail || 'Falha ao importar contatos.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const indexOfLastContact = currentPage * contactsPerPage;
  const indexOfFirstContact = indexOfLastContact - contactsPerPage;
  const currentContacts = filteredContacts.slice(indexOfFirstContact, indexOfLastContact);
  const totalPages = Math.ceil(filteredContacts.length / contactsPerPage);

  const paginate = (pageNumber) => {
    if (pageNumber < 1 || pageNumber > totalPages) return;
    setCurrentPage(pageNumber);
  };

  return (
    <div className="p-6 md:p-10 bg-gray-50 min-h-full">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Contatos</h1>
          <p className="text-gray-500 mt-1">Gerencie sua lista de clientes e leads.</p>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            ref={fileInputRef}
            disabled={isProcessing}
          />
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={isProcessing}
            className="flex items-center gap-2 bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-blue-300"
            title="Importar de um arquivo CSV"
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Upload size={18} />}
            <span className="hidden md:inline">Importar CSV</span>
          </button>
          <button
            onClick={handleExport}
            disabled={isProcessing || contacts.length === 0}
            className="flex items-center gap-2 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-300"
            title="Exportar contatos para um arquivo CSV"
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Download size={18} />}
            <span className="hidden md:inline">Exportar CSV</span>
          </button>
          <button
            onClick={() => setIsSyncModalOpen(true)}
            disabled={isProcessing}
            className="flex items-center gap-2 bg-green-800 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-900 transition-colors disabled:bg-green-300"
            title="Sincronizar com Google Sheets"
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <RefreshCw size={18} />}
            <span className="hidden md:inline">Sincronizar Planilha</span>
          </button>
        </div>
      </div>

      {success && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg relative mb-4" role="alert">{success}</div>}
      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">{error}</div>}

      <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <div className="flex flex-wrap gap-4 justify-between items-center mb-4">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Pesquisar em todos os campos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green"
            />
          </div>
          <button onClick={handleOpenAddModal} className="flex items-center gap-2 bg-brand-green text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-brand-green-dark transition-all duration-300">
            <Plus size={20} />
            Adicionar Contato
          </button>
        </div>

        {loading && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-brand-green" size={32} /></div>}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b-2 border-gray-200">
                <tr>
                  <th className="p-4 text-sm font-semibold text-gray-600">Nome</th>
                  <th className="p-4 text-sm font-semibold text-gray-600">WhatsApp</th>
                  <th className="p-4 text-sm font-semibold text-gray-600">Categorias</th>
                  <th className="p-4 text-sm font-semibold text-gray-600 uppercase">Observações</th>
                  <th className="p-4 text-sm font-semibold text-gray-600 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {currentContacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-800">{contact.nome}</td>
                    <td className="p-4 text-gray-600">{contact.whatsapp}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {Array.isArray(contact.categoria) && contact.categoria.length > 0 ? (
                          contact.categoria.map((cat, index) => (
                            <span key={index} className="px-2 py-1 text-xs font-semibold text-brand-green-dark bg-brand-green-light/30 rounded-full">
                              {cat}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 text-sm italic">Sem categoria</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-gray-600 text-sm max-w-xs truncate" title={contact.observacoes}>
                      {contact.observacoes || <span className="text-gray-400 italic">N/A</span>}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-4">
                        <button onClick={() => handleOpenEditModal(contact)} className="text-gray-500 hover:text-brand-green transition-colors"><Edit size={18} /></button>
                        <button onClick={() => handleOpenDeleteModal(contact)} className="text-gray-500 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredContacts.length === 0 && <p className="text-center text-gray-500 py-8">Nenhum contato encontrado.</p>}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6">
            <span className="text-sm text-gray-500">Página {currentPage} de {totalPages}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => paginate(1)} disabled={currentPage === 1} className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50"><ChevronsLeft size={16} /></button>
              <button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1} className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50"><ChevronLeft size={16} /></button>
              <span className="px-2 text-sm text-gray-600 font-medium">{currentPage}</span>
              <button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50"><ChevronRight size={16} /></button>
              <button onClick={() => paginate(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50"><ChevronsRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {isFormModalOpen && (
        <Modal onClose={handleCloseModals}>
          <ContactForm
            contact={editingContact}
            onSave={handleSave}
            onCancel={handleCloseModals}
            apiError={formApiError}
          />
        </Modal>
      )}

      {isDeleteModalOpen && contactToDelete && (
        <Modal onClose={handleCloseModals}>
          <div className="text-center p-6">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-semibold leading-6 text-gray-900">
              Excluir Contato
            </h3>
            <div className="mt-2">
              <p className="text-sm text-gray-500">
                Tem certeza que deseja excluir <span className="font-bold text-gray-700">{contactToDelete.nome}</span>? <br />Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="mt-6 flex justify-center gap-4">
              <button
                type="button"
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition"
                onClick={handleCloseModals}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
                onClick={confirmDelete}
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </Modal>
      )}
      
      {isSyncModalOpen && (
        <SyncSheetModal 
          onClose={handleCloseModals}
          onSuccess={(message) => {
            setSuccess(message);
            fetchContacts();
          }}
        />
      )}
    </div>
  );
}

export default Contacts;

