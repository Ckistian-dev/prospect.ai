import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom' // <-- 1. Importa o BrowserRouter
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* 2. O ÚNICO BrowserRouter da aplicação envolve o App aqui */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

