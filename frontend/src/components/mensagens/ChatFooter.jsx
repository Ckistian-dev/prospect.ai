import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, Mic, Send, Image as ImageIcon, FileText, StopCircle, Trash2, FileVideo } from 'lucide-react';

const ChatFooter = ({ onSendMessage, onSendMedia }) => {
    const [text, setText] = useState('');
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    const attachMenuRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingIntervalRef = useRef(null);
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
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const textarea = textInputRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            const scrollHeight = textarea.scrollHeight;
            textarea.style.height = `${Math.min(scrollHeight, 120)}px`;
            textarea.style.overflowY = scrollHeight > 120 ? 'auto' : 'hidden';
        }
    }, [text]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeTypes = ['audio/ogg; codecs=opus', 'audio/webm; codecs=opus'];
            const supportedType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';

            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: supportedType });
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
            mediaRecorderRef.current.onstop = () => {
                clearInterval(recordingIntervalRef.current);
                setRecordingTime(0);
                setIsRecording(false);
                stream.getTracks().forEach(track => track.stop());

                if (didCancelRecordingRef.current) {
                    didCancelRecordingRef.current = false;
                    return;
                }

                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
                if (audioBlob.size > 1000) {
                    onSendMedia(audioBlob, 'audio', `audio_${Date.now()}.ogg`);
                }
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            recordingIntervalRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
        } catch (err) {
            alert("Não foi possível acessar o microfone.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === "recording") {
            didCancelRecordingRef.current = false;
            mediaRecorderRef.current.stop();
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current?.state === "recording") {
            didCancelRecordingRef.current = true;
            mediaRecorderRef.current.stop();
        }
    };

    const handleFileChange = (event, type) => {
        const files = event.target.files;
        if (!files) return;
        for (const file of files) {
            onSendMedia(file, type, file.name);
        }
        event.target.value = null;
        setShowAttachMenu(false);
    };

    const submitText = (e) => {
        e?.preventDefault();
        const t = text.trim();
        if (!t || isRecording) return;
        onSendMessage(t);
        setText('');
    };

    const formatTime = (time) => {
        const m = Math.floor(time / 60).toString().padStart(2, '0');
        const s = (time % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <footer className="flex-shrink-0 p-3 bg-[#f0f2f5] border-t border-gray-200">
            <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'image')} multiple />
            <input type="file" ref={docInputRef} accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={(e) => handleFileChange(e, 'document')} multiple />
            <input type="file" ref={videoInputRef} accept="video/*" className="hidden" onChange={(e) => handleFileChange(e, 'video')} multiple />

            {isRecording ? (
                <div className="flex items-center gap-3">
                    <button onClick={cancelRecording} className="p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-200"><Trash2 size={22} /></button>
                    <div className="flex-1 flex items-center justify-center gap-2 text-red-600">
                        <StopCircle size={16} className="animate-pulse" />
                        <span className="font-mono">{formatTime(recordingTime)}</span>
                    </div>
                    <button onClick={stopRecording} className="p-2 text-white bg-brand-green rounded-full hover:bg-brand-green-dark transition-colors"><Send size={22} /></button>
                </div>
            ) : (
                <form onSubmit={submitText} className="flex items-center gap-3">
                    <div className="relative" ref={attachMenuRef}>
                        {showAttachMenu && (
                            <div className="absolute bottom-12 left-0 bg-white rounded-lg shadow-lg overflow-hidden w-48 z-10">
                                <button type="button" onClick={() => imageInputRef.current?.click()} className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-100">
                                    <ImageIcon size={20} className="text-purple-500" /> Imagem
                                </button>
                                <button type="button" onClick={() => videoInputRef.current?.click()} className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-100">
                                    <FileVideo size={20} className="text-red-500" /> Vídeo
                                </button>
                                <button type="button" onClick={() => docInputRef.current?.click()} className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-100">
                                    <FileText size={20} className="text-blue-500" /> Documento
                                </button>
                            </div>
                        )}
                        <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)} className="p-2 text-gray-500 hover:text-brand-green rounded-full hover:bg-gray-200 transition-colors">
                            <Paperclip size={22} />
                        </button>
                    </div>
                    <textarea
                        ref={textInputRef} rows={1} placeholder="Digite uma mensagem"
                        className="flex-1 px-4 py-2 border border-gray-300 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-green-light focus:border-brand-green transition-all resize-none"
                        value={text} onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); } }}
                    />
                    {text.trim() ? (
                        <button type="submit" className="p-2 text-white bg-brand-green rounded-full hover:bg-brand-green-dark transition-colors shadow-md"><Send size={22} /></button>
                    ) : (
                        <button type="button" onClick={startRecording} className="p-2 text-gray-500 hover:text-brand-green rounded-full hover:bg-gray-200 transition-colors"><Mic size={22} /></button>
                    )}
                </form>
            )}
        </footer>
    );
};

export default ChatFooter;
