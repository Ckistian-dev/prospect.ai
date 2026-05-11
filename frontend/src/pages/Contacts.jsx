import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { Plus, Edit, Trash2, Search, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, AlertTriangle, Upload, Download, Loader2, X, Save, User as UserIcon, Phone, Tag, FileText, Filter, MoreVertical, Layout, Database, ChevronDown, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import PageLoader from '../components/common/PageLoader';

// ─── DESIGN SYSTEM ──────────────────────────────────────────────────────────
const DS_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
.contacts-page { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
.contacts-page h1, .contacts-page h2, .contacts-page h3, .contacts-page h4 { font-family: 'Plus Jakarta Sans', sans-serif; }
.ds-surface { background: #ffffff; border-radius: 2.5rem; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 30px rgba(0,0,0,0.02); }
.ds-card { background: #ffffff; border-radius: 1.5rem; border: 1px solid rgba(0,0,0,0.05); padding: 1.5rem; transition: all 0.3s ease; }
.contact-input {
    width: 100%;
    height: 4.5rem;
    padding: 0 1.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    border-radius: 1.5rem;
    background: #ffffff;
    border: 2px solid #f1f5f9;
    color: #1e293b;
    outline: none;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.contact-input:focus { 
    border-color: #356854; 
    background: #ffffff; 
    box-shadow: 0 10px 25px -5px rgba(53,104,84,0.1), 0 8px 10px -6px rgba(53,104,84,0.1);
    transform: translateY(-2px);
}
.contact-label {
    display: block;
    text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-3 ml-1;
}
.contact-pill {
    padding: 0.4rem 1rem;
    border-radius: 1rem;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(53,104,84,0.06);
    color: #356854;
    border: 1px solid rgba(53,104,84,0.1);
}
.glass-header {
    background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.9) 100%);
    backdrop-filter: blur(10px);
}
.btn-primary {
    background: linear-gradient(135deg, #356854 0%, #2d5847 100%);
    box-shadow: 0 10px 30px -10px rgba(53,104,84,0.5);
}
.btn-primary:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 20px 40px -12px rgba(53,104,84,0.4);
}
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
`;

const Modal = ({ onClose, children, maxWidth = "max-w-3xl" }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-500" onClick={onClose}>
    <div className={`bg-white w-full ${maxWidth} relative overflow-hidden animate-in zoom-in duration-500 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)]`} style={{ borderRadius: '3.5rem' }} onClick={e => e.stopPropagation()}>
      <button onClick={onClose} className="absolute top-8 right-8 w-11 h-11 flex items-center justify-center bg-slate-50/50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-all z-20 backdrop-blur-sm border border-white/20 shadow-sm"><X size={20} /></button>
      {children}
    </div>
  </div>
);

function ContactForm({ contact, onSave, onCancel, apiError }) {
  const [formData, setFormData] = useState({ nome: '', whatsapp: '', categoria: '', observacoes: '' });
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    if (contact) setFormData({ nome: contact.nome || '', whatsapp: contact.whatsapp || '', categoria: Array.isArray(contact.categoria) ? contact.categoria.join(', ') : (contact.categoria || ''), observacoes: contact.observacoes || '' });
    else setFormData({ nome: '', whatsapp: '', categoria: '', observacoes: '' });
  }, [contact]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try { await onSave({ ...formData, categoria: formData.categoria.split(',').map(cat => cat.trim()).filter(Boolean), id: contact?.id }); }
    finally { setIsSaving(false); }
  };
  return (
    <div className="flex flex-col bg-white">
      <header className="p-10 md:p-14 glass-header border-b border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50/50 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="relative z-10">
          <h3 className="text-4xl font-[800] text-slate-800 tracking-tight leading-none mb-4">{contact?.id ? 'Atualizar Contato' : 'Novo Contato'}</h3>
          <div className="flex items-center gap-3">
            <span className="h-[2px] w-8 bg-emerald-500 rounded-full"></span>
            <p className="text-[11px] text-slate-400 font-[800] uppercase tracking-[0.25em]">{contact?.id ? 'Refinando informações estratégicas' : 'Provisionando novo contato na base'}</p>
          </div>
        </div>
      </header>
      <form onSubmit={handleSubmit} className="p-10 md:p-14 space-y-10 bg-[#fcfdfe]">
        {apiError && <div className="p-6 bg-rose-50 text-rose-600 text-xs font-bold rounded-2xl border border-rose-100 flex items-center gap-4 animate-in slide-in-from-top-4"><AlertTriangle size={24} /> {apiError}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
          <div className="md:col-span-2">
            <label className="contact-label">Nome Completo</label>
            <div className="group relative">
              <input type="text" value={formData.nome} onChange={e => setFormData(p => ({ ...p, nome: e.target.value }))} required className="contact-input pl-6" placeholder="Ex: João da Silva" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="contact-label">WhatsApp Corporativo</label>
            <div className="group relative">
              <input type="text" value={formData.whatsapp} onChange={e => setFormData(p => ({ ...p, whatsapp: e.target.value }))} required className="contact-input pl-6" placeholder="5511900000000" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="contact-label">Categorização (Tags)</label>
            <div className="group relative">
              <input type="text" value={formData.categoria} onChange={e => setFormData(p => ({ ...p, categoria: e.target.value }))} className="contact-input pl-6" placeholder="VIP, Inbound, Lead" />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="contact-label">Observações</label>
            <div className="group relative">
              <input type="text" value={formData.observacoes} onChange={e => setFormData(p => ({ ...p, observacoes: e.target.value }))} className="contact-input h-40 pl-6" placeholder="Notas estratégicas, perfil comportamental ou histórico de interesse..."></input>
            </div>
          </div>
        </div>
        <footer className="flex items-center justify-between pt-10 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-8 py-4 text-slate-400 font-bold text-[11px] uppercase tracking-widest hover:text-slate-600 transition-all flex items-center gap-2">
            <X size={14} /> Descartar Alterações
          </button>
          <button type="submit" disabled={isSaving} className="h-16 px-10 btn-primary text-white font-[800] uppercase tracking-[0.2em] text-[11px] rounded-[1.5rem] transition-all flex items-center gap-4 disabled:opacity-50">
            {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
            {isSaving ? 'Processando...' : 'Salvar'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formApiError, setFormApiError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactToDelete, setContactToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const contactsPerPage = 12;

  const fetchContacts = useCallback(async () => {
    try { setLoading(true); const res = await api.get('/contacts/'); setContacts(res.data); }
    catch (err) { setError('Falha de sincronização de rede.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    const term = searchTerm.toLowerCase();
    setFilteredContacts(contacts.filter(c => (c.nome || '').toLowerCase().includes(term) || (c.whatsapp || '').toLowerCase().includes(term) || (Array.isArray(c.categoria) ? c.categoria.join(' ') : (c.categoria || '')).toLowerCase().includes(term)));
    setCurrentPage(1);
  }, [searchTerm, contacts]);

  const handleSave = async (contactData) => {
    try {
      if (contactData.id) await api.put(`/contacts/${contactData.id}`, contactData);
      else await api.post('/contacts/', contactData);
      toast.success('Agenda atualizada com sucesso!');
      fetchContacts();
      setIsFormModalOpen(false);
    } catch (err) { setFormApiError(err.response?.data?.detail || 'Erro ao salvar.'); }
  };

  const currentContacts = filteredContacts.slice((currentPage - 1) * contactsPerPage, currentPage * contactsPerPage);
  const totalPages = Math.ceil(filteredContacts.length / contactsPerPage);

  if (loading) return <PageLoader message="Acessando torre de leads..." subMessage="Cruzando dados com a base legada do WhatsApp..." />;

  return (
    <div className="contacts-page p-6 md:p-12 min-h-screen bg-[#f8fafc]">
      <style>{DS_STYLE}</style>
      <div className="max-w-[1600px] mx-auto flex flex-col gap-12">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10">
          <div>
            <h1 className="text-4xl font-black text-slate-800 tracking-tight flex items-center gap-5">Agenda de Leads <Database size={32} className="text-[#356854]" /></h1>
            <p className="text-slate-400 mt-2 text-sm font-bold uppercase tracking-widest">Gestão centralizada de audiência e segmentação cognitiva</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
            <input type="file" accept=".csv" onChange={async (e) => { const f = e.target.files[0]; if (!f) return; setIsProcessing(true); const fd = new FormData(); fd.append('file', f); try { const res = await api.post('/contacts/import/csv', fd); toast.success(`${res.data.imported} Importados!`); fetchContacts(); } finally { setIsProcessing(false); if (fileInputRef.current) fileInputRef.current.value = ""; } }} className="hidden" ref={fileInputRef} />
            <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="h-16 px-8 bg-white text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] rounded-[1.5rem] border border-slate-100 shadow-sm hover:bg-slate-50 transition-all flex items-center gap-3">{isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />} Importar</button>
            <button onClick={async () => { setIsProcessing(true); try { const res = await api.get('/contacts/export/csv', { responseType: 'blob' }); const url = window.URL.createObjectURL(new Blob([res.data])); const link = document.createElement('a'); link.href = url; link.setAttribute('download', 'leads.csv'); link.click(); } finally { setIsProcessing(false); } }} disabled={isProcessing || contacts.length === 0} className="h-16 px-8 bg-white text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] rounded-[1.5rem] border border-slate-100 shadow-sm hover:bg-slate-50 transition-all flex items-center gap-3"><Download size={20} /> Exportar</button>
            <button onClick={() => { setEditingContact(null); setFormApiError(''); setIsFormModalOpen(true); }} className="h-16 px-10 bg-[#356854] text-white font-black text-xs uppercase tracking-[0.2em] rounded-[1.5rem] shadow-2xl shadow-emerald-900/10 hover:bg-[#2d5847] transition-all flex items-center gap-4"><Plus size={24} /> Novo Contato</button>
          </div>
        </header>

        <div className="ds-surface overflow-hidden border-none shadow-2xl shadow-slate-200/50 flex flex-col min-h-[650px]">
          <div className="p-10 border-b border-slate-50 bg-white sticky top-0 z-10">
            <div className="relative">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
              <input type="text" placeholder="Pesquisar por nome, WhatsApp ou tags estratégicas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-20 w-full pl-16 pr-8 bg-slate-50/30 border border-slate-100 rounded-[2rem] text-lg font-bold text-slate-700 outline-none focus:ring-8 focus:ring-emerald-500/5 focus:border-[#356854]/30 transition-all" />
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar flex-1">
            <table className="w-full text-left min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-50">
                  {['Identificação', 'WhatsApp', 'Tags', 'Observações', 'Ações'].map((h, i) => (
                    <th key={i} className="px-10 py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {currentContacts.map((contact) => (
                  <tr key={contact.id} className="transition-all hover:bg-emerald-50/20 group">
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-[1.25rem] flex items-center justify-center text-lg font-black text-white bg-gradient-to-br from-[#356854] to-[#4a8a6e] shadow-lg shadow-emerald-900/10 group-hover:scale-110 transition-all">{(contact.nome || '?')[0].toUpperCase()}</div>
                        <div>
                          <p className="text-base font-black text-slate-800">{contact.nome}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5 flex items-center gap-2"><CheckCircle size={10} className="text-emerald-500" /> Sincronizado</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-3 text-slate-700 font-black text-sm tracking-tight"><Phone size={16} className="text-emerald-500" /> {contact.whatsapp}</div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="flex flex-wrap gap-2.5">
                        {Array.isArray(contact.categoria) && contact.categoria.length > 0 ? contact.categoria.map((cat, idx) => <span key={idx} className="contact-pill">{cat}</span>) : <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">Nenhuma Segmentação</span>}
                      </div>
                    </td>
                    <td className="px-10 py-8 max-w-xs">
                      <p className="text-xs text-slate-500 font-medium truncate italic leading-relaxed" title={contact.observacoes}>{contact.observacoes || 'Nenhuma nota registrada.'}</p>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => { setEditingContact(contact); setFormApiError(''); setIsFormModalOpen(true); }} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-[#356854] hover:border-emerald-100 rounded-2xl transition-all shadow-sm"><Edit size={20} /></button>
                        <button onClick={() => { setContactToDelete(contact); setIsDeleteModalOpen(true); }} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-100 text-slate-400 hover:text-rose-500 hover:border-rose-100 rounded-2xl transition-all shadow-sm"><Trash2 size={20} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredContacts.length === 0 && <tr><td colSpan={5} className="text-center py-40 opacity-20"><UserIcon size={80} className="mx-auto mb-6" /><h3 className="text-lg font-black uppercase tracking-[0.2em]">Diretório de Leads Vazio</h3></td></tr>}
              </tbody>
            </table>
          </div>

          <footer className="p-10 border-t border-slate-50 flex flex-col md:flex-row justify-between items-center gap-8 bg-white">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{filteredContacts.length} Contatos Encontrados</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-3">
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="w-12 h-12 flex items-center justify-center border border-slate-100 rounded-2xl text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronsLeft size={20} /></button>
                <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="w-12 h-12 flex items-center justify-center border border-slate-100 rounded-2xl text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronLeft size={20} /></button>
                <div className="h-12 px-8 bg-emerald-50 rounded-2xl text-[#356854] font-black text-[10px] flex items-center uppercase tracking-[0.2em] border border-emerald-100 shadow-inner">Página {currentPage} de {totalPages}</div>
                <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages} className="w-12 h-12 flex items-center justify-center border border-slate-100 rounded-2xl text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronRight size={20} /></button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="w-12 h-12 flex items-center justify-center border border-slate-100 rounded-2xl text-slate-400 hover:text-[#356854] disabled:opacity-20"><ChevronsRight size={20} /></button>
              </div>
            )}
          </footer>
        </div>
      </div>

      {isFormModalOpen && <Modal onClose={() => setIsFormModalOpen(false)} maxWidth="max-w-4xl"><ContactForm contact={editingContact} onSave={handleSave} onCancel={() => setIsFormModalOpen(false)} apiError={formApiError} /></Modal>}
      {isDeleteModalOpen && (
        <Modal onClose={() => setIsDeleteModalOpen(false)} maxWidth="max-w-md">
          <div className="p-12 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-rose-500/20 to-transparent"></div>
            <div className="w-24 h-24 bg-gradient-to-br from-rose-50 to-rose-100/50 rounded-[2.5rem] flex items-center justify-center text-rose-500 mx-auto mb-8 shadow-sm border border-rose-100/50 relative">
              <div className="absolute inset-0 bg-rose-500/5 rounded-[2.5rem] animate-pulse"></div>
              <AlertTriangle size={48} className="relative z-10" />
            </div>
            <h3 className="text-3xl font-[800] text-slate-800 mb-3 tracking-tight">Expurgar Lead?</h3>
            <p className="text-slate-500 text-[13px] font-medium mb-10 leading-relaxed px-4">
              Deseja realmente remover <span className="text-slate-900 font-bold">{contactToDelete?.nome}</span> da base estratégica? <br />
              <span className="text-rose-500/80 font-bold uppercase text-[10px] tracking-widest mt-2 block">Esta ação é irreversível</span>
            </p>
            <div className="flex gap-4">
              <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 h-16 bg-slate-50 text-slate-400 font-bold text-[11px] uppercase tracking-widest rounded-[1.25rem] hover:bg-slate-100 hover:text-slate-600 transition-all border border-slate-100">Cancelar</button>
              <button onClick={async () => { try { await api.delete(`/contacts/${contactToDelete.id}`); toast.success('Lead removido da base.'); fetchContacts(); setIsDeleteModalOpen(false); } catch (e) { toast.error('Falha na operação.'); } }} className="flex-1 h-16 bg-rose-500 text-white font-[800] text-[11px] uppercase tracking-widest rounded-[1.25rem] shadow-lg shadow-rose-500/25 hover:bg-rose-600 hover:-translate-y-1 transition-all">Sim, Confirmar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Contacts;
