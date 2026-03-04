'use client'

/* ─────────────────────────────────────────────────────────────────────────────
 * LandingEffects
 * ① HorizontalScanLines  – gold scan lines sweeping across the page
 * ② KangaPets            – full-body cartoon kangaroos fixed at bottom corners
 *                          (UNSW is in Australia 🦘)
 * ───────────────────────────────────────────────────────────────────────────── */

// ── Horizontal scan lines ─────────────────────────────────────────────────────

const SCAN_LINES = [
  { top: '7%',  dur: '3.2s', delay: '0s',   op: 0.07, dir: 1  },
  { top: '19%', dur: '4.8s', delay: '1.1s', op: 0.05, dir: -1 },
  { top: '31%', dur: '2.8s', delay: '0.5s', op: 0.09, dir: 1  },
  { top: '44%', dur: '5.5s', delay: '2.2s', op: 0.06, dir: -1 },
  { top: '57%', dur: '3.8s', delay: '0.8s', op: 0.08, dir: 1  },
  { top: '70%', dur: '2.5s', delay: '1.7s', op: 0.07, dir: -1 },
  { top: '83%', dur: '4.2s', delay: '0.3s', op: 0.05, dir: 1  },
  { top: '93%', dur: '3.0s', delay: '2.8s', op: 0.06, dir: -1 },
]

// ── Full-body kangaroo SVG ─────────────────────────────────────────────────────
// ViewBox: 0 0 115 178  (side profile, facing left — flip via scaleX(-1) for right)

function KangaBody({ withJoey = false }: { withJoey?: boolean }) {
  return (
    <svg width="110" height="168" viewBox="0 0 115 178" fill="none" xmlns="http://www.w3.org/2000/svg">

      {/* ── TAIL (drawn first, behind body) ── */}
      <path d="M82 105 C96 112 112 132 114 168"
        stroke="#18120a" strokeWidth="16" strokeLinecap="round" fill="none"/>
      <path d="M82 105 C96 112 112 132 114 168"
        stroke="rgba(255,215,0,0.10)" strokeWidth="12" strokeLinecap="round" fill="none"/>

      {/* ── BODY ── */}
      <ellipse cx="68" cy="92" rx="28" ry="38"
        fill="#18120a" stroke="rgba(255,215,0,0.28)" strokeWidth="1.6"/>
      {/* Belly (lighter) */}
      <ellipse cx="57" cy="94" rx="15" ry="22" fill="#201808" opacity="0.85"/>

      {/* ── POUCH ── */}
      <path d="M48 98 Q60 112 72 98"
        fill="none" stroke="rgba(255,215,0,0.30)" strokeWidth="1.6" strokeLinecap="round"/>

      {/* ── JOEY (optional, peeking from pouch) ── */}
      {withJoey && (
        <g>
          <ellipse cx="59" cy="100" rx="9" ry="8"
            fill="#13100a" stroke="rgba(255,215,0,0.2)" strokeWidth="1"/>
          {/* joey eye */}
          <circle cx="55" cy="97" r="2.8" fill="#FFD700" opacity="0.9"/>
          <circle cx="55" cy="97" r="1.6" fill="#05040e"/>
          <circle cx="55.8" cy="96.2" r="0.9" fill="rgba(255,255,255,0.45)"/>
          {/* joey ear */}
          <path d="M60 95 L59 89 L64 94 Z"
            fill="#13100a" stroke="rgba(255,215,0,0.18)" strokeWidth="0.8"/>
        </g>
      )}

      {/* ── NECK ── */}
      <path d="M52 64 Q55 72 58 78"
        stroke="#18120a" strokeWidth="20" strokeLinecap="round" fill="none"/>

      {/* ── HEAD ── */}
      <ellipse cx="46" cy="48" rx="23" ry="25"
        fill="#18120a" stroke="rgba(255,215,0,0.30)" strokeWidth="1.6"/>

      {/* ── SNOUT (elongated forward) ── */}
      <ellipse cx="26" cy="57" rx="18" ry="12"
        fill="#1c1610" stroke="rgba(255,215,0,0.22)" strokeWidth="1.2"/>

      {/* ── NOSE ── */}
      <ellipse cx="12" cy="56" rx="6.5" ry="5.5" fill="#0a0808"/>
      <ellipse cx="10"  cy="55" rx="2.2" ry="1.6" fill="rgba(255,255,255,0.18)"/>

      {/* ── MOUTH ── */}
      <path d="M13 61 Q22 66 30 61"
        fill="none" stroke="rgba(255,215,0,0.22)" strokeWidth="0.9"/>

      {/* ── EYE ── */}
      <circle cx="52" cy="39" r="6.5" fill="#FFD700"/>
      <circle cx="52" cy="39" r="3.8" fill="#050410"/>
      <circle cx="53.6" cy="37.4" r="2"   fill="rgba(255,255,255,0.48)"/>

      {/* ── RIGHT EAR (background, slightly darker) ── */}
      <path d="M54 30 L58 8 L66 24 Z"
        fill="#10100a" stroke="rgba(255,215,0,0.18)" strokeWidth="1.1"/>
      <path d="M55 29 L58 12 L64 24 Z" fill="rgba(255,90,110,0.14)"/>

      {/* ── LEFT EAR (foreground) ── */}
      <g className="kanga-ear" style={{ transformOrigin: '42px 30px' }}>
        <path d="M36 32 L34 10 L46 28 Z"
          fill="#18120a" stroke="rgba(255,215,0,0.32)" strokeWidth="1.4"/>
        <path d="M37 31 L36 14 L44 28 Z" fill="rgba(255,90,110,0.20)"/>
      </g>

      {/* ── FRONT ARM (short, characteristic kangaroo pose — arms held in front) ── */}
      <path d="M58 76 Q44 84 38 96"
        stroke="#18120a" strokeWidth="12" strokeLinecap="round" fill="none"/>
      {/* Paw */}
      <ellipse cx="36" cy="96" rx="9" ry="7" fill="#141008"/>
      {/* Claws */}
      <line x1="29" y1="99" x2="26" y2="105" stroke="rgba(255,215,0,0.2)" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="35" y1="101" x2="33" y2="107" stroke="rgba(255,215,0,0.2)" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="41" y1="100" x2="40" y2="106" stroke="rgba(255,215,0,0.2)" strokeWidth="1.3" strokeLinecap="round"/>

      {/* ── BACK THIGH (large, powerful) ── */}
      <ellipse cx="80" cy="120" rx="20" ry="28"
        fill="#14110a" stroke="rgba(255,215,0,0.22)" strokeWidth="1.2"/>

      {/* ── LOWER LEG (bent at knee, angled forward) ── */}
      <path d="M70 142 C65 150 58 158 50 164"
        stroke="#18120a" strokeWidth="16" strokeLinecap="round" fill="none"/>
      <path d="M70 142 C65 150 58 158 50 164"
        stroke="rgba(255,215,0,0.08)" strokeWidth="12" strokeLinecap="round" fill="none"/>

      {/* ── BIG FOOT ── */}
      <ellipse cx="42" cy="165" rx="30" ry="9"
        fill="#10100a" stroke="rgba(255,215,0,0.24)" strokeWidth="1.2"/>
      {/* Toes */}
      <line x1="16" y1="163" x2="12" y2="172" stroke="rgba(255,215,0,0.22)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="25" y1="165" x2="22" y2="174" stroke="rgba(255,215,0,0.22)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="36" y1="167" x2="34" y2="176" stroke="rgba(255,215,0,0.22)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="48" y1="168" x2="47" y2="177" stroke="rgba(255,215,0,0.22)" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="60" y1="166" x2="61" y2="175" stroke="rgba(255,215,0,0.22)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// ── Desktop-pet kangaroo wrapper ──────────────────────────────────────────────

function KangaPet({
  side, withJoey = false, animDelay = '0s',
}: {
  side: 'left' | 'right'
  withJoey?: boolean
  animDelay?: string
}) {
  const isLeft = side === 'left'
  return (
    <div
      className="fixed bottom-0 pointer-events-none select-none hidden md:block"
      style={{
        [isLeft ? 'left' : 'right']: isLeft ? 16 : 16,
        zIndex: 5,
        // Left roo faces right (into the page), right roo faces left
        transform: isLeft ? 'scaleX(-1)' : 'none',
        animation: `rooIdle 4s ease-in-out ${animDelay} infinite`,
        transformOrigin: 'bottom center',
      }}>
      <KangaBody withJoey={withJoey} />
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function LandingEffects() {
  return (
    <>
      {/* ── Horizontal scan lines ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {SCAN_LINES.map((ln, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: ln.top, left: 0, right: 0, height: 1,
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: `rgba(255,215,0,${ln.op * 0.4})`,
            }} />
            <div style={{
              position: 'absolute', top: 0, height: '100%', width: 120,
              background: `linear-gradient(to right, transparent, rgba(255,215,0,${ln.op * 4}), rgba(255,215,0,${ln.op * 7}), rgba(255,215,0,${ln.op * 4}), transparent)`,
              animation: `scan${ln.dir > 0 ? 'R' : 'L'} ${ln.dur} linear ${ln.delay} infinite`,
            }} />
          </div>
        ))}
      </div>

      {/* ── Kangaroo desktop pets ── */}
      {/* Left: smaller, with joey — further back in scene */}
      <div className="fixed bottom-0 left-4 pointer-events-none select-none hidden md:block"
        style={{ zIndex: 5, transform: 'scaleX(-1) scale(0.72)', transformOrigin: 'bottom left',
          animation: 'rooIdle 5s ease-in-out 1.2s infinite' }}>
        <KangaBody withJoey={true} />
      </div>

      {/* Right: full size, plain */}
      <div className="fixed bottom-0 right-4 pointer-events-none select-none hidden md:block"
        style={{ zIndex: 5, transform: 'scale(0.88)', transformOrigin: 'bottom right',
          animation: 'rooIdle 4s ease-in-out 0s infinite' }}>
        <KangaBody withJoey={false} />
      </div>

      {/* ── Ear wiggle overlay — separate animated elements for each pet ── */}
      {/* (handled inside SVG via CSS class .kanga-ear) */}

      <style>{`
        /* Scan lines */
        @keyframes scanR {
          from { left: -130px; }
          to   { left: calc(100% + 10px); }
        }
        @keyframes scanL {
          from { right: -130px; left: unset; }
          to   { right: calc(100% + 10px); left: unset; }
        }

        /* Kangaroo idle: gentle sway + micro-breathe */
        @keyframes rooIdle {
          0%   { transform: translateY(0px)   rotate(0deg);    }
          20%  { transform: translateY(-4px)  rotate(0.8deg);  }
          40%  { transform: translateY(-6px)  rotate(-0.4deg); }
          60%  { transform: translateY(-3px)  rotate(0.6deg);  }
          80%  { transform: translateY(-5px)  rotate(-0.6deg); }
          100% { transform: translateY(0px)   rotate(0deg);    }
        }

        /* Left roo: scaleX(-1) + scale + idle combined */
        /* The wrapper handles scaleX and scale, this anim handles position only */

        /* Ear wiggle */
        .kanga-ear {
          animation: earWiggle 6s ease-in-out infinite;
        }
        @keyframes earWiggle {
          0%, 60%, 100% { transform: rotate(0deg);   }
          65%            { transform: rotate(12deg);  }
          70%            { transform: rotate(-6deg);  }
          75%            { transform: rotate(8deg);   }
          80%            { transform: rotate(0deg);   }
        }
      `}</style>
    </>
  )
}
