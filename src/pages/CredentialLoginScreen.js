// src/pages/CredentialLoginScreen.js

import React, { useState } from 'react';
// İkonları import etmemiz gerekiyor
import { RefreshCw, AlertTriangle, User, Lock, Eye, EyeOff, LogOut } from 'lucide-react';

/**
 * YENİ: Gerçek Giriş Ekranı (Kullanıcı Adı / Şifre ile)
 */
const CredentialLoginScreen = ({ db, setLoggedInUser, personnel }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async () => {
        if (!username || !password) {
            setError('Kullanıcı adı ve şifre zorunludur.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const lowerCaseUsername = username.trim().toLowerCase();
            const userData = personnel.find(p => p.username === lowerCaseUsername);

            if (!userData) {
                setError('Kullanıcı bulunamadı.');
                setLoading(false);
                return;
            }
            if (userData.password === password) {
                setLoggedInUser({ ...userData });
            } else {
                setError('Hatalı şifre.');
            }
        } catch (err) {
            console.error("Giriş hatası:", err);
            setError('Giriş sırasında bir hata oluştu.');
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl">
                <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-6">
                    Kalıphane Takip Sistemi
                </h2>
    
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Kullanıcı Adı
                        </label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <User className="w-5 h-5 text-gray-400" />
                            </span>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="kullanici.adi"
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Şifre
                        </label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                <Lock className="w-5 h-5 text-gray-400" />
                            </span>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                                {showPassword ?
                                    <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300 flex items-center">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            {error}
                        </div>
                    )}

                </div>
                <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 mt-6 disabled:opacity-50"
                >
                    {loading ?
                        <RefreshCw className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5 mr-2 rotate-180"/>}
                    {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
                </button>
            </div>
            <p className="mt-4 text-xs text-red-500 dark:text-red-400 text-center max-w-md">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Bu sistem, şifreleri güvensiz (şifrelenmemiş) olarak saklamaktadır.
                Bu yalnızca bir demo/prototip içindir.
            </p>
        </div>
    );
};

export default CredentialLoginScreen;