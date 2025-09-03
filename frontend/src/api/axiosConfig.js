import axios from 'axios';

// 1. Cria uma instância do Axios com a URL base da nossa API
//    A URL é lida de forma segura do arquivo .env
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// 2. Interceptor de Requisição: Adiciona o token de autenticação em CADA requisição
//    Esta função é executada ANTES de qualquer requisição ser enviada.
api.interceptors.request.use(
  (config) => {
    // Pega o token salvo no Local Storage
    const token = localStorage.getItem('accessToken');
    
    // Se o token existir, adiciona-o ao cabeçalho 'Authorization'
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    return config; // Retorna a configuração modificada para a requisição continuar
  },
  (error) => {
    // Se ocorrer um erro na configuração da requisição, ele é rejeitado
    return Promise.reject(error);
  }
);

// 3. Interceptor de Resposta: Lida com tokens expirados (erro 401)
//    Esta função é executada DEPOIS que uma resposta da API é recebida.
api.interceptors.response.use(
  // Se a resposta for um sucesso (status 2xx), apenas a retorna
  (response) => {
    return response;
  },
  // Se a resposta for um erro...
  (error) => {
    // Verifica se o erro é por falta de autorização (token inválido/expirado)
    if (error.response && error.response.status === 401) {
      console.error("Erro 401: Token inválido ou expirado. Redirecionando para login.");

      // Salva a página atual que o usuário tentava acessar
      const currentPath = window.location.pathname;
      if (currentPath !== '/login') {
          localStorage.setItem('redirectPath', currentPath);
      }

      // Limpa o token inválido do armazenamento
      localStorage.removeItem('accessToken');
      
      // Força o redirecionamento para a página de login.
      // Usamos window.location.href para garantir uma recarga completa da página.
      window.location.href = '/login';
    }
    
    // Para qualquer outro erro, apenas o repassa para ser tratado no local da chamada.
    return Promise.reject(error);
  }
);

export default api;

