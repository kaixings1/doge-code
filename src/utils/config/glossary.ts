import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const GLOSSARY_FILE = join(homedir(), '.doge', 'glossary.json')

export interface GlossaryEntry {
  term: string
  definition: string
  createdAt: string
  updatedAt: string
}

export interface GlossaryData {
  terms: Record<string, GlossaryEntry>
}

export function loadGlossary(): GlossaryData {
  if (!existsSync(GLOSSARY_FILE)) {
    return { terms: {} }
  }

  try {
    const content = readFileSync(GLOSSARY_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return { terms: {} }
  }
}

export function saveGlossary(data: GlossaryData): void {
  const dogeDir = join(homedir(), '.doge')
  if (!existsSync(dogeDir)) {
    mkdirSync(dogeDir, { recursive: true })
  }
  writeFileSync(GLOSSARY_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export function addGlossaryTerm(term: string, definition: string): GlossaryEntry {
  const data = loadGlossary()
  const now = new Date().toISOString()

  const entry: GlossaryEntry = {
    term,
    definition,
    createdAt: data.terms[term]?.createdAt || now,
    updatedAt: now,
  }

  data.terms[term] = entry
  saveGlossary(data)
  return entry
}

export function removeGlossaryTerm(term: string): boolean {
  const data = loadGlossary()
  if (!data.terms[term]) return false
  delete data.terms[term]
  saveGlossary(data)
  return true
}

export function searchGlossary(query: string): GlossaryEntry[] {
  const data = loadGlossary()
  const lowerQuery = query.toLowerCase()

  return Object.values(data.terms).filter(
    entry =>
      entry.term.toLowerCase().includes(lowerQuery) ||
      entry.definition.toLowerCase().includes(lowerQuery),
  )
}

export function getGlossaryTerm(term: string): GlossaryEntry | undefined {
  return loadGlossary().terms[term]
}

export function listGlossaryTerms(): GlossaryEntry[] {
  return Object.values(loadGlossary().terms).sort((a, b) =>
    a.term.localeCompare(b.term),
  )
}
