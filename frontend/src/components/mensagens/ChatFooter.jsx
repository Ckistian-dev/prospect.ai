import React, { useState, useEffect, useRef } from 'react';
import {
    Paperclip, Mic, Send, Image as ImageIcon, FileText, Loader2, StopCircle, Trash2, FileVideo, MessageSquarePlus, X as XIcon
} from 'lucide-react';

const ChatFooter = ({ onSendMessage, onSendMedia, onOpenTemplateModal }) => {
    const [text, setText] = useState('');
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const attachMenuRef = useRef(null); 

    const [selectedFiles, setSelectedFiles] = useState([]);

    const [isRecording, setIsRecording] = useState(false);
    const [isSendingMedia, setIsSendingMedia] = useState(false); 
    const [recordingTime, setRecordingTime] = useState(0);
    const [isDragging, setIsDragging] = useState(false); 

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingIntervalRef = useRef(null);
    const recordingMimeTypeRef = useRef('audio/webm'); 
    const didCancelRecordingRef = useRef(false);
    const textInputRef = useRef(null);

    const imageInputRef = useRef(null);
    const docInputRef = useRef(null);
    const videoInputRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
                setShowAttachMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        const textarea = textInputRef.current;
        if (textarea) {
            const maxHeight = 120; 

            textarea.style.height = 'auto'; 
            const scrollHeight = textarea.scrollHeight;

            if (scrollHeight > maxHeight) {
                textarea.style.height = `${maxHeight}px`;
                textarea.style.overflowY = 'auto'; 
            } else {
                textarea.style.height = `${scrollHeight}px`;
                textarea.style.overflowY = 'hidden'; 
            }
        }
    }, [text]); 

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mimeTypes = [
                'audio/ogg; codecs=opus', 
                'audio/opus',             
                'audio/ogg',              
                'audio/mp3',              
                'audio/webm; codecs=opus' 
            ];
            const supportedType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

            if (!supportedType) {
                alert("Seu navegador não suporta a gravação de áudio em um formato compatível (OGG, Opus ou MP3).");
                return;
            }

            recordingMimeTypeRef.current = supportedType; 

            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: supportedType });

            audioChunksRef.current = []; 

            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = () => {
                clearInterval(recordingIntervalRef.current);
                setRecordingTime(0);
                setIsRecording(false);

                stream.getTracks().forEach(track => track.stop());

                if (didCancelRecordingRef.current) {
                    didCancelRecordingRef.current = false; 
                    audioChunksRef.current = []; 
                    return; 
                }

                let targetMimeType = 'audio/ogg'; 
                let targetExtension = '.ogg';

                const recordedMimeType = recordingMimeTypeRef.current;

                if (recordedMimeType.includes('opus') || recordedMimeType.includes('ogg')) {
                    targetMimeType = 'audio/ogg'; 
                    targetExtension = '.ogg';
                } else if (recordedMimeType.includes('mp3')) {
                    targetMimeType = 'audio/mpeg'; 
                    targetExtension = '.mp3';
                } else {
                    targetMimeType = 'audio/ogg';
                    targetExtension = '.ogg';
                }

                const audioBlob = new Blob(audioChunksRef.current, { type: targetMimeType });
                const filename = `audio_${Date.now()}${targetExtension}`;

                if (audioBlob.size > 1000) { 
                    handleSendFile(audioBlob, 'audio', filename); 
                }

                audioChunksRef.current = [];
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);

            setRecordingTime(0);
            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prevTime => prevTime + 1);
            }, 1000);

        } catch (err) {
            console.error("Erro ao iniciar gravação de áudio:", err);
            alert("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            didCancelRecordingRef.current = false; 
            mediaRecorderRef.current.stop();
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            didCancelRecordingRef.current = true; 
            mediaRecorderRef.current.stop(); 
        }
    };

    const handleMicClick = () => {
        if (isRecording) {
            stopRecording(); 
        } else {
            startRecording(); 
        }
    };

    const handleSendFile = (file, type, customFilename = null) => {
        if (!file) return;

        try {
            const filename = customFilename || file.name || `${type}_${Date.now()}`;
            onSendMedia(file, type, filename); 
        } catch (error) {
            console.error(`Erro síncrono ao preparar envio de ${type}:`, error);
        }
    };

    const processIncomingFiles = (files) => {
        if (!files || files.length === 0) return;

        const newFiles = Array.from(files).map(file => {
            let type = 'document';
            if (file.type.startsWith('image/')) type = 'image';
            else if (file.type.startsWith('video/')) type = 'video';
            else if (file.type.startsWith('audio/')) type = 'audio';

            let previewUrl = null;
            if (type === 'image' || type === 'video') {
                previewUrl = URL.createObjectURL(file);
            }
            return { file, type, previewUrl };
        });

        setSelectedFiles(prev => [...prev, ...newFiles]);
    };

    const handleFileChange = (event, type) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        const processed = Array.from(files).map(file => {
            let previewUrl = null;
            if (type === 'image' || type === 'video') {
                previewUrl = URL.createObjectURL(file);
            }
            return { file, type, previewUrl };
        });

        setSelectedFiles(prev => [...prev, ...processed]);

        if (imageInputRef.current) imageInputRef.current.value = null;
        if (docInputRef.current) docInputRef.current.value = null;
        if (videoInputRef.current) videoInputRef.current.value = null;

        setShowAttachMenu(false);
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const files = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) files.push(file);
            }
        }
        
        if (files.length > 0) {
            processIncomingFiles(files);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            processIncomingFiles(files);
        }
    };

    const removeSelectedFile = (indexToRemove) => {
        setSelectedFiles(prev => {
            const next = [...prev];
            const item = next[indexToRemove];
            if (item && item.previewUrl) {
                URL.revokeObjectURL(item.previewUrl);
            }
            next.splice(indexToRemove, 1);
            return next;
        });
    };

    const submitTextLogic = () => {
        const textToSend = text.trim();
        if (!textToSend && selectedFiles.length === 0 && !isRecording) return;
        if (isSendingMedia) return;

        setText(''); 

        const filesToSubmit = [...selectedFiles];
        setSelectedFiles([]); 

        setTimeout(() => {
            const textarea = textInputRef.current;
            if (textarea) {
                textarea.focus();
                textarea.style.height = 'auto'; 
                textarea.style.overflowY = 'hidden';
            }
        }, 0);

        if (filesToSubmit.length > 0) {
            filesToSubmit.forEach((item, index) => {
                const captionThisFile = (index === 0 && textToSend) ? textToSend : null;
                onSendMedia(item.file, item.type, item.file.name, captionThisFile);
            });
        } else if (textToSend) {
            onSendMessage(textToSend); 
        }
    };

    const handleSubmitText = (e) => {
        e.preventDefault();
        submitTextLogic();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); 
            submitTextLogic();  
        }
    };

    const formatRecordingTime = (time) => {
        const minutes = Math.floor(time / 60).toString().padStart(2, '0');
        const seconds = (time % 60).toString().padStart(2, '0');
        return `${minutes}:${seconds}`;
    };

    return (
        <footer className="footer-loft">
            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'image')} multiple />
            <input type="file" ref={docInputRef} accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={(e) => handleFileChange(e, 'document')} multiple />
            <input type="file" ref={videoInputRef} accept="video/*" className="hidden" onChange={(e) => handleFileChange(e, 'video')} multiple />

            <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative flex ${selectedFiles.length > 0 ? 'items-end' : 'items-center'} gap-3 p-1.5 bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-emerald-900/5 border transition-all duration-500 ${isRecording ? 'ring-2 ring-red-500/20' : 'hover:shadow-emerald-900/10'} ${isDragging ? 'border-dashed border-brand-green bg-emerald-50/50 scale-[1.01]' : 'border-white'}`}>

                {isRecording ? (
                    <div className="flex-1 flex items-center justify-between px-3 h-12">
                        <button type="button" onClick={cancelRecording} className="w-9 h-9 flex items-center justify-center rounded-2xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                            <Trash2 size={18} />
                        </button>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-2xl border border-red-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-[11px] font-black font-mono text-red-600 tracking-wider">
                                    {formatRecordingTime(recordingTime)}
                                </span>
                            </div>
                        </div>

                        <button type="button" onClick={stopRecording} className="w-10 h-10 flex items-center justify-center rounded-2xl bg-brand-green text-white shadow-lg shadow-emerald-200 hover:scale-105 transition-all">
                            <Send size={18} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-1 pl-1">
                            <div className="relative" ref={attachMenuRef}>
                                <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)} className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all ${showAttachMenu ? 'bg-brand-green text-white shadow-lg shadow-emerald-100' : 'text-slate-400 hover:bg-slate-50 hover:text-brand-green'}`}>
                                    <Paperclip size={20} className={showAttachMenu ? 'rotate-45 transition-all' : ''} />
                                </button>

                                {showAttachMenu && (
                                    <div className="absolute bottom-14 left-0 bg-white border border-slate-100 rounded-[2rem] shadow-2xl w-52 p-1.5 z-50 animate-fade-in">
                                        <button onClick={() => imageInputRef.current?.click()} className="w-full flex items-center gap-3 p-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-green rounded-2xl transition-all">
                                            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center"><ImageIcon size={16} /></div> Imagem
                                        </button>
                                        <button onClick={() => videoInputRef.current?.click()} className="w-full flex items-center gap-3 p-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-green rounded-2xl transition-all">
                                            <div className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><FileVideo size={16} /></div> Vídeo
                                        </button>
                                        <button onClick={() => docInputRef.current?.click()} className="w-full flex items-center gap-3 p-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-green rounded-2xl transition-all">
                                            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-brand-green flex items-center justify-center"><FileText size={16} /></div> Documento
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button type="button" onClick={onOpenTemplateModal} className="w-10 h-10 flex items-center justify-center rounded-2xl text-slate-400 hover:bg-slate-50 hover:text-brand-green transition-all">
                                <MessageSquarePlus size={20} />
                            </button>
                        </div>

                        <div className="flex-1 flex flex-col min-w-0 gap-4">
                            {selectedFiles.length > 0 && (
                                <div className="w-full flex items-center gap-2 pb-2 mb-1 border-b border-slate-100 overflow-x-auto no-scrollbar">
                                    {selectedFiles.map((item, index) => (
                                        <div key={index} className="relative group shrink-0 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 overflow-hidden w-16 h-16">
                                            <button
                                                type="button"
                                                onClick={() => removeSelectedFile(index)}
                                                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-black/50 hover:bg-red-500 text-white rounded-full transition-colors z-10"
                                            >
                                                <XIcon size={12} />
                                            </button>
                                            {item.type === 'image' ? (
                                                <img src={item.previewUrl} alt="preview" className="w-full h-full object-cover" />
                                            ) : item.type === 'video' ? (
                                                <video src={item.previewUrl} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center justify-center p-2 text-slate-500">
                                                    <FileText size={20} />
                                                    <span className="text-[9px] mt-1 text-center w-full truncate">
                                                        {item.file.name}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <textarea
                                ref={textInputRef}
                                rows={1}
                                placeholder={selectedFiles.length > 0 ? "Adicione uma legenda..." : "Responda aqui..."}
                                className={`w-full px-2 bg-transparent text-[14px] font-bold text-slate-800 focus:outline-none resize-none no-scrollbar placeholder:text-slate-300 ${selectedFiles.length > 0 ? 'mb-3' : ''}`}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onPaste={handlePaste}
                            />
                        </div>

                        <div className="pr-1">
                            {(text.trim() || selectedFiles.length > 0) ? (
                                <button type="submit" onClick={handleSubmitText} className="w-11 h-11 flex items-center justify-center rounded-[1.2rem] bg-brand-green text-white shadow-xl shadow-emerald-200 hover:scale-105 active:scale-95 transition-all">
                                    <Send size={20} />
                                </button>
                            ) : (
                                <button type="button" onClick={handleMicClick} className="w-11 h-11 flex items-center justify-center rounded-[1.2rem] bg-slate-100 text-slate-400 hover:text-brand-green hover:bg-emerald-50 transition-all group">
                                    <Mic size={20} className="group-hover:scale-110 transition-all" />
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </footer>
    );
};

export default ChatFooter;
