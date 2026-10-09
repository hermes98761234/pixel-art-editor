import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { tr, type Lang, type T } from './i18n'

export type Theme = 'auto' | 'light' | 'dark'
const REPO = 'pixel-art-editor'
const KEY = REPO + ':shell'

/** useState persisted as JSON in localStorage (falls back silently when unavailable). */
export function usePersisted<V>(key: string, init: V): [V, (v: V | ((p: V) => V)) => void] {
  const [v, setV] = useState<V>(() => {
    try {
      const raw = localStorage.getItem(REPO + ':' + key)
      if (raw) return { ...(typeof init === 'object' && init !== null && !Array.isArray(init) ? init : {}), ...JSON.parse(raw) } as V
    } catch { /* ignore */ }
    return init
  })
  useEffect(() => {
    try { localStorage.setItem(REPO + ':' + key, JSON.stringify(v)) } catch { /* ignore */ }
  }, [key, v])
  return [v, setV]
}

export function useShell(): { lang: Lang; theme: Theme; setLang: (l: Lang) => void; setTheme: (t: Theme) => void; t: T } {
  const initLang: Lang = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk') ? 'uk' : 'en'
  const [s, setS] = useState<{ lang: Lang; theme: Theme }>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return { lang: initLang, theme: 'auto', ...JSON.parse(raw) }
    } catch { /* ignore */ }
    return { lang: initLang, theme: 'auto' }
  })
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
    const root = document.documentElement
    if (s.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = s.theme
    root.lang = s.lang
  }, [s])
  const t: T = useCallback((x, ...a) => tr(s.lang, x, ...a), [s.lang])
  return { lang: s.lang, theme: s.theme, setLang: (lang) => setS((p) => ({ ...p, lang })), setTheme: (theme) => setS((p) => ({ ...p, theme })), t }
}

export function Toolbar(p: { title: string; hint?: string; shell: ReturnType<typeof useShell>; children?: ReactNode }) {
  const { shell: s, t } = { shell: p.shell, t: p.shell.t }
  return (
    <header className="toolbar">
      <span className="brand">{p.title}</span>
      {p.hint && <span className="hint toolbar-hint">{p.hint}</span>}
      <span className="spacer" />
      {p.children}
      <select aria-label={t('Language')} value={s.lang} onChange={(e) => s.setLang(e.target.value as Lang)}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
      <select aria-label={t('Theme')} value={s.theme} onChange={(e) => s.setTheme(e.target.value as Theme)}>
        <option value="auto">{t('System')}</option>
        <option value="light">{t('Light')}</option>
        <option value="dark">{t('Dark')}</option>
      </select>
    </header>
  )
}

export function Footer({ t, note }: { t: T; note?: string }) {
  return (
    <p className="hint foot">
      {note ? note + ' ' : ''}
      {t('Runs entirely in your browser. Nothing is uploaded.')}{' '}
      <a href="https://github.com/hermes98761234/pixel-art-editor">{t('Source on GitHub')}</a>
    </p>
  )
}
