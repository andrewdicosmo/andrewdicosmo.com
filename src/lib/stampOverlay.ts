export function stampOverlay(id: string) {
  return `<svg class="stamp-overlay" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 260" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <filter id="${id}-texture" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="5" seed="42" result="noise"/>
        <feColorMatrix in="noise" type="luminanceToAlpha" result="noiseAlpha"/>
        <feComponentTransfer in="noiseAlpha" result="roughNoise">
          <feFuncA type="linear" slope="3.5" intercept="-1.2"/>
        </feComponentTransfer>
        <feComposite operator="out" in="SourceGraphic" in2="roughNoise" result="eroded"/>
        <feBlend mode="multiply" in="SourceGraphic" in2="eroded" result="blended"/>
        <feGaussianBlur stdDeviation=".5" in="blended" result="bleed"/>
        <feComponentTransfer in="bleed">
          <feFuncA type="linear" slope="2" intercept="-.1"/>
        </feComponentTransfer>
      </filter>
    </defs>
    <rect x="45" y="42" width="1110" height="176" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="14" opacity=".92" filter="url(#${id}-texture)"/>
  </svg>`;
}
