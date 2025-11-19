// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom'; // Eklendi
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter> {/* Eklendi: Uygulamayı Router ile sarmaladık */}
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();