'use client'

/* ─────────────────────────────────────────────────────────────────────────────
 * LandingEffects
 * Two layers rendered on the landing page background:
 *   1. HorizontalScanLines – thin gold lines sweeping left-right across the page
 *   2. FloatingChars       – cartoon cats / dogs / math symbols wandering around
 * ───────────────────────────────────────────────────────────────────────────── */

// ── SVG character components ──────────────────────────────────────────────────

function Cat() {
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ears */}
      <path d="M9 20 L13 7 L21 17 Z"  fill="#0e0d1e" stroke="rgba(255,215,0,0.45)" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M37 20 L33 7 L25 17 Z" fill="#0e0d1e" stroke="rgba(255,215,0,0.45)" strokeWidth="1.2" strokeLinejoin="round"/>
      {/* Inner ear */}
      <path d="M11 19 L14 10 L19 17 Z"  fill="rgba(255,120,140,0.22)"/>
      <path d="M35 19 L32 10 L27 17 Z" fill="rgba(255,120,140,0.22)"/>
      {/* Head */}
      <circle cx="23" cy="28" r="15" fill="#0e0d1e" stroke="rgba(255,215,0,0.38)" strokeWidth="1.2"/>
      {/* Eyes – gold pupils */}
      <ellipse cx="17" cy="26" rx="3.5" ry="4"   fill="#FFD700" opacity="0.92"/>
      <ellipse cx="29" cy="26" rx="3.5" ry="4"   fill="#FFD700" opacity="0.92"/>
      <ellipse cx="17" cy="26" rx="1.4" ry="3"   fill="#050410"/>
      <ellipse cx="29" cy="26" rx="1.4" ry="3"   fill="#050410"/>
      <circle  cx="18.2" cy="24.4" r="1.1" fill="rgba(255,255,255,0.55)"/>
      <circle  cx="30.2" cy="24.4" r="1.1" fill="rgba(255,255,255,0.55)"/>
      {/* Nose */}
      <path d="M21 31 L23 29 L25 31 L23 32.2 Z" fill="#FF8099"/>
      {/* Mouth */}
      <path d="M19.5 33 Q23 36.5 26.5 33" fill="none" stroke="rgba(255,215,0,0.4)" strokeWidth="0.9"/>
      {/* Whiskers */}
      <line x1="2"  y1="30"   x2="16"  y2="30.5" stroke="rgba(255,215,0,0.25)" strokeWidth="0.8"/>
      <line x1="2"  y1="32.5" x2="16"  y2="33"   stroke="rgba(255,215,0,0.25)" strokeWidth="0.8"/>
      <line x1="30" y1="30.5" x2="44"  y2="30"   stroke="rgba(255,215,0,0.25)" strokeWidth="0.8"/>
      <line x1="30" y1="33"   x2="44"  y2="32.5" stroke="rgba(255,215,0,0.25)" strokeWidth="0.8"/>
    </svg>
  )
}

function Dog() {
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <circle cx="23" cy="23" r="14" fill="#0d0b1a" stroke="rgba(255,190,50,0.38)" strokeWidth="1.2"/>
      {/* Left floppy ear */}
      <ellipse cx="9" cy="26" rx="7" ry="10" fill="#0d0b1a" stroke="rgba(255,190,50,0.3)" strokeWidth="1"
        transform="rotate(-18 9 26)"/>
      {/* Right floppy ear */}
      <ellipse cx="37" cy="26" rx="7" ry="10" fill="#0d0b1a" stroke="rgba(255,190,50,0.3)" strokeWidth="1"
        transform="rotate(18 37 26)"/>
      {/* Snout */}
      <ellipse cx="23" cy="28" rx="8" ry="6" fill="rgba(255,190,50,0.08)" stroke="rgba(255,190,50,0.18)" strokeWidth="0.7"/>
      {/* Eyes */}
      <circle cx="17" cy="21" r="3.8" fill="#FFD700" opacity="0.88"/>
      <circle cx="29" cy="21" r="3.8" fill="#FFD700" opacity="0.88"/>
      <circle cx="17" cy="21" r="2.2" fill="#050410"/>
      <circle cx="29" cy="21" r="2.2" fill="#050410"/>
      <circle cx="18" cy="19.8" r="1.1" fill="rgba(255,255,255,0.5)"/>
      <circle cx="30" cy="19.8" r="1.1" fill="rgba(255,255,255,0.5)"/>
      {/* Nose */}
      <ellipse cx="23" cy="26" rx="4.2" ry="3.2" fill="#111"/>
      <ellipse cx="21.5" cy="25" rx="1.6" ry="1.1" fill="rgba(255,255,255,0.25)"/>
      {/* Mouth */}
      <path d="M19 30 Q23 34 27 30" fill="none" stroke="rgba(255,190,50,0.45)" strokeWidth="0.9"/>
      {/* Tongue */}
      <ellipse cx="23" cy="33.5" rx="3.2" ry="2.5" fill="rgba(255,100,120,0.65)"/>
    </svg>
  )
}

function MathBadge({ sym }: { sym: string }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="38" rx="9" fill="rgba(6,5,18,0.88)" stroke="rgba(255,215,0,0.28)" strokeWidth="1"/>
      <text x="19" y="26" textAnchor="middle" fill="#FFD700" fontSize="21" fontWeight="700"
        fontFamily="Georgia,serif">{sym}</text>
    </svg>
  )
}

// ── Floating characters config ────────────────────────────────────────────────

const CHARS = [
  // id, component, starting left%, starting top%, animation-name, duration, delay
  { id: 'c1', el: <Cat />,               l: '4%',  t: '18%', anim: 'w1', dur: '18s', delay: '0s'   },
  { id: 'c2', el: <Cat />,               l: '72%', t: '12%', anim: 'w2', dur: '22s', delay: '3s'   },
  { id: 'c3', el: <Cat />,               l: '45%', t: '72%', anim: 'w3', dur: '20s', delay: '7s'   },
  { id: 'd1', el: <Dog />,               l: '18%', t: '58%', anim: 'w4', dur: '19s', delay: '2s'   },
  { id: 'd2', el: <Dog />,               l: '82%', t: '42%', anim: 'w5', dur: '24s', delay: '5s'   },
  { id: 'd3', el: <Dog />,               l: '55%', t: '22%', anim: 'w6', dur: '17s', delay: '9s'   },
  { id: 'm1', el: <MathBadge sym="∑" />, l: '12%', t: '82%', anim: 'w7', dur: '25s', delay: '1s'   },
  { id: 'm2', el: <MathBadge sym="∫" />, l: '78%', t: '68%', anim: 'w8', dur: '21s', delay: '6s'   },
  { id: 'm3', el: <MathBadge sym="√" />, l: '30%', t: '5%',  anim: 'w9', dur: '23s', delay: '11s'  },
  { id: 'm4', el: <MathBadge sym="Δ" />, l: '62%', t: '88%', anim: 'w10',dur: '16s', delay: '4s'   },
]

// ── Horizontal scan lines config ──────────────────────────────────────────────

const SCAN_LINES = [
  { top: '7%',  dur: '3.2s', delay: '0s',   op: 0.07, dir: 1 },
  { top: '19%', dur: '4.8s', delay: '1.1s', op: 0.05, dir: -1 },
  { top: '31%', dur: '2.8s', delay: '0.5s', op: 0.09, dir: 1 },
  { top: '44%', dur: '5.5s', delay: '2.2s', op: 0.06, dir: -1 },
  { top: '57%', dur: '3.8s', delay: '0.8s', op: 0.08, dir: 1 },
  { top: '70%', dur: '2.5s', delay: '1.7s', op: 0.07, dir: -1 },
  { top: '83%', dur: '4.2s', delay: '0.3s', op: 0.05, dir: 1 },
  { top: '93%', dur: '3.0s', delay: '2.8s', op: 0.06, dir: -1 },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function LandingEffects() {
  return (
    <>
      {/* ── Horizontal scan lines ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {SCAN_LINES.map((ln, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: ln.top,
            left: 0,
            right: 0,
            height: 1,
          }}>
            {/* Faint base line */}
            <div style={{
              position: 'absolute', inset: 0,
              background: `rgba(255,215,0,${ln.op * 0.4})`,
            }} />
            {/* Traveling glow — main */}
            <div style={{
              position: 'absolute',
              top: 0, height: '100%',
              width: 120,
              background: `linear-gradient(to right, transparent, rgba(255,215,0,${ln.op * 4}), rgba(255,215,0,${ln.op * 6}), rgba(255,215,0,${ln.op * 4}), transparent)`,
              animation: `scan${ln.dir > 0 ? 'R' : 'L'} ${ln.dur} linear ${ln.delay} infinite`,
            }} />
            {/* Trailing sparkle — smaller, faster */}
            <div style={{
              position: 'absolute',
              top: 0, height: '100%',
              width: 40,
              background: `linear-gradient(to right, transparent, rgba(255,215,0,${ln.op * 8}), transparent)`,
              animation: `scan${ln.dir > 0 ? 'R' : 'L'} ${ln.dur} linear calc(${ln.delay} + ${parseFloat(ln.dur) * 0.3}s) infinite`,
            }} />
          </div>
        ))}
      </div>

      {/* ── Floating cartoon characters ── */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        {CHARS.map((c) => (
          <div key={c.id}
            style={{
              position: 'absolute',
              left: c.l,
              top: c.t,
              animation: `${c.anim} ${c.dur} ease-in-out ${c.delay} infinite, bob 0.55s ease-in-out infinite alternate`,
              willChange: 'transform',
            }}>
            {/* Inner wrapper for the bob/tilt */}
            <div style={{ animation: `tilt 0.55s ease-in-out infinite alternate` }}>
              {c.el}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        /* Scan line animations */
        @keyframes scanR {
          from { left: -130px; }
          to   { left: calc(100% + 10px); }
        }
        @keyframes scanL {
          from { right: -130px; left: unset; }
          to   { right: calc(100% + 10px); left: unset; }
        }

        /* Character bob / tilt */
        @keyframes bob {
          from { transform: translateY(0px); }
          to   { transform: translateY(-5px); }
        }
        @keyframes tilt {
          from { transform: rotate(-6deg) scaleX(1); }
          to   { transform: rotate(6deg) scaleX(1); }
        }

        /* ── 10 unique wander paths ── */
        @keyframes w1 {
          0%   { transform: translate(0,0)            scaleX(1);  }
          15%  { transform: translate(18vw,-6vh)      scaleX(1);  }
          30%  { transform: translate(38vw, 8vh)      scaleX(-1); }
          50%  { transform: translate(55vw,-3vh)      scaleX(-1); }
          65%  { transform: translate(40vw, 14vh)     scaleX(1);  }
          80%  { transform: translate(20vw, 5vh)      scaleX(1);  }
          100% { transform: translate(0,0)            scaleX(1);  }
        }
        @keyframes w2 {
          0%   { transform: translate(0,0)            scaleX(1);  }
          20%  { transform: translate(-22vw, 10vh)    scaleX(-1); }
          40%  { transform: translate(-45vw,-4vh)     scaleX(-1); }
          60%  { transform: translate(-30vw, 18vh)    scaleX(1);  }
          80%  { transform: translate(-12vw, 8vh)     scaleX(1);  }
          100% { transform: translate(0,0)            scaleX(1);  }
        }
        @keyframes w3 {
          0%   { transform: translate(0,0)            scaleX(-1); }
          25%  { transform: translate(-15vw,-12vh)    scaleX(-1); }
          45%  { transform: translate(-35vw,-5vh)     scaleX(1);  }
          65%  { transform: translate(-18vw, 8vh)     scaleX(1);  }
          85%  { transform: translate( 5vw, 15vh)     scaleX(-1); }
          100% { transform: translate(0,0)            scaleX(-1); }
        }
        @keyframes w4 {
          0%   { transform: translate(0,0)            scaleX(1);  }
          20%  { transform: translate( 25vw,-15vh)    scaleX(1);  }
          40%  { transform: translate( 50vw, -8vh)    scaleX(-1); }
          60%  { transform: translate( 60vw, 10vh)    scaleX(-1); }
          80%  { transform: translate( 35vw, 18vh)    scaleX(1);  }
          100% { transform: translate(0,0)            scaleX(1);  }
        }
        @keyframes w5 {
          0%   { transform: translate(0,0)            scaleX(-1); }
          18%  { transform: translate(-18vw, 12vh)    scaleX(-1); }
          36%  { transform: translate(-40vw, 5vh)     scaleX(1);  }
          54%  { transform: translate(-55vw,-8vh)     scaleX(1);  }
          72%  { transform: translate(-38vw,-18vh)    scaleX(-1); }
          100% { transform: translate(0,0)            scaleX(-1); }
        }
        @keyframes w6 {
          0%   { transform: translate(0,0)            scaleX(1);  }
          22%  { transform: translate(-20vw, 18vh)    scaleX(-1); }
          44%  { transform: translate(-10vw, 35vh)    scaleX(-1); }
          66%  { transform: translate( 15vw, 28vh)    scaleX(1);  }
          88%  { transform: translate( 8vw,  8vh)     scaleX(1);  }
          100% { transform: translate(0,0)            scaleX(1);  }
        }
        @keyframes w7 {
          0%   { transform: translate(0,0)            scaleX(1);  }
          25%  { transform: translate( 30vw,-20vh)    scaleX(1);  }
          50%  { transform: translate( 55vw,-12vh)    scaleX(-1); }
          75%  { transform: translate( 40vw,  5vh)    scaleX(-1); }
          100% { transform: translate(0,0)            scaleX(1);  }
        }
        @keyframes w8 {
          0%   { transform: translate(0,0)            scaleX(-1); }
          30%  { transform: translate(-25vw,-18vh)    scaleX(-1); }
          60%  { transform: translate(-50vw, -5vh)    scaleX(1);  }
          80%  { transform: translate(-30vw, 10vh)    scaleX(1);  }
          100% { transform: translate(0,0)            scaleX(-1); }
        }
        @keyframes w9 {
          0%   { transform: translate(0,0)            scaleX(1);  }
          20%  { transform: translate( 15vw, 20vh)    scaleX(1);  }
          40%  { transform: translate( 35vw, 40vh)    scaleX(-1); }
          60%  { transform: translate( 20vw, 55vh)    scaleX(-1); }
          80%  { transform: translate(-5vw,  35vh)    scaleX(1);  }
          100% { transform: translate(0,0)            scaleX(1);  }
        }
        @keyframes w10 {
          0%   { transform: translate(0,0)            scaleX(-1); }
          25%  { transform: translate(-20vw,-22vh)    scaleX(-1); }
          50%  { transform: translate(-42vw,-35vh)    scaleX(1);  }
          75%  { transform: translate(-28vw,-15vh)    scaleX(1);  }
          100% { transform: translate(0,0)            scaleX(-1); }
        }
      `}</style>
    </>
  )
}
