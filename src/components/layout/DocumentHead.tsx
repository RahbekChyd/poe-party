import { useEffect } from 'react'
import { useTags, type RouterManagedTag } from '@tanstack/react-router'
const MANAGED_HEAD_ATTR = 'data-poe-party-head'

function removeManagedTags() {
  document.head.querySelectorAll(`[${MANAGED_HEAD_ATTR}]`).forEach((element) => element.remove())
}

function removeConflictingStaticTag(tag: RouterManagedTag) {
  const attrs = tag.attrs ?? {}

  if (tag.tag === 'meta') {
    const name = typeof attrs.name === 'string' ? attrs.name : null
    const property = typeof attrs.property === 'string' ? attrs.property : null
    const selector = name
      ? `meta[name="${CSS.escape(name)}"]`
      : property
        ? `meta[property="${CSS.escape(property)}"]`
        : null

    if (selector) {
      document.head.querySelectorAll(selector).forEach((element) => element.remove())
    }
  }

  if (tag.tag === 'link' && attrs.rel === 'canonical') {
    document.head.querySelectorAll('link[rel="canonical"]').forEach((element) => element.remove())
  }
}

function appendManagedTag(tag: RouterManagedTag) {
  if (tag.tag === 'title') {
    document.title = typeof tag.children === 'string' ? tag.children : ''
    return
  }

  if (tag.tag !== 'meta' && tag.tag !== 'link' && tag.tag !== 'script' && tag.tag !== 'style') {
    return
  }

  removeConflictingStaticTag(tag)

  const element = document.createElement(tag.tag)
  element.setAttribute(MANAGED_HEAD_ATTR, 'true')

  for (const [key, value] of Object.entries(tag.attrs ?? {})) {
    if (key === 'suppressHydrationWarning' || value === undefined || value === false) {
      continue
    }

    element.setAttribute(key, value === true ? '' : String(value))
  }

  if (typeof tag.children === 'string') {
    element.innerHTML = tag.children
  }

  document.head.appendChild(element)
}

export function DocumentHead() {
  const tags = useTags()

  useEffect(() => {
    removeManagedTags()
    tags.forEach(appendManagedTag)

    return removeManagedTags
  }, [tags])

  return null
}
