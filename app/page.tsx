'use client'
/** このファイルの役割と主要な画面動作を、実装の近くにコメントで説明しています。 */

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DisasterMap = dynamic(() => import('@/components/disaster-map'), { ssr: false })

import {
  AlertTriangle, Bell, Bookmark, Check, ChevronRight, CircleHelp, Clock3,
  FileText, Flag, HeartHandshake, Home, Inbox, LifeBuoy, MapPin, Menu,
  MessageCircle, Package, Search, Send, Settings, ShieldCheck, Siren,
  SlidersHorizontal, UserRound, Users, X, Zap, Plus, Navigation, LockKeyhole,
} from 'lucide-react'

type Tab = '検索' | '投稿' | '地図' | 'マイページ'
type Role = '被災者' | '支援者' | '管理者'
type Request = { id:number; title:string; category:string; urgency:string; place:string; time:string; match:number; body:string; tags?:string[]; saved?:boolean; status?:string }

const initialRequests: Request[] = [
  { id:1, title:'飲料水を届けてほしい', category:'水・飲料', urgency:'高', place:'輪島市 河井町', time:'15分前', match:92, body:'家族3名で避難しています。500mlの水を12本ほど必要としています。受け取りは避難所入口でお願いします。' },
  { id:2, title:'乳児用ミルクとおむつ', category:'乳幼児用品', urgency:'高', place:'珠洲市 飯田町', time:'38分前', match:86, body:'生後8か月の子ども用です。粉ミルクとMサイズのおむつを探しています。' },
  { id:3, title:'毛布・防寒具が必要です', category:'衣類・寝具', urgency:'中', place:'能登町 宇出津', time:'1時間前', match:78, body:'高齢の母と避難中です。大人用の毛布を2枚、可能であれば防寒着もお願いします。' },
]

function Badge({children, tone='neutral'}:{children:React.ReactNode;tone?:'red'|'amber'|'green'|'blue'|'neutral'}) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
function IconButton({label, children, onClick}:{label:string;children:React.ReactNode;onClick?:()=>void}) {
  return <button aria-label={label} className="icon-button" onClick={onClick}>{children}</button>
}

export default function Page() {
  const [tab, setTab] = useState<Tab>('検索')
  const [role, setRole] = useState<Role>('被災者')
  // 災害レベルはサーバーから取得した値だけを表示し、初期値で開放しません。
  const [level, setLevel] = useState<number | null>(null)
  const [matchingLocked, setMatchingLocked] = useState(false)
  const isAdmin = role === '管理者'
  // レベル未取得中は安全側に扱い、マッチングへ遷移させません。
  const displayLevel = level ?? '確認中'
  const [requests, setRequests] = useState(initialRequests)
  const [query, setQuery] = useState('')
  const [urgency, setUrgency] = useState('すべて')
  const [selected, setSelected] = useState<Request | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  // 災害レベルはサーバーの安全情報を表示します。変更操作は管理者モーダルに分離します。
  const [levelOpen, setLevelOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [draftSaved, setDraftSaved] = useState(false)
  const [form, setForm] = useState({title:'', category:'水・飲料', quantity:'', place:'', urgency:'中', description:'', tags:''})
  const [chromeHidden, setChromeHidden] = useState(false)

  // 起動時にサーバーの最新災害レベルを取得し、画面だけがLv.1になる不整合を防ぎます。
  useEffect(() => {
    // 災害レベルはサーバーから取得し、初期値で画面を開放しません。
    fetch('/api/disaster-level', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('level-fetch-failed')
        const body = await response.json()
        const currentLevel = Number(body.level)
        if (Number.isInteger(currentLevel) && currentLevel >= 1 && currentLevel <= 3) setLevel(currentLevel)
      })
      .catch(() => showNotice('災害レベルを取得できませんでした'))

  // 自己申告で保存した役割を読み込み、アプリ全体の表示権限を同期します。
  // BEGIN DEMO ACCESS: 未ログインのデモ役割を確認します。削除時はこのコメントからENDまで削除します。
  const demoRole = document.cookie.match(/(?:^|; )yorisoi_demo_role=([^;]+)/)?.[1]
  if (demoRole === 'victim') setRole('被災者')
  if (demoRole === 'supporter') setRole('支援者')
  if (demoRole === 'admin') setRole('管理者')
  // END DEMO ACCESS
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return
  createClient().auth.getUser()
    .then(async ({ data: { user } }) => {
        if (!user) return
        const { data } = await createClient().from('profiles').select('role_type').eq('id', user.id).maybeSingle()
        const savedRole = data?.role_type
        if (savedRole === 'victim') setRole('被災者')
        if (savedRole === 'supporter') setRole('支援者')
        if (savedRole === 'admin') setRole('管理者')
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const resetChromeTimer = () => {
      setChromeHidden(false)
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!menuOpen) setChromeHidden(true)
      }, 4000)
    }
    resetChromeTimer()
    window.addEventListener('pointerdown', resetChromeTimer)
    window.addEventListener('keydown', resetChromeTimer)
    window.addEventListener('scroll', resetChromeTimer, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', resetChromeTimer)
      window.removeEventListener('keydown', resetChromeTimer)
      window.removeEventListener('scroll', resetChromeTimer)
    }
  }, [menuOpen])

  // メニュー外のクリックは、メニュー用オーバーレイ側で閉じます。
  // document のキャプチャ監視は、メニュー項目の click より先に実行されて遷移を妨げるため使いません。

  const filtered = useMemo(() => {
    const terms = query.split(/[、,\s]+/).map(term => term.trim()).filter(Boolean)
    return requests.filter(r => {
      const searchable = `${r.title} ${r.category} ${r.place} ${(r.tags ?? []).join(' ')}`.toLowerCase()
      const matchesQuery = terms.length === 0 || terms.some(term => searchable.includes(term.toLowerCase()))
      return matchesQuery && (urgency === 'すべて' || r.urgency === urgency)
    })
  }, [requests, query, urgency])
  const showNotice = (text:string) => { setNotice(text); setTimeout(()=>setNotice(''), 2600) }
  // メニュー内の項目を選択したときは、画面を切り替えたあとメニューも閉じます。
  const selectTab = (nextTab: Tab) => { setTab(nextTab); setMenuOpen(false) }
  // マッチング遷移前にサーバー環境変数由来の災害レベルを確認し、Lv.2以上は画面遷移を止めます。
  const openMatching = async (event?: React.MouseEvent) => {
    event?.preventDefault()
    try {
      const response = await fetch('/api/disaster-level', { cache: 'no-store' })
      const body = await response.json()
      const currentLevel = Number(body.level)
      if (!Number.isInteger(currentLevel) || currentLevel < 1 || currentLevel >= 2) {
        setMatchingLocked(true)
        return
      }
      window.location.href = '/matching'
    } catch {
      showNotice('安全情報を確認できないため、マッチングを開けません')
    }
  }
  // BEGIN DEMO ACCESS: デモアカウントでも実際の投稿APIを利用できるようにします。公開後に削除する場合は、このコメントからENDまで削除します。
  const submitPost = async () => {
    if (!form.title || !form.place || !form.quantity) return showNotice(role === '被災者' ? '必要物資・数量・受取場所を入力してください' : '支援物資・数量・支援場所を入力してください')
    // BEGIN DEMO ACCESS: デモ役割のCookieが利用できないアップロード環境でも、投稿APIへデモアクセスを伝えます。公開時はこの行を削除します。
    const response = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-demo-access': 'true' }, body: JSON.stringify({ post_type: role === '支援者' ? 'support_offer' : 'victim_request', title: form.title, category: form.category, quantity: form.quantity, place: form.place, urgency: role === '支援者' ? 3 : ({ 低: 1, 中: 3, 高: 5 } as Record<string, number>)[form.urgency] ?? 3, description: form.description, disaster_type: '地震', available_time: role === '支援者' ? '平日18時以降・土日終日' : 'いつでも', tags: form.tags.split(/[、,\\s]+/).map((tag: string) => tag.trim()).filter(Boolean) }) })
    if (!response.ok) { const result = await response.json().catch(() => ({})); return showNotice(result.error ?? '投稿を保存できませんでした') }
    setRequests([{ id: Date.now(), title: form.title, category: form.category, urgency: form.urgency, place: form.place, time: '今', match: 0, body: form.description || '支援を必要としています。', tags: form.tags.split(/[、,\\s]+/).map((tag: string) => tag.trim()).filter(Boolean), status: '募集中' }, ...requests])
    setForm({ title: '', category: '水・飲料', quantity: '', place: '', urgency: '中', description: '', tags: '' })
    showNotice('支援投稿を公開しました')
    setTab('検索')
  }
  // END DEMO ACCESS

  return <main className={`app-shell ${chromeHidden?'chrome-hidden':''}`}>
    <header className="topbar">
      <IconButton label={menuOpen?'メインメニューを閉じる':'メインメニュー'} onClick={()=>setMenuOpen(open=>!open)}><Menu size={20}/></IconButton>
      {/* 左上のブランドアイコンは、アプリ全体の最上位ホームへ戻る共通導線です。 */}<a href="/home" className="brand" aria-label="よりそい最上位ホーム"><div className="brand-mark"><HeartHandshake size={22}/></div><div><strong>よりそい</strong><span>災害支援マッチング</span></div></a>
      <div className="location"><MapPin size={15}/>全国の支援情報</div>
      <div className="top-actions"><a className="text-button" href="/auth/login">ログイン</a><button className={`level level-${level}`} onClick={()=>isAdmin?setAdminOpen(true):setLevelOpen(true)}><span className="status-dot"/>災害レベル Lv.{level}<ChevronRight size={14}/></button><IconButton label="通知"><Bell size={19}/><i className="notification-dot"/></IconButton></div>
    </header>
    <div className="alertbar"><AlertTriangle size={17}/><span><b>支援情報をご確認ください</b>：{level !== null && level <= 1?'通常のマッチングが利用できます':level===2?'指定物資置き場への支援のみ利用できます':'安全確認のため個人支援・マッチングを停止しています'}</span>{isAdmin&&<button onClick={()=>setAdminOpen(true)}>災害レベルを確認 <ChevronRight size={14}/></button>}</div>
    <div className="layout">
      <aside className={`sidebar ${menuOpen?'is-open':''}`}><div className="sidebar-head"><div className="side-label">メインメニュー</div></div>{(['検索','投稿','地図','マイページ'] as Tab[]).map((item,i)=>{const I=[Search,Plus,MapPin,UserRound][i]; return <button key={item} className={tab===item?'nav-item active':'nav-item'} onClick={()=>selectTab(item)}><I size={19}/>{item}{item==='検索'&&<span className="count">3</span>}</button>})}<div className="side-divider"/><div className="side-label">安全とサポート</div>{isAdmin&&<button className="nav-item" onClick={()=>setAdminOpen(true)}><ShieldCheck size={19}/>管理・安全設定</button>}<button className="nav-item" onClick={()=>showNotice('ヘルプセンターを開きました')}><CircleHelp size={19}/>ヘルプセンター</button><div className="sidebar-footer"><div className="offline"><span className="status-dot green"/>オフライン保存 有効</div><small>通信が不安定な場合も、入力内容は端末に保存されます。</small></div></aside>
      <section className="content"><div className="content-head"><div><p className="eyebrow">{tab==='検索'?'支援を探す':tab==='投稿'?'支援を届ける':tab==='地図'?'地域の状況':'あなたの活動'}</p><h1>{tab}</h1></div>{tab==='検索'&&<button className="primary-button" onClick={()=>selectTab('投稿')}><Plus size={17}/>支援を投稿する</button>}</div>
      {tab==='検索'&&<>
        <div className="matching-entry"><div><strong>マッチング候補を見る</strong><span>検索画面を閉じて、専用ページで支援相手を探します。</span></div><a className="primary-button" href="/matching" onClick={openMatching}>マッチングページへ<ChevronRight size={16}/></a></div><div className="search-panel legacy-search-panel"><div className="search-input"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="物資、地域名などで検索"/><kbd aria-label="キーボードショートカット">⌘ K</kbd></div><div className="filters"><SlidersHorizontal size={16}/><span>絞り込み</span>{['すべて','高','中'].map(x=><button key={x} className={urgency===x?'filter active':'filter'} onClick={()=>setUrgency(x)}>{x==='すべて'?'すべての緊急度':`${x}緊急度`}</button>)}</div></div>
        <div className="matching-layout"><section className="latest-requests"><div className="section-title"><div><h2>最新の支援依頼</h2><p>あなたの近くで、助けを待っている声です</p></div><span>{filtered.length}件</span></div><div className="request-list">{filtered.map(r=><article className="request-card" key={r.id}><div className="card-top"><Badge tone={r.urgency==='高'?'red':r.urgency==='中'?'amber':'blue'}>{r.urgency}緊急度</Badge>{r.status&&<Badge tone={r.status==='募集中'?'green':'neutral'}>{r.status}</Badge>}<span className="card-time"><Clock3 size={14}/>{r.time}</span><IconButton label="ブックマーク" onClick={()=>setRequests(requests.map(x=>x.id===r.id?{...x,saved:!x.saved}:x))}><Bookmark size={18} fill={r.saved?'currentColor':'none'}/></IconButton>{isAdmin&&<IconButton label="投稿を削除" onClick={()=>{if(confirm('この支援依頼を削除しますか？')){setRequests(requests.filter(x=>x.id!==r.id));showNotice('管理者権限で投稿を削除しました')}}}><X size={17}/></IconButton>}</div><h3>{r.title}</h3><p className="card-body">{r.body}</p><div className="card-meta"><span><Package size={15}/>{r.category}</span><span><MapPin size={15}/>{r.place}</span></div><div className="card-bottom">{/* マッチ度は仕様変更により依頼一覧から削除。候補情報は独立したマッチングページで確認します。 */}<button className="text-button" onClick={()=>setSelected(r)}>詳細を見る <ChevronRight size={15}/></button></div></article>)}</div></section><section className={`matching-panel ${level>1?'is-locked':''}`}><div className="matching-head"><div className="matching-title"><HeartHandshake size={18}/><h2>マッチング候補</h2><Badge tone={level>1?'neutral':'green'}>{level>1?'現在利用できません':'70%以上を表示'}</Badge></div><p>{level>1?'災害レベルがLv.1以下になるまでマッチング機能は停止しています。':'距離・緊急度・物資の一致度から、候補を上位に表示しています。'}</p></div>{level !== null && level <= 1?<div className="matching-list">{[{name:'佐藤 花子',item:'飲料水・食料を支援',distance:'2.4km',score:94},{name:'山田 健',item:'水・衛生用品を支援',distance:'5.1km',score:82}].map(c=><div className="matching-row" key={c.name}><div className="avatar small">{c.name.slice(0,1)}</div><div className="matching-person"><b>{c.name}</b><span>{c.item} / {c.distance}</span></div><strong>{c.score}%</strong><button className="text-button" onClick={()=>showNotice(`${c.name}への支援申し出を確認しました`)}>詳細 <ChevronRight size={14}/></button></div>)}</div>:<div className="matching-locked"><LockKeyhole size={22}/><span>現在利用できません</span></div>}</section></div>
      </>}
      {tab==='投稿'&&<PostForm form={form} setForm={setForm} submit={submitPost} draftSaved={draftSaved} setDraftSaved={setDraftSaved} role={role}/>} 
      {tab==='地図'&&<DisasterMap onNotice={showNotice} role={role}/>} 
      {tab==='マイページ'&&<MyPage role={role} onRoleChange={(next)=>{setRole(next);showNotice(`${next}アカウントに切り替えました`)}} onNotice={showNotice}/>} 
      </section>
    </div>
    <nav className="mobile-nav">{(['検索','投稿','地図','マイページ'] as Tab[]).map((x,i)=>{const I=[Search,Plus,MapPin,UserRound][i];return <button key={x} className={tab===x?'active':''} onClick={()=>selectTab(x)}><I size={20}/><span>{x}</span></button>})}</nav>
    {notice&&<div className="toast"><Check size={17}/>{notice}</div>}
    {matchingLocked&&<div className="modal-backdrop" role="presentation" onClick={()=>setMatchingLocked(false)}><div className="modal locked-state" role="alertdialog" aria-modal="true" aria-labelledby="matching-lock-title" onClick={e=>e.stopPropagation()}><LockKeyhole size={30}/><h2 id="matching-lock-title">この機能はレベル2以上では使用できません</h2><p>災害レベルがLv.1になるまでマッチング機能は停止しています。</p><button className="primary-button full" onClick={()=>setMatchingLocked(false)}>確認しました</button></div></div>}
    {menuOpen&&<div className="modal-backdrop menu-backdrop" onClick={()=>setMenuOpen(false)}><div className="quick-menu" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><p className="eyebrow">ナビゲーション</p><h2>メニュー</h2></div></div><div className="quick-menu-list"><div className="quick-menu-label">メインメニュー</div>{(['検索','投稿','地図','マイページ'] as Tab[]).map((item,i)=>{const I=[Search,Plus,MapPin,UserRound][i];return <button key={item} className={tab===item?'selected':''} onClick={()=>{setTab(item);setMenuOpen(false)}}><I size={19}/><span>{item}</span>{item==='検索'&&<span className="count">3</span>}<ChevronRight size={16}/></button>})}<div className="quick-menu-divider"/><div className="quick-menu-label">安全とサポート</div>{isAdmin&&<button onClick={()=>{setAdminOpen(true);setMenuOpen(false)}}><ShieldCheck size={19}/><span>管理・安全設定</span><ChevronRight size={16}/></button>}<button onClick={()=>{showNotice('ヘルプセンターを開きました');setMenuOpen(false)}}><CircleHelp size={19}/><span>ヘルプセンター</span><ChevronRight size={16}/></button><div className="quick-menu-footer"><span className="status-dot green"/>オフライン保存 有効</div></div></div></div>}
    {selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelected(null)}><X size={19}/></button><Badge tone={selected.urgency==='高'?'red':'amber'}>{selected.urgency}緊急度</Badge><h2>{selected.title}</h2><p>{selected.body}</p><div className="detail-row"><MapPin size={17}/><b>受取場所</b><span>{selected.place}</span></div><div className="detail-row"><Package size={17}/><b>カテゴリ</b><span>{selected.category}</span></div><div className="privacy-note"><ShieldCheck size={17}/>連絡先はマッチング成立後にのみ共有されます。</div>{level !== null && level <= 1&&role!=='管理者'?<button className="primary-button full" onClick={()=>{setSelected(null);showNotice('支援の申し出を送信しました')}}><HeartHandshake size={17}/>この依頼を支援する</button>:<button className="disabled-button full"><LockKeyhole size={16}/>災害レベルが下がるまで停止中</button>}</div></div>}
    {levelOpen&&!isAdmin&&<div className="modal-backdrop" onClick={()=>setLevelOpen(false)}><div className="modal level-dialog" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setLevelOpen(false)} aria-label="閉じる"><X size={19}/></button><div className="level-dialog-icon"><AlertTriangle size={22}/></div><p className="eyebrow">地域の安全情報</p><h2>現在のレベルは Lv.{level} です</h2><p>{level !== null && level <= 1?'通常のマッチングが利用できます。':'安全確保のため一部の機能が制限されています。'}</p><button className="primary-button full" onClick={()=>setLevelOpen(false)}>確認しました</button></div></div>}
    {adminOpen&&isAdmin&&<div className="modal-backdrop" onClick={()=>setAdminOpen(false)}><div className="admin-panel" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><p className="eyebrow">デモアカウント / 安全管理</p><h2>管理・安全設定</h2></div><button className="modal-close" onClick={()=>setAdminOpen(false)}><X size={19}/></button></div><div className="admin-section"><label>デモアカウントを切り替え</label><p className="panel-hint">権限ごとの画面を確認できます。災害レベルを変更できるのは管理者だけです。</p><div className="level-options role-options">{(['被災者','支援者','管理者'] as Role[]).map(r=><button className={role===r?'selected':''} key={r} onClick={()=>{setRole(r);showNotice(`${r}アカウントに切り替えました`)}}>{r}<small>{r==='管理者'?'地域設定・通報管理':r==='支援者'?'支援物資を登録':'支援を依頼'}</small></button>)}</div></div><div className="admin-section"><label>地域の災害レベル <Badge tone={isAdmin?'green':'neutral'}>{isAdmin?'管理者のみ変更可':'閲覧のみ'}</Badge></label><div className="level-options">{[1,2,3].map(n=><button disabled={!isAdmin} className={level===n?'selected':''} key={n} onClick={async()=>{if(!isAdmin)return showNotice('災害レベルの変更は管理者のみ行えます');try{const response=await fetch('/api/disaster-level',{method:'POST',headers:{'content-type':'application/json','x-demo-admin':'true'},body:JSON.stringify({level:n}),cache:'no-store'});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'保存に失敗しました');setLevel(Number(body.level));showNotice(`災害レベルをLv.${n}に変更しました`)}catch{showNotice('災害レベルをサーバーに保存できませんでした')}}}>Lv.{n}<small>{n===1?'通常運用':n===2?'指定置き場のみ':'緊急停止'}</small></button>)}</div></div><div className="auto-card"><Zap size={18}/><div><b>自動判定レベル：Lv.2</b><p>気象庁・自治体の情報をもとに判定（デモ）</p></div><Settings size={17}/></div><div className="admin-section"><label>通報・安全確認</label><div className="report-line"><Flag size={17}/><span>未確認の通報</span><Badge tone="red">2件</Badge><ChevronRight size={16}/></div><div className="report-line"><FileText size={17}/><span>管理者操作ログ</span><ChevronRight size={16}/></div></div><div className="warning-box"><Siren size={18}/><p><b>Lv.3では直接支援を行わないでください。</b><br/>二次災害の危険があるため、必ず自治体の指示に従ってくだ��い。</p></div></div></div>}
  </main>
}

function PostForm({form,setForm,submit,draftSaved,setDraftSaved,role}:{form:any;setForm:any;submit:()=>void;draftSaved:boolean;setDraftSaved:(x:boolean)=>void;role:Role}) { const update=(k:string,v:string)=>setForm({...form,[k]:v}); // 被災者は支援依頼を、支援者は支援物資の提供を投稿できます。管理者は確認・管理に専念します。
  const canPost=role==='被災者' || role==='支援者'; return <div className="form-wrap"><div className="form-intro"><div className="big-icon"><HeartHandshake size={25}/></div><div><h2>支援投稿</h2><p>{role==='被災者'?'必要な物資や助けを、できるだけ具体的に教えてください。':'支援できる物資と受け渡し条件を登録してください。緊急度の入力はありません。'}</p></div></div><div className="form-card"><label>{canPost?'必要な物資':'支援できる物資'}<input value={form.title} onChange={e=>update('title',e.target.value)} placeholder={canPost?'例：飲料水を届けてほしい':'例：飲料水・衛生用品を支援'}/></label><div className="form-grid"><label>{canPost?'カテゴリ':'物資'}<select value={form.category} onChange={e=>update('category',e.target.value)}><option>水・飲料</option><option>食料</option><option>医薬品</option><option>乳幼児用品</option><option>衣類・寝具</option></select></label><label>数量<input value={form.quantity} onChange={e=>update('quantity',e.target.value)} placeholder="例：12本"/></label></div><label>{role==='被災者'?'受け取り場所':'受け渡し可能な範囲'}<input value={form.place} onChange={e=>update('place',e.target.value)} placeholder={canPost?'例：輪島市 河井町 避難所入口':'例：石川県内・近隣市町村まで'}/></label>{role==='被災者'?<div className="form-grid"><label>緊急度<div className="segmented">{['低','中','高'].map(x=><button type="button" className={form.urgency===x?'selected':''} onClick={()=>update('urgency',x)} key={x}>{x}</button>)}</div></label><label>受取可能時間<input placeholder="例：いつでも"/></label></div>:<label>受け渡し可能時間<input placeholder="例：���日18時以降・土日終日"/></label>}<label>{canPost?'詳細（任意）':'その他（任意）'}<textarea value={form.description} onChange={e=>update('description',e.target.value)} placeholder={canPost?'家族構成、避難状況などを入力してください':'支援可能な物資や補足を入力してください'} rows={4}/></label><label>投稿タグ（複数可）<input placeholder="例：飲料水, 車で搬送可能" onChange={e=>update('tags',e.target.value)}/></label><div className="form-actions"><button className="secondary-button" onClick={()=>{setDraftSaved(true)}}><FileText size={16}/>下書き保存</button><button className="primary-button" disabled={!canPost} onClick={()=>canPost&&submit()}><Send size={16}/>{canPost?'支援を依頼する':'支援者は依頼を投稿できません'}</button></div>{draftSaved&&<p className="saved-note"><Check size={15}/>下書きを端末に保存しました</p>}</div><div className="privacy-note"><ShieldCheck size={17}/>個人情報は公��されません。マッチ��グ成立後も、必要最小限の情報のみ共有されます。</div></div> }

function MapView({level,onNotice}:{level:number;onNotice:(s:string)=>void}) { const pins=[{x:'25%',y:'31%',type:'避難所',n:'輪島市立体育館',c:'blue'},{x:'61%',y:'25%',type:'物資',n:'支援物資置き場',c:'green'},{x:'48%',y:'65%',type:'通行注意',n:'県道249号',c:'red'},{x:'76%',y:'70%',type:'避難所',n:'珠洲市役所',c:'blue'}]; return <div className="map-page"><div className="map-toolbar"><div className="search-input"><Search size={17}/><input placeholder="地名・施設名を検索"/></div><button className="secondary-button"><Navigation size={16}/>現在地</button></div><div className="map-canvas"><div className="map-grid"/><div className="river river-a"/><div className="river river-b"/>{pins.map(p=><button key={p.n} className={`map-pin pin-${p.c}`} style={{left:p.x,top:p.y}} onClick={()=>onNotice(`${p.n}の詳細を表示しました`)}><span><MapPin size={17}/></span><small>{p.type}</small></button>)}<div className="cluster" style={{left:'38%',top:'45%'}}>12</div><div className="map-legend"><b>地図表示</b><span><i className="legend-dot blue"/>避難所</span><span><i className="legend-dot green"/>物資</span><span><i className="legend-dot red"/>通行注意</span></div><div className="map-caution"><AlertTriangle size={16}/>通行止め・危険区域の情報は自治体発表を優先してください</div></div><div className="map-bottom"><div><b>近くの支援スポット</b><span>50m以内のピンをまとめて表示しています</span></div><button className="text-button" onClick={()=>onNotice('ピン投稿フォームを開きました')}><Plus size={16}/>ピンを投稿</button></div></div> }
// DEMO ACCOUNT — REMOVE THIS BLOCK to remove the temporary role-switching demo.
function MyPage({role,onRoleChange,onNotice}:{role:Role;onRoleChange:(role:Role)=>void;onNotice:(s:string)=>void}) { return <div className="mypage"><div className="profile-card"><a className="primary-button" href="/account/declaration">災害時の自己申告・役割設定</a><div className="avatar">田</div><div><h2>田中 太郎</h2><p>{role} <Badge tone="green">デモアカウント</Badge></p><small>石川県 輪島市</small></div><button className="icon-button" aria-label="プロフィール設定"><Settings size={18}/></button></div><div className="role-switch-card"><div><h3>デモ用アカウント</h3><p>役割を切り替えて、それぞれの画面と権限を確認できます。</p></div><div className="role-switcher">{(['被災者','支援者','管理者'] as Role[]).map(item=><button type="button" key={item} className={role===item?'selected':''} onClick={()=>onRoleChange(item)}>{item}<small>{item==='被災者'?'支援を依頼':item==='支援者'?'物資を支援':'地域・通報を管理'}</small></button>)}</div></div><div className="stats"><div><b>8</b><span>支援した人</span></div><div><b>3</b><span>投稿した依頼</span></div><div><b>5</b><span>保存した依頼</span></div></div><div className="mypage-section"><h3>活動状況</h3><div className="activity"><Package size={19}/><div><b>飲料水の依頼</b><p>支援者とマッチング済み</p></div><Badge tone="green">進行中</Badge><ChevronRight size={16}/></div><div className="activity"><HeartHandshake size={19}/><div><b>毛布を支援しました</b><p>3日前</p></div><Badge tone="neutral">完了</Badge><ChevronRight size={16}/></div></div><div className="mypage-section"><h3>サポート</h3><button className="menu-line" onClick={()=>onNotice('ヘルプセンターを開きました')}><LifeBuoy size={18}/>ヘルプセンター<ChevronRight size={16}/></button><button className="menu-line"><FileText size={18}/>利用規約・プライバシー<ChevronRight size={16}/></button></div></div>}
