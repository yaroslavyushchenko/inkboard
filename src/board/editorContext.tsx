import { createContext, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { Editor } from './editor'
import type { Session } from './session'

const EditorContext = createContext<Editor | null>(null)

/** Gives the board UI below it its editor (one per open board; the app creates it with createEditor). */
export function EditorProvider({ editor, children }: { editor: Editor; children: ReactNode }) {
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
}

export function useEditor(): Editor {
  const editor = useContext(EditorContext)
  if (!editor) throw new Error('useEditor() needs an <EditorProvider> above it')
  return editor
}

/** React binding for the session of the board this component belongs to. */
export function useSession<T>(select: (s: Session) => T): T {
  return useStore(useEditor().session, select)
}
