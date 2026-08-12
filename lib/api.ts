const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('e360_token');
}

export function saveSession(token: string, usuario: Usuario) {
  localStorage.setItem('e360_token', token);
  localStorage.setItem('e360_usuario', JSON.stringify(usuario));
}

export function clearSession() {
  localStorage.removeItem('e360_token');
  localStorage.removeItem('e360_usuario');
}

export function getUsuario(): Usuario | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('e360_usuario');
  return raw ? JSON.parse(raw) : null;
}

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: 'superadmin' | 'admin';
  cnpj: string;
  razao_social: string;
}

export interface Empresa {
  id: number;
  cnpj: string;
  razao_social: string;
  backend_url: string | null;
  ativo: boolean;
  created_at: string;
  // Tunnel principal (LEFT JOIN tunnel_portas WHERE principal = true)
  porta_id: number | null;
  porta_local: number | null;
  tunnel_cf_id: string | null;
  tunnel_machine_id: string | null;
  tunnel_backend_url: string | null;
  tunnel_ativo: boolean | null;
}

export interface TunnelHealth {
  cnpj: string;
  status: string;
  connections: number;
}

export interface CfTunnel {
  id: string;
  nome: string;
  status: string;
  conexoes: number;
  criado_em: string;
  orfao: boolean;
  cnpj: string | null;
  razao_social: string | null;
  portas: string[] | null;
}

export interface TunnelInfo {
  tunnel_id?: string;
  backend_url?: string;
  porta?: number;
  status?: string;
  instalar_windows: string;
  instalar_linux: string;
}

export interface TunnelPorta {
  id: number;
  cnpj?: string;
  nome: string;
  porta_local: number;
  protocolo: string;
  principal: boolean;
  aplicacao?: 'giro_web' | 'petshop_web';
  cf_tunnel_id: string | null;
  backend_url: string | null;
  ativo: boolean;
  created_at: string;
  api_usuario?: string;
  api_senha?: string;
  api_senha_set?: boolean;
  api_key?: string;
  giro_jwt_secret?: string;
  machine_id?: string | null;
  versao_atual?: string | null;
  versao_reportada_em?: string | null;
  // health (só presente no endpoint /health)
  status?: string;
  connections?: number;
}

export interface Dispositivo {
  id: number;
  device_id: string;
  cnpj: string;
  razao_social: string;
  nome: string | null;
  status: 'pendente' | 'aprovado' | 'bloqueado';
  ip_registro: string;
  created_at: string;
  aprovado_por_nome: string | null;
  aplicacao?: 'giro_web' | 'petshop_web';
}

export interface SecurityAlert {
  ts: string;
  machine_id: string;
  message: string;
}

export interface Release {
  id: number;
  versao: string;
  changelog: string | null;
  arquivo_nome: string;
  arquivo_tamanho: number;
  sha256: string;
  created_at: string;
  criado_por_nome: string | null;
}

export interface UsuarioAdmin {
  id: number;
  cnpj: string;
  nome: string;
  email: string;
  role: string;
  ativo: boolean;
  created_at: string;
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const contentType = res.headers.get('content-type') || '';
  let data: unknown;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    // Tenta parsear mesmo assim (algumas respostas têm content-type errado)
    try { data = JSON.parse(text); } catch { data = { erro: text || `Erro ${res.status}` }; }
  }

  if (!res.ok) {
    const msg = (data as Record<string, string>)?.erro || `Erro ${res.status}`;
    // Token expirado em rota autenticada → redireciona para login
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/signin')) {
      clearSession();
      window.location.href = '/auth';
    }
    throw new Error(msg);
  }
  return data as T;
}

// Auth
export const api = {
  signin: (email: string, senha: string, captcha_token?: string) =>
    req<{ token: string; usuario: Usuario }>('/signin', {
      method: 'POST',
      body: JSON.stringify({ email, senha, captcha_token }),
    }),

  validateToken: (token: string) =>
    req<{ valid: boolean; usuario: Usuario | null }>('/validateToken', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  // Empresas
  getEmpresas: () => req<Empresa[]>('/empresas'),
  criarEmpresa: (data: Partial<Empresa>) =>
    req<Empresa>('/empresas', { method: 'POST', body: JSON.stringify(data) }),
  atualizarEmpresa: (cnpj: string, data: Partial<Empresa>) =>
    req<Empresa>(`/empresas/${cnpj}`, { method: 'PUT', body: JSON.stringify(data) }),
  excluirEmpresa: (cnpj: string) =>
    req<{ ok: boolean }>(`/empresas/${cnpj}`, { method: 'DELETE' }),

  // Limpeza de tunnels órfãos na Cloudflare
  getCfTunnels: () => req<CfTunnel[]>('/admin/cf-tunnels'),
  deletarCfTunnel: (id: string) =>
    req<{ ok: boolean }>(`/admin/cf-tunnels/${id}`, { method: 'DELETE' }),

  // Portas / Tunnels
  getPortas: (cnpj: string) =>
    req<TunnelPorta[]>(`/empresas/${cnpj}/portas`),
  adicionarPorta: (cnpj: string, data: { nome: string; porta_local: number; protocolo: string; principal: boolean; aplicacao?: 'giro_web' | 'petshop_web' }) =>
    req<TunnelPorta>(`/empresas/${cnpj}/portas`, { method: 'POST', body: JSON.stringify(data) }),
  editarPorta: (cnpj: string, id: number, data: Partial<TunnelPorta>) =>
    req<TunnelPorta>(`/empresas/${cnpj}/portas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  removerPorta: (cnpj: string, id: number) =>
    req<{ ok: boolean }>(`/empresas/${cnpj}/portas/${id}`, { method: 'DELETE' }),
  healthPortas: (cnpj: string) =>
    req<TunnelPorta[]>(`/empresas/${cnpj}/portas/health`),
  criarTunnelPorta: (cnpj: string, id: number) =>
    req<TunnelInfo & { id: number; porta_local: number; nome: string }>(`/empresas/${cnpj}/portas/${id}/tunnel`, { method: 'POST' }),
  removerTunnelPorta: (cnpj: string, id: number) =>
    req<{ ok: boolean }>(`/empresas/${cnpj}/portas/${id}/tunnel`, { method: 'DELETE' }),
  getInstalar: (cnpj: string, id: number) =>
    req<{ nome: string; porta_local: number; backend_url: string; instalar_windows: string; instalar_linux: string; desinstalar: string }>(`/empresas/${cnpj}/portas/${id}/instalar`),
  gerarSetupToken: (cnpj: string, id: number, machine_id?: string) =>
    req<{ ok: boolean; setup_token: string; porta_nome: string; expira_em_minutos: number; travado_ao_equipamento: boolean; aviso: string }>(
      `/empresas/${cnpj}/portas/${id}/setup-token`,
      { method: 'POST', body: JSON.stringify(machine_id ? { machine_id } : {}) }
    ),
  getSecurityAlerts: (cnpj: string) =>
    req<SecurityAlert[]>(`/empresas/${cnpj}/security-alerts`),
  regenerarInstallerKey: (cnpj: string) =>
    req<{ ok: boolean; aviso: string }>(`/empresas/${cnpj}/installer-key/regenerar`, { method: 'POST' }),
  editarCredenciais: (cnpj: string, id: number, api_usuario: string, api_senha: string) =>
    req<TunnelPorta>(`/empresas/${cnpj}/portas/${id}`, { method: 'PUT', body: JSON.stringify({ api_usuario, api_senha }) }),
  regenerarApiKey: (cnpj: string, id: number) =>
    req<{ ok: boolean; api_key: string }>(`/empresas/${cnpj}/portas/${id}/regenerar-api-key`, { method: 'POST' }),
  limparMaquina: (cnpj: string, id: number) =>
    req<{ ok: boolean }>(`/empresas/${cnpj}/portas/${id}/machine`, { method: 'DELETE' }),
  getTunnelsHealth: () => req<TunnelHealth[]>('/admin/tunnels-health'),

  getInstallerKey: async (): Promise<{ api_key: string }> => req('/admin/installer-key'),

  getIniPadrao: async (): Promise<string> => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/admin/ini-padrao`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as Record<string,string>).erro || `Erro ${res.status}`);
    }
    return res.text();
  },
  getIniInstalador: async (cnpj: string, id: number): Promise<string> => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/empresas/${cnpj}/portas/${id}/ini-instalador`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as Record<string,string>).erro || `Erro ${res.status}`);
    }
    return res.text();
  },

  // Dispositivos
  getDispositivos: (params?: { cnpj?: string; status?: string; aplicacao?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return req<Dispositivo[]>(`/dispositivos${qs ? '?' + qs : ''}`);
  },
  atualizarDispositivo: (id: number, data: { status: string; nome?: string }) =>
    req<Dispositivo>(`/dispositivos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  removerDispositivo: (id: number) =>
    req<{ ok: boolean }>(`/dispositivos/${id}`, { method: 'DELETE' }),

  // Releases (Fase 2 — catálogo de versões do MVC_LOGIDOC)
  getReleases: () => req<Release[]>('/admin/releases'),
  uploadRelease: async (versao: string, changelog: string, arquivo: File): Promise<{ ok: boolean; release: Release }> => {
    const token = getToken();
    const form = new FormData();
    form.append('versao', versao);
    form.append('changelog', changelog);
    form.append('arquivo', arquivo);
    const res = await fetch(`${BASE_URL}/admin/releases`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as Record<string, string>).erro || `Erro ${res.status}`);
    return data as { ok: boolean; release: Release };
  },
  baixarRelease: async (id: number, nomeArquivo: string): Promise<void> => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/admin/releases/${id}/download`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as Record<string, string>).erro || `Erro ${res.status}`);
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  removerRelease: (id: number) =>
    req<{ ok: boolean }>(`/admin/releases/${id}`, { method: 'DELETE' }),

  // Usuários
  getUsuarios: () => req<UsuarioAdmin[]>('/usuarios'),
  criarUsuario: (data: { cnpj: string; nome: string; email: string; senha: string; role?: string }) =>
    req<UsuarioAdmin>('/usuarios', { method: 'POST', body: JSON.stringify(data) }),
  trocarSenha: (id: number, senha_atual: string, senha_nova: string) =>
    req<{ ok: boolean }>(`/usuarios/${id}/senha`, {
      method: 'PUT',
      body: JSON.stringify({ senha_atual, senha_nova }),
    }),
};
