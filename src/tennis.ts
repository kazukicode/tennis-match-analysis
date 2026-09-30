export type Side = 0 | 1
export type Mode = 'score' | 'board'

export type Player = {
  id: string
  name: string
  x: number
  y: number
}

export type PointEvent = {
  winner: Side
  createdAt: string
}

export type CourtAnnotation = {
  id: string
  kind: 'arrow' | 'line' | 'draw'
  start: { x: number; y: number }
  end: { x: number; y: number }
  color: string
  points?: { x: number; y: number }[]
}

export type Project = {
  version: 1
  courtVersion?: 2
  title: string
  format: 'singles' | 'doubles'
  players: [Player[], Player[]]
  rules: {
    bestOf: number
    gamesToWin: number
    tieBreak: boolean
    noAd: boolean
    firstServer: Side
  }
  points: PointEvent[]
  mode: Mode
  ball: { x: number; y: number } | null
  annotations?: CourtAnnotation[]
}

export type ScoreRow = {
  number: number
  set: number
  game: number
  games: [number, number]
  points: [string, string]
  winner: Side
  createdAt: string
}

export type Score = {
  sets: [number, number]
  completedSets: [number, number][]
  games: [number, number]
  points: [number, number]
  tieBreakPoints: [number, number] | null
  server: Side
  finished: boolean
  rows: ScoreRow[]
}

export function pointLabel(points: [number, number], side: Side) {
  const own = points[side]
  const other = points[side === 0 ? 1 : 0]
  if (own >= 3 && other >= 3) {
    if (own === other) return '40'
    return own > other ? 'AD' : '40'
  }
  return ['0', '15', '30', '40'][own] ?? '40'
}

export function calculateScore(project: Project): Score {
  const score: Score = {
    sets: [0, 0],
    completedSets: [],
    games: [0, 0],
    points: [0, 0],
    tieBreakPoints: null,
    server: project.rules.firstServer,
    finished: false,
    rows: [],
  }
  const setsToWin = Math.floor(project.rules.bestOf / 2) + 1

  const finishSet = (winner: Side, games: [number, number]) => {
    score.completedSets.push(games)
    score.sets[winner] += 1
    score.games = [0, 0]
    score.points = [0, 0]
    score.tieBreakPoints = null
    score.finished = score.sets[winner] >= setsToWin
  }

  const finishGame = (winner: Side) => {
    score.games[winner] += 1
    score.points = [0, 0]
    score.server = winner === 0 ? 1 : 0
    const [gamesA, gamesB] = score.games
    if (project.rules.tieBreak && gamesA === project.rules.gamesToWin && gamesB === project.rules.gamesToWin) {
      score.tieBreakPoints = [0, 0]
      return
    }
    if (gamesA >= project.rules.gamesToWin && gamesA - gamesB >= 2) {
      finishSet(0, [gamesA, gamesB])
    } else if (gamesB >= project.rules.gamesToWin && gamesB - gamesA >= 2) {
      finishSet(1, [gamesA, gamesB])
    }
  }

  project.points.forEach((event, index) => {
    const eventSet = score.completedSets.length + 1
    const eventGame = score.games[0] + score.games[1] + 1
    if (!score.finished) {
      if (score.tieBreakPoints) {
        score.tieBreakPoints[event.winner] += 1
        const [pointsA, pointsB] = score.tieBreakPoints
        if (pointsA >= 7 && pointsA - pointsB >= 2) finishSet(0, [project.rules.gamesToWin + 1, project.rules.gamesToWin])
        if (pointsB >= 7 && pointsB - pointsA >= 2) finishSet(1, [project.rules.gamesToWin, project.rules.gamesToWin + 1])
      } else {
        score.points[event.winner] += 1
        const [pointsA, pointsB] = score.points
        if (project.rules.noAd && pointsA >= 3 && pointsB >= 3 && pointsA !== pointsB) {
          finishGame(event.winner)
        } else if (!project.rules.noAd && pointsA >= 3 && pointsB >= 3 && Math.abs(pointsA - pointsB) >= 2) {
          finishGame(pointsA > pointsB ? 0 : 1)
        } else if (Math.max(pointsA, pointsB) >= 4 && Math.abs(pointsA - pointsB) >= 2) {
          finishGame(pointsA > pointsB ? 0 : 1)
        }
      }
    }
    score.rows.push({
      number: index + 1,
      set: eventSet,
      game: eventGame,
      games: score.completedSets.length >= eventSet ? [...score.completedSets[eventSet - 1]] : [...score.games],
      points: score.tieBreakPoints
        ? [`${score.tieBreakPoints[0]}`, `${score.tieBreakPoints[1]}`]
        : [pointLabel(score.points, 0), pointLabel(score.points, 1)],
      winner: event.winner,
      createdAt: event.createdAt,
    })
  })
  return score
}

export function safeName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'match'
}
