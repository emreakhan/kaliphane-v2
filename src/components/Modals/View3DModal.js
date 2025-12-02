// src/components/Modals/View3DModal.js

import React, { useState, Suspense } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OrbitControls, Stage } from '@react-three/drei';
import { X, Upload, Box, Loader as LoaderIcon } from 'lucide-react';
import { 
    storage, 
    db, 
    ref, 
    uploadBytes, 
    getDownloadURL, 
    doc, 
    updateDoc
} from '../../config/firebase.js'; // SADECE FONKSİYONLAR

import { PROJECT_COLLECTION } from '../../config/constants.js'; // ADRES BURADAN

// 3D Model Bileşeni
const Model = ({ url }) => {
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#d1d5db" roughness={0.5} metalness={0.1} />
    </mesh>
  );
};

const View3DModal = ({ isOpen, onClose, mold }) => {
    const [uploading, setUploading] = useState(false);
    const [currentStlUrl, setCurrentStlUrl] = useState(mold?.stlUrl || null);

    if (!isOpen || !mold) return null;

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.stl')) {
            alert("Lütfen sadece .stl uzantılı dosya yükleyiniz.");
            return;
        }

        setUploading(true);
        try {
            const storageRef = ref(storage, `molds/${mold.id}/3d_model.stl`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            const moldRef = doc(db, PROJECT_COLLECTION, mold.id);
            await updateDoc(moldRef, { stlUrl: downloadURL });

            setCurrentStlUrl(downloadURL);
        } catch (error) {
            console.error("Yükleme hatası:", error);
            alert("Dosya yüklenirken bir hata oluştu.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex justify-center items-center z-[70] p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden relative border border-gray-200 dark:border-gray-700">
                
                <div className="flex justify-between items-center p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 z-10 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
                        <Box className="w-6 h-6 mr-2 text-blue-600" />
                        3D Kalıp Görüntüleyici - <span className="ml-2 font-normal text-gray-500">{mold.moldName}</span>
                    </h3>
                    <div className="flex items-center gap-4">
                        <label className={`cursor-pointer px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition flex items-center shadow-lg ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {uploading ? <LoaderIcon className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            {uploading ? 'Yükleniyor...' : (currentStlUrl ? 'Modeli Güncelle' : 'Model Yükle')}
                            <input type="file" className="hidden" accept=".stl" onChange={handleFileUpload} disabled={uploading} />
                        </label>
                        <button onClick={onClose} className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 bg-gray-100 dark:bg-gray-900 relative overflow-hidden">
                    {currentStlUrl ? (
                        <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 150], fov: 45 }}>
                            <Suspense fallback={null}>
                                <Stage environment={null} intensity={1} contactShadow={false}>
                                    <Model url={currentStlUrl} />
                                </Stage>
                                <ambientLight intensity={0.4} />
                                <directionalLight position={[10, 10, 10]} intensity={1.5} />
                                <directionalLight position={[-10, -10, -10]} intensity={0.5} />
                            </Suspense>
                            <OrbitControls makeDefault />
                        </Canvas>
                    ) : (
                        <div className="h-full flex flex-col justify-center items-center text-gray-400 dark:text-gray-500 p-8 text-center">
                            <div className="w-32 h-32 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mb-6">
                                <Box className="w-16 h-16 opacity-50" />
                            </div>
                            <h4 className="text-2xl font-bold mb-2 text-gray-600 dark:text-gray-300">3D Model Bulunamadı</h4>
                            <p className="max-w-md text-gray-500 dark:text-gray-400 mb-8">
                                Bu kalıba ait <strong>.STL</strong> dosyasını yükleyerek parçayı 360° inceleyebilirsiniz.
                            </p>
                        </div>
                    )}

                    {currentStlUrl && (
                        <div className="absolute top-4 left-4 pointer-events-none">
                            <Suspense fallback={
                                <div className="flex items-center bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                                    <LoaderIcon className="w-4 h-4 mr-2 animate-spin"/> Model Yükleniyor...
                                </div>
                            }>
                            </Suspense>
                        </div>
                    )}
                    
                    {currentStlUrl && (
                        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-white/90 dark:bg-gray-800/90 text-gray-600 dark:text-gray-300 text-xs px-4 py-2 rounded-full shadow-lg pointer-events-none border dark:border-gray-600">
                            🖱️ Sol Tık: Çevir | 👉 Sağ Tık: Taşı | 🔍 Tekerlek: Yakınlaş
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default View3DModal;