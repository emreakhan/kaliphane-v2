// src/components/Modals/ImagePreviewModal.js

import React from 'react';
import { X, ZoomIn } from 'lucide-react';

const ImagePreviewModal = ({ isOpen, imageUrl, onClose, title }) => {
    if (!isOpen || !imageUrl) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-90 backdrop-blur-sm transition-opacity duration-300" onClick={onClose}>
            {/* Kapatma Butonu (Sağ Üst) */}
            <button 
                onClick={onClose}
                className="absolute top-5 right-5 text-white bg-gray-800 hover:bg-gray-700 rounded-full p-2 transition transform hover:scale-110"
            >
                <X className="w-8 h-8" />
            </button>

            {/* Resim Alanı */}
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                {title && (
                    <div className="absolute top-0 left-0 bg-black/50 text-white text-xs px-2 py-1 rounded-br-lg backdrop-blur-md">
                        {title}
                    </div>
                )}
                <img 
                    src={imageUrl} 
                    alt="Önizleme" 
                    className="max-w-full max-h-[85vh] rounded-lg shadow-2xl border-4 border-gray-800"
                />
                <div className="text-center mt-2">
                    <a 
                        href={imageUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-white text-sm flex items-center justify-center gap-2 transition"
                    >
                        <ZoomIn className="w-4 h-4" /> Orjinal Boyutta Aç
                    </a>
                </div>
            </div>
        </div>
    );
};

export default ImagePreviewModal;