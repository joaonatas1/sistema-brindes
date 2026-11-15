
(() => {
'use strict';

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
const clamp = (n, a, b) => Math.min(b, Math.max(a, Math.round(Number(n) || a)));
const fData = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
const fHora = iso => new Date(iso).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
const fDH = iso => iso ? fData(iso) + ' às ' + fHora(iso) : '';
const svg = p => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  gerar: svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8H8.5a2.5 2.5 0 1 1 2.4-3.2L12 8zm0 0h3.5a2.5 2.5 0 1 0-2.4-3.2L12 8z"/>'),
  ler: svg('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 8h3v3H8zM13 13h3v3h-3zM14 8h2M8 14v2"/>'),
  hist: svg('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
  painel: svg('<path d="M5 20V11M12 20V4M19 20v-6"/>'),
  ajustes: svg('<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.4"/><circle cx="8" cy="17" r="2.4"/>')
};
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/* ---------- conexão com o banco (Firebase / Firestore) ---------- */
firebase.initializeApp({
  apiKey: "AIzaSyCkDGYyL2QGjL8dt4Qq_BVkQDSSe6VSvIk",
  authDomain: "sistema-brindes-amy.firebaseapp.com",
  projectId: "sistema-brindes-amy",
  storageBucket: "sistema-brindes-amy.firebasestorage.app",
  messagingSenderId: "467069225718",
  appId: "1:467069225718:web:13a9ed36cb45b88cd13ad7"
});
const fdb = firebase.firestore();
const LINK_LOCAL = (() => {
  const seg = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, '');
  if (seg && !/\.html?$/i.test(seg)) return seg;
  return new URLSearchParams(location.search).get('local') || '';
})();
const SENHA_DONO_SHA256 = '38cbf473ce3ad49f2d8f298c768d4f187c5c202d3c3bb08f31809cb1f8430315';
const enc = new TextEncoder();
const hexDe = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const aleatHex = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return hexDe(a.buffer); };
async function sha256Hex(txt) { return hexDe(await crypto.subtle.digest('SHA-256', enc.encode(txt))); }
async function hashPin(pin, salt) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256'}, chave, 256);
  return hexDe(bits);
}
const erroCod = code => { const e = new Error(code); e.code = code; return e; };
const pinOk = p => /^[0-9]{4}$/.test(String(p || ''));
const agora = () => new Date().toISOString();
const clampN = (v, a, b, padrao) => { const n = parseInt(v, 10); if (isNaN(n)) return padrao; return Math.max(a, Math.min(b, n)); };
function gerarSufixo() {
  for (;;) {
    const b = new Uint8Array(4); crypto.getRandomValues(b);
    let saida = '', nSimb = 0;
    for (let i = 0; i < 4; i++) {
      const ch = ALFA[b[i] % ALFA.length];
      if ('@#$%&'.includes(ch)) nSimb++;
      saida += ch;
    }
    if (nSimb <= 1) return saida;
  }
}
async function apagarDocs(snap) {
  for (let i = 0; i < snap.docs.length; i += 400) {
    const lote = fdb.batch();
    snap.docs.slice(i, i + 400).forEach(d => lote.delete(d.ref));
    await lote.commit();
  }
}
async function sessao(token) {
  const s = await fdb.collection('sessoes').doc(token || '-').get();
  if (!s.exists) throw erroCod('sessao_invalida');
  const d = s.data();
  if (Date.now() - d.criado_ms > 60 * 864e5) throw erroCod('sessao_invalida');
  const m = await fdb.collection('membros').doc(d.membro_id).get();
  if (!m.exists) throw erroCod('sessao_invalida');
  return {id: m.id, ...m.data()};
}
async function soAdmin(token) {
  const m = await sessao(token);
  if (m.nivel !== 'admin') throw erroCod('nao_admin');
  return m;
}
async function checarDono(senha) {
  if ((await sha256Hex(String(senha || ''))) !== SENHA_DONO_SHA256) throw erroCod('senha_dono_invalida');
}
async function criarMembro(estabId, nome, nivel, pin) {
  const salt = aleatHex(16);
  const ref = fdb.collection('membros').doc();
  const dados = {estab_id: estabId, nome, nivel, salt, pin_hash: await hashPin(pin, salt)};
  await ref.set(dados);
  return {id: ref.id, ...dados};
}
async function novaSessao(m) {
  const token = aleatHex(24);
  await fdb.collection('sessoes').doc(token).set({membro_id: m.id, criado_ms: Date.now()});
  return {token, estab_id: m.estab_id, membro_id: m.id, nome: m.nome, nivel: m.nivel};
}
async function pinJaExiste(estabId, pin, ignorarId) {
  const snap = await fdb.collection('membros').where('estab_id', '==', estabId).get();
  for (const d of snap.docs) {
    if (d.id === ignorarId) continue;
    const x = d.data();
    if ((await hashPin(pin, x.salt)) === x.pin_hash) return true;
  }
  return false;
}
function slugify(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
async function slugLivre(nome, idAtual) {
  const base = slugify(nome) || 'local';
  let s = base, n = 2;
  for (;;) {
    const q = await fdb.collection('estabs').where('slug', '==', s).get();
    if (q.docs.every(d => d.id === idAtual)) return s;
    s = base + '-' + n++;
  }
}
const FN = {
  async estab_definir_link(a) {
    await checarDono(a.p_senha_dono);
    const ref = fdb.collection('estabs').doc(a.p_estab);
    const s = await ref.get();
    if (!s.exists) throw erroCod('nao_encontrado');
    const slug = await slugLivre(s.data().nome, a.p_estab);
    await ref.update({slug});
    return {slug};
  },
  async dono_entrar(a) {
    await checarDono(a.p_senha_dono);
    return {ok: true};
  },
  async estabs_listar() {
    const [es, ms] = await Promise.all([
      fdb.collection('estabs').get(),
      fdb.collection('membros').where('nivel', '==', 'admin').get()
    ]);
    const comAdmin = new Set(ms.docs.map(d => d.data().estab_id));
    return es.docs.map(d => ({id: d.id, nome: d.data().nome, prefixo: d.data().prefixo, slug: d.data().slug || '', tem_admin: comAdmin.has(d.id)}))
      .sort((a, b) => a.nome.toLowerCase().localeCompare(b.nome.toLowerCase()));
  },
  async entrar(a) {
    if (!pinOk(a.p_pin)) return {erro: 'pin_invalido'};
    const corte = Date.now() - 10 * 60000;
    const tent = await fdb.collection('tentativas').where('estab_id', '==', a.p_estab).get();
    if (tent.docs.filter(d => d.data().criado_ms > corte).length >= 30) return {erro: 'muitas_tentativas'};
    const mb = await fdb.collection('membros').where('estab_id', '==', a.p_estab).get();
    for (const d of mb.docs) {
      const x = d.data();
      if ((await hashPin(a.p_pin, x.salt)) === x.pin_hash) return novaSessao({id: d.id, ...x});
    }
    await fdb.collection('tentativas').add({estab_id: a.p_estab, criado_ms: Date.now()});
    return {erro: 'pin_nao_encontrado'};
  },
  async primeiro_admin(a) {
    const ja = await fdb.collection('membros').where('estab_id', '==', a.p_estab).where('nivel', '==', 'admin').limit(1).get();
    if (!ja.empty) throw erroCod('ja_tem_admin');
    if (!pinOk(a.p_pin)) throw erroCod('pin_invalido');
    if (!String(a.p_nome || '').trim()) throw erroCod('nome_vazio');
    return novaSessao(await criarMembro(a.p_estab, a.p_nome.trim(), 'admin', a.p_pin));
  },
  async estab_criar(a) {
    await checarDono(a.p_senha_dono);
    if (!String(a.p_nome || '').trim()) throw erroCod('nome_vazio');
    if (!/^[A-Z0-9]{2,5}$/.test(a.p_prefixo || '')) throw erroCod('prefixo_invalido');
    if (!String(a.p_admin_nome || '').trim()) throw erroCod('nome_vazio');
    if (!pinOk(a.p_pin)) throw erroCod('pin_invalido');
    const ref = fdb.collection('estabs').doc();
    const slug = await slugLivre(a.p_nome.trim(), ref.id);
    await ref.set({nome: a.p_nome.trim(), slug, prefixo: a.p_prefixo, cor: COR_PADRAO, logo: '', regras: '', validade_dias: 30, brindes: [], motivos: MOTIVOS_PADRAO.slice(), criado_em: agora()});
    return novaSessao(await criarMembro(ref.id, a.p_admin_nome.trim(), 'admin', a.p_pin));
  },
  async estab_excluir(a) {
    await checarDono(a.p_senha_dono);
    const [mb, br] = await Promise.all([
      fdb.collection('membros').where('estab_id', '==', a.p_estab).get(),
      fdb.collection('brindes').where('estab_id', '==', a.p_estab).get()
    ]);
    await apagarDocs(mb); await apagarDocs(br);
    await fdb.collection('estabs').doc(a.p_estab).delete();
  },
  async estab_detalhe(a) {
    const m = await sessao(a.p_token);
    const s = await fdb.collection('estabs').doc(m.estab_id).get();
    const e = s.data() || {};
    return {id: s.id, nome: e.nome, prefixo: e.prefixo, cor: e.cor || COR_PADRAO, logo: e.logo || '', regras: e.regras || '',
      validade_dias: e.validade_dias || 30, brindes: e.brindes || [], motivos: e.motivos || []};
  },
  async estab_salvar(a) {
    const m = await soAdmin(a.p_token);
    const p = a.p_patch || {}; const up = {};
    if (p.nome && String(p.nome).trim()) up.nome = String(p.nome).trim();
    if (p.prefixo != null) up.prefixo = p.prefixo;
    if (p.cor != null) up.cor = p.cor;
    if (p.logo != null) up.logo = p.logo;
    if (p.regras != null) up.regras = p.regras;
    if (p.validade_dias != null) up.validade_dias = parseInt(p.validade_dias, 10);
    if (p.brindes != null) up.brindes = p.brindes;
    if (p.motivos != null) up.motivos = p.motivos;
    await fdb.collection('estabs').doc(m.estab_id).update(up);
  },
  async membros_listar(a) {
    const m = await sessao(a.p_token);
    const snap = await fdb.collection('membros').where('estab_id', '==', m.estab_id).get();
    return snap.docs.map(d => ({id: d.id, nome: d.data().nome, nivel: d.data().nivel}))
      .sort((x, y) => x.nome.localeCompare(y.nome));
  },
  async membro_salvar(a) {
    const m = await soAdmin(a.p_token);
    if (!String(a.p_nome || '').trim()) throw erroCod('nome_vazio');
    if (!pinOk(a.p_pin)) throw erroCod('pin_invalido');
    if (!['admin', 'equipe'].includes(a.p_nivel)) throw erroCod('nivel_invalido');
    if (await pinJaExiste(m.estab_id, a.p_pin)) throw erroCod('pin_repetido');
    await criarMembro(m.estab_id, a.p_nome.trim(), a.p_nivel, a.p_pin);
  },
  async membro_trocar_pin(a) {
    const m = await soAdmin(a.p_token);
    if (!pinOk(a.p_pin)) throw erroCod('pin_invalido');
    if (await pinJaExiste(m.estab_id, a.p_pin, a.p_membro)) throw erroCod('pin_repetido');
    const alvo = await fdb.collection('membros').doc(a.p_membro).get();
    if (!alvo.exists || alvo.data().estab_id !== m.estab_id) return;
    const salt = aleatHex(16);
    await alvo.ref.update({salt, pin_hash: await hashPin(a.p_pin, salt)});
  },
  async membro_remover(a) {
    const m = await soAdmin(a.p_token);
    if (a.p_membro === m.id) throw erroCod('nao_pode_remover_a_si_mesmo');
    const alvo = await fdb.collection('membros').doc(a.p_membro).get();
    if (!alvo.exists || alvo.data().estab_id !== m.estab_id) return;
    if (alvo.data().nivel === 'admin') {
      const ads = await fdb.collection('membros').where('estab_id', '==', m.estab_id).where('nivel', '==', 'admin').get();
      if (ads.size < 2) throw erroCod('precisa_um_admin');
    }
    await alvo.ref.delete();
  },
  async brindes_listar(a) {
    const m = await sessao(a.p_token);
    const snap = await fdb.collection('brindes').where('estab_id', '==', m.estab_id).get();
    return snap.docs.map(d => d.data()).sort((x, y) => (y.criado_em || '').localeCompare(x.criado_em || '')).slice(0, 1000);
  },
  async brindes_gerar(a) {
    const m = await soAdmin(a.p_token);
    const es = await fdb.collection('estabs').doc(m.estab_id).get();
    const e = es.data() || {};
    const ganhadores = a.p_ganhadores || [];
    if (ganhadores.length < 1 || ganhadores.length > 50) throw erroCod('quantidade_invalida');
    if (!(e.brindes || []).some(b => b.nome === a.p_brinde)) throw erroCod('brinde_inexistente');
    const usos = clampN(a.p_usos ?? 1, 1, 10, 1);
    const dias = clampN(a.p_dias ?? 30, 1, 365, 30);
    const criados = [];
    const lote = fdb.batch();
    for (const w of ganhadores) {
      let cod = null;
      for (let t = 0; t < 100 && !cod; t++) {
        const tentativa = e.prefixo + '-' + gerarSufixo();
        const existe = await fdb.collection('brindes').doc(tentativa).get();
        if (!existe.exists && !criados.includes(tentativa)) cod = tentativa;
      }
      if (!cod) throw erroCod('sem_codigo_livre');
      const validade = new Date(Date.now() + dias * 864e5).toISOString();
      lote.set(fdb.collection('brindes').doc(cod), {
        codigo: cod, estab_id: m.estab_id, brinde: a.p_brinde, motivo: a.p_motivo || '',
        nome: String(w.nome || '').trim(), telefone: String(w.tel || '').trim(), usos,
        resgates: [], criado_em: agora(), criado_por: m.nome, valido_ate: validade, cancelado: null
      });
      criados.push(cod);
    }
    await lote.commit();
    return criados;
  },
  async brinde_ler(a) {
    const m = await sessao(a.p_token);
    const ref = fdb.collection('brindes').doc(a.p_codigo);
    return fdb.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists || s.data().estab_id !== m.estab_id) return {tipo: 'inexistente', codigo: a.p_codigo};
      const b = s.data();
      if (b.cancelado) return {tipo: 'cancelado', gift: b};
      if ((b.resgates || []).length >= b.usos) return {tipo: 'entregue', gift: b};
      if (Date.now() > Date.parse(b.valido_ate)) return {tipo: 'vencido', gift: b};
      const reg = {em: agora(), por: m.nome, porId: m.id};
      const resgates = [...(b.resgates || []), reg];
      tx.update(ref, {resgates});
      return {tipo: 'ok', gift: {...b, resgates}, reg};
    });
  },
  async brinde_editar(a) {
    const m = await soAdmin(a.p_token);
    const ref = fdb.collection('brindes').doc(a.p_codigo);
    const s = await ref.get();
    if (!s.exists || s.data().estab_id !== m.estab_id) return;
    await ref.update({nome: String(a.p_nome || '').trim(), telefone: String(a.p_telefone || '').trim()});
  },
  async brinde_cancelar(a) {
    const m = await soAdmin(a.p_token);
    const ref = fdb.collection('brindes').doc(a.p_codigo);
    const s = await ref.get();
    if (!s.exists || s.data().estab_id !== m.estab_id || s.data().cancelado) return;
    await ref.update({cancelado: {em: agora(), por: m.nome, motivo: String(a.p_motivo || '').trim()}});
  },
  async brinde_desfazer(a) {
    const m = await sessao(a.p_token);
    const ref = fdb.collection('brindes').doc(a.p_codigo);
    await fdb.runTransaction(async tx => {
      const s = await tx.get(ref);
      if (!s.exists || s.data().estab_id !== m.estab_id) return;
      tx.update(ref, {resgates: (s.data().resgates || []).filter(x => x.em !== a.p_em)});
    });
  }
};
async function rpc(fn, args) {
  try {
    return await FN[fn](args || {});
  } catch (e) {
    if (e && e.code && MSG[e.code]) throw e;
    if (e && e.code === 'unavailable') throw erroCod('rede');
    if (e && e.code) throw erroCod('erro');
    if (e && e.message === 'rede') throw e;
    if (e && /network|offline|fetch/i.test(e.message || '')) throw erroCod('rede');
    console.error(e);
    throw erroCod('erro');
  }
}

const MSG = {
  sessao_invalida: 'Sua sessão expirou. Entre de novo com o PIN.',
  senha_dono_invalida: 'Senha do dono incorreta.',
  nao_admin: 'Só o administrador pode fazer isso.',
  pin_repetido: 'Esse PIN já é de outra pessoa. Escolha outro.',
  pin_invalido: 'O PIN precisa ter 4 números.',
  nome_vazio: 'Escreva o nome.',
  prefixo_invalido: 'O início do código precisa ter de 2 a 5 letras ou números.',
  precisa_um_admin: 'Precisa existir pelo menos um administrador.',
  nao_pode_remover_a_si_mesmo: 'Você não pode remover o seu próprio acesso.',
  ja_tem_admin: 'Este estabelecimento já tem administrador. Entre com o PIN.',
  brinde_inexistente: 'Esse brinde não está mais na lista. Atualize a página.',
  quantidade_invalida: 'Escolha de 1 a 50 brindes.',
  sem_codigo_livre: 'Não consegui criar códigos novos. Tente de novo.',
  rede: 'Sem conexão com a internet. Tente de novo.'
};
const msgErro = (e, padrao) => (e && MSG[e.code]) || padrao || 'Não foi possível concluir. Tente de novo.';

/* ---------- códigos, situação e padrões ---------- */
const ALFA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789@#$%&';
const MOTIVOS_PADRAO = ['Aniversário', 'Cortesia', 'Promoção', 'Cashback', 'Outros'];
const REGRAS_PADRAO = 'Este prêmio é intransferível. Será validado com o nome e o telefone de quem ganhou.';
const COR_PADRAO = '#7B1E3A';
function validadeDe(dias, base) { const d = base ? new Date(base) : new Date(); d.setDate(d.getDate() + dias); d.setHours(23, 59, 59, 0); return d.toISOString(); }
const SIT = {ativo: {t: 'Ativo', c: 'info'}, entregue: {t: 'Entregue', c: 'ok'}, vencido: {t: 'Vencido', c: 'warn'}, cancelado: {t: 'Cancelado', c: 'bad'}};
function situacao(g) {
  if (g.cancelado) return 'cancelado';
  if ((g.resgates || []).length >= (g.usos || 1)) return 'entregue';
  if (Date.now() > Date.parse(g.validoAte)) return 'vencido';
  return 'ativo';
}
const pill = g => { const s = SIT[situacao(g)]; const f = (g.resgates || []).length; const parcial = situacao(g) === 'ativo' && f > 0; return `<span class="pill ${s.c}">${parcial ? `${f} de ${g.usos} usados` : s.t}</span>`; };

/* ---------- estado ---------- */
const S = {
  fase: 'carregando', nota: '', estabs: [], estabsOk: false, sess: null, est: null, membros: [], gifts: [], giftsOk: false,
  tab: 'ler', erro: '', cfg: null, cfgSujo: false, sheet: null,
  login: {estabId: null, pin: '', erro: '', modo: 'pin', nome: '', pin1: '', pin2: '', excluir: false, excluindo: false, senhaExcluir: '', senhaPainel: '', ocupado: false},
  novo: {nome: '', prefixo: '', admin: '', pin: '', senha: ''},
  gerar: {brindeId: null, motivo: '', qtd: 1, dias: '', usos: 1, ganhadores: [{nome: '', tel: ''}], ocupado: false, feitos: null},
  ler: {res: null, codigo: '', busca: '', ocupado: false},
  hist: {filtro: 'todos', busca: '', selModo: false, sel: [], motivo: '', ocupado: false},
  painel: {periodo: 30},
  painelBusca: '',
  novoM: {nome: '', pin: '', nivel: 'equipe'}, trocaPin: {id: null, pin: ''}
};
const getP = p => p.split('.').reduce((o, k) => (o == null ? o : o[k]), S);
const setP = (p, v) => { const ks = p.split('.'); const last = ks.pop(); const o = ks.reduce((o, k) => o[k], S); o[last] = v; };
const estab = () => S.est;
const ehAdmin = () => !!S.sess && S.sess.nivel === 'admin';
const giftById = id => S.gifts.find(g => g.codigo === id);
const gift = r => ({
  id: r.codigo, codigo: r.codigo, brinde: r.brinde, motivo: r.motivo || '', nome: r.nome || '', telefone: r.telefone || '',
  usos: r.usos || 1, resgates: r.resgates || [], criadoEm: r.criado_em, criadoPor: r.criado_por || '', validoAte: r.valido_ate, cancelado: r.cancelado || null
});

function guarda(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function pega(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3800); }
function falha(e, oque) {
  if (e && e.code === 'sessao_invalida') { sair(MSG.sessao_invalida); return; }
  toast(msgErro(e, 'Não foi possível ' + oque + '. Tente de novo.'));
}

/* ---------- marca ---------- */
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0;
  const n = parseInt(m[1], 16); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  return .2126 * f(n >> 16 & 255) + .7152 * f(n >> 8 & 255) + .0722 * f(n & 255);
}
const corOk = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : COR_PADRAO;
const sobre = hex => lum(hex) > .42 ? '#1B1418' : '#FFFFFF';
function aplicarMarca() {
  const e = estab(); const c = corOk(e && e.cor);
  document.documentElement.style.setProperty('--brand', c);
  document.documentElement.style.setProperty('--on-brand', sobre(c));
}

/* ---------- imagem do brinde (story 1080x1920) ---------- */
let fontesP;
function fontes() {
  if (!fontesP) fontesP = Promise.race([
    Promise.all(['800 100px "Bricolage Grotesque"', '600 40px "Instrument Sans"', '400 28px "Instrument Sans"', '700 80px "JetBrains Mono"'].map(f => document.fonts.load(f).catch(() => {}))),
    new Promise(r => setTimeout(r, 3000))
  ]);
  return fontesP;
}
const FD = '"Bricolage Grotesque","Trebuchet MS",system-ui,sans-serif', FB = '"Instrument Sans",system-ui,sans-serif', FC = '"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace';
const logos = new Map();
function carregarImg(src) { return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }); }
async function logoDe(e) {
  if (!e || !e.logo) return null;
  if (!logos.has(e.logo)) logos.set(e.logo, await carregarImg(e.logo).catch(() => null));
  return logos.get(e.logo);
}
function quebra(x, texto, maxW) {
  const ps = String(texto).trim().split(/\s+/); const ls = []; let l = '';
  for (const p of ps) { const t = l ? l + ' ' + p : p; if (!l || x.measureText(t).width <= maxW) l = t; else { ls.push(l); l = p; } }
  if (l) ls.push(l); return ls;
}
function cabe(x, t, maxW) { if (x.measureText(t).width <= maxW) return t; while (t.length > 1 && x.measureText(t + '…').width > maxW) t = t.slice(0, -1); return t.trimEnd() + '…'; }
function espacado(x, t, cx, y, sp) {
  const cs = [...t]; const ws = cs.map(ch => x.measureText(ch).width); let px = cx - (ws.reduce((a, b) => a + b, 0) + sp * (cs.length - 1)) / 2;
  x.textAlign = 'left'; cs.forEach((ch, i) => { x.fillText(ch, px, y); px += ws[i] + sp; }); x.textAlign = 'center';
}
function desenhaQR(x, texto, px, py, lado) {
  const qr = qrcode(0, 'M'); qr.addData(texto); qr.make();
  const n = qr.getModuleCount(); x.fillStyle = '#17110F';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) {
    const x0 = Math.round(px + c * lado / n), y0 = Math.round(py + r * lado / n);
    x.fillRect(x0, y0, Math.round(px + (c + 1) * lado / n) - x0, Math.round(py + (r + 1) * lado / n) - y0);
  }
}
function drawStory(g, e, logo, escala) {
  const W = 1080, H = 1920, k = escala || 1;
  const cv = document.createElement('canvas'); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
  const x = cv.getContext('2d'); x.scale(k, k);
  const marca = corOk(e.cor), on = sobre(marca), cx = W / 2;
  x.fillStyle = marca; x.fillRect(0, 0, W, H);
  const gr = x.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.30)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.fillStyle = on;

  // topo: logo ou nome do estabelecimento
  if (logo) {
    const s = Math.min(520 / logo.width, 180 / logo.height); const lw = logo.width * s, lh = logo.height * s;
    x.drawImage(logo, cx - lw / 2, 130 + (180 - lh) / 2, lw, lh);
  } else {
    let fs = 60; x.font = `600 ${fs}px ${FD}`;
    while (fs > 36 && x.measureText(e.nome || '').width > 900) { fs -= 4; x.font = `600 ${fs}px ${FD}`; }
    x.fillText(cabe(x, e.nome || '', 900), cx, 240);
  }
  // chamada
  x.globalAlpha = .9; x.font = `600 42px ${FB}`; espacado(x, 'VOCÊ GANHOU', cx, 400, 12); x.globalAlpha = 1;
  // nome do brinde, ajustado à área 440–770
  let linhas = [], tam = 64;
  for (const t of [150, 132, 116, 100, 88, 76, 64]) {
    x.font = `800 ${t}px ${FD}`; const ls = quebra(x, g.brinde || '', 940);
    if (ls.length <= 3 && ls.every(l => x.measureText(l).width <= 960) && ls.length * t * 1.04 <= 330) { linhas = ls; tam = t; break; }
  }
  if (!linhas.length) { x.font = `800 64px ${FD}`; linhas = quebra(x, g.brinde || '', 940).slice(0, 4); tam = 64; }
  const alt = linhas.length * tam * 1.04; let by = 440 + (330 - alt) / 2 + tam * .82;
  linhas.forEach(l => { x.fillText(cabe(x, l, 960), cx, by); by += tam * 1.04; });

  // cartão picotado com o QR Code e o código
  const X = 160, Y = 800, Wc = 760, Hc = 760, R = 44, ny = 1404, nr = 26;
  x.save(); x.shadowColor = 'rgba(0,0,0,.28)'; x.shadowBlur = 44; x.shadowOffsetY = 18; x.fillStyle = '#FFFFFF';
  x.beginPath(); x.moveTo(X + R, Y); x.lineTo(X + Wc - R, Y); x.arcTo(X + Wc, Y, X + Wc, Y + R, R);
  x.lineTo(X + Wc, ny - nr); x.arc(X + Wc, ny, nr, -Math.PI / 2, Math.PI / 2, true);
  x.lineTo(X + Wc, Y + Hc - R); x.arcTo(X + Wc, Y + Hc, X + Wc - R, Y + Hc, R);
  x.lineTo(X + R, Y + Hc); x.arcTo(X, Y + Hc, X, Y + Hc - R, R);
  x.lineTo(X, ny + nr); x.arc(X, ny, nr, Math.PI / 2, -Math.PI / 2, true);
  x.lineTo(X, Y + R); x.arcTo(X, Y, X + R, Y, R); x.closePath(); x.fill(); x.restore();
  desenhaQR(x, g.codigo, cx - 260, 846, 520);
  x.save(); x.strokeStyle = '#CFC6CB'; x.lineWidth = 4; x.setLineDash([16, 14]); x.beginPath(); x.moveTo(X + nr + 16, ny); x.lineTo(X + Wc - nr - 16, ny); x.stroke(); x.restore();
  x.fillStyle = '#17110F'; let fc = 86; x.font = `700 ${fc}px ${FC}`;
  while (fc > 44 && x.measureText(g.codigo).width > 660) { fc -= 4; x.font = `700 ${fc}px ${FC}`; }
  x.fillText(g.codigo, cx, 1508);

  // rodapé: ganhador, validade e regras
  x.fillStyle = on; let y = 1640;
  if (g.nome) { x.font = `600 44px ${FB}`; x.fillText(cabe(x, 'Para: ' + g.nome, 920), cx, y); y += 56; }
  x.globalAlpha = .92; x.font = `500 36px ${FB}`;
  x.fillText('Válido até ' + fData(g.validoAte) + ((g.usos || 1) > 1 ? ` · vale ${g.usos} usos` : ''), cx, y); y += 58;
  if (e.regras) {
    x.globalAlpha = .82; x.font = `400 30px ${FB}`;
    let rs = quebra(x, e.regras, 900); if (rs.length > 3) { rs = rs.slice(0, 3); rs[2] = cabe(x, rs[2], 850); if (!rs[2].endsWith('…')) rs[2] += '…'; }
    rs.forEach(l => { x.fillText(l, cx, y); y += 40; });
  }
  x.globalAlpha = 1;
  return cv;
}
const blobDe = (cv, tipo, q) => new Promise(r => cv.toBlob(r, tipo, q));

const prevCache = new Map(); let filaPrev = [], rodandoPrev = false;
const chavePrev = (g, e) => [g.id, g.codigo, g.brinde, g.nome, g.validoAte, g.usos, e.nome, e.cor, (e.logo || '').length, e.regras].join('|');
const prevSrc = g => { const e = estab(); return (e && prevCache.get(chavePrev(g, e))) || ''; };
async function rodarPrev() {
  if (rodandoPrev) return; rodandoPrev = true;
  try {
    await fontes();
    while (filaPrev.length) {
      const id = filaPrev.shift(); const g = giftById(id), e = estab(); if (!g || !e) continue;
      const k = chavePrev(g, e);
      if (!prevCache.has(k)) {
        const b = await blobDe(drawStory(g, e, await logoDe(e), .5), 'image/jpeg', .9);
        prevCache.set(k, URL.createObjectURL(b)); await new Promise(r => setTimeout(r, 0));
      }
      document.querySelectorAll('img[data-prev]').forEach(im => { if (im.dataset.prev === id) im.src = prevCache.get(k); });
    }
  } catch (err) { console.error(err); }
  rodandoPrev = false;
}
let cfgPrevT;
function cfgPrev() {
  clearTimeout(cfgPrevT);
  cfgPrevT = setTimeout(async () => {
    const im = $('#cfgPrev'); if (!im || !S.cfg) return;
    try {
      await fontes(); const c = S.cfg;
      const amostra = {codigo: (c.prefixo || 'AAA') + '-7K#P', brinde: (c.brindes[0] && c.brindes[0].nome) || 'Taça de vinho', nome: 'Nome do ganhador', validoAte: validadeDe(clamp(c.validadeDias, 1, 365)), usos: 1};
      im.src = drawStory(amostra, c, await logoDe(c), .3).toDataURL('image/jpeg', .9);
    } catch (err) { console.error(err); }
  }, 350);
}
function depoisDeRender() {
  document.querySelectorAll('img[data-prev]').forEach(im => { if (im.getAttribute('src') === PIXEL && !filaPrev.includes(im.dataset.prev)) filaPrev.push(im.dataset.prev); });
  if (filaPrev.length) rodarPrev();
  if ($('#cfgPrev')) cfgPrev();
}

/* ---------- leitura do QR Code ---------- */
function decodifica(src, max) {
  const w0 = src.naturalWidth || src.videoWidth || src.width, h0 = src.naturalHeight || src.videoHeight || src.height; if (!w0 || !h0) return null;
  const k = Math.min(1, max / Math.max(w0, h0)); const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(src, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h); const r = jsQR(d.data, w, h, {inversionAttempts: 'attemptBoth'});
  return r && r.data ? r.data : null;
}
async function lerFoto(file) {
  const url = URL.createObjectURL(file); let img;
  try { img = await carregarImg(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  if ('BarcodeDetector' in window) {
    try { const r = await new BarcodeDetector({formats: ['qr_code']}).detect(img); if (r[0] && r[0].rawValue) return r[0].rawValue; } catch (e) {}
  }
  if (typeof jsQR === 'undefined') throw new Error('sem-leitor');
  for (const max of [1100, 700, 1700]) { const r = decodifica(img, max); if (r) return r; }
  return null;
}
let aoVivo = (() => { try { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && document.featurePolicy && document.featurePolicy.allowsFeature && document.featurePolicy.allowsFeature('camera')); } catch (e) { return false; } })();
let cam = null;
function fecharCamera() { if (!cam) return; clearInterval(cam.t); cam.stream && cam.stream.getTracks().forEach(t => t.stop()); cam.el.remove(); cam = null; }
async function abrirCamera() {
  const el = document.createElement('div'); el.className = 'camera';
  el.innerHTML = '<video playsinline autoplay muted></video><div class="rodape"><button class="btn" data-act="cam-fechar">Fechar câmera</button></div>';
  document.body.appendChild(el); cam = {el};
  try {
    cam.stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}, audio: false});
    const v = $('video', el); v.srcObject = cam.stream; await v.play();
    cam.t = setInterval(() => { if (!cam || typeof jsQR === 'undefined') return; const r = decodifica(v, 720); if (r) { fecharCamera(); validarTexto(r); } }, 260);
  } catch (err) { fecharCamera(); aoVivo = false; render(); toast('A câmera ao vivo não abriu. Toque de novo para ler por foto, ou digite o código.'); }
}


/* ---------- carregar dados ---------- */
async function carregarEstabs() {
  const rows = await rpc('estabs_listar');
  S.estabs = (rows || []).map(r => ({id: r.id, nome: r.nome, prefixo: r.prefixo, slug: r.slug || '', temAdmin: r.tem_admin}));
  S.estabsOk = true;
  if (LINK_LOCAL) S.login.estabId = (S.estabs.find(x => x.slug === LINK_LOCAL) || {}).id || null;
  else if (!S.estabs.some(x => x.id === S.login.estabId)) S.login.estabId = (S.estabs[0] || {}).id || null;
}
async function carregarEstab() {
  const d = await rpc('estab_detalhe', {p_token: S.sess.token});
  S.est = {id: d.id, nome: d.nome, prefixo: d.prefixo, cor: d.cor, logo: d.logo || '', regras: d.regras || '', validadeDias: d.validade_dias || 30, brindes: d.brindes || [], motivos: d.motivos || []};
  aplicarMarca();
}
async function carregarMembros() { S.membros = (await rpc('membros_listar', {p_token: S.sess.token})) || []; }
async function carregarGifts() { const rows = await rpc('brindes_listar', {p_token: S.sess.token}); S.gifts = (rows || []).map(gift); S.giftsOk = true; }

async function entrarComSessao(res) {
  S.sess = {token: res.token, estabId: res.estab_id, membroId: res.membro_id, nome: res.nome, nivel: res.nivel};
  guarda('brindes.sessao', S.sess); guarda('brindes.ultimo', res.estab_id);
  S.login.pin = ''; S.login.erro = ''; S.login.modo = 'pin'; S.login.nome = S.login.pin1 = S.login.pin2 = '';
  S.cfg = null; S.cfgSujo = false; S.sheet = null; S.ler.res = null; S.gerar.feitos = null;
  await carregarEstab(); await carregarMembros(); await carregarGifts();
  S.tab = ehAdmin() ? 'gerar' : 'ler';
  iniciarGerar(); render();
}
function sair(msg) {
  S.sess = null; guarda('brindes.sessao', null); S.gifts = []; S.est = null; S.membros = []; S.sheet = null; S.cfg = null; S.cfgSujo = false;
  if (msg) S.nota = msg;
  if (S.dono) S.login.modo = 'painel';
  document.documentElement.style.removeProperty('--brand'); document.documentElement.style.removeProperty('--on-brand');
  S.login.pin = ''; render();
}
let VERSAO_BASE = null;
function hashTexto(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h + ':' + s.length; }
async function versaoAtual() {
  const [js, pagina] = await Promise.all([
    fetch('/app.js', {cache: 'no-store'}).then(r => r.text()),
    fetch('/', {cache: 'no-store'}).then(r => r.text())
  ]);
  return hashTexto(js) + '|' + hashTexto(pagina);
}
function podeRecarregarSozinho() {
  const ae = document.activeElement;
  if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return false;
  if (S.ler.res || S.ler.ocupado || S.login.ocupado || S.login.pin || S.gerar.feitos || S.sheet) return false;
  return true;
}
function avisaNovaVersao() {
  if (podeRecarregarSozinho()) { location.reload(); return; }
  if (document.getElementById('aviso-versao')) return;
  const d = document.createElement('div');
  d.id = 'aviso-versao';
  d.setAttribute('role', 'status');
  d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#1c1c1c;color:#fff;padding:14px 16px;text-align:center;font-weight:600;font-size:15px;cursor:pointer';
  d.textContent = 'Há uma atualização do sistema. Toque aqui para atualizar.';
  d.onclick = () => location.reload();
  document.body.appendChild(d);
}
async function verificarVersao() {
  if (document.hidden) return;
  try {
    const v = await versaoAtual();
    if (VERSAO_BASE === null) { VERSAO_BASE = v; return; }
    if (v !== VERSAO_BASE) avisaNovaVersao();
  } catch (e) { /* sem internet: tenta de novo depois */ }
}
function ligarVersao() {
  verificarVersao();
  setInterval(verificarVersao, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarVersao(); });
}

function ligarAtualizacao() {
  ligarVersao();
  setInterval(async () => {
    if (!S.sess || (S.sheet && S.sheet.modo) || document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    try { await carregarGifts(); suave(); } catch (e) { if (e.code === 'sessao_invalida') sair(MSG.sessao_invalida); }
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.sess) carregarGifts().then(suave).catch(() => {}); });
}

function aplicarMarca() {
  const e = estab(); const c = corOk(e && e.cor);
  document.documentElement.style.setProperty('--brand', c);
  document.documentElement.style.setProperty('--on-brand', sobre(c));
}

function iniciarGerar() {
  const e = estab(); if (!e) return; const G = S.gerar;
  const b = e.brindes.find(x => x.id === G.brindeId) || e.brindes[0];
  G.brindeId = b ? b.id : null; G.usos = b ? (b.usos || 1) : 1;
  if (!e.motivos.includes(G.motivo)) G.motivo = e.motivos[0] || '';
  G.dias = e.validadeDias || 30; G.qtd = 1; G.ganhadores = [{nome: '', tel: ''}]; G.ocupado = false;
}
function ajustaGanhadores() {
  const G = S.gerar; G.qtd = clamp(G.qtd, 1, 50);
  while (G.ganhadores.length < G.qtd) G.ganhadores.push({nome: '', tel: ''});
  G.ganhadores.length = G.qtd;
}

async function validarCodigo(full) {
  const res = await rpc('brinde_ler', {p_token: S.sess.token, p_codigo: full});
  if (res.tipo === 'inexistente') return {tipo: 'inexistente', codigo: full};
  return {tipo: res.tipo, g: gift(res.gift), reg: res.reg ? {em: res.reg.em, por: res.reg.por} : null};
}
async function validarTexto(txt) {
  if (S.ler.ocupado) return;
  const bruto = String(txt || '').trim().toUpperCase().replace(/\s+/g, '');
  const full = bruto.includes('-') ? bruto : S.est.prefixo + '-' + bruto.slice(-4);
  S.ler.ocupado = true; S.sheet = null;
  try { S.ler.res = await validarCodigo(full); S.ler.codigo = ''; await carregarGifts(); }
  catch (err) { falha(err, 'validar o código'); }
  S.ler.ocupado = false; S.tab = 'ler'; render(); window.scrollTo(0, 0);
}

/* ---------- telas ---------- */
const vNota = () => S.nota ? `<p class="aviso" role="status">${esc(S.nota)}</p>` : '';
const vErro = () => `<p class="erro" role="alert">${esc(S.erro)}</p>`;
function campo(path, rotulo, attrs) { const id = 'b-' + path.replace(/\./g, '-'); return `<div class="grupo"><label class="lb" for="${id}">${rotulo}</label><input class="in" id="${id}" data-bind="${path}" value="${esc(getP(path))}" ${attrs || ''}></div>`; }

function view() {
  if (S.fase === 'carregando') return `<div class="wrap"><header class="abertura"><h1>Sistema de Brindes</h1><p>Abrindo o sistema…</p></header></div>`;
  if (!S.sess || !estab()) return vEntrada();
  return vApp();
}

function linkDe(slug) {
  return location.origin + '/' + encodeURIComponent(slug);
}
function vEntradaLink() {
  const e = S.estabs.find(x => x.id === S.login.estabId);
  let corpo;
  if (!S.estabsOk) corpo = '<section class="card"><p class="carregando">Buscando…</p></section>';
  else if (!e) corpo = '<section class="card"><h2>Link inválido</h2><p>Não encontramos esse estabelecimento. Peça o endereço correto ao dono.</p></section>';
  else corpo = '<p class="estab-unico">' + esc(e.nome) + '</p>' + (e.temAdmin ? vPin() : vPrimeiroAdmin(e));
  return '<div class="wrap">' + vNota() + corpo + '</div>';
}
function vEntrada() {
  if (LINK_LOCAL) return vEntradaLink();
  const L = S.login; let corpo;
  if (!S.dono) corpo = vPainelEntrar();
  else if (L.modo === 'painel') corpo = vPainelGeral();
  else if (L.modo === 'novo') corpo = vNovoEstab();
  else {
    if (!S.estabs.length) {
      corpo = S.estabsOk
        ? '<section class="card"><h2>Nenhum estabelecimento cadastrado</h2><p>O dono cadastra o primeiro estabelecimento pelo Painel geral.</p></section>'
        : '<section class="card"><p class="carregando">Buscando os estabelecimentos…</p></section>';
    } else {
      const e = S.estabs.find(x => x.id === L.estabId) || S.estabs[0];
      const escolha = S.estabs.length > 1
        ? '<div class="grupo"><span class="lb">Estabelecimento</span><div class="chips">' + S.estabs.map(x => '<button class="chip" aria-pressed="' + (x.id === e.id) + '" data-act="escolher-estab" data-id="' + esc(x.id) + '">' + esc(x.nome) + '</button>').join('') + '</div></div>'
        : '<p class="estab-unico">' + esc(e.nome) + '</p>';
      corpo = escolha + (e.temAdmin ? vPin() : vPrimeiroAdmin(e));
    }
    corpo += S.dono
      ? '<button class="link" data-act="pin-voltar-painel">Voltar ao Painel geral</button>'
      : '<button class="link" data-act="painel-abrir">Painel geral (dono)</button>';
  }
  return '<div class="wrap">' + vNota() + corpo + '</div>';
}
function vPainelEntrar() {
  return `<section class="card"><h2>Painel geral</h2><p class="dica">Área do dono. Aqui se cadastram e excluem estabelecimentos.</p>
    <input class="in" id="b-login-senhaPainel" data-bind="login.senhaPainel" type="password" autocomplete="off" placeholder="Senha" value="${esc(S.login.senhaPainel || '')}">
    ${vErro()}<div class="acoes"><button class="btn pri" data-act="painel-entrar" ${S.login.ocupado ? 'disabled' : ''}>Entrar</button></div></section>`;
}
function semAcento(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function vPainelGeral() {
  const d = S.dono;
  if (d.excluir) {
    const e = S.estabs.find(x => x.id === d.excluir);
    if (e) return vExcluirPainel(e);
    d.excluir = null;
  }
  return `<section class="card"><h2>Painel geral</h2><div class="acoes"><button class="btn pri" data-act="painel-novo">Cadastrar estabelecimento</button></div>${vErro()}
    <div class="grupo"><input class="in" id="b-painel-busca" data-bind="painelBusca" data-live="painel" type="search" placeholder="Buscar estabelecimento pelo nome" autocomplete="off" aria-label="Buscar estabelecimento" value="${esc(S.painelBusca || '')}"></div>
    ${vCopia()}
    <div id="painelLista">${vPainelLista()}</div><button class="link" data-act="painel-sair">Sair do Painel geral</button></section>`;
}
function vPainelLista() {
  if (!S.estabs.length) return '<p>Nenhum estabelecimento cadastrado ainda.</p>';
  const busca = semAcento(S.painelBusca).trim();
  const filtrados = S.estabs.filter(e => semAcento(e.nome + ' ' + e.prefixo).includes(busca));
  if (!filtrados.length) return '<p>Nenhum estabelecimento com esse nome.</p>';
  const tamanho = S.painelMais || 20;
  const mostrados = filtrados.slice(0, tamanho);
  const linhas = mostrados.map(e => {
    const aberto = S.painelAberto === e.id;
    const link = e.slug
      ? `<button class="link-btn" data-act="painel-copiar" data-id="${esc(e.id)}" aria-label="Copiar link de ${esc(e.nome)}">${esc(linkDe(e.slug))}</button>`
      : `<button class="btn sm" data-act="painel-gerar-link" data-id="${esc(e.id)}">Gerar link</button>`;
    const menu = aberto
      ? `<div class="menu-estab"><small>${esc(e.prefixo)} · ${e.temAdmin ? 'com administrador' : 'sem administrador ainda'}</small><div class="acoes"><button class="btn pri" data-act="painel-abrir-estab" data-id="${esc(e.id)}">Entrar</button><button class="btn danger" data-act="painel-excluir" data-id="${esc(e.id)}">Excluir</button></div></div>`
      : '';
    return `<div class="item-estab"><button class="nome-estab" data-act="painel-toggle" data-id="${esc(e.id)}" aria-expanded="${aberto ? 'true' : 'false'}"><span class="seta">${aberto ? '▾' : '▸'}</span>${esc(e.nome)}</button>${link}${menu}</div>`;
  }).join('');
  const resto = filtrados.length - mostrados.length;
  const rodape = resto > 0
    ? `<p class="dica">Mostrando ${mostrados.length} de ${filtrados.length}.</p><div class="acoes"><button class="btn" data-act="painel-mais">Mostrar mais ${Math.min(20, resto)}</button></div>`
    : (filtrados.length > 20 ? `<p class="dica">Mostrando todos os ${filtrados.length}.</p>` : '');
  return linhas + rodape;
}
function vExcluirPainel(e) {
  return `<section class="card"><h2>Excluir ${esc(e.nome)}?</h2><p>O estabelecimento, a equipe e todos os brindes gerados nele são apagados. Os códigos deixam de funcionar. Isso não pode ser desfeito.</p>${vErro()}<div class="acoes"><button class="btn" data-act="painel-excluir-nao">Manter</button><button class="btn danger" data-act="painel-excluir-sim" data-id="${esc(e.id)}">Excluir de vez</button></div></section>`;
}
function vPin() {
  const L = S.login, n = L.pin.length;
  return `<section class="card"><h2>Digite seu PIN</h2>
    <div class="pontos" role="img" aria-label="${n} de 4 dígitos digitados">${[0, 1, 2, 3].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>
    <p class="erro" role="alert">${esc(L.erro)}</p>
    <div class="teclado">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="tecla" data-act="pin" data-d="${d}" ${L.ocupado ? 'disabled' : ''}>${d}</button>`).join('')}<span></span><button class="tecla" data-act="pin" data-d="0" ${L.ocupado ? 'disabled' : ''}>0</button><button class="tecla aux" data-act="pin" data-d="x">Apagar</button></div>
  </section>`;
}
function vPrimeiroAdmin(e) {
  return `<section class="card"><h2>Primeiro acesso</h2><p>${esc(e.nome)} ainda não tem administrador. Crie o seu acesso: é com este PIN que você entra para gerar brindes e ver os relatórios.</p>
    ${campo('login.nome', 'Seu nome', 'autocomplete="off" placeholder="Como a equipe te chama"')}
    <div class="duas">${campo('login.pin1', 'PIN (4 números)', 'data-kind="pin" inputmode="numeric" type="password" autocomplete="off"')}${campo('login.pin2', 'Repita o PIN', 'data-kind="pin" inputmode="numeric" type="password" autocomplete="off"')}</div>
    ${vErro()}<button class="btn pri block" data-act="criar-admin" data-id="${esc(e.id)}" ${S.login.ocupado ? 'disabled' : ''}>Criar acesso e entrar</button></section>`;
}
function vExcluir(e) {
  const L = S.login;
  return `<section class="card"><h2>Excluir ${esc(e.nome)}?</h2><p>O estabelecimento, a equipe e todos os brindes gerados nele são apagados. Os códigos deixam de funcionar. Isso não pode ser desfeito.</p>
    ${campo('login.senhaExcluir', 'Senha do dono', 'type="password" autocomplete="off"')}
    ${vErro()}<div class="acoes"><button class="btn" data-act="excluir-nao" ${L.excluindo ? 'disabled' : ''}>Manter</button><button class="btn danger" data-act="excluir-sim" data-id="${esc(e.id)}" ${L.excluindo ? 'disabled' : ''}>${L.excluindo ? 'Excluindo…' : 'Excluir de vez'}</button></div></section>`;
}
function vNovoEstab() {
  return `<section class="card"><h2>Novo estabelecimento</h2>
    <p class="dica">Você está no Painel geral.</p>
    ${campo('novo.nome', 'Nome do estabelecimento', 'autocomplete="off" placeholder="Ex.: Amy Wine Bar"')}
    ${campo('novo.prefixo', 'Início do código (2 a 5 letras)', 'data-kind="prefixo" autocomplete="off" autocapitalize="characters" placeholder="Ex.: AMY"')}
    <p class="dica">Os códigos ficam assim: AMY-7K3P.</p>
    ${campo('novo.admin', 'Nome do administrador', 'autocomplete="off"')}
    ${campo('novo.pin', 'PIN do administrador (4 números)', 'data-kind="pin" inputmode="numeric" type="password" autocomplete="off"')}
    ${vErro()}<div class="acoes"><button class="btn" data-act="painel-voltar">Voltar</button><button class="btn pri" data-act="criar-estab" ${S.login.ocupado ? 'disabled' : ''}>Cadastrar</button></div></section>`;
}

function vApp() {
  const e = estab(), adm = ehAdmin();
  const tabs = [['gerar', 'Gerar'], ['ler', 'Ler'], ['hist', 'Histórico'], ['painel', 'Painel'], ['ajustes', 'Ajustes']];
  const corpo = !adm ? vLer() : S.tab === 'gerar' ? vGerar() : S.tab === 'hist' ? vHist() : S.tab === 'painel' ? vPainel() : S.tab === 'ajustes' ? vAjustes() : vLer();
  return `<div class="wrap ${adm ? 'comtabs' : ''}">
    <header class="topo">
      <span class="quem"><strong>${esc(e.nome)}</strong><span>${esc(S.sess.nome)} · ${adm ? 'Administrador' : 'Equipe'}</span></span>
      <button class="btn sm" data-act="sair">Sair</button></header>
    ${vNota()}<main>${corpo}</main></div>
    ${adm ? `<nav class="dock" id="dock" aria-label="Seções">${tabs.map(([k, t]) => `<button type="button" class="${S.tab === k ? 'ativo' : ''}" data-act="tab" data-t="${k}" aria-label="${t}" ${S.tab === k ? 'aria-current="page"' : ''}>${IC[k]}<span class="lbl">${t}</span></button>`).join('')}</nav>` : ''}
    ${adm && S.tab === 'ajustes' ? `<div class="salvar-bar" id="salvarBar" ${S.cfgSujo ? '' : 'hidden'}><div><span>Alterações não salvas</span><button class="btn sm" data-act="cfg-descartar">Descartar</button><button class="btn sm pri" data-act="cfg-salvar">Salvar</button></div></div>` : ''}
    ${adm && S.tab === 'hist' && S.hist.selModo && !S.sheet ? vSelBar() : ''}
    ${S.sheet ? (S.sheet.lote ? vLote() : vSheet()) : ''}`;
}
function vSelBar() {
  const n = S.hist.sel.length;
  return `<div class="sel-bar" id="selBar" role="region" aria-label="Seleção de brindes"><span>${n} selecionado${n === 1 ? '' : 's'}</span><button class="btn sm" data-act="h-sel-limpar" ${n ? '' : 'disabled'}>Limpar</button><button class="btn sm danger" data-act="lote-abrir" ${n ? '' : 'disabled'}>Cancelar</button></div>`;
}
function vLote() {
  const n = S.hist.sel.length;
  return `<div class="sheet-bg" data-act="sheet-fundo"><div class="sheet" role="dialog" aria-modal="true" aria-label="Cancelar brindes selecionados">
    <section class="card"><h2>Cancelar ${n} brinde${n === 1 ? '' : 's'}?</h2><p>Os códigos deixam de valer na hora. Isso não pode ser desfeito.</p>${campo('hist.motivo', 'Motivo (opcional)', 'autocomplete="off"')}
    <div class="acoes"><button class="btn" data-act="lote-voltar">Manter brindes</button><button class="btn danger" data-act="lote-cancelar" ${S.hist.ocupado ? 'disabled' : ''}>${S.hist.ocupado ? 'Cancelando…' : 'Cancelar brindes'}</button></div></section>
  </div></div>`;
}

/* gerar */
function vGerar() {
  const e = estab(), G = S.gerar;
  if (G.feitos) return vGerados();
  if (!e.brindes.length) return `<section class="card"><h2>Cadastre os brindes primeiro</h2><p>Em Ajustes você cria a lista de brindes que podem ser dados, como taça de vinho ou sobremesa.</p><button class="btn pri block" data-act="tab" data-t="ajustes">Ir para Ajustes</button></section>`;
  const dias = clamp(G.dias, 1, 365);
  return `<section class="card"><h2>Gerar brindes</h2>
    <div class="grupo"><span class="lb">Qual brinde</span><div class="chips">${e.brindes.map(b => `<button class="chip" aria-pressed="${b.id === G.brindeId}" data-act="g-brinde" data-id="${esc(b.id)}">${esc(b.nome)}</button>`).join('')}</div></div>
    ${e.motivos.length ? `<div class="grupo"><span class="lb">Motivo</span><div class="chips">${e.motivos.map(mt => `<button class="chip" aria-pressed="${mt === G.motivo}" data-act="g-motivo" data-v="${esc(mt)}">${esc(mt)}</button>`).join('')}</div></div>` : ''}
    <div class="grupo"><label class="lb" for="b-gerar-qtd">Quantos brindes</label><div class="passo"><button data-act="g-qtd" data-d="-1" aria-label="Diminuir">−</button><input class="in" id="b-gerar-qtd" data-bind="gerar.qtd" data-rerender="qtd" type="number" inputmode="numeric" min="1" max="50" value="${esc(G.qtd)}"><button data-act="g-qtd" data-d="1" aria-label="Aumentar">+</button></div></div>
    <div class="duas">
      <div class="grupo"><label class="lb" for="b-gerar-dias">Validade (dias)</label><input class="in" id="b-gerar-dias" data-bind="gerar.dias" data-rerender="dias" type="number" inputmode="numeric" min="1" max="365" value="${esc(G.dias)}"><span class="dica">Até ${fData(validadeDe(dias))}</span></div>
      <div class="grupo"><label class="lb" for="b-gerar-usos">Usos por código</label><input class="in" id="b-gerar-usos" data-bind="gerar.usos" type="number" inputmode="numeric" min="1" max="10" value="${esc(G.usos)}"><span class="dica">1 = vale uma vez</span></div>
    </div>
  </section>
  <section class="card"><h2>Quem vai ganhar</h2>
    ${G.ganhadores.map((w, i) => `<div class="ganh">${G.qtd > 1 ? `<span class="ganh-n">Brinde ${i + 1}</span>` : ''}
      <input class="in" id="b-gerar-ganhadores-${i}-nome" data-bind="gerar.ganhadores.${i}.nome" value="${esc(w.nome)}" placeholder="Nome" aria-label="Nome do ganhador ${i + 1}" autocomplete="off">
      <input class="in" id="b-gerar-ganhadores-${i}-tel" data-bind="gerar.ganhadores.${i}.tel" value="${esc(w.tel)}" placeholder="Telefone" aria-label="Telefone do ganhador ${i + 1}" inputmode="tel" autocomplete="off"></div>`).join('')}
    <p class="dica">Nome e telefone aparecem na hora de entregar, para conferir se é a mesma pessoa. Se deixar em branco, dá para preencher depois no Histórico.</p>
    ${vErro()}
    <button class="btn pri big block" data-act="gerar" id="btnGerar" ${G.ocupado ? 'disabled' : ''}>${G.ocupado ? 'Gerando…' : `Gerar ${G.qtd > 1 ? G.qtd + ' brindes' : 'brinde'}`}</button>
  </section>`;
}
function vGerados() {
  const codigos = S.gerar.feitos; const e = estab();
  return `<section class="card"><h2>${codigos.length > 1 ? codigos.length + ' brindes gerados' : 'Brinde gerado'}</h2><p>Baixe a imagem e envie para quem ganhou. O botão do WhatsApp abre a conversa com a mensagem pronta; a imagem você anexa.</p><button class="btn block" data-act="g-novo">Gerar mais brindes</button></section>
  <div class="lista">${codigos.map(cod => { const g = giftById(cod); if (!g) return ''; return `<article class="gerado">
    <button class="story-btn" data-act="abrir" data-id="${esc(cod)}" aria-label="Ver imagem do brinde ${esc(g.codigo)}"><img class="story" data-prev="${esc(cod)}" src="${prevSrc(g) || PIXEL}" alt=""></button>
    <div class="info"><span class="cod">${esc(g.codigo)}</span><strong>${esc(g.brinde)}</strong><span class="dica">${esc(g.nome || 'Sem nome')}${g.telefone ? ' · ' + esc(g.telefone) : ''}</span>
      <div class="acoes"><button class="btn sm" data-act="baixar-img" data-id="${esc(cod)}">Baixar imagem</button><a class="btn sm" href="${esc(waLink(g, e))}" target="_blank" rel="noopener">WhatsApp</a></div></div>
  </article>`; }).join('')}</div>`;
}
function waLink(g, e) {
  let d = (g.telefone || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d;
  const msg = `Olá${g.nome ? ', ' + g.nome.trim().split(/\s+/)[0] : ''}! Você ganhou: ${g.brinde} (${e.nome}). Seu código é ${g.codigo}, válido até ${fData(g.validoAte)}. Apresente a imagem com o QR Code para retirar.`;
  return 'https://wa.me/' + (d.length >= 12 ? d : '') + '?text=' + encodeURIComponent(msg);
}

/* ler */
function vLer() {
  const e = estab(), L = S.ler;
  const leitor = aoVivo
    ? `<button class="btn pri big block" data-act="cam">${IC.ler} Ler QR Code</button>`
    : `<label class="btn pri big block" for="qrFile" tabindex="0" role="button" data-act="rotulo-arquivo">${IC.ler} ${L.ocupado ? 'Lendo…' : 'Ler QR Code'}</label>`;
  return `${L.res ? vVeredito(L.res) : ''}
  <section class="card">${leitor}
    <input class="vh" type="file" id="qrFile" accept="image/*" capture="environment" data-file="qr" tabindex="-1" aria-hidden="true">
    ${aoVivo ? '' : '<p class="dica">A câmera abre para você fotografar o QR Code do cliente. O brinde é marcado como usado assim que o código é lido.</p>'}</section>
  <section class="card"><h2>Digitar o código</h2>
    <div class="cod-linha"><span class="prefixo">${esc(e.prefixo)}-</span><input class="in" id="b-ler-codigo" data-bind="ler.codigo" data-kind="cod" value="${esc(L.codigo)}" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Os 4 caracteres do código" placeholder="7K3P"><button class="btn pri" data-act="validar">Validar</button></div>
    <div class="simbolos"><span class="dica">Símbolos:</span>${[...'@#$%&'].map(s => `<button data-act="simb" data-s="${esc(s)}" aria-label="Inserir ${esc(s)}">${esc(s)}</button>`).join('')}</div></section>
  <section class="card"><h2>Buscar por nome ou telefone</h2>
    <input class="in" id="b-ler-busca" data-bind="ler.busca" data-live="lerBusca" value="${esc(L.busca)}" placeholder="Nome de quem ganhou" autocomplete="off" aria-label="Buscar ganhador">
    <div id="lerBusca" class="lista">${vBuscaLista()}</div></section>`;
}
function vBuscaLista() {
  const q = norm(S.ler.busca).trim(); if (q.length < 2) return '';
  const qd = q.replace(/\D/g, '');
  const achados = S.gifts.filter(g => norm(g.nome).includes(q) || norm(g.codigo).includes(q) || (qd.length >= 3 && (g.telefone || '').replace(/\D/g, '').includes(qd))).slice(0, 20);
  if (!achados.length) return `<p class="dica">Nenhum brinde encontrado para essa busca.</p>`;
  return achados.map(vVale).join('');
}
function vVale(g, soLeitura) {
  const [pre, suf] = String(g.codigo).split('-');
  const miolo = `<span class="vale-in"><span class="stub"><small>${esc(pre)}</small><b>${esc(suf || '')}</b></span>
    <span class="corpo"><strong>${esc(g.brinde)}</strong><span class="quem">${esc(g.nome || 'Sem nome')}</span><span class="meta">${pill(g)}<span>gerado em ${fData(g.criadoEm)}</span></span></span></span>`;
  return soLeitura ? `<span class="vale vale-sel">${miolo}</span>` : `<button class="vale" data-act="abrir" data-id="${esc(g.codigo)}">${miolo}</button>`;
}
function dadosDe(g, completo, usado, semNome) {
  const linhas = [['Ganhador', g.nome || 'Sem nome'], ['Telefone', g.telefone || 'Não informado'], ['Código', g.codigo], [usado ? 'Era válido até' : 'Válido até', fData(g.validoAte)]];
  if (semNome) linhas.shift();
  if (g.motivo) linhas.push(['Motivo', g.motivo]);
  if ((g.usos || 1) > 1) linhas.push(['Usos', `${(g.resgates || []).length} de ${g.usos}`]);
  if (completo) linhas.push(['Gerado', fDH(g.criadoEm) + (g.criadoPor ? ', por ' + g.criadoPor : '')]);
  return `<dl class="dados">${linhas.map(([a, b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`).join('')}</dl>`;
}
const vEntregas = g => (g.resgates || []).map(r => `<p>Entregue em ${fDH(r.em)}, por ${esc(r.por)}.</p>`).join('');
function vVeredito(r) {
  const outro = `<button class="btn block" data-act="ler-limpar">Ler outro</button>`;
  if (r.tipo === 'inexistente') return `<section class="veredito bad" role="status"><span class="selo-v">Código não encontrado</span><p class="cod grande">${esc(r.codigo)}</p><p>Este código não existe neste estabelecimento. Confira se foi digitado certo ou peça para ver a imagem original.</p>${outro}</section>`;
  const g = r.g;
  if (r.tipo === 'ok') {
    const f = g.resgates.length;
    return `<section class="veredito ok" role="status" aria-label="Confirmado"><div class="ok-icone" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><p class="premio">${esc(g.brinde)}</p><p class="quem-grande"><span>Ganhador</span>${esc(g.nome || 'Sem nome')}</p>${dadosDe(g, false, false, true)}
      <p>Entregue por ${esc(r.reg.por)} em ${fDH(r.reg.em)}.${(g.usos || 1) > 1 ? ` Uso ${f} de ${g.usos}.` : ''}</p>
      <div class="acoes"><button class="btn pri" data-act="ler-limpar">Ler outro</button><button class="btn" data-act="desfazer" data-id="${esc(g.codigo)}" data-em="${esc(r.reg.em)}">Desfazer</button></div></section>`;
  }
  if (r.tipo === 'entregue') return `<section class="veredito warn" role="status"><span class="selo-v">Já utilizado</span><p class="premio">${esc(g.brinde)}</p>${vEntregas(g)}${dadosDe(g, false, true)}${outro}</section>`;
  if (r.tipo === 'vencido') return `<section class="veredito warn" role="status"><span class="selo-v">Vencido em ${fData(g.validoAte)}</span><p class="premio">${esc(g.brinde)}</p>${dadosDe(g)}${outro}</section>`;
  return `<section class="veredito bad" role="status"><span class="selo-v">Cancelado</span><p class="premio">${esc(g.brinde)}</p><p>Cancelado em ${fDH(g.cancelado.em)}, por ${esc(g.cancelado.por)}.${g.cancelado.motivo ? ' Motivo: ' + esc(g.cancelado.motivo) + '.' : ''}</p>${dadosDe(g)}${outro}</section>`;
}

/* histórico */
function histFiltrada() {
  const H = S.hist, q = norm(H.busca).trim();
  return S.gifts.filter(g => (H.filtro === 'todos' || situacao(g) === H.filtro) && (!q || norm([g.nome, g.codigo, g.brinde, g.telefone, g.motivo].join(' ')).includes(q)));
}
function vHistLista() {
  if (!S.giftsOk) return `<p class="carregando">Carregando os brindes…</p>`;
  const l = histFiltrada();
  if (!S.gifts.length) return `<p class="dica">Nenhum brinde gerado ainda. Eles aparecem aqui assim que você gerar o primeiro.</p>`;
  if (!l.length) return `<p class="dica">Nenhum brinde nesse filtro.</p>`;
  const selecao = ehAdmin() && S.hist.selModo;
  const linhas = l.slice(0, 200).map(g => {
    if (!selecao) return vVale(g);
    if (situacao(g) !== 'ativo') return `<div class="sel-linha sel-off">${vVale(g, true)}</div>`;
    const on = S.hist.sel.includes(g.codigo);
    return `<label class="sel-linha"><input type="checkbox" class="sel-caixa" data-act="h-sel" data-id="${esc(g.codigo)}" ${on ? 'checked' : ''} aria-label="Selecionar ${esc(g.brinde)} ${esc(g.codigo)}">${vVale(g, true)}</label>`;
  }).join('');
  return linhas + (l.length > 200 ? `<p class="dica">Mostrando 200 de ${l.length}. Use a busca ou exporte a planilha para ver todos.</p>` : '');
}
function vHist() {
  const cont = {todos: S.gifts.length, ativo: 0, entregue: 0, vencido: 0, cancelado: 0}; S.gifts.forEach(g => cont[situacao(g)]++);
  const fs = [['todos', 'Todos'], ['ativo', 'Ativos'], ['entregue', 'Entregues'], ['vencido', 'Vencidos'], ['cancelado', 'Cancelados']];
  return `<section class="card"><h2>Histórico</h2>
    <div class="chips">${fs.map(([k, t]) => `<button class="chip" aria-pressed="${S.hist.filtro === k}" data-act="h-filtro" data-f="${k}">${t}<span class="n">${cont[k]}</span></button>`).join('')}</div>
    <input class="in" id="b-hist-busca" data-bind="hist.busca" data-live="hist" value="${esc(S.hist.busca)}" placeholder="Buscar por nome, código ou brinde" autocomplete="off" aria-label="Buscar no histórico">
    <button class="btn block" data-act="exportar">Exportar planilha (.xlsx)</button>
    ${ehAdmin() ? `<button class="btn block ${S.hist.selModo ? 'pri' : ''}" data-act="h-sel-modo">${S.hist.selModo ? 'Sair da seleção' : 'Selecionar vários para cancelar'}</button>` : ''}</section>
  <div id="histLista" class="lista">${vHistLista()}</div>`;
}

/* painel */
function vPainel() {
  const P = S.painel.periodo, desde = P ? Date.now() - P * 864e5 : 0;
  const gs = S.gifts.filter(g => Date.parse(g.criadoEm) >= desde);
  const c = {ativo: 0, entregue: 0, vencido: 0, cancelado: 0}; gs.forEach(g => c[situacao(g)]++);
  const validos = gs.length - c.cancelado, taxa = validos ? Math.round(c.entregue / validos * 100) : 0;
  const agrupa = campo => { const m = new Map(); gs.forEach(g => { const k = g[campo] || 'Sem motivo'; const o = m.get(k) || {g: 0, e: 0}; o.g++; if (situacao(g) === 'entregue') o.e++; m.set(k, o); }); return [...m].sort((a, b) => b[1].g - a[1].g); };
  const barras = lista => { const max = Math.max(1, ...lista.map(x => x[1].g)); return lista.map(([k, o]) => `<div class="barra"><span class="rot">${esc(k)}</span><span class="num">${o.g} · ${o.e}</span><span class="trilho"><i style="width:${o.g / max * 100}%"></i><i class="ent" style="width:${o.e / max * 100}%"></i></span></div>`).join(''); };
  const pessoas = new Map(); S.gifts.forEach(g => (g.resgates || []).forEach(r => { if (Date.parse(r.em) >= desde) pessoas.set(r.por, (pessoas.get(r.por) || 0) + 1); }));
  const lp = [...pessoas].sort((a, b) => b[1] - a[1]), maxP = Math.max(1, ...lp.map(x => x[1]));
  const ps = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [0, 'Tudo']];
  const vazio = `<p class="dica">Sem brindes neste período.</p>`;
  return `<section class="card"><h2>Painel</h2><div class="chips">${ps.map(([k, t]) => `<button class="chip" aria-pressed="${P === k}" data-act="p-periodo" data-p="${k}">${t}</button>`).join('')}</div></section>
  <div class="tiles">
    <div class="tile"><b>${gs.length}</b><span>Gerados</span></div><div class="tile"><b>${c.entregue}</b><span>Entregues</span></div><div class="tile"><b>${taxa}%</b><span>Taxa de resgate</span></div>
    <div class="tile"><b>${c.ativo}</b><span>Ativos</span></div><div class="tile"><b>${c.vencido}</b><span>Vencidos</span></div><div class="tile"><b>${c.cancelado}</b><span>Cancelados</span></div>
  </div>
  <section class="card"><h2>Por brinde</h2><div class="legenda"><span>Gerados</span><span class="ent">Entregues</span></div>${gs.length ? barras(agrupa('brinde')) : vazio}</section>
  <section class="card"><h2>Por motivo</h2>${gs.length ? barras(agrupa('motivo')) : vazio}</section>
  <section class="card"><h2>Entregas por pessoa</h2>${lp.length ? lp.map(([k, n]) => `<div class="barra"><span class="rot">${esc(k)}</span><span class="num">${n}</span><span class="trilho"><i class="ent" style="width:${n / maxP * 100}%"></i></span></div>`).join('') : `<p class="dica">Nenhuma entrega registrada neste período.</p>`}</section>`;
}

/* ajustes */
function vAjustes() {
  const e = estab();
  if (!S.cfg) { S.cfg = clone(e); S.cfg.validadeDias = e.validadeDias; }
  const c = S.cfg, eu = S.sess.membroId;
  return `<section class="card"><h2>Marca</h2>
    <div class="marca-grade"><div class="grupo" style="gap:12px">
      ${campo('cfg.nome', 'Nome do estabelecimento', 'data-live="cfgPrev" autocomplete="off"')}
      ${campo('cfg.prefixo', 'Início do código', 'data-kind="prefixo" data-live="cfgPrev" autocomplete="off" autocapitalize="characters"')}
      <div class="grupo"><label class="lb" for="b-cfg-cor">Cor da marca</label><div class="cor-linha"><input type="color" id="b-cfg-cor" data-bind="cfg.cor" data-live="cfgPrev" value="${esc(corOk(c.cor))}"><span class="dica">Fundo da imagem e dos botões</span></div></div>
      <div class="grupo"><span class="lb">Logo</span><div class="logo-linha">${c.logo ? `<img src="${esc(c.logo)}" alt="Logo atual">` : ''}<label class="btn sm" for="logoFile" tabindex="0" role="button" data-act="rotulo-arquivo">${c.logo ? 'Trocar logo' : 'Enviar logo'}</label>${c.logo ? `<button class="btn sm danger" data-act="cfg-logo-x">Remover</button>` : ''}<input class="vh" type="file" id="logoFile" accept="image/*" data-file="logo" tabindex="-1" aria-hidden="true"></div></div>
    </div><div class="grupo"><span class="lb">Prévia da imagem</span><img class="story" id="cfgPrev" src="${PIXEL}" alt="Prévia da imagem do brinde"></div></div>
    <p class="dica">Mudar o início do código vale só para os próximos brindes. Os que já foram gerados continuam funcionando.</p></section>

  <section class="card"><h2>Brindes</h2><p>O número ao lado é quantas vezes cada código pode ser usado (1 = vale uma vez).</p>
    ${c.brindes.map((b, i) => `<div class="linha-edit"><input class="in" id="b-cfg-brindes-${i}-nome" data-bind="cfg.brindes.${i}.nome" data-live="cfgPrev" value="${esc(b.nome)}" aria-label="Nome do brinde ${i + 1}" placeholder="Nome do brinde" autocomplete="off"><input class="in usos" id="b-cfg-brindes-${i}-usos" data-bind="cfg.brindes.${i}.usos" type="number" inputmode="numeric" min="1" max="10" value="${esc(b.usos || 1)}" aria-label="Usos por código do brinde ${i + 1}"><button class="x" data-act="cfg-brinde-x" data-i="${i}" aria-label="Remover brinde ${esc(b.nome)}">×</button></div>`).join('')}
    <button class="btn block" data-act="cfg-brinde-mais">Adicionar brinde</button></section>

  <details class="card recolhivel"><summary><h2>Motivos</h2></summary>
    ${c.motivos.map((mt, i) => `<div class="linha-edit"><input class="in" id="b-cfg-motivos-${i}" data-bind="cfg.motivos.${i}" value="${esc(mt)}" aria-label="Motivo ${i + 1}" placeholder="Motivo" autocomplete="off"><button class="x" data-act="cfg-motivo-x" data-i="${i}" aria-label="Remover motivo ${esc(mt)}">×</button></div>`).join('')}
    <button class="btn block" data-act="cfg-motivo-mais">Adicionar motivo</button></details>

  <details class="card recolhivel"><summary><h2>Validade e regras</h2></summary>
    ${campo('cfg.validadeDias', 'Validade padrão (dias)', 'type="number" inputmode="numeric" min="1" max="365" data-live="cfgPrev"')}
    <div class="grupo"><label class="lb" for="b-cfg-regras">Regras que aparecem na imagem</label><textarea class="in" id="b-cfg-regras" data-bind="cfg.regras" data-live="cfgPrev" maxlength="220">${esc(c.regras)}</textarea></div></details>

  <section class="card"><h2>Equipe</h2><p>Administrador gera brindes e vê tudo. Equipe só lê o código e entrega. Estas mudanças valem na hora.</p>
    <div>${S.membros.map(m => `<div class="membro"><span class="nome">${esc(m.nome)}${m.id === eu ? ' (você)' : ''}</span><span class="nivel">${m.nivel === 'admin' ? 'Administrador' : 'Equipe'}</span>
      ${S.trocaPin.id === m.id
        ? `<input class="in" style="width:110px" id="b-trocaPin-pin" data-bind="trocaPin.pin" data-kind="pin" value="${esc(S.trocaPin.pin)}" inputmode="numeric" type="password" placeholder="Novo PIN" aria-label="Novo PIN de ${esc(m.nome)}" autocomplete="off"><button class="btn sm pri" data-act="cfg-pin-ok">OK</button>`
        : `<button class="btn sm" data-act="cfg-pin" data-id="${esc(m.id)}">Trocar PIN</button>${m.id !== eu ? `<button class="btn sm danger" data-act="cfg-membro-x" data-id="${esc(m.id)}">Remover</button>` : ''}`}</div>`).join('')}</div>
    <h3>Adicionar pessoa</h3>
    <div class="duas">${campo('novoM.nome', 'Nome', 'autocomplete="off"')}${campo('novoM.pin', 'PIN (4 números)', 'data-kind="pin" inputmode="numeric" type="password" autocomplete="off"')}</div>
    <div class="chips"><button class="chip" aria-pressed="${S.novoM.nivel === 'equipe'}" data-act="cfg-nivel" data-v="equipe">Equipe</button><button class="chip" aria-pressed="${S.novoM.nivel === 'admin'}" data-act="cfg-nivel" data-v="admin">Administrador</button></div>
    ${vErro()}<button class="btn block" data-act="cfg-membro-mais">Adicionar à equipe</button></section>`;
}
function marcaSujo() { if (!S.cfgSujo) { S.cfgSujo = true; const b = $('#salvarBar'); if (b) b.hidden = false; } }

/* folha de detalhes */
function vSheet() {
  const sh = S.sheet, g = giftById(sh.id), e = estab(), adm = ehAdmin(); if (!g) return '';
  const sit = situacao(g), feitos = (g.resgates || []).length;
  let extra = '';
  if (sh.modo === 'editar') extra = `<section class="card"><h3>Corrigir ganhador</h3>${campo('sheet.nome', 'Nome', 'autocomplete="off"')}${campo('sheet.tel', 'Telefone', 'inputmode="tel" autocomplete="off"')}<div class="acoes"><button class="btn" data-act="s-modo" data-m="">Voltar</button><button class="btn pri" data-act="s-salvar">Salvar</button></div></section>`;
  else if (sh.modo === 'cancelar') extra = `<section class="card"><h3>Cancelar este brinde?</h3><p>O código deixa de valer na hora. Isso não pode ser desfeito.</p>${campo('sheet.motivo', 'Motivo (opcional)', 'autocomplete="off"')}<div class="acoes"><button class="btn" data-act="s-modo" data-m="">Manter brinde</button><button class="btn danger" data-act="s-cancelar">Cancelar brinde</button></div></section>`;
  else if (adm) extra = `<div class="acoes"><button class="btn" data-act="baixar-img" data-id="${esc(g.codigo)}">Baixar imagem</button><a class="btn" href="${esc(waLink(g, e))}" target="_blank" rel="noopener">WhatsApp</a></div>
    <div class="acoes">${sit !== 'cancelado' ? `<button class="btn" data-act="s-modo" data-m="editar">Corrigir ganhador</button>` : ''}${feitos ? `<button class="btn" data-act="desfazer" data-id="${esc(g.codigo)}" data-em="${esc(g.resgates[feitos - 1].em)}">Desfazer última entrega</button>` : ''}${sit === 'ativo' || sit === 'vencido' ? `<button class="btn danger" data-act="s-modo" data-m="cancelar">Cancelar brinde</button>` : ''}</div>`;
  return `<div class="sheet-bg" data-act="sheet-fundo"><div class="sheet" role="dialog" aria-modal="true" aria-label="Detalhes do brinde ${esc(g.codigo)}">
    <div class="sheet-topo">${pill(g)}<button class="btn sm" data-act="sheet-fechar">Fechar</button></div>
    ${adm ? `<img class="story" data-prev="${esc(g.codigo)}" src="${prevSrc(g) || PIXEL}" alt="Imagem do brinde ${esc(g.codigo)}">` : ''}
    <div class="centro"><span class="cod grande">${esc(g.codigo)}</span><h2>${esc(g.brinde)}</h2></div>
    <section class="card">${dadosDe(g, true)}${vEntregas(g)}${g.cancelado ? `<p>Cancelado em ${fDH(g.cancelado.em)}, por ${esc(g.cancelado.por)}.${g.cancelado.motivo ? ' Motivo: ' + esc(g.cancelado.motivo) + '.' : ''}</p>` : ''}</section>
    ${sit === 'ativo' && !sh.modo ? `<button class="btn pri big block" data-act="s-baixa">Entregar e marcar como usado</button>` : ''}
    ${extra}</div></div>`;
}

/* ---------- render ---------- */
function render() {
  const ae = document.activeElement, fid = ae && app.contains(ae) ? ae.id : ''; let ss = null, se = null;
  try { ss = ae.selectionStart; se = ae.selectionEnd; } catch (e) {}
  const sh = $('.sheet'), st = sh ? sh.scrollTop : 0;
  app.innerHTML = view();
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus({preventScroll: true}); try { if (ss != null) el.setSelectionRange(ss, se); } catch (e) {} } }
  const sh2 = $('.sheet'); if (sh2 && st) sh2.scrollTop = st;
  depoisDeRender();
}
function suave() {
  const ae = document.activeElement;
  if (ae && app.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== 'file') return;
  render();
}

const LIVE = {
  lerBusca() { const el = $('#lerBusca'); if (el) el.innerHTML = vBuscaLista(); },
  hist() { const el = $('#histLista'); if (el) el.innerHTML = vHistLista(); },
  cfgPrev,
  painel() { S.painelMais = 20; const el = $('#painelLista'); if (el) el.innerHTML = vPainelLista(); }
};
document.addEventListener('input', ev => {
  const t = ev.target, p = t.dataset && t.dataset.bind; if (!p) return;
  let v = t.value;
  if (t.dataset.kind === 'cod') { v = [...v.toUpperCase()].filter(c => ALFA.includes(c)).join('').slice(0, 4); if (v !== t.value) t.value = v; }
  else if (t.dataset.kind === 'pin') { v = v.replace(/\D/g, '').slice(0, 4); if (v !== t.value) t.value = v; }
  else if (t.dataset.kind === 'prefixo') { v = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); if (v !== t.value) t.value = v; }
  else if (t.type === 'number') v = v === '' ? '' : Number(v);
  setP(p, v);
  if (p.indexOf('cfg.') === 0) marcaSujo();
  const lv = t.dataset.live; if (lv && LIVE[lv]) LIVE[lv]();
});
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset && t.dataset.rerender) { if (t.dataset.rerender === 'qtd') ajustaGanhadores(); else S.gerar.dias = clamp(S.gerar.dias, 1, 365); render(); return; }
  if (!t.dataset || !t.dataset.file || !t.files || !t.files[0]) return;
  const file = t.files[0]; t.value = '';
  if (t.dataset.file === 'qr') {
    S.ler.ocupado = true; S.ler.res = null; render();
    let txt = null, erro = false;
    try { txt = await lerFoto(file); } catch (e) { erro = true; }
    S.ler.ocupado = false;
    if (txt) { validarTexto(txt); return; }
    render(); toast(erro ? 'Não foi possível abrir a foto. Tente de novo ou digite o código.' : 'Não achei um QR Code na foto. Aproxime, evite reflexo e tente de novo, ou digite o código.');
  } else if (t.dataset.file === 'logo') {
    try {
      const url = URL.createObjectURL(file); const img = await carregarImg(url); URL.revokeObjectURL(url);
      let data = '';
      for (const max of [480, 320, 200]) {
        const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); data = c.toDataURL('image/png'); if (data.length < 150000) break;
      }
      if (data.length > 200000) { toast('Essa imagem é pesada demais. Use um logo mais simples.'); return; }
      S.cfg.logo = data; marcaSujo(); render();
    } catch (e) { toast('Não foi possível abrir essa imagem.'); }
  }
});
document.addEventListener('keydown', ev => {
  const t = ev.target;
  if ((ev.key === 'Enter' || ev.key === ' ') && t.dataset && t.dataset.act === 'rotulo-arquivo') { ev.preventDefault(); const i = document.getElementById(t.getAttribute('for')); if (i) i.click(); return; }
  if (ev.key === 'Enter' && t.id === 'b-ler-codigo') { A.validar(); return; }
  if (ev.key === 'Escape' && S.sheet) { S.sheet = null; render(); return; }
  if (!S.sess && S.login.modo === 'pin' && $('.teclado') && !/^(INPUT|TEXTAREA)$/.test(t.tagName)) {
    if (/^\d$/.test(ev.key)) A.pin({d: ev.key}); else if (ev.key === 'Backspace') A.pin({d: 'x'});
  }
});
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'rotulo-arquivo') return;
  if (act === 'sheet-fundo') { if (ev.target === el) { S.sheet = null; render(); } return; }
  if (el.tagName === 'A') return;
  S.erro = '';
  if (A[act]) A[act](el.dataset, el);
});

/* ---------- ações ---------- */
const pinValido = p => /^\d{4}$/.test(p || '');
function baixarArquivo(blob, nome) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const COPIA_KEY = 'brindes.ultimaCopia';
function ultimaCopia() { try { return Number(localStorage.getItem(COPIA_KEY)) || 0; } catch (e) { return 0; } }
function marcaCopia() { try { localStorage.setItem(COPIA_KEY, String(Date.now())); } catch (e) { /* sem armazenamento: sem lembrete */ } }
function vCopia() {
  const u = ultimaCopia();
  const dias = u ? Math.floor((Date.now() - u) / 864e5) : null;
  const aviso = dias === null
    ? 'Nenhuma cópia enviada deste aparelho ainda.'
    : (dias >= 7 ? `Faz ${dias} dias desde a última cópia. Vale enviar uma nova.` : (dias === 0 ? 'Última cópia enviada hoje.' : `Última cópia há ${dias} ${dias === 1 ? 'dia' : 'dias'}.`));
  return `<div class="copia"><p class="dica">${aviso}</p><div class="acoes"><button class="btn" data-act="painel-copia">Enviar cópia por e-mail</button></div></div>`;
}
async function enviarCopia() {
  const [es, bs] = await Promise.all([fdb.collection('estabs').get(), fdb.collection('brindes').get()]);
  const nomes = {};
  es.docs.forEach(d => { nomes[d.id] = d.data().nome || ''; });
  const cabE = ['ID', 'Estabelecimento', 'Prefixo', 'Link'];
  const linhasE = es.docs.map(d => { const x = d.data(); return [d.id, x.nome || '', x.prefixo || '', x.slug ? location.origin + location.pathname + '?local=' + encodeURIComponent(x.slug) : '']; });
  const cabB = ['Código', 'Estabelecimento', 'Brinde', 'Motivo', 'Ganhador', 'Telefone', 'Usos permitidos', 'Usos feitos', 'Entregas', 'Gerado em', 'Gerado por', 'Válido até', 'Cancelado em', 'Cancelado por', 'Motivo do cancelamento'];
  const linhasB = bs.docs.map(d => {
    const x = d.data(), rs = x.resgates || [], c = x.cancelado || null;
    return [x.codigo || d.id, nomes[x.estab_id] || '', x.brinde || '', x.motivo || '', x.nome || '', x.telefone || '', x.usos || 1, rs.length,
      rs.map(r => (r.em || '') + ' por ' + (r.por || '')).join('; '), x.criado_em || '', x.criado_por || '', x.valido_ate || '',
      c ? (c.em || '') : '', c ? (c.por || '') : '', c ? (c.motivo || '') : ''];
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cabE].concat(linhasE)), 'Estabelecimentos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cabB].concat(linhasB)), 'Brindes');
  const buf = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
  const nome = `copia-brindes-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const arq = new File([buf], nome, {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  if (navigator.canShare && navigator.canShare({files: [arq]})) {
    try { await navigator.share({files: [arq], title: 'Cópia dos brindes', text: 'Cópia de segurança dos brindes'}); marcaCopia(); toast('Cópia enviada.'); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  baixarArquivo(new Blob([buf]), nome); marcaCopia(); toast('Cópia baixada. Anexe o arquivo no seu e-mail.');
}
const A = {
  async 'painel-copia'() {
    S.erro = '';
    try { await enviarCopia(); }
    catch (err) { S.erro = 'Não foi possível gerar a cópia agora. Tente de novo em instantes.'; }
    render();
  },
  'novo-estab'() { S.login.modo = 'novo'; S.novo = {nome: '', prefixo: '', admin: '', pin: '', senha: ''}; render(); },
  'voltar-entrada'() { S.login.modo = 'pin'; S.erro = ''; render(); },
  'painel-abrir'() {
    S.erro = '';
    if (S.dono) { S.login.modo = 'painel'; carregarEstabs().catch(() => {}).then(render); return; }
    S.login.modo = 'painel-entrar'; S.login.senhaPainel = ''; render();
  },
  async 'painel-entrar'() {
    const senha = S.login.senhaPainel || '';
    if (!senha) { S.erro = 'Digite a senha do dono.'; return render(); }
    S.login.ocupado = true; S.erro = ''; render();
    try {
      await rpc('dono_entrar', {p_senha_dono: senha});
      S.dono = {senha}; S.login.senhaPainel = ''; S.login.modo = 'painel';
      await carregarEstabs();
    } catch (err) { S.erro = msgErro(err, 'Não foi possível entrar no painel.'); }
    S.login.ocupado = false; render();
  },
  'painel-voltar'() { S.login.modo = 'painel'; S.erro = ''; render(); },
  'painel-novo'() { S.login.modo = 'novo'; S.novo = {nome: '', prefixo: '', admin: '', pin: '', senha: ''}; S.erro = ''; render(); },
  'painel-sair'() { S.dono = null; S.login.modo = 'pin'; S.erro = ''; render(); },
  'pin-voltar-painel'() { if (!S.dono) return; S.login.modo = 'painel'; S.erro = ''; carregarEstabs().catch(() => {}).then(render); },
  'painel-abrir-estab'(d) { S.login.estabId = d.id; S.login.modo = 'pin'; S.login.pin = ''; S.login.erro = ''; S.erro = ''; render(); },
  'painel-copiar'(d) {
    const e = S.estabs.find(x => x.id === d.id); if (!e || !e.slug) return;
    const url = linkDe(e.slug);
    const mostra = () => toast(url);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('Link copiado.'), mostra);
    else mostra();
  },
  async 'painel-gerar-link'(d) {
    try {
      await rpc('estab_definir_link', {p_senha_dono: S.dono.senha, p_estab: d.id});
      await carregarEstabs(); toast('Link criado.');
    } catch (err) { S.erro = msgErro(err, 'Não foi possível criar o link.'); }
    render();
  },
  'painel-toggle'(d) { S.painelAberto = S.painelAberto === d.id ? null : d.id; render(); },
  'painel-mais'() { S.painelMais = (S.painelMais || 20) + 20; render(); },
  'painel-excluir'(d) { S.dono.excluir = d.id; S.erro = ''; render(); },
  'painel-excluir-nao'() { S.dono.excluir = null; S.erro = ''; render(); },
  async 'painel-excluir-sim'(d) {
    try {
      await rpc('estab_excluir', {p_senha_dono: S.dono.senha, p_estab: d.id});
      if ((pega('brindes.sessao') || {}).estabId === d.id) guarda('brindes.sessao', null);
      S.dono.excluir = null; S.erro = '';
      await carregarEstabs(); toast('Estabelecimento excluído.');
    } catch (err) { S.erro = msgErro(err, 'Não foi possível excluir agora.'); }
    render();
  },
  'escolher-estab'(d) { if (S.login.ocupado) return; S.login.estabId = d.id; S.login.pin = ''; S.login.erro = ''; S.login.excluir = false; render(); },
  'excluir-estab'() { S.login.excluir = true; S.login.senhaExcluir = ''; S.erro = ''; render(); },
  'excluir-nao'() { S.login.excluir = false; render(); },
  async 'excluir-sim'(d) {
    const L = S.login; if (L.excluindo) return;
    if (!L.senhaExcluir) { S.erro = 'Digite a senha do dono.'; return render(); }
    L.excluindo = true; S.erro = ''; render();
    try {
      await rpc('estab_excluir', {p_senha_dono: L.senhaExcluir, p_estab: d.id});
      L.senhaExcluir = ''; L.excluir = false; L.estabId = null;
      if ((pega('brindes.sessao') || {}).estabId === d.id) guarda('brindes.sessao', null);
      await carregarEstabs(); toast('Estabelecimento excluído.');
    } catch (err) { S.erro = msgErro(err, 'Não foi possível excluir agora.'); }
    L.excluindo = false; render();
  },
  pin(d) {
    const L = S.login; if (L.ocupado) return; L.erro = '';
    if (d.d === 'x') L.pin = L.pin.slice(0, -1); else if (L.pin.length < 4) L.pin += d.d;
    if (L.pin.length === 4) {
      L.ocupado = true; render();
      rpc('entrar', {p_estab: L.estabId, p_pin: L.pin}).then(async res => {
        L.ocupado = false;
        if (res && res.erro) {
          L.pin = '';
          L.erro = res.erro === 'muitas_tentativas' ? 'Muitas tentativas. Espere 10 minutos e tente de novo.' : 'PIN não encontrado. Tente de novo.';
          return render();
        }
        await entrarComSessao(res);
      }).catch(err => { L.ocupado = false; L.pin = ''; L.erro = msgErro(err, 'Não consegui entrar agora.'); render(); });
    }
    render();
  },
  async 'criar-admin'(d) {
    const L = S.login, nome = L.nome.trim();
    if (!nome) { S.erro = 'Escreva o seu nome.'; return render(); }
    if (!pinValido(L.pin1)) { S.erro = 'O PIN precisa ter 4 números.'; return render(); }
    if (L.pin1 !== L.pin2) { S.erro = 'Os dois PINs estão diferentes.'; return render(); }
    L.ocupado = true; render();
    try {
      const res = await rpc('primeiro_admin', {p_estab: d.id, p_nome: nome, p_pin: L.pin1});
      await entrarComSessao(res);
    } catch (err) { S.erro = msgErro(err, 'Não foi possível criar o acesso.'); }
    L.ocupado = false; render();
  },
  async 'criar-estab'() {
    const N = S.novo, nome = N.nome.trim(), adminNome = N.admin.trim();
    if (!S.dono) { S.erro = 'Entre no Painel geral primeiro.'; return render(); }
    if (!nome) { S.erro = 'Escreva o nome do estabelecimento.'; return render(); }
    if (!/^[A-Z0-9]{2,5}$/.test(N.prefixo)) { S.erro = 'O início do código precisa ter de 2 a 5 letras ou números.'; return render(); }
    if (!adminNome) { S.erro = 'Escreva o seu nome.'; return render(); }
    if (!pinValido(N.pin)) { S.erro = 'O PIN precisa ter 4 números.'; return render(); }
    S.login.ocupado = true; render();
    try {
      const res = await rpc('estab_criar', {p_senha_dono: S.dono.senha, p_nome: nome, p_prefixo: N.prefixo, p_admin_nome: adminNome, p_pin: N.pin});
      await carregarEstabs();
      await entrarComSessao(res); S.tab = 'ajustes'; render(); toast('Estabelecimento criado. Cadastre os brindes para começar.');
    } catch (err) { S.erro = msgErro(err, 'Não foi possível cadastrar.'); }
    S.login.ocupado = false; render();
  },
  sair() { sair(); },
  tab(d) { S.tab = d.t; S.hist.selModo = false; S.hist.sel = []; if (d.t === 'ajustes' && !S.cfgSujo) S.cfg = null; if (d.t === 'gerar' && !S.gerar.feitos) iniciarGerar(); render(); window.scrollTo(0, 0); },

  'g-brinde'(d) { const b = estab().brindes.find(x => x.id === d.id); S.gerar.brindeId = d.id; S.gerar.usos = (b && b.usos) || 1; render(); },
  'g-motivo'(d) { S.gerar.motivo = d.v; render(); },
  'g-qtd'(d) { S.gerar.qtd = clamp(Number(S.gerar.qtd || 1) + Number(d.d), 1, 50); ajustaGanhadores(); render(); },
  'g-novo'() { S.gerar.feitos = null; iniciarGerar(); render(); window.scrollTo(0, 0); },
  async gerar() {
    const G = S.gerar; if (G.ocupado || !ehAdmin()) return;
    const b = estab().brindes.find(x => x.id === G.brindeId);
    if (!b) { S.erro = 'Escolha qual brinde gerar.'; return render(); }
    ajustaGanhadores();
    G.ocupado = true; S.erro = ''; render();
    try {
      const codigos = await rpc('brindes_gerar', {
        p_token: S.sess.token, p_brinde: b.nome, p_motivo: G.motivo || '',
        p_usos: clamp(G.usos, 1, 10), p_dias: clamp(G.dias, 1, 365),
        p_ganhadores: G.ganhadores.map(w => ({nome: (w.nome || '').trim(), tel: (w.tel || '').trim()}))
      });
      await carregarGifts();
      G.feitos = codigos || [];
    } catch (err) { falha(err, 'gerar os brindes'); }
    G.ocupado = false; render(); window.scrollTo(0, 0);
  },
  async 'baixar-img'(d) {
    const g = giftById(d.id) || S.gifts.find(x => x.codigo === d.id), e = estab(); if (!g) return;
    try {
      await fontes(); const blob = await blobDe(drawStory(g, e, await logoDe(e), 1), 'image/png');
      baixarArquivo(blob, `brinde-${slug(g.codigo.replace(/[@#$%&]/g, c => ({'@': 'arroba', '#': 'jogo', '$': 'cifrao', '%': 'porcento', '&': 'e'}[c])))}${g.nome ? '-' + slug(g.nome) : ''}.png`);
      toast('Imagem baixada.');
    } catch (err) { toast('Não foi possível baixar a imagem agora.'); }
  },
  abrir(d) { const g = giftById(d.id); if (!g) return; S.sheet = {id: d.id, modo: '', nome: g.nome || '', tel: g.telefone || '', motivo: ''}; render(); },
  'sheet-fechar'() { S.sheet = null; render(); },
  's-modo'(d) { const g = giftById(S.sheet.id); S.sheet.modo = d.m; if (d.m === 'editar') { S.sheet.nome = g.nome || ''; S.sheet.tel = g.telefone || ''; } render(); },
  async 's-salvar'() {
    const sh = S.sheet, g = giftById(sh.id); if (!ehAdmin() || !g) return;
    try { await rpc('brinde_editar', {p_token: S.sess.token, p_codigo: g.codigo, p_nome: sh.nome.trim(), p_telefone: sh.tel.trim()}); await carregarGifts(); sh.modo = ''; render(); toast('Ganhador atualizado.'); }
    catch (err) { falha(err, 'salvar'); }
  },
  async 's-cancelar'() {
    const sh = S.sheet, g = giftById(sh.id); if (!ehAdmin() || !g) return;
    try { await rpc('brinde_cancelar', {p_token: S.sess.token, p_codigo: g.codigo, p_motivo: (sh.motivo || '').trim()}); await carregarGifts(); sh.modo = ''; render(); toast('Brinde cancelado.'); }
    catch (err) { falha(err, 'cancelar'); }
  },
  async 's-baixa'() {
    const sh = S.sheet, g = giftById(sh.id); if (!g || S.ler.ocupado) return; S.ler.ocupado = true;
    try {
      const r = await validarCodigo(g.codigo); S.ler.res = r; S.sheet = null; S.tab = 'ler'; S.ler.busca = '';
      await carregarGifts();
    } catch (err) { falha(err, 'registrar a entrega'); }
    S.ler.ocupado = false; render(); window.scrollTo(0, 0);
  },
  async desfazer(d) {
    try {
      await rpc('brinde_desfazer', {p_token: S.sess.token, p_codigo: d.id, p_em: d.em});
      await carregarGifts(); S.ler.res = null; render(); toast('Entrega desfeita. O brinde voltou a valer.');
    } catch (err) { falha(err, 'desfazer'); }
  },

  cam() { abrirCamera(); },
  'cam-fechar'() { fecharCamera(); },
  validar() { const c = S.ler.codigo; if (c.length !== 4) return toast('Digite os 4 caracteres do código.'); validarTexto(c); },
  simb(d) { if (S.ler.codigo.length >= 4) return; S.ler.codigo += d.s; const i = $('#b-ler-codigo'); if (i) { i.value = S.ler.codigo; i.focus(); } },
  'ler-limpar'() { S.ler.res = null; render(); window.scrollTo(0, 0); },

  'h-filtro'(d) { S.hist.filtro = d.f; render(); },
  'h-sel-modo'() { S.hist.selModo = !S.hist.selModo; S.hist.sel = []; render(); },
  'h-sel'(d) { const i = S.hist.sel.indexOf(d.id); if (i >= 0) S.hist.sel.splice(i, 1); else S.hist.sel.push(d.id); render(); },
  'h-sel-limpar'() { S.hist.sel = []; render(); },
  'lote-abrir'() { if (!ehAdmin() || !S.hist.sel.length) return; S.sheet = {lote: true}; render(); },
  'lote-voltar'() { S.sheet = null; render(); },
  async 'lote-cancelar'() {
    const L = S.hist; if (!ehAdmin() || L.ocupado || !L.sel.length) return;
    const codigos = L.sel.slice(), motivo = (L.motivo || '').trim();
    L.ocupado = true; render();
    let ok = 0, falhou = 0, expirou = false;
    for (const c of codigos) {
      try { await rpc('brinde_cancelar', {p_token: S.sess.token, p_codigo: c, p_motivo: motivo}); ok++; }
      catch (err) { if (err.code === 'sessao_invalida') { expirou = true; break; } falhou++; }
    }
    L.ocupado = false; L.sel = []; L.selModo = false; L.motivo = ''; S.sheet = null;
    try { await carregarGifts(); } catch (e) {}
    if (expirou) { sair(MSG.sessao_invalida); return; }
    render();
    toast(falhou ? `${ok} cancelado${ok === 1 ? '' : 's'}. ${falhou} não puderam ser cancelados.` : `${ok} brinde${ok === 1 ? '' : 's'} cancelado${ok === 1 ? '' : 's'}.`);
  },
  'p-periodo'(d) { S.painel.periodo = Number(d.p); render(); },
  async exportar() {
    if (typeof XLSX === 'undefined') return toast('A planilha não pôde ser preparada. Recarregue a página.');
    const lista = histFiltrada(), e = estab(); if (!lista.length) return toast('Não há brindes neste filtro para exportar.');
    const cab = ['Código', 'Brinde', 'Motivo', 'Ganhador', 'Telefone', 'Situação', 'Gerado em', 'Gerado por', 'Válido até', 'Usos permitidos', 'Usos feitos', 'Última entrega', 'Entregue por', 'Cancelado em', 'Cancelado por', 'Motivo do cancelamento'];
    const linhas = lista.map(g => { const rs = g.resgates || [], u = rs[rs.length - 1], c = g.cancelado; return [g.codigo, g.brinde, g.motivo || '', g.nome || '', g.telefone || '', SIT[situacao(g)].t, fDH(g.criadoEm), g.criadoPor || '', fData(g.validoAte), g.usos || 1, rs.length, u ? fDH(u.em) : '', u ? u.por : '', c ? fDH(c.em) : '', c ? c.por : '', c ? c.motivo || '' : '']; });
    const ws = XLSX.utils.aoa_to_sheet([cab].concat(linhas)); ws['!cols'] = [12, 24, 14, 26, 18, 12, 20, 16, 12, 14, 12, 20, 16, 20, 16, 28].map(w => ({wch: w}));
    const ent = []; lista.forEach(g => (g.resgates || []).forEach(r => ent.push([g.codigo, g.brinde, g.nome || '', g.telefone || '', fDH(r.em), r.por])));
    const ws2 = XLSX.utils.aoa_to_sheet([['Código', 'Brinde', 'Ganhador', 'Telefone', 'Entregue em', 'Entregue por']].concat(ent)); ws2['!cols'] = [12, 24, 26, 18, 20, 16].map(w => ({wch: w}));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Brindes'); XLSX.utils.book_append_sheet(wb, ws2, 'Entregas');
    const buf = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
    baixarArquivo(new Blob([buf]), `brindes-${slug(e.nome)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('Planilha baixada.');
  },

  'cfg-brinde-mais'() { S.cfg.brindes.push({id: uid(), nome: '', usos: 1}); marcaSujo(); render(); const i = $(`#b-cfg-brindes-${S.cfg.brindes.length - 1}-nome`); if (i) i.focus(); },
  'cfg-brinde-x'(d) { S.cfg.brindes.splice(Number(d.i), 1); marcaSujo(); render(); },
  'cfg-motivo-mais'() { S.cfg.motivos.push(''); marcaSujo(); render(); const i = $(`#b-cfg-motivos-${S.cfg.motivos.length - 1}`); if (i) i.focus(); },
  'cfg-motivo-x'(d) { S.cfg.motivos.splice(Number(d.i), 1); marcaSujo(); render(); },
  'cfg-logo-x'() { S.cfg.logo = ''; marcaSujo(); render(); },
  'cfg-nivel'(d) { S.novoM.nivel = d.v; render(); },
  async 'cfg-membro-mais'() {
    const M = S.novoM, nome = M.nome.trim();
    if (!nome) { S.erro = 'Escreva o nome da pessoa.'; return render(); }
    if (!pinValido(M.pin)) { S.erro = 'O PIN precisa ter 4 números.'; return render(); }
    try {
      await rpc('membro_salvar', {p_token: S.sess.token, p_nome: nome, p_pin: M.pin, p_nivel: M.nivel});
      await carregarMembros(); S.novoM = {nome: '', pin: '', nivel: 'equipe'}; S.erro = ''; render(); toast('Pessoa adicionada.');
    } catch (err) { S.erro = msgErro(err, 'Não foi possível adicionar.'); render(); }
  },
  async 'cfg-membro-x'(d) {
    try { await rpc('membro_remover', {p_token: S.sess.token, p_membro: d.id}); await carregarMembros(); render(); toast('Pessoa removida.'); }
    catch (err) { falha(err, 'remover'); }
  },
  'cfg-pin'(d) { S.trocaPin = {id: d.id, pin: ''}; render(); const i = $('#b-trocaPin-pin'); if (i) i.focus(); },
  async 'cfg-pin-ok'() {
    const T = S.trocaPin; if (!pinValido(T.pin)) return toast('O PIN precisa ter 4 números.');
    try { await rpc('membro_trocar_pin', {p_token: S.sess.token, p_membro: T.id, p_pin: T.pin}); S.trocaPin = {id: null, pin: ''}; await carregarMembros(); render(); toast('PIN trocado.'); }
    catch (err) { falha(err, 'trocar o PIN'); }
  },
  'cfg-descartar'() { S.cfg = null; S.cfgSujo = false; S.trocaPin = {id: null, pin: ''}; render(); },
  async 'cfg-salvar'() {
    const c = S.cfg; if (!ehAdmin() || !c) return;
    const nome = String(c.nome || '').trim();
    if (!nome) return toast('O estabelecimento precisa de um nome.');
    if (!/^[A-Z0-9]{2,5}$/.test(c.prefixo || '')) return toast('O início do código precisa ter de 2 a 5 letras ou números.');
    const brindes = c.brindes.map(b => ({id: b.id, nome: String(b.nome || '').trim(), usos: clamp(b.usos, 1, 10)})).filter(b => b.nome);
    const motivos = [...new Set(c.motivos.map(m => String(m || '').trim()).filter(Boolean))];
    const patch = {nome, prefixo: c.prefixo, cor: corOk(c.cor), logo: c.logo || '', regras: String(c.regras || '').trim(), validade_dias: clamp(c.validadeDias, 1, 365), brindes, motivos};
    try {
      await rpc('estab_salvar', {p_token: S.sess.token, p_patch: patch});
      await carregarEstab(); S.cfg = null; S.cfgSujo = false; iniciarGerar(); render(); toast('Ajustes salvos.');
    } catch (err) { falha(err, 'salvar os ajustes'); }
  }
};

/* ---------- inicialização ---------- */
async function boot() {
  S.fase = 'pronto'; render();
  try { await carregarEstabs(); }
  catch (err) { S.nota = msgErro(err, 'Não consegui carregar os estabelecimentos.'); }
  const salvo = pega('brindes.sessao');
  if (salvo && salvo.token) {
    S.sess = salvo;
    try { await carregarMembros(); const m = S.membros.find(x => x.id === salvo.membroId); if (!m) throw {code: 'sessao_invalida'};
      S.sess.nome = m.nome; S.sess.nivel = m.nivel; await carregarEstab(); await carregarGifts();
      S.tab = ehAdmin() ? 'gerar' : 'ler'; iniciarGerar();
    } catch (err) {
      S.sess = null;
      if (err.code === 'sessao_invalida') guarda('brindes.sessao', null);
      else S.nota = msgErro(err, 'Não consegui abrir o seu acesso agora.');
    }
  }
  render(); ligarAtualizacao();
}
boot();
})();
