'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, type Empresa, type Release, type ResultadoAgendamentoServicoLote } from '@/lib/api';

// Autoatualizacao do proprio CloudflaredService em massa -- um servico por
// empresa (nao por porta), por isso lista empresas em vez de portas.

// Primeira versao com autoatualizacao -- abaixo disso o agendamento fica salvo
// mas nao e' aplicado (a troca pra 1.1.1.31 precisa ser manual). 1.1.1.29/30
// tinham o ajudante com o nome do servico errado e nunca conseguiam reiniciar.
const VERSAO_MINIMA_AUTOUPDATE = '1.1.1.31';

function compararVersao(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function tempoRelativo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function temAgendamentoPendente(e: Empresa): boolean {
  return !!e.cloudflared_versao_alvo && e.cloudflared_versao_alvo !== e.cloudflared_versao;
}

function suportaAutoupdate(e: Empresa): boolean {
  return !!e.cloudflared_versao && compararVersao(e.cloudflared_versao, VERSAO_MINIMA_AUTOUPDATE) >= 0;
}

export default function ServicoLote({ releases }: { releases: Release[] }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState('');

  const [busca, setBusca]               = useState('');
  const [filtroVersao, setFiltroVersao] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState<'' | 'agendado' | 'falhou' | 'sem_autoupdate'>('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const [modalAberto, setModalAberto] = useState(false);
  const [formLote, setFormLote]       = useState({ versaoAlvo: '', janelaInicio: '02:00', janelaFim: '04:00', tamanhoLote: 10 });
  const [agendando, setAgendando]     = useState(false);
  const [resultadoLote, setResultadoLote] = useState<ResultadoAgendamentoServicoLote[] | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try { setEmpresas(await api.getEmpresas()); setErro(''); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao carregar.'); }
    finally { setLoading(false); }
  }, []);

  // Carga inicial so' com setState no callback da promise (carregar() tem
  // setLoading sincrono, que o react-hooks/set-state-in-effect nao aceita).
  useEffect(() => {
    let vivo = true;
    api.getEmpresas()
      .then(rows => { if (vivo) { setEmpresas(rows); setErro(''); } })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar.'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, []);

  const releasesServico = releases.filter(r => r.produto === 'cloudflared_service');

  const versoesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    empresas.forEach(e => { if (e.cloudflared_versao) set.add(e.cloudflared_versao); });
    return Array.from(set).sort(compararVersao);
  }, [empresas]);

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return empresas.filter(e => {
      if (filtroVersao && e.cloudflared_versao !== filtroVersao) return false;
      if (filtroSituacao === 'agendado' && !temAgendamentoPendente(e)) return false;
      if (filtroSituacao === 'falhou' && !(temAgendamentoPendente(e) && (e.cloudflared_tentativas_falhas ?? 0) > 0)) return false;
      if (filtroSituacao === 'sem_autoupdate' && suportaAutoupdate(e)) return false;
      if (b && !`${e.razao_social} ${e.cnpj}`.toLowerCase().includes(b)) return false;
      return true;
    });
  }, [empresas, busca, filtroVersao, filtroSituacao]);

  const selecionadasEmpresas = empresas.filter(e => selecionados.has(e.cnpj));
  const semAutoupdateSelecionadas = selecionadasEmpresas.filter(e => !suportaAutoupdate(e));
  const todasVisiveisSelecionadas = filtradas.length > 0 && filtradas.every(e => selecionados.has(e.cnpj));

  function toggleSelecionado(cnpj: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(cnpj)) next.delete(cnpj); else next.add(cnpj);
      return next;
    });
  }

  function toggleTodosVisiveis() {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (todasVisiveisSelecionadas) filtradas.forEach(e => next.delete(e.cnpj));
      else filtradas.forEach(e => next.add(e.cnpj));
      return next;
    });
  }

  function abrirAgendarLote() {
    setFormLote({ versaoAlvo: '', janelaInicio: '02:00', janelaFim: '04:00', tamanhoLote: 10 });
    setResultadoLote(null);
    setModalAberto(true);
  }

  async function confirmarAgendarLote() {
    if (!formLote.versaoAlvo || selecionados.size === 0) return;
    setAgendando(true);
    try {
      const resp = await api.agendarServicoLote({
        cnpjs: [...selecionados],
        versao_alvo: formLote.versaoAlvo,
        atualizacao_janela_inicio: formLote.janelaInicio,
        atualizacao_janela_fim: formLote.janelaFim,
        tamanho_lote: formLote.tamanhoLote,
      });
      setResultadoLote(resp.resultados);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao agendar.');
    } finally {
      setAgendando(false);
    }
  }

  function fecharModalLote() {
    setModalAberto(false);
    setResultadoLote(null);
    setSelecionados(new Set());
    carregar();
  }

  const numLotes = Math.max(1, Math.ceil(selecionados.size / Math.max(1, formLote.tamanhoLote)));
  const sucessos = resultadoLote?.filter(r => r.ok).length ?? 0;
  const falhas   = resultadoLote?.filter(r => !r.ok) ?? [];

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {filtradas.length} de {empresas.length} empresa{empresas.length !== 1 ? 's' : ''} exibida{filtradas.length !== 1 ? 's' : ''}
        </p>
        <button onClick={carregar} disabled={loading}
          className="px-3 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
          {loading ? '...' : '↺ Atualizar'}
        </button>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{erro}</div>}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome ou CNPJ..."
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 w-64 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        <select value={filtroVersao} onChange={e => setFiltroVersao(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="">Todas as versões do serviço</option>
          {versoesDisponiveis.map(v => <option key={v} value={v}>v{v}</option>)}
        </select>
        <select value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value as typeof filtroSituacao)}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="">Todas as situações</option>
          <option value="agendado">Com atualização agendada</option>
          <option value="falhou">Com falha na atualização</option>
          <option value="sem_autoupdate">Sem autoatualização (&lt; {VERSAO_MINIMA_AUTOUPDATE})</option>
        </select>
      </div>

      {/* Barra de seleção */}
      {selecionados.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
          <span className="text-sm font-medium text-indigo-800">{selecionados.size} selecionada{selecionados.size !== 1 ? 's' : ''}</span>
          <button onClick={abrirAgendarLote}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            ⚙ Agendar atualização do serviço
          </button>
          <button onClick={() => setSelecionados(new Set())} className="ml-auto text-xs text-indigo-500 hover:text-indigo-700">Limpar seleção</button>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Nenhuma empresa encontrada.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={todasVisiveisSelecionadas} onChange={toggleTodosVisiveis} className="rounded border-gray-300" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">CNPJ / Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tunnel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Versão do serviço</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Agendamento atual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map(e => {
                const falhasEmp = e.cloudflared_tentativas_falhas ?? 0;
                return (
                  <tr key={e.cnpj} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selecionados.has(e.cnpj)} onChange={() => toggleSelecionado(e.cnpj)} className="rounded border-gray-300" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900 truncate max-w-[220px]">{e.razao_social}</span>
                        {!e.ativo && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">inativa</span>}
                      </div>
                      <div className="font-mono text-xs text-gray-400">{e.cnpj}</div>
                    </td>
                    <td className="px-4 py-3">
                      {e.tunnel_cf_id ? (
                        <code className="text-xs text-indigo-600 truncate block max-w-[240px]" title={e.tunnel_backend_url || ''}>{e.tunnel_backend_url}</code>
                      ) : (
                        <span className="text-xs text-gray-300 italic">não configurado</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {e.cloudflared_versao ? (
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${
                          suportaAutoupdate(e) ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-amber-700 bg-amber-50 border-amber-200'
                        }`} title={suportaAutoupdate(e) ? '' : `Autoatualização só a partir da ${VERSAO_MINIMA_AUTOUPDATE} — atualize manualmente uma vez`}>
                          ⚙ v{e.cloudflared_versao}
                          {e.cloudflared_versao_em && <span className="opacity-60">· {tempoRelativo(e.cloudflared_versao_em)}</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300 italic">não reportada</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {temAgendamentoPendente(e) ? (
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${
                          falhasEmp >= 3 ? 'text-red-700 bg-red-50 border-red-200' : 'text-violet-700 bg-violet-50 border-violet-200'
                        }`}>
                          📅 alvo v{e.cloudflared_versao_alvo} · {(e.cloudflared_janela_inicio || '').slice(0, 5)}–{(e.cloudflared_janela_fim || '').slice(0, 5)}
                          {falhasEmp > 0 && <span> · {falhasEmp} falha{falhasEmp !== 1 ? 's' : ''}</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300 italic">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Atualizar CloudflaredService em massa</h2>
            <p className="text-sm text-gray-500 mb-4">{selecionados.size} empresa{selecionados.size !== 1 ? 's' : ''}</p>

            {!resultadoLote ? (
              <>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5 rounded-lg mb-4">
                  Na troca, o serviço de cada cliente é reiniciado e o tunnel fica fora do ar por ~15–30 segundos.
                  Se a versão nova não subir, o ajudante volta a anterior sozinho.
                </div>
                {semAutoupdateSelecionadas.length > 0 && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-lg mb-4">
                    {semAutoupdateSelecionadas.length} das selecionadas estão abaixo da {VERSAO_MINIMA_AUTOUPDATE} (ou sem versão
                    reportada): o agendamento fica salvo, mas elas só atualizam depois de uma troca manual.
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Versão alvo</label>
                    <select value={formLote.versaoAlvo} onChange={e => setFormLote(f => ({ ...f, versaoAlvo: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Selecione uma versão...</option>
                      {releasesServico.map(r => (
                        <option key={r.id} value={r.versao}>v{r.versao}{r.changelog ? ` — ${r.changelog.slice(0, 40)}` : ''}</option>
                      ))}
                    </select>
                    {releasesServico.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">Nenhuma versão do CloudflaredService publicada — envie em Versões.</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Janela — início</label>
                      <input type="time" value={formLote.janelaInicio}
                        onChange={e => setFormLote(f => ({ ...f, janelaInicio: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Janela — fim</label>
                      <input type="time" value={formLote.janelaFim}
                        onChange={e => setFormLote(f => ({ ...f, janelaFim: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tamanho do lote</label>
                    <input type="number" min={1} value={formLote.tamanhoLote}
                      onChange={e => setFormLote(f => ({ ...f, tamanhoLote: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <p className="text-xs text-gray-400 mt-1">
                      As {selecionados.size} empresas serão divididas em {numLotes} grupo{numLotes !== 1 ? 's' : ''} de até {formLote.tamanhoLote},
                      cada grupo com uma fatia diferente da janela — para não reiniciar todos os tunnels no mesmo horário.
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setModalAberto(false)} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
                  <button onClick={confirmarAgendarLote} disabled={agendando || !formLote.versaoAlvo}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                    {agendando ? 'Agendando...' : 'Confirmar agendamento'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2.5 rounded-lg mb-3">
                  {sucessos} de {resultadoLote.length} agendada{sucessos !== 1 ? 's' : ''} com sucesso.
                </div>
                {falhas.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto mb-3">
                    {falhas.map(f => {
                      const emp = empresas.find(e => e.cnpj === f.cnpj);
                      return (
                        <p key={f.cnpj} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                          {emp?.razao_social || f.cnpj} — {f.erro}
                        </p>
                      );
                    })}
                  </div>
                )}
                <div className="flex justify-end mt-5">
                  <button onClick={fecharModalLote} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
                    Fechar e atualizar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
