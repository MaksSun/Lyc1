import React from 'react'
import 'katex/dist/katex.min.css'
import { BlockMath, InlineMath } from 'react-katex'

type Props = { text?: string }

export default function Latex({ text }: Props) {
  const t = text ?? ''
  const parts: Array<{ type: 'text' | 'inline' | 'block', value: string }> = []

  let i = 0
  while (i < t.length) {
    if (t.startsWith('$$', i)) {
      const j = t.indexOf('$$', i + 2)
      if (j !== -1) {
        parts.push({ type: 'block', value: t.slice(i + 2, j) })
        i = j + 2
        continue
      }
    }
    if (t.startsWith('$', i)) {
      const j = t.indexOf('$', i + 1)
      if (j !== -1) {
        parts.push({ type: 'inline', value: t.slice(i + 1, j) })
        i = j + 1
        continue
      }
    }
    const next = t.indexOf('$', i)
    const chunk = next === -1 ? t.slice(i) : t.slice(i, next)
    parts.push({ type: 'text', value: chunk })
    i = next === -1 ? t.length : next
  }

  return (
    <span>
      {parts.map((p, idx) => {
        if (p.type === 'block') return <div key={idx} style={{ margin: '12px 0' }}><BlockMath math={p.value} /></div>
        if (p.type === 'inline') return <InlineMath key={idx} math={p.value} />
        return <React.Fragment key={idx}>{p.value}</React.Fragment>
      })}
    </span>
  )
}
