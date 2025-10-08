import React from 'react';
import { X } from 'lucide-react';

// Esta é uma versão mais simples e flexível do Modal.
// Ele não tem um 'title' próprio; o título virá do conteúdo (children).
const Modal = ({ children, onClose }) => {
  return (
    // Backdrop (fundo escuro)
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 animate-fade-in"
      // Clicar no fundo fecha o modal
      onClick={onClose}
    >
      {/* Conteúdo do Modal */}
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-md min-w-fit p-6 relative animate-fade-in-up"
        // Impede que o clique dentro do modal se propague para o fundo e o feche
        onClick={e => e.stopPropagation()} 
      >
        {/* Botão de Fechar no canto superior direito */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
          aria-label="Fechar modal"
        >
          <X size={24} />
        </button>
        
        {/* O conteúdo (nosso formulário ou a confirmação de exclusão) é renderizado aqui */}
        <div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;

