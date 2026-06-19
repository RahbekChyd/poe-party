import { cn } from '../../lib/utils'
const DIVINE_ORB_ICON_URL =
  'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyModValues.png'

export function DivineOrbIcon({
  size = 14,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <img
      src={DIVINE_ORB_ICON_URL}
      alt="Divine Orb"
      width={size}
      height={size}
      loading="lazy"
      className={cn('inline-block shrink-0 object-contain', className)}
    />
  )
}

export function DivinePrice({
  amount,
  className,
  iconSize = 14,
}: {
  amount: number | string
  className?: string
  iconSize?: number
}) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {amount}
      <DivineOrbIcon size={iconSize} />
    </span>
  )
}
