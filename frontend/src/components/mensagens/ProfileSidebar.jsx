import React, { useState, useEffect, useRef } from 'react';
import { Phone, FileText, Edit, X, Check, Save, Smartphone, Target } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axiosConfig';

const ProfileSidebar = ({ atendimento, onClose, statusOptions, getTextColorForBackground, isOpen, onUpdateStatus }) => {
    const [activeSubMenu, setActiveSubMenu] = useState(null);
    const [isEditingObs, setIsEditingObs] = useState(false);
    const [obsText, setObsText] = useState(atendimento.observacoes || '');
    const [imgError, setImgError] = useState(false);
    const textareaRef = useRef(null);

    useEffect(() => {
        setObsText(atendimento.observacoes || '');
        setIsEditingObs(false);
        setActiveSubMenu(null);
        setImgError(false);
    }, [atendimento.id]);

    useEffect(() => {
        if (!isEditingObs) {
            setObsText(atendimento.observacoes || '');
        }
    }, [atendimento.observacoes]);

    const handleSaveObs = async () => {
        try {
            if (!atendimento.prospect_contact_id) {
                toast.error('Este contato não está vinculado a uma prospecção.');
                return;
            }
            await api.put(`/prospecting/contacts/${atendimento.prospect_contact_id}`, { observacoes: obsText });
            onUpdateStatus(atendimento.id, { observacoes: obsText });
            setIsEditingObs(false);
            toast.success('Observações atualizadas!');
        } catch (error) {
            toast.error('Erro ao salvar observações.');
        }
    };

    const statusStyle = (() => {
        const opt = statusOptions.find(o => o.nome === atendimento.situacao);
        const color = opt?.cor || '#6b7280';
        return { 
            backgroundColor: color + '15', 
            color: color,
            borderColor: color + '30'
        };
    })();

    return (
        <div className="h-full bg-gray-50 border-l border-gray-200 flex flex-col shadow-xl">
            <header className="flex-shrink-0 flex items-center justify-between p-4 bg-white border-b h-16">
                <h3 className="font-bold text-gray-800">Dados do Contato</h3>
                <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100"><X size={20} /></button>
            </header>

            <div className="flex-1 p-6 overflow-y-auto space-y-8">
                <div className="text-center space-y-4">
                    {atendimento.profilePicUrl && !imgError ? (
                        <img src={atendimento.profilePicUrl} alt="" className="w-24 h-24 rounded-full mx-auto object-cover shadow-md" onError={() => setImgError(true)} />
                    ) : (
                        <div className="w-24 h-24 rounded-full mx-auto bg-brand-green flex items-center justify-center text-4xl font-bold text-white shadow-md">
                            {(atendimento.nome_contato || '??').substring(0, 2).toUpperCase()}
                        </div>
                    )}
                    <div className="relative">
                        <div className="flex items-center justify-center gap-2">
                            <h2 className="text-xl font-bold text-gray-900 truncate max-w-[200px]">{atendimento.nome_contato || 'Sem nome'}</h2>
                            <button onClick={() => setActiveSubMenu(activeSubMenu === 'name' ? null : 'name')} className="p-1 text-gray-400 hover:text-blue-600"><Edit size={14} /></button>
                        </div>
                    </div>
                    <p className="text-gray-500 flex items-center justify-center gap-2"><Phone size={14} /> {atendimento.whatsapp}</p>
                    <p className="text-xs text-gray-400 flex items-center justify-center gap-1 mt-1">
                        <Smartphone size={12} /> {atendimento.instanceName}
                    </p>
                    {atendimento.campanha && (
                        <p className="text-xs text-blue-600 font-semibold flex items-center justify-center gap-1 mt-1">
                            <Target size={12} /> {atendimento.campanha}
                        </p>
                    )}
                    <div className="flex justify-center">
                        <span 
                            className="px-3 py-1 rounded border text-sm font-bold shadow-sm" 
                            style={statusStyle}
                        >
                            {atendimento.situacao?.toUpperCase()}
                        </span>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <FileText size={16} className="text-brand-green" />
                            Resumo / Observações
                        </h4>
                        {!isEditingObs ? (
                            <button onClick={() => setIsEditingObs(true)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                                <Edit size={14} />
                            </button>
                        ) : (
                            <div className="flex gap-1">
                                <button onClick={() => {
                                    setIsEditingObs(false);
                                    setObsText(atendimento.observacoes || '');
                                }} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                                    <X size={14} />
                                </button>
                                <button onClick={handleSaveObs} className="p-1 text-gray-400 hover:text-green-600 transition-colors">
                                    <Check size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {isEditingObs ? (
                        <textarea
                            ref={textareaRef}
                            value={obsText}
                            onChange={(e) => setObsText(e.target.value)}
                            className="w-full text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-brand-green resize-none"
                            rows={6}
                            placeholder="Adicione um resumo ou observação..."
                        />
                    ) : (
                        <p className="text-sm text-gray-600 whitespace-pre-wrap text-left">
                            {obsText || <span className="italic text-gray-400">Nenhuma observação registrada.</span>}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfileSidebar;
