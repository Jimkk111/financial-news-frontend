import type { Block, Inline } from '@/types/content'
import { normalizeContent } from './validateContent'

function inlineText(children: Inline[]): string {
  return children.map(node => node.type === 'text' ? node.text : '\n').join('')
}

function blockText(block: Block): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading': return inlineText(block.children)
    case 'bulletList':
    case 'orderedList': return block.items.map(item => inlineText(item.children)).join('\n')
    case 'blockquote': return block.children.map(blockText).join('\n\n')
    case 'codeBlock': return block.code
    case 'image': return block.caption || block.alt || ''
    default: return ''
  }
}

export function articleToText(content: unknown): string {
  return normalizeContent(content).map(blockText).filter(text => text.trim()).join('\n\n').trim()
}
