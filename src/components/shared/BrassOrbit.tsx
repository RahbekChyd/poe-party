export function BrassOrbit({ placement }: { placement: 'sign-in' | 'sample' }) {
  return (
    <div aria-hidden="true" className={`brass-orbit brass-orbit--${placement}`}>
      <span />
      <span />
      <span />
    </div>
  )
}
