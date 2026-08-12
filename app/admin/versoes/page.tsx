'use client';
import { useEffect, useState, useCallback } from 'react';
import { api, getUsuario, type Release, type Usuario } from '@/lib/api';

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VersoesPage() {
  const [usuario, setUsuario]   = useState<Usuario | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState('');
  const [busca, setBusca]       = useState('');
  const [modal, setModal]       = useState<null | 'upload' | 'excluir'>(null);
  const [formVersao, setFormVersao]         = useState('');
  const [formChangelog, setFormChangelog]   = useState('');
  const [formArquivo, setFormArquivo]       = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState<number | null>(null);
  const [excluir, setExcluir]   = useState<Release | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setReleases(await api.getReleases()); setErro(''); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { setUsuario(getUsuario()); carregar(); }, [carregar]);

  const filtrados = releases.filter(r => {
    const alvo = `${r.versao} ${r.changelog ?? ''} ${r.criado_por_nome ?? ''}`.toLowerCase();
    return alvo.includes(busca.toLowerCase());
  });

  function abrirUpload() {
    setFormVersao(''); setFormChangelog(''); setFormArquivo(null);
    setModal('upload');
  }

  async function enviarRelease() {
    if (!formVersao.trim() || !formArquivo) return;
    setEnviando(true);
    try {
      await api.uploadRelease(formVersao.trim(), formChangelog.trim(), formArquivo);
      setModal(null);
      await carregar();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro ao enviar.'); }
    finally { setEnviando(false); }
  }

  async function baixar(r: Release) {
    setBaixando(r.id);
    try { await api.baixarRelease(r.id, r.arquivo_nome); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro ao baixar.'); }
    finally { setBaixando(null); }
  }

  function abrirExcluir(r: Release) { setExcluir(r); setModal('excluir'); }

  async function confirmarExcluir() {
    if (!excluir) return;
    setExcluindo(true);
    try {
      await api.removerRelease(excluir.id);
      setModal(null); setExcluir(null);
      await carregar();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Erro ao excluir.'); }
    finally { setExcluindo(false); }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Versões — MVC_LOGIDOC</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {releases.length} versão{releases.length !== 1 ? 'ões' : ''} no catálogo
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
              + Nova versão
            </button>
          )}
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{erro}</div>}

      <div className="mb-4">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por versão, changelog ou quem enviou..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {releases.length === 0 ? 'Nenhuma versão cadastrada ainda.' : 'Nenhuma versão encontrada.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Versão</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Changelog</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Arquivo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Enviado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-gray-900">v{r.versao}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[320px] truncate" title={r.changelog || ''}>
                    {r.changelog || <span className="text-gray-300 italic">sem changelog</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700 truncate max-w-[180px]" title={r.arquivo_nome}>{r.arquivo_nome}</div>
                    <div className="text-xs text-gray-400">{formatarTamanho(r.arquivo_tamanho)} · <span className="font-mono" title={r.sha256}>sha256 …{r.sha256.slice(-8)}</span></div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-600">{r.criado_por_nome || '—'}</div>
                    <div className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString('pt-BR')}</div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => baixar(r)} disabled={baixando === r.id}
                      className="px-2.5 py-1 text-xs bg-teal-100 text-teal-700 rounded hover:bg-teal-200 transition-colors disabled:opacity-50 mr-1.5">
                      {baixando === r.id ? 'Baixando...' : '⬇ Baixar'}
                    </button>
                    {usuario?.role === 'superadmin' && (
                      <button onClick={() => abrirExcluir(r)}
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
            <h2 className="text-lg font-bold text-gray-900 mb-4">Nova versão do MVC_LOGIDOC</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Versão</label>
                <input value={formVersao} onChange={e => setFormVersao(e.target.value)}
                  placeholder="1.2.3.7"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Changelog (opcional)</label>
                <textarea value={formChangelog} onChange={e => setFormChangelog(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo (MVC_LOGIDOC.exe)</label>
                <input type="file" onChange={e => setFormArquivo(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-600" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
              <button onClick={enviarRelease} disabled={enviando || !formVersao.trim() || !formArquivo}
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
            <h2 className="text-lg font-bold text-gray-900 mb-1">Excluir versão</h2>
            <p className="text-sm text-gray-500 mb-4">
              Remove definitivamente a versão <code className="bg-gray-100 px-1 rounded">v{excluir.versao}</code> e o
              arquivo do servidor. Isso não afeta clientes que já tenham essa versão instalada.
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
