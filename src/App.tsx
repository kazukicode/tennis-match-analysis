import { Fragment, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent, type PointerEvent } from 'react'
import { ArrowUpRight, CircleDot, ClipboardList, Download, FileJson2, FileUp, LayoutGrid, Move, Pencil, RotateCcw, Trophy, Undo2 } from 'lucide-react'
import { calculateScore, pointLabel, safeName, type CourtAnnotation, type Player, type Project, type Side } from './tennis'
import './App.css'

const letters = ['A', 'B', 'C', 'D']
const drawingColors = ['#ffffff', '#d8f079', '#ff927e', '#63c6e4', '#f6d15c', '#283d31']

function readProject(value: unknown): Project | null {
  if (!value || typeof value !== 'object') return null
  const project = value as Partial<Project>
  if (project.version !== 1 || !project.rules || !Array.isArray(project.players) || project.players.length !== 2 || !Array.isArray(project.points)) return null
  if (!['singles', 'doubles'].includes(project.format ?? '') || !['score', 'board'].includes(project.mode ?? '')) return null
  if (!Number.isInteger(project.rules.bestOf) || project.rules.bestOf < 1 || project.rules.bestOf > 5 || ![4, 6, 8].includes(project.rules.gamesToWin)) return null
  if (project.players.some((team) => !Array.isArray(team) || team.some((player) => !player || typeof player.name !== 'string'))) return null
  if (project.points.some((point) => !point || (point.winner !== 0 && point.winner !== 1) || typeof point.createdAt !== 'string')) return null
  const needsCourtMigration = project.courtVersion !== 2
  const players = project.players.map((team) => team.map((player) => ({
    ...player,
    x: needsCourtMigration ? player.x * 0.6 : player.x,
    y: needsCourtMigration ? player.y * (13 / 6) : player.y,
  }))) as [Player[], Player[]]
  const ball = project.ball && typeof project.ball === 'object'
    ? needsCourtMigration ? { x: project.ball.x * 0.6, y: project.ball.y * (13 / 6) } : project.ball
    : null
  return { ...project, courtVersion: 2, players, ball, annotations: project.annotations ?? [] } as Project
}

function App() {
  const [screen, setScreen] = useState<'home' | 'setup' | 'match'>('home')
  const [project, setProject] = useState<Project | null>(null)
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<'singles' | 'doubles'>('singles')
  const [names, setNames] = useState([['', ''], ['', '']])
  const [bestOf, setBestOf] = useState(3)
  const [gamesToWin, setGamesToWin] = useState(6)
  const [tieBreak, setTieBreak] = useState(true)
  const [noAd, setNoAd] = useState(false)
  const [firstServer, setFirstServer] = useState<Side>(0)
  const [dragging, setDragging] = useState<{ side: Side; index: number } | null>(null)
  const [draggingBall, setDraggingBall] = useState(false)
  const [boardTool, setBoardTool] = useState<'move' | 'arrow' | 'draw' | 'ball'>('move')
  const [annotationColor, setAnnotationColor] = useState(drawingColors[0])
  const [drawing, setDrawing] = useState<CourtAnnotation | null>(null)
  const [importError, setImportError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const courtRef = useRef<SVGSVGElement>(null)
  const score = project ? calculateScore(project) : null
  const setCount = project && score ? Math.max(project.rules.bestOf, score.completedSets.length + 1) : bestOf

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const key = event.key.toLowerCase()
      if (key !== 'a' && key !== 'b') return
      const winner: Side = key === 'a' ? 0 : 1
      setProject((current) => {
        if (!current || current.mode !== 'score' || calculateScore(current).finished) return current
        return { ...current, points: [...current.points, { winner, createdAt: new Date().toISOString() }] }
      })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const updateProject = (updater: (current: Project) => Project) => setProject((current) => current ? updater(current) : current)

  const createProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const count = format === 'singles' ? 1 : 2
    const teams = [0, 1].map((side) => Array.from({ length: count }, (_, index) => ({
      id: `${side}-${index}`,
      name: names[side][index]?.trim() || `選手${letters[(format === 'singles' ? side : side * 2) + index]}`,
      x: count === 1 ? 300 : index === 0 ? 235 : 365,
      y: side === 0 ? 1040 : 260,
    }))) as [Player[], Player[]]
    setProject({ version: 1, courtVersion: 2, title: title.trim() || 'テニスの試合', format, players: teams, rules: { bestOf, gamesToWin, tieBreak, noAd, firstServer }, points: [], mode: 'score', ball: null, annotations: [] })
    setScreen('match')
  }

  const openJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const loaded = readProject(JSON.parse(await file.text()))
      if (!loaded) throw new Error('Invalid project')
      setProject(loaded)
      setScreen('match')
      setImportError('')
    } catch { setImportError('このJSONファイルは読み込めませんでした。') }
    event.target.value = ''
  }

  const downloadJson = () => {
    if (!project) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeName(project.title)}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const downloadCsv = () => {
    if (!project || !score) return
    const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
    const columns = Math.max(project.rules.bestOf, score.completedSets.length + 1)
    const rows = [
      ['選手', ...Array.from({ length: columns }, (_, index) => `第${index + 1}セット`), 'ゲーム得点'],
      ...([0, 1] as const).map((side) => [
        project.players[side].map((player) => player.name).join(' / '),
        ...Array.from({ length: columns }, (_, index) => score.completedSets[index]?.[side] ?? (index === score.completedSets.length ? score.games[side] : '')),
        score.tieBreakPoints ? `${score.tieBreakPoints[side]}` : pointLabel(score.points, side),
      ]),
    ]
    const url = URL.createObjectURL(new Blob([`\ufeff${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeName(project.title)}-score.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const awardPoint = (winner: Side) => updateProject((current) => current.mode === 'score' && !calculateScore(current).finished
    ? { ...current, points: [...current.points, { winner, createdAt: new Date().toISOString() }] } : current)

  const movePlayer = (side: Side, index: number, x: number, y: number) => updateProject((current) => {
    const players: [Player[], Player[]] = [current.players[0].map((player) => ({ ...player })), current.players[1].map((player) => ({ ...player }))]
    players[side][index] = { ...players[side][index], x, y }
    return { ...current, players }
  })

  const handlePointerMove = (event: MouseEvent<SVGSVGElement>) => {
    if ((!dragging && !draggingBall && !drawing) || !courtRef.current) return
    const bounds = courtRef.current.getBoundingClientRect()
    const point = {
      x: Math.max(20, Math.min(580, Math.round(((event.clientX - bounds.left) / bounds.width) * 600))),
      y: Math.max(43, Math.min(1257, Math.round(((event.clientY - bounds.top) / bounds.height) * 1300))),
    }
    if (drawing) {
      setDrawing((current) => {
        if (!current) return current
        if (current.kind !== 'draw') return { ...current, end: point }
        const points = current.points ?? [current.start]
        const lastPoint = points[points.length - 1]
        if (Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 3) return current
        return { ...current, end: point, points: [...points, point] }
      })
    } else if (draggingBall) {
      updateProject((current) => current.ball ? { ...current, ball: point } : current)
    } else if (dragging) {
      movePlayer(dragging.side, dragging.index, point.x, point.y)
    }
  }

  const startBallPointerDrag = (event: PointerEvent<SVGGElement>) => {
    if (event.pointerType === 'mouse') return
    event.stopPropagation()
    setDraggingBall(true)
    try { event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId) } catch {}
  }

  const startBallMouseDrag = (event: MouseEvent<SVGGElement>) => {
    event.stopPropagation()
    setDraggingBall(true)
  }

  const beginDrawing = (clientX: number, clientY: number, pointer?: { target: SVGSVGElement; id: number }) => {
    if (boardTool !== 'arrow' && boardTool !== 'draw' || !courtRef.current) return
    const bounds = courtRef.current.getBoundingClientRect()
    const point = {
      x: Math.round(((clientX - bounds.left) / bounds.width) * 600),
      y: Math.round(((clientY - bounds.top) / bounds.height) * 1300),
    }
    setDrawing({ id: `${Date.now()}-${Math.random()}`, kind: boardTool, start: point, end: point, color: annotationColor, ...(boardTool === 'draw' ? { points: [point] } : {}) })
    if (pointer) {
      try { pointer.target.setPointerCapture(pointer.id) } catch {}
    }
  }

  const startPointerDrawing = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse') return
    beginDrawing(event.clientX, event.clientY, { target: event.currentTarget, id: event.pointerId })
  }

  const startMouseDrawing = (event: MouseEvent<SVGSVGElement>) => beginDrawing(event.clientX, event.clientY)

  const finishDrawing = () => {
    const pathLength = drawing?.points?.reduce((length, point, index, points) => {
      if (index === 0) return length
      const previous = points[index - 1]
      return length + Math.hypot(point.x - previous.x, point.y - previous.y)
    }, 0) ?? 0
    const distance = drawing?.kind === 'draw' ? pathLength : drawing ? Math.hypot(drawing.end.x - drawing.start.x, drawing.end.y - drawing.start.y) : 0
    if (drawing && distance > 12) {
      updateProject((current) => ({ ...current, annotations: [...(current.annotations ?? []), drawing] }))
    }
    setDrawing(null)
    setDragging(null)
    setDraggingBall(false)
  }

  const finishPointerDrawing = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== 'mouse') finishDrawing()
  }

  const placeBall = (event: MouseEvent<SVGSVGElement>) => {
    if (!project || boardTool !== 'ball' || dragging || drawing || !courtRef.current) return
    const bounds = courtRef.current.getBoundingClientRect()
    updateProject((current) => ({ ...current, ball: { x: Math.round(((event.clientX - bounds.left) / bounds.width) * 600), y: Math.round(((event.clientY - bounds.top) / bounds.height) * 1300) } }))
  }

  const startNew = () => {
    if (project && !window.confirm('現在の試合を閉じて，新しい試合を作成しますか？')) return
    setProject(null)
    setScreen('home')
    setTitle('')
    setNames([['', ''], ['', '']])
    setImportError('')
  }

  const visibleAnnotations = [...(project?.annotations ?? []), ...(drawing ? [drawing] : [])]

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={startNew} aria-label="試合作成へ戻る"><span className="brand-mark"><span /></span><span>COURT<span className="brand-light">NOTES</span></span></button>
        <div className="topbar-right"><span className="byline">by K.Kitaoka</span>
          <input ref={fileInput} className="visually-hidden" type="file" accept=".json,application/json" onChange={openJson} />
        </div>
      </header>

      {screen === 'home' ? <section className="landing-page">
        <div className="landing-copy"><div className="eyebrow"><span className="eyebrow-line" /> MATCH DESK <span>COURT NOTES</span></div><h1>テニス分析アプリ</h1><p>テニスのスコアと戦術を記録します。</p></div>
        <div className="landing-actions"><button className="primary-button" type="button" onClick={() => { setImportError(''); setProject(null); setScreen('setup') }}>新規作成 <span>↗</span></button><button className="secondary-button" type="button" onClick={() => fileInput.current?.click()}><FileUp size={16} /> JSONファイルを開く</button></div>
        {importError && <p className="error-message" role="alert">{importError}</p>}
        <footer className="setup-footer"><span>COURT NOTES <span>·</span> TENNIS MATCH ANALYSIS</span><span>POINT BY POINT, PLAY BY PLAY.</span></footer>
      </section> : !project ? <section className="setup-page">
        <div className="setup-intro"><div className="eyebrow"><span className="eyebrow-line" /> MATCH DESK <span>01 / SETUP</span></div><h1>テニス分析アプリ</h1><p>試合情報を設定してください。</p></div>
        <form className="setup-form" onSubmit={createProject}>
          <div className="form-section"><div className="section-heading"><span className="section-index">01</span><h2>試合情報</h2><span className="section-rule" /></div>
            <label className="field-label" htmlFor="match-title">タイトル <span>OPTIONAL</span></label><input id="match-title" className="text-input title-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例：秋季クラブ内戦" />
          </div>
          <div className="form-section"><div className="section-heading"><span className="section-index">02</span><h2>対戦形式</h2><span className="section-rule" /></div>
            <div className="segmented-control" role="group" aria-label="対戦形式"><button type="button" className={format === 'singles' ? 'selected' : ''} onClick={() => setFormat('singles')}>シングルス</button><button type="button" className={format === 'doubles' ? 'selected' : ''} onClick={() => setFormat('doubles')}>ダブルス</button></div>
            <div className="teams-grid">{[0, 1].map((side) => <div className={`team-fields team-${side}`} key={side}><div className="team-label"><span className="team-chip">{side === 0 ? 'A' : 'B'}</span><span>TEAM {side === 0 ? 'A' : 'B'}</span></div>
              {Array.from({ length: format === 'singles' ? 1 : 2 }, (_, index) => <input key={index} className="text-input player-input" aria-label={`${side === 0 ? 'A' : 'B'}側 選手${index + 1}`} value={names[side][index]} onChange={(event) => setNames((current) => current.map((team, teamIndex) => teamIndex === side ? team.map((name, playerIndex) => playerIndex === index ? event.target.value : name) : team))} placeholder={`選手${letters[(format === 'singles' ? side : side * 2) + index]}`} />)}
            </div>)}</div>
          </div>
          <div className="form-section"><div className="section-heading"><span className="section-index">03</span><h2>試合ルール</h2><span className="section-rule" /></div>
            <div className="rules-grid"><div className="rule-field"><label className="field-label" htmlFor="best-of">セット数（半角数字）</label><input id="best-of" className="select-input number-input" type="number" inputMode="numeric" min={1} max={5} step={1} value={bestOf} onChange={(event) => setBestOf(Math.max(1, Math.min(5, Number(event.target.value) || 1)))} /><span className="field-hint">{Math.floor(bestOf / 2) + 1}セット先取</span></div>
              <div className="rule-field"><label className="field-label" htmlFor="games-to-win">1セットのゲーム数</label><select id="games-to-win" className="select-input" value={gamesToWin} onChange={(event) => setGamesToWin(Number(event.target.value))}>{[4, 6, 8].map((value) => <option key={value} value={value}>{value}ゲーム先取</option>)}</select><span className="field-hint">2ゲーム差でセット獲得</span></div>
            </div>
            <div className="rule-toggles"><label className="toggle-row"><input type="checkbox" checked={tieBreak} onChange={(event) => setTieBreak(event.target.checked)} /><span className="toggle-ui" /><span><strong>タイブレーク</strong><small>{gamesToWin} - {gamesToWin} で実施</small></span></label><label className="toggle-row"><input type="checkbox" checked={noAd} onChange={(event) => setNoAd(event.target.checked)} /><span className="toggle-ui" /><span><strong>ノーアド</strong><small>デュース後の1ポイントで決着</small></span></label></div>
            <div className="server-choice"><span className="field-label">最初のサーバー</span><div className="server-buttons">{[0, 1].map((side) => <button type="button" key={side} className={firstServer === side ? 'selected' : ''} onClick={() => setFirstServer(side as Side)}>{names[side][0].trim() || `選手${letters[format === 'singles' ? side : side * 2]}`}</button>)}</div></div>
          </div>
          {importError && <p className="error-message" role="alert">{importError}</p>}
          <div className="form-footer"><span>JSONで保存・再開できます</span><button className="primary-button" type="submit">コートに進む <span>↗</span></button></div>
        </form>
        <footer className="setup-footer"><span>COURT NOTES <span>·</span> TENNIS MATCH ANALYSIS</span><span>POINT BY POINT, PLAY BY PLAY.</span></footer>
      </section> : <>
        <div className="match-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> MATCH IN PROGRESS <span>{project.format === 'singles' ? 'SINGLES' : 'DOUBLES'} · BEST OF {project.rules.bestOf}</span></div><h1>{project.title}</h1><p className="match-subtitle">{project.players[0].map((player) => player.name).join(' / ')} <span>vs</span> {project.players[1].map((player) => player.name).join(' / ')}</p></div>
          <div className="match-actions">{project.mode === 'score' && <button className="secondary-button csv-button" type="button" onClick={downloadCsv}><Download size={15} /> CSV出力</button>}<button className="secondary-button" type="button" onClick={downloadJson}><FileJson2 size={15} /> JSON保存</button></div>
        </div>
        <nav className="mode-tabs" aria-label="作業モード"><button type="button" className={project.mode === 'score' ? 'active' : ''} onClick={() => updateProject((current) => ({ ...current, mode: 'score' }))}><ClipboardList size={16} /> スコア記録 <span>01</span></button><button type="button" className={project.mode === 'board' ? 'active' : ''} onClick={() => updateProject((current) => ({ ...current, mode: 'board' }))}><LayoutGrid size={16} /> 戦術ボード <span>02</span></button><div className="tabs-spacer" /></nav>
        {project.mode === 'score' && score ? <section className="score-workspace"><div className="score-main">
          <div className="scoreboard"><div className="scoreboard-top"><span>LIVE SCORE</span><span>{score.finished ? 'MATCH COMPLETE' : `SET ${Math.min(score.completedSets.length + 1, project.rules.bestOf)}`}</span></div>
            <div className="scoreboard-grid" style={{ gridTemplateColumns: `minmax(0, 1.2fr) repeat(${setCount}, minmax(0, .8fr)) minmax(40px, .7fr)` }}>
              <div className="set-head">選手</div>{Array.from({ length: setCount }, (_, index) => <div key={`head-${index}`} className="set-head">S{index + 1}</div>)}<div className="set-head">GAME</div>
              {([0, 1] as const).map((side) => <Fragment key={side}>
                <div className="score-name-cell"><span className={`score-side-mark side-${side === 0 ? 'a' : 'b'}`} />{project.players[side].map((player) => player.name).join(' / ')}{score.server === side && <span className="serve-indicator">SERVE</span>}</div>
                {Array.from({ length: setCount }, (_, index) => <div key={`set-${side}-${index}`} className={`game-cell ${index === score.completedSets.length ? 'current-game' : ''}`}>{score.completedSets[index]?.[side] ?? (index === score.completedSets.length ? score.games[side] : '·')}</div>)}
                <div className="current-points">{score.tieBreakPoints ? score.tieBreakPoints[side] : pointLabel(score.points, side)}</div>
              </Fragment>)}
            </div>
            {score.finished && <div className="match-result"><Trophy size={15} /> 試合終了 · {project.players[score.sets[0] > score.sets[1] ? 0 : 1].map((player) => player.name).join(' / ')} の勝利</div>}
          </div>
          <div className="point-entry"><div className="entry-heading"><div><span className="eyebrow-line" /><span>POINT ENTRY</span></div><span>RALLY WON BY</span></div>
            <div className="winner-buttons">{[0, 1].map((side) => <button type="button" key={side} disabled={score.finished} className={`winner-button winner-${side}`} onClick={() => awardPoint(side as Side)}><span className="winner-label">TEAM {side === 0 ? 'A' : 'B'}</span><strong>{project.players[side].map((player) => player.name).join(' / ')}</strong><span className="winner-cta">ポイント獲得 <span>↗</span></span></button>)}</div>
            <div className="entry-tools"><button type="button" className="text-action" onClick={() => updateProject((current) => ({ ...current, points: current.points.slice(0, -1) }))} disabled={project.points.length === 0}><Undo2 size={14} /> 1ポイント戻す</button><span>{project.points.length} POINTS</span><button type="button" className="text-action" onClick={() => { if (window.confirm('ポイント履歴をすべて削除しますか？')) updateProject((current) => ({ ...current, points: [] })) }} disabled={project.points.length === 0}><RotateCcw size={14} /> 試合をリセット</button></div>
          </div>
        </div>
          <aside className="history-panel"><div className="panel-heading"><div><span className="eyebrow-line" /><span>RALLY LOG</span></div><span className="history-count">{project.points.length.toString().padStart(2, '0')}</span></div>
            {score.rows.length === 0 ? <div className="empty-history"><span className="empty-history-mark">01</span><p>ラリー履歴</p><small>0 ポイント</small></div> : <div className="history-list">{[...score.rows].reverse().slice(0, 30).map((row) => <div className="history-row" key={row.number}><span className="history-number">{String(row.number).padStart(2, '0')}</span><span className={`history-winner side-text-${row.winner}`}>{project.players[row.winner][0].name}</span><span className="history-score">{row.games[0]}–{row.games[1]} <small>{row.points[0]}:{row.points[1]}</small></span></div>)}</div>}
            <div className="history-foot"><span>SET {Math.min(score.completedSets.length + 1, project.rules.bestOf)}</span><span>{project.points.length} POINTS</span></div>
          </aside>
        </section> : <section className="board-workspace">
          <div className="board-toolbar"><div className="board-toolbar-title"><span className="eyebrow-line" /><span>TACTICAL POSITIONING</span></div><button type="button" className="text-action" onClick={() => updateProject((current) => ({ ...current, ball: null, annotations: [], players: [current.players[0].map((player, index) => ({ ...player, x: current.players[0].length === 1 ? 300 : index === 0 ? 235 : 365, y: 1040 })), current.players[1].map((player, index) => ({ ...player, x: current.players[1].length === 1 ? 300 : index === 0 ? 235 : 365, y: 260 }))] }))}><RotateCcw size={14} /> 配置をリセット</button></div>
          <div className="board-controls">
            <div className="board-tool-buttons" role="toolbar" aria-label="ボードツール">
              <button type="button" className={boardTool === 'move' ? 'selected' : ''} title="選手を移動" aria-label="選手を移動" onClick={() => setBoardTool('move')}><Move size={16} /></button>
              <button type="button" className={boardTool === 'arrow' ? 'selected' : ''} title="矢印を描く" aria-label="矢印を描く" onClick={() => setBoardTool('arrow')}><ArrowUpRight size={16} /></button>
              <button type="button" className={boardTool === 'draw' ? 'selected' : ''} title="自由に描く" aria-label="描画モード" onClick={() => setBoardTool('draw')}><Pencil size={16} /></button>
              <button type="button" className={boardTool === 'ball' ? 'selected' : ''} title="ボールを配置" aria-label="ボールを配置" onClick={() => setBoardTool('ball')}><CircleDot size={16} /></button>
              {project.ball && <button type="button" title="ボールを削除" aria-label="ボールを削除" onClick={() => updateProject((current) => ({ ...current, ball: null }))}>×</button>}
              <button type="button" title="最後の線・矢印を取り消す" aria-label="最後の線・矢印を取り消す" disabled={!project.annotations?.length} onClick={() => updateProject((current) => ({ ...current, annotations: (current.annotations ?? []).slice(0, -1) }))}><Undo2 size={16} /></button>
            </div>
            <div className="annotation-colors" role="group" aria-label="描画色">{drawingColors.map((color) => <button key={color} type="button" className={annotationColor === color ? 'selected' : ''} style={{ backgroundColor: color }} aria-label={`色 ${color}`} aria-pressed={annotationColor === color} onClick={() => setAnnotationColor(color)} />)}</div>
          </div>
          <div className="board-layout"><div className="court-frame"><svg ref={courtRef} className="court-svg" viewBox="0 0 600 1300" role="img" aria-label="縦向きのテニスコート" onClick={placeBall} onPointerDown={startPointerDrawing} onMouseDown={startMouseDrawing} onPointerMove={handlePointerMove} onMouseMove={handlePointerMove} onPointerUp={finishPointerDrawing} onPointerCancel={finishDrawing} onMouseUp={finishDrawing}>
            <defs><pattern id="court-grain" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 18L18 0" stroke="#1d5637" strokeOpacity=".025" strokeWidth="1" /></pattern><filter id="token-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity=".22" /></filter>
              {visibleAnnotations.map((annotation, index) => annotation.kind === 'arrow' && <marker key={`arrow-${annotation.id}`} id={`arrowhead-${index}`} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse" viewBox="0 0 12 12"><path d="M1 1L11 6L1 11Z" fill={annotation.color} /></marker>)}
            </defs>
            <rect width="600" height="1300" fill="#ffffff" /><rect width="600" height="1300" fill="url(#court-grain)" />
            <rect x="20" y="43" width="560" height="1214" fill="none" stroke="#1d5637" strokeWidth="4" />
            <line x1="90" y1="43" x2="90" y2="1257" stroke="#1d5637" strokeWidth="3" /><line x1="510" y1="43" x2="510" y2="1257" stroke="#1d5637" strokeWidth="3" />
            <line x1="90" y1="323" x2="510" y2="323" stroke="#1d5637" strokeWidth="3" /><line x1="90" y1="977" x2="510" y2="977" stroke="#1d5637" strokeWidth="3" /><line x1="300" y1="323" x2="300" y2="977" stroke="#1d5637" strokeWidth="3" />
            <line x1="20" y1="650" x2="580" y2="650" stroke="#38624a" strokeWidth="6" />
            {visibleAnnotations.map((annotation, index) => annotation.kind === 'draw'
              ? <polyline key={annotation.id} points={(annotation.points ?? [annotation.start, annotation.end]).map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={annotation.color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              : <line key={annotation.id} x1={annotation.start.x} y1={annotation.start.y} x2={annotation.end.x} y2={annotation.end.y} stroke={annotation.color} strokeWidth="5" strokeLinecap="round" markerEnd={annotation.kind === 'arrow' ? `url(#arrowhead-${index})` : undefined} />)}
            {[0, 1].map((side) => project.players[side].map((player, index) => <g key={player.id} className="player-token" transform={`translate(${player.x} ${player.y})`} filter="url(#token-shadow)" onPointerDown={(event) => { if (boardTool === 'arrow' || boardTool === 'draw') return; event.stopPropagation(); setDragging({ side: side as Side, index }); try { event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId) } catch {} }} onMouseDown={(event) => { if (boardTool !== 'arrow' && boardTool !== 'draw') event.stopPropagation() }} onClick={(event) => event.stopPropagation()}><circle r="25" fill={side === 0 ? '#d7f46a' : '#ff8068'} stroke="#fffdf7" strokeWidth="3" /><text y="43" textAnchor="middle" fill="#fffdf7" fontSize="13" fontWeight="700" paintOrder="stroke" stroke="#173426" strokeWidth="3">{player.name}</text></g>))}
            {project.ball && <g className="ball-marker" transform={`translate(${project.ball.x} ${project.ball.y})`} onPointerDown={startBallPointerDrag} onMouseDown={startBallMouseDrag} onClick={(event) => event.stopPropagation()}><circle r="15" fill="#fffdf3" /><circle r="15" fill="none" stroke="#bfd363" strokeWidth="3" /><path d="M-7 -13 Q7 0 -7 13 M7 -13 Q-7 0 7 13" fill="none" stroke="#bfd363" strokeWidth="1.5" /></g>}
          </svg></div>
            <aside className="board-legend"><div className="panel-heading"><div><span className="eyebrow-line" /><span>PLAYERS</span></div><span className="history-count">{project.format === 'singles' ? '1v1' : '2v2'}</span></div>
              <div className="legend-team"><span className="legend-dot side-a" /><div><small>TEAM A</small>{project.players[0].map((player) => <strong key={player.id}>{player.name}</strong>)}</div></div><div className="legend-team"><span className="legend-dot side-b" /><div><small>TEAM B</small>{project.players[1].map((player) => <strong key={player.id}>{player.name}</strong>)}</div></div>{project.ball && <div className="legend-ball"><span className="ball-mini" /> ボール</div>}<div className="board-score-note"><span>現在のスコア</span><strong>{score?.games[0] ?? 0}<i>–</i>{score?.games[1] ?? 0}</strong><small>ゲーム · {project.points.length}ポイント</small></div>
            </aside>
          </div>
        </section>}
        <footer className="match-footer"><span>COURT NOTES <span>·</span> TENNIS MATCH ANALYSIS</span><button type="button" onClick={startNew}>別の試合を作成 <span>↗</span></button></footer>
      </>}
  </main>
  )
}

export default App
