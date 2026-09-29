'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, type Empresa, type Release, type ResultadoAgendamentoServicoLote } from '@/lib/api';

// Atualizacao em massa de apps POR EMPRESA (nao por porta): o proprio
// CloudflaredService (colunas cloudflared_* de empresas) e o MonitorGiro
// (empresa_produtos). Lista empresas em vez de portas.

export type ProdutoLote = 'cloudflared_service' | 'monitor_giro';

interface CamposAgenda {
  versao?: string | null;
  versaoEm?: string | null;
  alvo?: string | null;
  inicio?: string | null;
  fim?: string | null;
  falhas: number;
}

interface ConfigProduto {
  nome: string;
  icone: string;
  // A troca e' feita pelo CloudflaredService do cliente -- abaixo desta versao
  // DELE o agendamento fica salvo mas nao e' aplicado.
  minimoServico: string;
  motivoMinimo: string;
  janelaPadrao: [string, string];
  aviso: string;
  seAplica: (e: Empresa) => boolean;
  campos: (e: Empresa) => CamposAgenda;
}

const CONFIG: Record<ProdutoLote, ConfigProduto> = {
  cloudflared_service: {
    nome: 'CloudflaredService',
    icone: '⚙',
    // 1.1.1.29/30 tinham o ajudante com o nome do servico errado e nunca reiniciavam.
    minimoServico: '1.1.1.31',
    motivoMinimo: 'autoatualização do serviço',
    janelaPadrao: ['02:00', '04:00'],
    aviso: 'Na troca, o serviço de cada cliente é reiniciado e o tunnel fica fora do ar por ~15–30 segundos. ' +
      'Se a versão nova não subir, o ajudante volta a anterior sozinho.',
    seAplica: () => true,
    campos: e => ({
      versao: e.cloudflared_versao, versaoEm: e.cloudflared_versao_em, alvo: e.cloudflared_versao_alvo,
      inicio: e.cloudflared_janela_inicio, fim: e.cloudflared_janela_fim, falhas: e.cloudflared_tentativas_falhas ?? 0,
    }),
  },
  monitor_giro: {
    nome: 'MonitorGiro',
    icone: '📊',
    minimoServico: '1.1.1.35',
    motivoMinimo: 'atualização do MonitorGiro',
    // Fora do processamento noturno (giro 23h, correlacao 4h, sweep 5h).
    janelaPadrao: ['12:00', '14:00'],
    aviso: 'O serviço MonitorGiro de cada cliente é parado durante a troca. Se o giro, a correlação ou o sweep ' +
      'estiverem rodando, a troca espera terminar. Evite janelas entre 23h e 6h.',
    seAplica: e => e.giro_habilitado,
    campos: e => ({
      versao: e.monitor_giro_versao, versaoEm: e.monitor_giro_versao_em, alvo: e.monitor_giro_versao_alvo,
      inicio: e.monitor_giro_janela_inicio, fim: e.monitor_giro_janela_fim, falhas: e.monitor_giro_tentativas_falhas ?? 0,
    }),
  },
};

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

function temAgendamentoPendente(c: CamposAgenda): boolean {
  return !!c.alvo && c.alvo !== c.versao;
}

export default function ServicoLote({ releases, produto }: { releases: Release[]; produto: ProdutoLote }) {
  const cfg = CONFIG[produto];
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState('');

  const [busca, setBusca]               = useState('');
  const [filtroVersao, setFiltroVersao] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState<'' | 'agendado' | 'falhou' | 'sem_autoupdate'>('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const [modalAberto, setModalAberto] = useState(false);
  const [formLote, setFormLote]       = useState({ versaoAlvo: '', janelaInicio: cfg.janelaPadrao[0], janelaFim: cfg.janelaPadrao[1], tamanhoLote: 10 });
  const [agendando, setAgendando]     = useState(false);
  const [resultadoLote, setResultadoLote] = useState<ResultadoAgendamentoServicoLote[] | null>(null);

  const suportaAutoupdate = useCallback((e: Empresa) =>
    !!e.cloudflared_versao && compararVersao(e.cloudflared_versao, cfg.minimoServico) >= 0, [cfg.minimoServico]);

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

  const releasesProduto = releases.filter(r => r.produto === produto);
  const aplicaveis = useMemo(() => empresas.filter(cfg.seAplica), [empresas, cfg]);

  const versoesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    aplicaveis.forEach(e => { const v = cfg.campos(e).versao; if (v) set.add(v); });
    return Array.from(set).sort(compararVersao);
  }, [aplicaveis, cfg]);

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return aplicaveis.filter(e => {
      const c = cfg.campos(e);
      if (filtroVersao && c.versao !== filtroVersao) return false;
      if (filtroSituacao === 'agendado' && !temAgendamentoPendente(c)) return false;
      if (filtroSituacao === 'falhou' && !(temAgendamentoPendente(c) && c.falhas > 0)) return false;
      if (filtroSituacao === 'sem_autoupdate' && suportaAutoupdate(e)) return false;
      if (b && !`${e.razao_social} ${e.cnpj}`.toLowerCase().includes(b)) return false;
      return true;
    });
  }, [aplicaveis, cfg, busca, filtroVersao, filtroSituacao, suportaAutoupdate]);

  const selecionadasEmpresas = aplicaveis.filter(e => selecionados.has(e.cnpj));
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
    setFormLote({ versaoAlvo: '', janelaInicio: cfg.janelaPadrao[0], janelaFim: cfg.janelaPadrao[1], tamanhoLote: 10 });
    setResultadoLote(null);
    setModalAberto(true);
  }

  async function confirmarAgendarLote() {
    if (!formLote.versaoAlvo || selecionados.size === 0) return;
    setAgendando(true);
    try {
      const dados = {
        cnpjs: [...selecionados],
        versao_alvo: formLote.versaoAlvo,
        atualizacao_janela_inicio: formLote.janelaInicio,
        atualizacao_janela_fim: formLote.janelaFim,
        tamanho_lote: formLote.tamanhoLote,
      };
      const resp = produto === 'cloudflared_service'
        ? await api.agendarServicoLote(dados)
        : await api.agendarProdutoEmpresaLote(produto, dados);
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
          {filtradas.length} de {aplicaveis.length} empresa{aplicaveis.length !== 1 ? 's' : ''} exibida{filtradas.length !== 1 ? 's' : ''}
          {produto === 'monitor_giro' && <span className="text-gray-400"> · só empresas com Giro habilitado</span>}
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
          <option value="">Todas as versões do {cfg.nome}</option>
          {versoesDisponiveis.map(v => <option key={v} value={v}>v{v}</option>)}
        </select>
        <select value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value as typeof filtroSituacao)}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="">Todas as situações</option>
          <option value="agendado">Com atualização agendada</option>
          <option value="falhou">Com falha na atualização</option>
          <option value="sem_autoupdate">CloudflaredService abaixo da {cfg.minimoServico}</option>
        </select>
      </div>

      {/* Barra de seleção */}
      {selecionados.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
          <span className="text-sm font-medium text-indigo-800">{selecionados.size} selecionada{selecionados.size !== 1 ? 's' : ''}</span>
          <button onClick={abrirAgendarLote}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            {cfg.icone} Agendar atualização do {cfg.nome}
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Versão do {cfg.nome}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Agendamento atual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map(e => {
                const c = cfg.campos(e);
                const suporta = suportaAutoupdate(e);
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
                      {c.versao ? (
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${
                          suporta ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-amber-700 bg-amber-50 border-amber-200'
                        }`} title={suporta ? '' : `CloudflaredService v${e.cloudflared_versao || '?'} — a ${cfg.motivoMinimo} exige ${cfg.minimoServico}+`}>
                          {cfg.icone} v{c.versao}
                          {c.versaoEm && <span className="opacity-60">· {tempoRelativo(c.versaoEm)}</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300 italic">não reportada</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {temAgendamentoPendente(c) ? (
                        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${
                          c.falhas >= 3 ? 'text-red-700 bg-red-50 border-red-200' : 'text-violet-700 bg-violet-50 border-violet-200'
                        }`}>
                          📅 alvo v{c.alvo} · {(c.inicio || '').slice(0, 5)}–{(c.fim || '').slice(0, 5)}
                          {c.falhas > 0 && <span> · {c.falhas} falha{c.falhas !== 1 ? 's' : ''}</span>}
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
            <h2 className="text-lg font-bold text-gray-900 mb-1">Atualizar {cfg.nome} em massa</h2>
            <p className="text-sm text-gray-500 mb-4">{selecionados.size} empresa{selecionados.size !== 1 ? 's' : ''}</p>

            {!resultadoLote ? (
              <>
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2.5 rounded-lg mb-4">
                  {cfg.aviso}
                </div>
                {semAutoupdateSelecionadas.length > 0 && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-lg mb-4">
                    {semAutoupdateSelecionadas.length} das selecionadas têm o CloudflaredService abaixo da {cfg.minimoServico} (ou
                    sem versão reportada): o agendamento fica salvo, mas elas só atualizam depois que o serviço for atualizado.
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Versão alvo</label>
                    <select value={formLote.versaoAlvo} onChange={e => setFormLote(f => ({ ...f, versaoAlvo: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Selecione uma versão...</option>
                      {releasesProduto.map(r => (
                        <option key={r.id} value={r.versao}>v{r.versao}{r.changelog ? ` — ${r.changelog.slice(0, 40)}` : ''}</option>
                      ))}
                    </select>
                    {releasesProduto.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">Nenhuma versão do {cfg.nome} publicada — envie em Versões.</p>
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
                      cada grupo com uma fatia diferente da janela — para não trocar todos no mesmo horário.
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
