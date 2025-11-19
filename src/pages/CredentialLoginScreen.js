// src/pages/CredentialLoginScreen.js

import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';
import { Lock, User, LogIn, AlertCircle, Hexagon } from 'lucide-react'; // Hexagon ikonu logo yerine eklendi

// --- TEK RESİM IMPORTU ---
// Sadece assets klasörüne attığın arka plan resmini çağırıyoruz.
import backgroundImage from '../assets/kaliphane-bg.jpg'; 

const CredentialLoginScreen = ({ setLoggedInUser, personnel }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const user = personnel.find(p => p.username === username && p.password === password);

            if (user) {
                setLoggedInUser(user);
                localStorage.setItem('kaliphane_user', JSON.stringify(user));
            } else {
                setError('Kullanıcı adı veya şifre hatalı!');
            }
        } catch (err) {
            setError('Giriş yapılırken bir hata oluştu.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div 
            className="min-h-screen flex items-center justify-center bg-gray-900 px-4 relative overflow-hidden bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundImage})` }} 
        >
            {/* Arka Plan Karartma (Yazılar okunsun diye) */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"></div>

            {/* Login Kartı */}
            <div className="max-w-md w-full space-y-8 bg-black/40 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/10 relative z-10 animate-fade-in-up">
                
                {/* --- LOGO YERİNE İKON VE YAZI --- */}
                <div className="flex flex-col items-center justify-center">
                    <div className="mb-2 p-3 bg-white/10 rounded-full shadow-lg border border-white/20">
                        {/* Resim yerine Lucide'in şık bir ikonunu koyduk */}
                        <Hexagon className="h-10 w-10 text-blue-400" strokeWidth={1.5} />
                    </div>
                    <h2 className="mt-2 text-3xl font-extrabold text-white tracking-tight drop-shadow-md text-center">
                        Etka-D Kalıp
                    </h2>
                    <p className="mt-1 text-sm text-gray-300 drop-shadow-sm text-center">
                        Üretim Takip Sistemi
                    </p>
                </div>

                {error && (
                    <div className="bg-red-500/20 border-l-4 border-red-500 p-4 rounded-md flex items-center">
                        <AlertCircle className="h-5 w-5 text-red-400 mr-3" />
                        <p className="text-sm text-red-100 font-medium">{error}</p>
                    </div>
                )}

                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    <div className="space-y-4">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                            </div>
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="block w-full px-3 py-3 pl-10 border border-white/20 rounded-lg bg-black/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm transition-all"
                                placeholder="Kullanıcı Adı"
                            />
                        </div>

                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                            </div>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full px-3 py-3 pl-10 border border-white/20 rounded-lg bg-black/50 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm transition-all"
                                placeholder="Şifre"
                            />
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 shadow-lg hover:shadow-blue-500/30 transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                                <LogIn className="h-5 w-5 text-blue-200 group-hover:text-white transition-colors" />
                            </span>
                            {loading ? 'Giriş Yapılıyor...' : 'Sisteme Giriş Yap'}
                        </button>
                    </div>
                </form>

                <div className="text-center mt-6">
                    <p className="text-xs text-gray-500/80">
                        &copy; {new Date().getFullYear()} Etka-D Kalıp ve Plastik San. Tic. Ltd. Şti.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default CredentialLoginScreen;