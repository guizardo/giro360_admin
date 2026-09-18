'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, getUsuario, type Pacote, type Usuario } from '@/lib/api';

const COMPONENTE_LABEL: Record<string, string> = {
  mvc_logidoc: 'MVC_LOGIDOC (exe + DLLs)',
  cloudflared: 'cloudflared',
  monitor_dashboard_web: 'MonitorDashboardWeb',
  petshop_api: 'PetShop_API',
  logidoc_api_rest: 'LogiDoc_API_REST',
  petshop_web: 'PetShop_Web',
};

// Mesmos valores que TInstaladorAutomatico.DetectarArquiteturaWindows gera no
// CloudflaredService (Fase 6c/6f) — precisam bater exatamente com o que é
// cadastrado aqui, senão o ObterUltimoPacote não encontra o pacote certo.
const ARQUITETURAS_CLOUDFLARED = [
  { value: 'amd64',      label: 'amd64 (Windows 8+, padrão)' },
  { value: '386',        label: '386 (32-bit, Windows 8+)' },
  { value: 'arm64',      label: 'arm64' },
  { value: 'amd64-win7', label: 'amd64-win7 (Windows 7 ou anterior)' },
  { value: '386-win7',   label: '386-win7 (32-bit, Windows 7 ou anterior)' },
];

// PetshopWeb não tem variante "-win7" (Next.js 14 exige Node >=18.17, que não
// roda em Windows 7/Server 2008 de jeito nenhum — ver UInstalacaoAutomatica.
// BaixarPacotePetshopWeb). Só as duas arquiteturas modernas mesmo.
const ARQUITETURAS_PETSHOP_WEB = [
  { value: 'amd64', label: 'amd64 (64-bit, Windows 8.1+)' },
  { value: '386',   label: '386 (32-bit, Windows 8.1+)' },
];

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PacotesPage() {
  const [usuario, setUsuario]   = useState<Usuario | null>(null);
  const [pacotes, setPacotes]   = useState<Pacote[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState('');
  const [busca, setBusca]       = useState('');
  const [modal, setModal]       = useState<null | 'upload' | 'excluir'>(null);
  const [formComponente, setFormComponente] = useState<'mvc_logidoc' | 'cloudflared' | 'monitor_dashboard_web' | 'petshop_api' | 'logidoc_api_rest' | 'petshop_web'>('mvc_logidoc');
  const [formVersao, setFormVersao]         = useState('');
  const [formArquitetura, setFormArquitetura] = useState('');
  const [formChangelog, setFormChangelog]   = useState('');
  const [formArquivo, setFormArquivo]       = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState<number | null>(null);
  const [excluir, setExcluir]   = useState<Pacote | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setPacotes(await api.getPacotes()); setErro(''); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { setUsuario(getUsuario()); carregar(); }, [carregar]);

  const filtrados = pacotes.filter(p => {
    const alvo = `${COMPONENTE_LABEL[p.componente] || p.componente} ${p.versao} ${p.arquitetura} ${p.changelog ?? ''} ${p.criado_por_nome ?? ''}`.toLowerCase();
    return alvo.includes(busca.toLowerCase());
  });

  function abrirUpload() {
    setFormComponente('mvc_logidoc'); setFormVersao(''); setFormArquitetura(''); setFormChangelog(''); setFormArquivo(null);
    setModal('upload');
  }

  async function enviarPacote() {
    if (!formVersao.trim() || !formArquivo) return;
    setEnviando(true);
    try {
      await api.uploadPacote(formComponente, formVersao.trim(), formArquitetura.trim(), formChangelog.trim(), formArquivo);
      setModal(null);
      await carregar();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro ao enviar.'); }
    finally { setEnviando(false); }
  }

  async function baixar(p: Pacote) {
    setBaixando(p.id);
    try { await api.baixarPacote(p.id, p.arquivo_nome); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro ao baixar.'); }
    finally { setBaixando(null); }
  }

  function abrirExcluir(p: Pacote) { setExcluir(p); setModal('excluir'); }

  async function confirmarExcluir() {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await api.removerPacote(excluir.id);
      setModal(null); setExcluir(null);
      await carregar();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro ao excluir.'); }
    finally { setExcluindo(false); }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pacotes de instalação</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pacotes.length} pacote{pacotes.length !== 1 ? 's' : ''} no catálogo — exe+DLLs, cloudflared e demais
            artefatos usados numa instalação nova (independente das versões de atualização em <span className="italic">Versões</span>)
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={carregar} disabled={loading}
            className="px-3 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
            {loading ? '...' : '↺ Atualizar'}
          </button>
          {usuario?.role === 'superadmin' && (
            <button onClick={abrirUpload}
              className="px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
              + Novo pacote
            </button>
          )}
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{erro}</div>}

      <div className="mb-4">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por componente, versão, arquitetura ou changelog..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {pacotes.length === 0 ? 'Nenhum pacote cadastrado ainda.' : 'Nenhum pacote encontrado.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Componente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Versão</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Arquivo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Enviado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{COMPONENTE_LABEL[p.componente] || p.componente}</div>
                    {p.arquitetura && <div className="text-xs text-gray-400 font-mono">{p.arquitetura}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-gray-900">v{p.versao}</span>
                    {p.changelog && <div className="text-xs text-gray-400 truncate max-w-[220px]" title={p.changelog}>{p.changelog}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700 truncate max-w-[180px]" title={p.arquivo_nome}>{p.arquivo_nome}</div>
                    <div className="text-xs text-gray-400">{formatarTamanho(p.arquivo_tamanho)} · <span className="font-mono" title={p.sha256}>sha256 …{p.sha256.slice(-8)}</span></div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-600">{p.criado_por_nome || '—'}</div>
                    <div className="text-xs text-gray-400">{new Date(p.created_at).toLocaleString('pt-BR')}</div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => baixar(p)} disabled={baixando === p.id}
                      className="px-2.5 py-1 text-xs bg-teal-100 text-teal-700 rounded hover:bg-teal-200 transition-colors disabled:opacity-50 mr-1.5">
                      {baixando === p.id ? 'Baixando...' : '⬇ Baixar'}
                    </button>
                    {usuario?.role === 'superadmin' && (
                      <button onClick={() => abrirExcluir(p)}
                        className="px-2.5 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors">
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Upload */}
      {modal === 'upload' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Novo pacote de instalação</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Componente</label>
                <select value={formComponente} onChange={e => {
                    const novo = e.target.value as typeof formComponente;
                    setFormComponente(novo);
                    if (novo !== 'cloudflared' && novo !== 'petshop_web') setFormArquitetura('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="mvc_logidoc">MVC_LOGIDOC (exe + DLLs, .zip)</option>
                  <option value="cloudflared">cloudflared (binário oficial)</option>
                  <option value="monitor_dashboard_web">MonitorDashboardWeb</option>
                  <option value="petshop_api">PetShop_API (exe + DLLs, .zip)</option>
                  <option value="logidoc_api_rest">LogiDoc_API_REST (exe + DLLs, .zip)</option>
                  <option value="petshop_web">PetShop_Web (Node + build Next.js, .zip)</option>
                </select>
              </div>
              <div className={(formComponente === 'cloudflared' || formComponente === 'petshop_web') ? 'grid grid-cols-2 gap-3' : ''}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Versão</label>
                  <input value={formVersao} onChange={e => setFormVersao(e.target.value)}
                    placeholder="1.2.3.7"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                {formComponente === 'cloudflared' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Arquitetura</label>
                    <select value={formArquitetura} onChange={e => setFormArquitetura(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Selecione...</option>
                      {ARQUITETURAS_CLOUDFLARED.map(a => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                {formComponente === 'petshop_web' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Arquitetura</label>
                    <select value={formArquitetura} onChange={e => setFormArquitetura(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Selecione...</option>
                      {ARQUITETURAS_PETSHOP_WEB.map(a => (
                        <option key={a.value} value={a.value}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Changelog (opcional)</label>
                <textarea value={formChangelog} onChange={e => setFormChangelog(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo</label>
                <input type="file" onChange={e => setFormArquivo(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-600" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={enviarPacote}
                disabled={enviando || !formVersao.trim() || !formArquivo || ((formComponente === 'cloudflared' || formComponente === 'petshop_web') && !formArquitetura)}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {enviando ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Excluir */}
      {modal === 'excluir' && excluir && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Excluir pacote</h2>
            <p className="text-sm text-gray-500 mb-4">
              Remove definitivamente o pacote <code className="bg-gray-100 px-1 rounded">{COMPONENTE_LABEL[excluir.componente] || excluir.componente} v{excluir.versao}</code> e
              o arquivo do servidor.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setModal(null); setExcluir(null); }} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={confirmarExcluir} disabled={excluindo}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50">
                {excluindo ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
