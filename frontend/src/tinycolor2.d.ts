declare module 'tinycolor2' {
  interface TinycolorInstance {
    toHex(): string; toHexString(): string; toRgbString(): string
    isDark(): boolean; isLight(): boolean
    lighten(amount?: number): TinycolorInstance
    darken(amount?: number): TinycolorInstance
    setAlpha(alpha: number): TinycolorInstance
    getAlpha(): number
    toRgb(): { r: number; g: number; b: number; a: number }
  }
  function tinycolor(color: string | object): TinycolorInstance
  export = tinycolor
}
