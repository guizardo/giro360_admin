'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, getUsuario, type Empresa, type TunnelPorta, type TunnelHealth, type Usuario, type SecurityAlert } from '@/lib/api';
import { crypt } from '@/lib/crypt';

const STATUS_COR: Record<string, { dot: string; text: string; label: string }> = {
  healthy:      { dot: 'bg-green-500',  text: 'text-green-700',  label: 'Online'       },
  inactive:     { dot: 'bg-gray-400',   text: 'text-gray-500',   label: 'Inativo'      },
  degraded:     { dot: 'bg-yellow-500', text: 'text-yellow-700', label: 'Degradado'    },
  down:         { dot: 'bg-red-500',    text: 'text-red-700',    label: 'Offline'      },
  desconhecido: { dot: 'bg-gray-300',   text: 'text-gray-400',   label: 'Desconhecido' },
  erro:         { dot: 'bg-red-400',    text: 'text-red-500',    label: 'Erro CF'      },
};

type Modal = null | 'empresa' | 'portas' | 'nova-porta' | 'instalar' | 'setup-token' | 'credenciais' | 'ini-padrao' | 'excluir-empresa';

export default function EmpresasPage() {
  const [usuario, setUsuario]         = useState<Usuario | null>(null);
  const [empresas, setEmpresas]       = useState<Empresa[]>([]);
  const [loading, setLoading]         = useState(true);
  const [erro, setErro]               = useState('');
  const [modal, setModal]             = useState<Modal>(null);
  const [empresaSel, setEmpresaSel]   = useState<Empresa | null>(null);
  const [editando, setEditando]       = useState<Empresa | null>(null);
  const [portas, setPortas]           = useState<TunnelPorta[]>([]);
  const [portasHealth, setPortasHealth] = useState<Record<number, { status: string; connections: number }>>({});
  const [instalar, setInstalar]       = useState<{ nome: string; instalar_windows: string; instalar_linux: string; backend_url: string; desinstalar: string } | null>(null);
  const [setupToken, setSetupToken]   = useState<{ token: string; porta_nome: string; expiraEmMinutos: number; travadoAoEquipamento: boolean } | null>(null);
  const [alertasSeguranca, setAlertasSeguranca] = useState<SecurityAlert[]>([]);
  const [portaCred, setPortaCred]     = useState<TunnelPorta | null>(null);
  const [formCred, setFormCred]       = useState({ api_usuario: 'logidoc_api', api_senha: '' });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [senhaEncriptada, setSenhaEncriptada] = useState('');
  const [formEmpresa, setFormEmpresa] = useState({ cnpj: '', razao_social: '', backend_url: '' });
  const [formPorta, setFormPorta]     = useState<{ nome: string; porta_local: string; protocolo: string; principal: boolean; aplicacao: 'giro_web' | 'petshop_web' }>(
    { nome: 'API Delphi', porta_local: '8082', protocolo: 'http', principal: true, aplicacao: 'giro_web' }
  );
  const [salvando, setSalvando]       = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [tunnelHealth, setTunnelHealth]   = useState<Record<string, { status: string; connections: number }>>({});
  const [installerKey, setInstallerKey]   = useState('');
  const [iniPadraoConteudo, setIniPadraoConteudo] = useState('');
  const [jwtSecretEncriptado, setJwtSecretEncriptado] = useState('');
  const [empresaExcluir, setEmpresaExcluir] = useState<Empresa | null>(null);
  const [confirmExcluirTexto, setConfirmExcluirTexto] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setEmpresas(await api.getEmpresas()); setErro(''); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro.'); }
    finally { setLoading(false); }
  }, []);

  const carregarHealth = useCallback(async () => {
    try {
      const health: TunnelHealth[] = await api.getTunnelsHealth();
      const map: Record<string, { status: string; connections: number }> = {};
      health.forEach(h => { map[h.cnpj] = { status: h.status, connections: h.connections }; });
      setTunnelHealth(map);
    } catch { /* ignorar — admin sem permissão retorna 403 */ }
  }, []);

  useEffect(() => { setUsuario(getUsuario()); carregar(); carregarHealth(); }, [carregar, carregarHealth]);

  // ── Empresa ──────────────────────────────────────────────────
  function abrirNova() {
    setEditando(null);
    setFormEmpresa({ cnpj: '', razao_social: '', backend_url: '' });
    setModal('empresa');
  }
  function abrirEditar(e: Empresa) {
    setEditando(e);
    setFormEmpresa({ cnpj: e.cnpj, razao_social: e.razao_social, backend_url: e.backend_url || '' });
    setModal('empresa');
  }
  async function salvarEmpresa() {
    setSalvando(true);
    try {
      if (editando) {
        await api.atualizarEmpresa(editando.cnpj, { razao_social: formEmpresa.razao_social, backend_url: formEmpresa.backend_url || undefined });
      } else {
        await api.criarEmpresa({ cnpj: formEmpresa.cnpj, razao_social: formEmpresa.razao_social });
      }
      setModal(null); carregar();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
    finally { setSalvando(false); }
  }
  async function toggleAtivo(e: Empresa) {
    try { await api.atualizarEmpresa(e.cnpj, { ativo: !e.ativo }); carregar(); }
    catch (err: unknown) { alert(err instanceof Error ? err.message : 'Erro.'); }
  }

  function abrirExcluirEmpresa(e: Empresa) {
    setConfirmExcluirTexto('');
    setEmpresaExcluir(e);
    setModal('excluir-empresa');
  }

  async function confirmarExcluirEmpresa() {
    if (!empresaExcluir) return;
    setExcluindo(true);
    try {
      await api.excluirEmpresa(empresaExcluir.cnpj);
      setModal(null);
      setEmpresaExcluir(null);
      carregar();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao excluir.');
    } finally {
      setExcluindo(false);
    }
  }

  // ── Portas ───────────────────────────────────────────────────
  async function abrirPortas(e: Empresa) {
    setEmpresaSel(e);
    setPortas([]);
    setPortasHealth({});
    setAlertasSeguranca([]);
    setModal('portas');
    const rows = await api.getPortas(e.cnpj);
    setPortas(rows);
    atualizarHealth(e.cnpj, rows);
    api.getSecurityAlerts(e.cnpj).then(setAlertasSeguranca).catch(() => {});
  }

  async function atualizarHealth(cnpj: string, rows?: TunnelPorta[]) {
    const tem = (rows ?? portas).some(p => p.cf_tunnel_id);
    if (!tem) return;
    setLoadingHealth(true);
    try {
      const health = await api.healthPortas(cnpj);
      const map: Record<number, { status: string; connections: number }> = {};
      health.forEach(h => { map[h.id] = { status: h.status || 'desconhecido', connections: h.connections || 0 }; });
      setPortasHealth(map);
    } catch { /* ignora */ }
    finally { setLoadingHealth(false); }
  }

  async function criarTunnelPorta(porta: TunnelPorta) {
    if (!empresaSel) return;
    setSalvando(true);
    try {
      const info = await api.criarTunnelPorta(empresaSel.cnpj, porta.id);
      const rows = await api.getPortas(empresaSel.cnpj);
      setPortas(rows);
      carregar();
      // Abrir instalação diretamente
      setInstalar({
        nome:             info.nome,
        instalar_windows: info.instalar_windows,
        instalar_linux:   info.instalar_linux,
        backend_url:      info.backend_url || '',
        desinstalar:      'cloudflared service uninstall',
      });
      setModal('instalar');
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
    finally { setSalvando(false); }
  }

  async function removerTunnelPorta(porta: TunnelPorta) {
    if (!empresaSel || !confirm(`Remover tunnel da porta ${porta.porta_local}?`)) return;
    setSalvando(true);
    try {
      await api.removerTunnelPorta(empresaSel.cnpj, porta.id);
      const rows = await api.getPortas(empresaSel.cnpj);
      setPortas(rows);
      carregar();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
    finally { setSalvando(false); }
  }

  async function verInstalar(porta: TunnelPorta) {
    if (!empresaSel) return;
    try {
      const info = await api.getInstalar(empresaSel.cnpj, porta.id);
      setInstalar(info);
      setSetupToken(null);
      setModal('instalar');
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
  }

  async function gerarSetupToken(porta: TunnelPorta) {
    if (!empresaSel) return;
    const machineId = window.prompt(
      `Gerar novo token de instalação para "${porta.nome}"?\n\nO token anterior será invalidado.\n\n`
      + `Se você já tem o UUID do equipamento do cliente (mostrado no UFormInstall antes de instalar — clique no rótulo "Máquina" lá para copiar), cole aqui para travar o token a essa máquina específica.\n`
      + `Deixe em branco para gerar sem travar (qualquer equipamento que apresentar o token primeiro reivindica a porta).`,
      ''
    );
    if (machineId === null) return; // cancelado
    try {
      const result = await api.gerarSetupToken(empresaSel.cnpj, porta.id, machineId.trim() || undefined);
      setSetupToken({ token: result.setup_token, porta_nome: result.porta_nome, expiraEmMinutos: result.expira_em_minutos, travadoAoEquipamento: result.travado_ao_equipamento });
      // Abrir modal de instalação para exibir o token
      const info = await api.getInstalar(empresaSel.cnpj, porta.id);
      setInstalar(info);
      setModal('instalar');
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
  }

  function abrirCredenciais(porta: TunnelPorta) {
    setPortaCred(porta);
    setFormCred({ api_usuario: porta.api_usuario || 'logidoc_api', api_senha: '' });
    // Pré-preenche a senha encriptada com o valor atual para exibir o INI imediatamente
    setSenhaEncriptada(porta.api_senha ? crypt('C', porta.api_senha) : '');
    setJwtSecretEncriptado(porta.giro_jwt_secret ? crypt('C', porta.giro_jwt_secret) : '');
    setMostrarSenha(false);
    setModal('credenciais');
  }

  function gerarSenhaSegura() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const senha = Array.from(bytes).map(b => chars[b % chars.length]).join('');
    setFormCred(f => ({ ...f, api_senha: senha }));
    setSenhaEncriptada(crypt('C', senha));
    setMostrarSenha(true);
  }

  function atualizarSenha(valor: string) {
    setFormCred(f => ({ ...f, api_senha: valor }));
    setSenhaEncriptada(valor ? crypt('C', valor) : '');
  }

  async function salvarCredenciais() {
    if (!portaCred || !empresaSel) return;
    if (!formCred.api_senha.trim() && !portaCred.api_senha_set) {
      alert('Informe a senha antes de salvar.'); return;
    }
    setSalvando(true);
    try {
      await api.editarCredenciais(empresaSel.cnpj, portaCred.id, formCred.api_usuario, formCred.api_senha);
      const rows = await api.getPortas(empresaSel.cnpj);
      setPortas(rows);
      // Força api_senha_set=true localmente (senha acabou de ser gravada)
      const portaAtualizada = rows.find(r => r.id === portaCred.id) ?? portaCred;
      setPortaCred({ ...portaAtualizada, api_senha_set: true, api_usuario: formCred.api_usuario });
      setFormCred(f => ({ ...f, api_senha: '' }));
      setSenhaEncriptada('');
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro ao salvar.'); }
    finally { setSalvando(false); }
  }

  async function removerPorta(porta: TunnelPorta) {
    if (!empresaSel || !confirm(`Remover porta ${porta.porta_local} (${porta.nome})?`)) return;
    setSalvando(true);
    try {
      await api.removerPorta(empresaSel.cnpj, porta.id);
      const rows = await api.getPortas(empresaSel.cnpj);
      setPortas(rows);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
    finally { setSalvando(false); }
  }

  async function adicionarPorta() {
    if (!empresaSel) return;
    setSalvando(true);
    try {
      await api.adicionarPorta(empresaSel.cnpj, {
        nome:        formPorta.nome,
        porta_local: parseInt(formPorta.porta_local),
        protocolo:   formPorta.protocolo,
        principal:   formPorta.principal,
        aplicacao:   formPorta.aplicacao,
      });
      const rows = await api.getPortas(empresaSel.cnpj);
      setPortas(rows);
      setModal('portas');
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
    finally { setSalvando(false); }
  }

  // ── helpers ──────────────────────────────────────────────────
  function copiar(txt: string) {
    navigator.clipboard.writeText(txt).catch(() => {});
  }

  async function limparMaquina(p: import('@/lib/api').TunnelPorta) {
    if (!empresaSel) return;
    if (!confirm(`Liberar máquina registrada na porta "${p.nome}"?\nIsso invalidará a sessão atual e permitirá instalação em outro equipamento.`)) return;
    try {
      await api.limparMaquina(empresaSel.cnpj, p.id);
      const rows = await api.getPortas(empresaSel.cnpj);
      setPortas(rows);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
  }

  async function regenerarInstallerKey() {
    if (!empresaSel) return;
    if (!confirm(`Gerar nova chave de instalador para "${empresaSel.razao_social}"?\n\nClientes já instalados com a chave anterior vão parar de sincronizar credenciais até receberem um novo INI Instalador.`)) return;
    try {
      const result = await api.regenerarInstallerKey(empresaSel.cnpj);
      alert(result.aviso);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
  }

  async function abrirIniPadrao() {
    try {
      const [{ api_key }, conteudo] = await Promise.all([
        api.getInstallerKey(),
        api.getIniPadrao(),
      ]);
      setInstallerKey(api_key);
      setIniPadraoConteudo(conteudo);
      setModal('ini-padrao');
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
  }

  function downloadIniPadrao() {
    const blob = new Blob([iniPadraoConteudo], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'CLOUDFLARED_BACKEND.INI';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function downloadIniInstalador(porta: TunnelPorta) {
    if (!empresaSel) return;
    try {
      const conteudo = await api.getIniInstalador(empresaSel.cnpj, porta.id);
      const blob = new Blob([conteudo], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'CLOUDFLARED_BACKEND.INI';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro.'); }
  }

  const totalAtivos  = empresas.filter(e => e.ativo).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Empresas / CNPJs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{totalAtivos} ativa{totalAtivos !== 1 ? 's' : ''} de {empresas.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregarHealth} title="Verificar status de todos os tunnels CF"
            className="px-3 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
            ↺ Status tunnels
          </button>
          <button onClick={abrirIniPadrao}
            title="Ver chave de instalação e baixar CLOUDFLARED_BACKEND.INI"
            className="px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors">
            🔑 INI Padrão
          </button>
          <button onClick={abrirNova} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            + Nova empresa
          </button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{erro}</div>}

      {/* Tabela empresas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Carregando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">CNPJ / Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tunnel CF</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empresas.map(e => {
                const h = tunnelHealth[e.cnpj];
                const tunnelStatus = e.tunnel_cf_id
                  ? (h ? h.status : 'desconhecido')
                  : 'inactive';
                const sc = STATUS_COR[tunnelStatus] ?? STATUS_COR.desconhecido;
                return (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{e.razao_social}</div>
                      <div className="font-mono text-xs text-gray-400">{e.cnpj}</div>
                    </td>
                    <td className="px-4 py-3">
                      {e.tunnel_cf_id ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
                              :{e.porta_local ?? '—'}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${sc.text}`}>
                              <span className={`w-2 h-2 rounded-full ${sc.dot} ${tunnelStatus === 'healthy' ? 'animate-pulse' : ''}`} />
                              {sc.label}
                              {h && h.connections > 0 && (
                                <span className="text-gray-400 ml-0.5">·{h.connections}</span>
                              )}
                            </span>
                            {e.tunnel_machine_id ? (
                              <span className="text-xs text-amber-600" title={`Máquina: ${e.tunnel_machine_id}`}>🖥</span>
                            ) : (
                              <span className="text-xs text-gray-300" title="Sem máquina registrada">🔓</span>
                            )}
                          </div>
                          {e.tunnel_backend_url && (
                            <span className="text-xs text-indigo-500 truncate max-w-[260px]" title={e.tunnel_backend_url}>
                              {e.tunnel_backend_url}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 italic">não configurado</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${e.ativo ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {e.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => abrirPortas(e)}
                          className="px-2 py-1 text-xs bg-orange-50 text-orange-700 rounded hover:bg-orange-100 transition-colors font-medium">
                          🌐 Tunnels
                        </button>
                        <button onClick={() => abrirEditar(e)}
                          className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 transition-colors">
                          Editar
                        </button>
                        <button onClick={() => toggleAtivo(e)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${e.ativo ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                          {e.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                        {usuario?.role === 'superadmin' && (
                          <button onClick={() => abrirExcluirEmpresa(e)}
                            className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal Empresa ───────────────────────────────────────── */}
      {modal === 'empresa' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editando ? 'Editar empresa' : 'Nova empresa'}</h2>
            <div className="space-y-3">
              {!editando && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ (somente números)</label>
                  <input value={formEmpresa.cnpj} onChange={e => setFormEmpresa(f => ({ ...f, cnpj: e.target.value }))}
                    maxLength={14} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="00000000000000" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razão Social</label>
                <input value={formEmpresa.razao_social} onChange={e => setFormEmpresa(f => ({ ...f, razao_social: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <p className="text-xs text-gray-400">A URL do backend é preenchida automaticamente ao criar tunnels.</p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={salvarEmpresa} disabled={salvando}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Portas / Tunnels ───────────────────────────────── */}
      {modal === 'portas' && empresaSel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Portas & Tunnels CF</h2>
                <p className="text-sm text-gray-500">{empresaSel.razao_social}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => atualizarHealth(empresaSel.cnpj)}
                  className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
                  {loadingHealth ? '...' : '↺ Health'}
                </button>
                <button onClick={regenerarInstallerKey}
                  title="Gira a installer_key desta empresa — clientes com o INI antigo param de sincronizar até receberem um novo"
                  className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors">
                  🔑 Chave instalador
                </button>
                <button onClick={() => { setFormPorta({ nome: 'API Delphi', porta_local: '8082', protocolo: 'http', principal: portas.length === 0, aplicacao: 'giro_web' }); setModal('nova-porta'); }}
                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                  + Porta
                </button>
              </div>
            </div>

            {alertasSeguranca.length > 0 && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-red-800 mb-1.5">
                  ⚠ {alertasSeguranca.length} tentativa{alertasSeguranca.length !== 1 ? 's' : ''} de ativação com equipamento diferente do registrado
                </p>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {alertasSeguranca.map((a, i) => (
                    <p key={i} className="text-xs text-red-700">
                      <span className="text-red-400">{new Date(a.ts).toLocaleString('pt-BR')}</span>{' '}
                      — {a.message} <span className="font-mono text-red-400">(tentado: …{a.machine_id.slice(-8)})</span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            {portas.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                Nenhuma porta configurada. Adicione uma para criar o tunnel CF.
              </div>
            ) : (
              <div className="space-y-3">
                {portas.map(p => {
                  const h = portasHealth[p.id];
                  const sc = STATUS_COR[h?.status || (p.cf_tunnel_id ? 'desconhecido' : 'inactive')];
                  return (
                    <div key={p.id} className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-gray-900 text-sm">{p.nome}</span>
                            {p.principal && (
                              <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">principal</span>
                            )}
                            {p.aplicacao === 'petshop_web' && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">petshop web</span>
                            )}
                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                              :{p.porta_local} {p.protocolo}
                            </span>
                          </div>

                          {p.cf_tunnel_id ? (
                            <>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`inline-flex items-center gap-1 text-xs font-medium ${sc.text}`}>
                                  <span className={`w-2 h-2 rounded-full ${sc.dot} ${h?.status === 'healthy' ? 'animate-pulse' : ''}`} />
                                  {sc.label}
                                  {h?.connections !== undefined && h.connections > 0 && (
                                    <span className="text-gray-400 ml-1">· {h.connections} conexão{h.connections !== 1 ? 'ões' : ''}</span>
                                  )}
                                </span>
                              </div>
                              <code className="text-xs text-indigo-600 truncate block">{p.backend_url}</code>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 italic">tunnel não criado</span>
                          )}
                          {/* Status do equipamento registrado */}
                          <div className="mt-1.5 flex items-center gap-1.5">
                            {p.machine_id ? (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                🖥 Máquina registrada
                                <span className="font-mono text-amber-500">…{p.machine_id.slice(-8)}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded">
                                🖥 Livre para instalação
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                          {!p.cf_tunnel_id ? (
                            <button onClick={() => criarTunnelPorta(p)} disabled={salvando}
                              className="px-2.5 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors disabled:opacity-50 whitespace-nowrap">
                              ▶ Criar tunnel
                            </button>
                          ) : (
                            <>
                              <button onClick={() => verInstalar(p)}
                                className="px-2.5 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors whitespace-nowrap">
                                📋 Instalar
                              </button>
                              <button onClick={() => gerarSetupToken(p)}
                                className="px-2.5 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors whitespace-nowrap">
                                🔑 Token serviço
                              </button>
                              <button onClick={() => downloadIniInstalador(p)}
                                title="Baixar CLOUDFLARED_BACKEND.INI com setup_token para distribuir ao cliente"
                                className="px-2.5 py-1 text-xs bg-teal-100 text-teal-700 rounded hover:bg-teal-200 transition-colors whitespace-nowrap">
                                ⬇ INI Instalador
                              </button>
                              <button onClick={() => abrirCredenciais(p)}
                                className="px-2.5 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors whitespace-nowrap">
                                🔒 Credenciais
                              </button>
                              {p.machine_id && (
                                <button onClick={() => limparMaquina(p)}
                                  className="px-2.5 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-colors whitespace-nowrap">
                                  🖥 Liberar máquina
                                </button>
                              )}
                            </>
                          )}
                          {p.cf_tunnel_id && (
                            <button onClick={() => removerTunnelPorta(p)} disabled={salvando}
                              className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                              Remover tunnel
                            </button>
                          )}
                          {!p.cf_tunnel_id && (
                            <button onClick={() => removerPorta(p)} disabled={salvando}
                              className="px-2.5 py-1 text-xs bg-gray-100 text-gray-500 rounded hover:bg-gray-200 transition-colors">
                              Excluir porta
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end mt-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Nova Porta ─────────────────────────────────────── */}
      {modal === 'nova-porta' && empresaSel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Nova porta</h2>

            {/* Preview do hostname que será gerado */}
            {formPorta.porta_local && (
              <div className="mb-3 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700">
                URL pública:&nbsp;
                <code className="font-mono">
                  https://{empresaSel.cnpj.substring(0, 8)}{formPorta.principal ? '' : `-p${formPorta.porta_local}`}.logidoc.work
                </code>
                {portas.some(p => p.cf_tunnel_id) && (
                  <span className="block mt-1 text-indigo-500">Será adicionado ao tunnel existente desta empresa.</span>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do serviço</label>
                <input value={formPorta.nome} onChange={e => setFormPorta(f => ({ ...f, nome: e.target.value }))}
                  placeholder="ex: API Delphi, VNC, RDP..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Porta local</label>
                  <input type="number" value={formPorta.porta_local} onChange={e => setFormPorta(f => ({ ...f, porta_local: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Protocolo</label>
                  <select value={formPorta.protocolo} onChange={e => setFormPorta(f => ({ ...f, protocolo: e.target.value }))}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS (cert. autoassinado)</option>
                    <option value="tcp">TCP</option>
                    <option value="ssh">SSH</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={formPorta.principal}
                  onChange={e => setFormPorta(f => ({ ...f, principal: e.target.checked }))}
                  className="rounded border-gray-300" />
                Marcar como backend principal da empresa
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={formPorta.aplicacao === 'petshop_web'}
                  onChange={e => setFormPorta(f => ({ ...f, aplicacao: e.target.checked ? 'petshop_web' : 'giro_web' }))}
                  className="rounded border-gray-300" />
                Backend para aplicação PetShop web
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal('portas')} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={adicionarPorta} disabled={salvando || !formPorta.nome || !formPorta.porta_local}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {salvando ? 'Adicionando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Instalar ───────────────────────────────────────── */}
      {modal === 'instalar' && instalar && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Instalar tunnel — {instalar.nome}</h2>

            <div className="space-y-4">
              {/* Setup token do serviço Windows */}
              {setupToken && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-800 mb-1">Token de Instalação (Serviço Windows) — uso único</p>
                  <p className="text-xs text-blue-600 mb-2">
                    Use na instalação do CloudflaredService.exe na máquina do cliente.
                    Expira em {setupToken.expiraEmMinutos} minutos ou na primeira autenticação, o que ocorrer primeiro.
                    {setupToken.travadoAoEquipamento
                      ? ' 🔒 Travado ao equipamento informado — não funciona em outro computador.'
                      : ' ⚠ Não travado a um equipamento — vale para o computador que apresentar primeiro.'}
                  </p>
                  <div className="relative">
                    <code className="block text-xs bg-blue-900 text-blue-200 rounded px-3 py-2 break-all pr-16">{setupToken.token}</code>
                    <button onClick={() => copiar(setupToken.token)}
                      className="absolute right-2 top-1.5 text-xs bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded">Copiar</button>
                  </div>
                  <p className="text-xs text-blue-700 mt-2">Comando de instalação:</p>
                  <div className="relative mt-1">
                    <code className="block text-xs bg-gray-900 text-green-400 rounded px-3 py-2 break-all pr-16">
                      {`CloudflaredService.exe /install --setup-token ${setupToken.token} --cnpj ${empresaSel?.cnpj}`}
                    </code>
                    <button onClick={() => copiar(`CloudflaredService.exe /install --setup-token ${setupToken.token} --cnpj ${empresaSel?.cnpj}`)}
                      className="absolute right-2 top-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded">Copiar</button>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">URL pública gerada</p>
                <code className="block text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-3 py-2 break-all">{instalar.backend_url}</code>
              </div>

              <p className="text-xs text-gray-500">Instalação direta via cloudflared (alternativa ao serviço Windows):</p>
              {[
                { label: 'Windows (Administrador)', cmd: instalar.instalar_windows, icon: '🪟' },
                { label: 'Linux / Mac',             cmd: instalar.instalar_linux,   icon: '🐧' },
              ].map(({ label, cmd, icon }) => (
                <div key={label}>
                  <p className="text-xs font-medium text-gray-500 mb-1">{icon} {label}</p>
                  <div className="relative">
                    <code className="block text-xs bg-gray-900 text-green-400 rounded px-3 py-2.5 break-all leading-5 pr-16">{cmd}</code>
                    <button onClick={() => copiar(cmd)}
                      className="absolute right-2 top-2 text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded transition-colors">
                      Copiar
                    </button>
                  </div>
                </div>
              ))}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
                Para <strong>desinstalar</strong>: execute <code className="bg-yellow-100 px-1 rounded">{instalar.desinstalar}</code> na máquina do cliente antes de remover o tunnel aqui.
              </div>
            </div>

            <div className="flex justify-end mt-5">
              <button onClick={() => { setModal(empresaSel ? 'portas' : null); setSetupToken(null); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Credenciais API ────────────────────────────────── */}
      {/* ── Modal INI Padrão ─────────────────────────────────────── */}
      {modal === 'ini-padrao' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">INI do Instalador</h2>
            <p className="text-sm text-gray-500 mb-4">Distribua o arquivo <code className="text-xs bg-gray-100 px-1 rounded">CLOUDFLARED_BACKEND.INI</code> junto com o CloudflaredService.exe.</p>

            {/* Chave plain text */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Chave de instalação <span className="font-normal text-gray-400">(INSTALLER_API_KEY — plain text)</span>
              </label>
              <div className="flex gap-2">
                <input readOnly value={installerKey}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50 text-gray-800 select-all" />
                <button onClick={() => { navigator.clipboard.writeText(installerKey); }}
                  className="px-3 text-xs border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                  Copiar
                </button>
              </div>
            </div>

            {/* Preview INI com chave encriptada */}
            <div className="bg-gray-950 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-300">
                  <span className="text-yellow-300">CLOUDFLARED_BACKEND.INI</span>
                  <span className="ml-2 text-gray-500 font-normal">— chave criptografada com XOR (CryptStr)</span>
                </p>
                <button onClick={downloadIniPadrao}
                  className="text-xs bg-teal-700 hover:bg-teal-600 text-white px-2 py-0.5 rounded">
                  ↓ Download
                </button>
              </div>
              <pre className="text-xs text-green-400 whitespace-pre leading-5 select-all">{iniPadraoConteudo}</pre>
            </div>

            <div className="flex justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'credenciais' && portaCred && empresaSel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Credenciais da API</h2>
            <p className="text-sm text-gray-500 mb-4">{portaCred.nome} · porta {portaCred.porta_local}</p>

            {/* Passo 1 – Usuário */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Usuário</label>
              <input value={formCred.api_usuario}
                onChange={e => setFormCred(f => ({ ...f, api_usuario: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="logidoc_api" />
            </div>

            {/* Senha atual — somente leitura, para uso em integrações */}
            {portaCred?.api_senha && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <label className="block text-xs font-semibold text-amber-700 mb-1">
                  Senha atual <span className="font-normal text-amber-500">(plain text — use para integrações REST)</span>
                </label>
                <div className="flex gap-2">
                  <input readOnly value={portaCred.api_senha}
                    className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm font-mono bg-white text-gray-800 select-all" />
                  <button onClick={() => navigator.clipboard.writeText(portaCred.api_senha!)}
                    className="px-3 text-xs border border-amber-300 rounded-lg text-amber-700 hover:bg-amber-100">
                    Copiar
                  </button>
                </div>
              </div>
            )}

            {/* JWT Secret — somente leitura, para configurar no INI da API Delphi */}
            {portaCred?.giro_jwt_secret && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <label className="block text-xs font-semibold text-amber-700 mb-1">
                  JWT Secret <span className="font-normal text-amber-500">(plain text — GIRO_JWT_SECRET no INI)</span>
                </label>
                <div className="flex gap-2">
                  <input readOnly value={portaCred.giro_jwt_secret}
                    className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm font-mono bg-white text-gray-800 select-all" />
                  <button onClick={() => navigator.clipboard.writeText(portaCred.giro_jwt_secret!)}
                    className="px-3 text-xs border border-amber-300 rounded-lg text-amber-700 hover:bg-amber-100">
                    Copiar
                  </button>
                </div>
              </div>
            )}

            {/* Passo 2 – Senha com gerador */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-600">
                  Senha
                  {portaCred.api_senha_set && !formCred.api_senha && (
                    <span className="ml-2 text-xs font-normal text-green-600">● senha configurada — deixe em branco para manter</span>
                  )}
                </label>
                <button onClick={gerarSenhaSegura}
                  className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 font-medium px-2 py-0.5 rounded">
                  ✦ Gerar senha segura
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={formCred.api_senha}
                  onChange={e => atualizarSenha(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder={portaCred.api_senha_set ? '(manter senha atual)' : 'Digite ou gere uma senha'} />
                <button onClick={() => setMostrarSenha(v => !v)}
                  className="px-3 text-xs border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50">
                  {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            {/* Passo 3 – INI gerado */}
            {senhaEncriptada && (
              <div className="bg-gray-950 rounded-xl p-3 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-300">Arquivo <span className="text-yellow-300">API_LOGIDOC_HTTP.INI</span> — colocar na pasta do serviço</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copiar(
                        `[API_HTTP]\nUSUARIO_API=${formCred.api_usuario}\nSENHA_API_HTTP=${senhaEncriptada}\nAPI_HTTP=S` +
                        (jwtSecretEncriptado ? `\nGIRO_JWT_SECRET_ENC=${jwtSecretEncriptado}` : '')
                      )}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-0.5 rounded">
                      Copiar
                    </button>
                    <button
                      onClick={() => {
                        const conteudo = `[API_HTTP]\r\nUSUARIO_API=${formCred.api_usuario}\r\nSENHA_API_HTTP=${senhaEncriptada}\r\nAPI_HTTP=S` +
                          (jwtSecretEncriptado ? `\r\nGIRO_JWT_SECRET_ENC=${jwtSecretEncriptado}` : '') + '\r\n';
                        const blob = new Blob([conteudo], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'API_LOGIDOC_HTTP.INI';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-0.5 rounded">
                      ↓ Download
                    </button>
                  </div>
                </div>
                <pre className="text-xs text-green-400 whitespace-pre-wrap break-all leading-5 select-all overflow-x-auto">{
`[API_HTTP]
USUARIO_API=${formCred.api_usuario}
SENHA_API_HTTP=${senhaEncriptada}
API_HTTP=S` + (jwtSecretEncriptado ? `\nGIRO_JWT_SECRET_ENC=${jwtSecretEncriptado}` : '')
                }</pre>
                <p className="text-xs text-gray-500 mt-2">Salvar como <code className="text-gray-400">API_LOGIDOC_HTTP.INI</code> na mesma pasta do executável. Senha criptografada localmente.</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setModal('portas')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Fechar</button>
              <button onClick={salvarCredenciais} disabled={salvando || (!formCred.api_senha.trim() && !portaCred.api_senha_set)}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Excluir Empresa ────────────────────────────────── */}
      {modal === 'excluir-empresa' && empresaExcluir && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-red-700 mb-1">Excluir empresa</h2>
            <p className="text-sm text-gray-600 mb-4">
              Isso apaga <strong>{empresaExcluir.razao_social}</strong> permanentemente: tunnels na Cloudflare (DNS + conexões),
              portas, usuários do portal, dispositivos aprovados e registros de acesso desta empresa. Não pode ser desfeito.
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Digite o CNPJ <code className="bg-gray-100 px-1 rounded">{empresaExcluir.cnpj}</code> para confirmar:
            </label>
            <input value={confirmExcluirTexto} onChange={e => setConfirmExcluirTexto(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500" />
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setModal(null); setEmpresaExcluir(null); }} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={confirmarExcluirEmpresa} disabled={confirmExcluirTexto !== empresaExcluir.cnpj || excluindo}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {excluindo ? 'Excluindo...' : 'Excluir definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
