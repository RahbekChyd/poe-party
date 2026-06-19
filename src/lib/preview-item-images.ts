import headhunterImage from '../assets/preview-items/headhunter.png'
import progenesisImage from '../assets/preview-items/progenesis.png'
import watchersEyeImage from '../assets/preview-items/watchers-eye.png'
const PREVIEW_ITEM_IMAGE_BY_NAME: Record<string, string> = {
  Headhunter: headhunterImage,
  "Watcher's Eye": watchersEyeImage,
  Progenesis: progenesisImage,
}

export function getPreviewItemImage(itemName: string | null | undefined): string | null {
  if (!itemName) return null
  return PREVIEW_ITEM_IMAGE_BY_NAME[itemName] ?? null
}
