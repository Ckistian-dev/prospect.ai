import React from 'react';
import { X } from 'lucide-react';

const Modal = ({ children, onClose, maxWidth = "max-w-xl" }) => {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-10"
      onClick={onClose}
    >
      {/* Backdrop with sophisticated blur */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-500" />
      
      <div
        className={`bg-[#f8fafc] w-full ${maxWidth} relative flex flex-col overflow-hidden animate-in fade-in zoom-in slide-in-from-bottom-8 duration-500 max-h-[calc(100vh-5rem)]`}
        style={{ 
          borderRadius: '2.5rem', 
          boxShadow: '0 40px 100px -20px rgba(15,23,42,0.3)' 
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Subtle accent line at the top */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-[#356854]/40 to-transparent" />

        <button
          onClick={onClose}
          className="absolute top-8 right-8 w-11 h-11 flex items-center justify-center bg-white/80 backdrop-blur-md text-slate-400 hover:text-slate-900 rounded-2xl transition-all z-50 shadow-sm hover:shadow-md border border-white/50"
          aria-label="Fechar modal"
        >
          <X size={20} />
        </button>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
