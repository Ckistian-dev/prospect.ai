import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import toast from 'react-hot-toast';
import { Edit, Trash2, Loader2, UserPlus, Save, CheckCircle, XCircle, Settings, Shield, Search, AlertTriangle } from 'lucide-react';

// Modal Genérico
const Modal = ({ onClose, children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm animate-fade-in-up-fast" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-fade-in-up flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            {children}
        </div>
    </div>
);

const DeleteConfirmationModal = ({ onClose, onConfirm }) => (
    <Modal onClose={onClose}>
        <div className="p-6 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Excluir Usuário</h3>
            <p className="mt-2 text-sm text-gray-500">Tem certeza que deseja apagar este usuário? Esta ação não pode ser desfeita.</p>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition">Cancelar</button>
                <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition">Sim, Excluir</button>
            </div>
        </div>
    </Modal>
);

// Modal de Edição/Criação de Usuário
const UserModal = ({ user, onSave, onClose, isCreating = false }) => {
    const [formData, setFormData] = useState({
        email: user?.email || '',
        password: '',
        tokens: user?.tokens ?? 0,
        instance_name: user?.instance_name || '',
    });
    
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const payload = { ...formData, tokens: parseInt(formData.tokens, 10) || 0 };

            if (!isCreating && !payload.password) {
                delete payload.password; // Não envia senha em branco na atualização
            }
            await onSave(user?.id, payload);
            onClose();
        } catch (error) {
            // O erro já é tratado na função onSave, que mantém o modal aberto
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal onClose={onClose}>
            <div className="flex flex-col h-full">
                <div className="p-6 border-b border-gray-200">
                    <h3 className="text-xl font-bold text-gray-900">{isCreating ? 'Criar Novo Usuário' : `Editar Usuário`}</h3>
                    {!isCreating && <p className="text-sm text-gray-500 mt-1">{user.email}</p>}
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email*</label>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} required className="block w-full px-4 py-2.5 text-sm rounded-lg border border-gray-300 shadow-sm focus:border-brand-green focus:ring-brand-green" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {isCreating ? 'Senha*' : 'Nova Senha (opcional)'}
                            </label>
                            <input type="password" name="password" value={formData.password} onChange={handleChange} required={isCreating} placeholder={isCreating ? "Defina uma senha" : "Deixe em branco para manter a atual"} className="block w-full px-4 py-2.5 text-sm rounded-lg border border-gray-300 shadow-sm focus:border-brand-green focus:ring-brand-green" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tokens</label>
                                <input type="number" name="tokens" value={formData.tokens} onChange={handleChange} className="block w-full px-4 py-2.5 text-sm rounded-lg border border-gray-300 shadow-sm focus:border-brand-green focus:ring-brand-green" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Instância WhatsApp</label>
                                <input type="text" name="instance_name" value={formData.instance_name} onChange={handleChange} className="block w-full px-4 py-2.5 text-sm rounded-lg border border-gray-300 shadow-sm focus:border-brand-green focus:ring-brand-green" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-gray-200 flex justify-end gap-4 bg-gray-50 rounded-b-xl">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition">Cancelar</button>
                    <button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-brand-green text-white rounded-md hover:bg-brand-green-dark transition flex items-center gap-2 disabled:bg-gray-400">
                        {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        {isSaving ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

function Admin() {
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [modalState, setModalState] = useState({ type: null, data: null });
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, userId: null });
    const navigate = useNavigate();

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const usersRes = await api.get('/admin/users');
            setUsers(usersRes.data);
            setError('');
        } catch (err) {
            setError('Falha ao carregar usuários. Você pode não ter privilégios de administrador.');
            toast.error('Falha ao carregar usuários.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleSaveUser = async (userId, userData) => {
        const isCreating = !userId;
        const apiCall = isCreating ? api.post('/admin/users', userData) : api.put(`/admin/users/${userId}`, userData);
        const successMsg = isCreating ? 'Usuário criado com sucesso!' : 'Usuário atualizado com sucesso!';
        const errorMsg = isCreating ? 'Falha ao criar usuário.' : 'Falha ao atualizar usuário.';

        try {
            const response = await apiCall;
            if (isCreating) {
                setUsers(prev => [...prev, response.data].sort((a, b) => a.id - b.id));
            } else {
                setUsers(prev => prev.map(u => u.id === userId ? response.data : u));
            }
            toast.success(successMsg);
        } catch (err) {
            const detail = err.response?.data?.detail || 'Verifique os campos e tente novamente.';
            toast.error(`${errorMsg} ${detail}`);
            throw err; // Re-lança para manter o modal aberto
        }
    };

    const handleDeleteClick = (userId) => {
        setDeleteConfirmation({ isOpen: true, userId });
    };

    const confirmDeleteUser = async () => {
        const { userId } = deleteConfirmation;
        try {
            await api.delete(`/admin/users/${userId}`);
            setUsers(prev => prev.filter(u => u.id !== userId));
            toast.success('Usuário apagado com sucesso!');
        } catch (err) {
            const detail = err.response?.data?.detail || '';
            toast.error(`Falha ao apagar usuário. ${detail}`);
        } finally {
            setDeleteConfirmation({ isOpen: false, userId: null });
        }
    };

    const filteredUsers = users.filter(user => 
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-brand-green" size={32} /></div>;
    }

    if (error) {
        return <div className="p-10 text-center text-red-600 bg-red-50 rounded-lg m-10">{error}</div>;
    }

    return (
        <div className="p-6 md:p-10 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Painel do Administrador</h1>
                    <p className="text-gray-500 mt-1">Gerenciamento de usuários do sistema.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="Pesquisar por email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green"
                        />
                    </div>
                    <button
                        onClick={() => setModalState({ type: 'create', data: null })}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-green text-white rounded-lg shadow-md text-sm font-medium hover:bg-brand-green-dark transition-colors"
                    >
                        <UserPlus size={16} />
                        Novo Usuário
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                <div className="overflow-x-auto custom-scrollbar pb-2">
                    <table className="w-full text-left min-w-[1000px]">
                        <thead className="border-b-2 border-gray-200">
                            <tr>
                                <th className="p-4 text-sm font-semibold text-gray-600">Email</th>
                                <th className="p-4 text-sm font-semibold text-gray-600">Tokens</th>
                                <th className="p-4 text-sm font-semibold text-gray-600">Instância</th>
                                <th className="p-4 text-sm font-semibold text-gray-600 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map(user => (
                                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td className="p-4 font-semibold text-gray-800">
                                        {user.email}
                                        {user.is_superuser && (
                                            <Shield size={14} className="inline-block ml-1 text-purple-600" title="Superusuário" />
                                        )}
                                    </td>
                                    <td className="p-4 text-gray-600">{user.tokens.toLocaleString('pt-BR')}</td>
                                    <td className="p-4 text-sm text-gray-600">{user.instance_name || '-'}</td>
                                    <td className="p-4">
                                        <div className="flex justify-center items-center gap-2">
                                            <button onClick={() => setModalState({ type: 'edit', data: user })} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-full transition-colors" title="Editar Usuário"><Edit size={18} /></button>
                                            <button onClick={() => handleDeleteClick(user.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-full transition-colors" title="Apagar Usuário"><Trash2 size={18} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {(modalState.type === 'edit' || modalState.type === 'create') && (
                <UserModal 
                    user={modalState.data} 
                    onSave={handleSaveUser} 
                    onClose={() => setModalState({ type: null, data: null })}
                    isCreating={modalState.type === 'create'}
                />
            )}
            {deleteConfirmation.isOpen && (
                <DeleteConfirmationModal onClose={() => setDeleteConfirmation({ isOpen: false, userId: null })} onConfirm={confirmDeleteUser} />
            )}
        </div>
    );
}

export default Admin;