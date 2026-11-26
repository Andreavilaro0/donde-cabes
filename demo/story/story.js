(() => {
  const root = document.getElementById("story"), g = window.gsap, ST = window.ScrollTrigger
  if (!root || !g || !ST || matchMedia("(prefers-reduced-motion: reduce)").matches) return
  g.registerPlugin(ST)
  root.classList.add("story-js")
  const $$ = s => [...root.querySelectorAll(s)]
  const at = (trigger, start = "top 72%") => ({ trigger, start, toggleActions: "play none none reverse" })

  g.fromTo($$(".story-sign span"), { color: "#22364a" }, { color: "#ffcf4a", duration: .12, ease: "none", stagger: .07, scrollTrigger: at(".story-roof", "top 85%") })

  const f3 = root.querySelector(".story-f3")
  const t3 = g.timeline({ scrollTrigger: at(f3) })
  $$(".story-f3 .story-bal").forEach((b, i) => {
    const l = b.querySelector(".story-light")
    if (l) t3.fromTo(l, { opacity: 0 }, { opacity: 1, duration: .3, ease: "power2.out" }, i * .3)
    t3.fromTo(b.querySelector(".story-blind"), { scaleY: 1 }, { scaleY: .32, duration: .7, ease: "power3.out", transformOrigin: "50% 0%" }, i * .3 + .05)
  })

  g.fromTo($$(".story-w-fit .story-w-glass"), { fill: "#0a1520" }, { fill: "#ffcf4a", duration: .18, ease: "none", stagger: .012, scrollTrigger: at(".story-f2", "top 60%") })
  g.fromTo($$(".story-w-blind"), { scaleY: .12 }, { scaleY: 1, duration: .3, ease: "power2.out", stagger: .02, delay: 1.2, scrollTrigger: at(".story-f2", "top 60%") })

  const open = b => g.timeline()
    .fromTo(b.map(x => x.querySelector(".story-box-flap")), { rotateX: 0 }, { rotateX: -80, duration: .25, ease: "power2.out", stagger: .05 })
    .fromTo(b.map(x => x.querySelector(".story-letter")), { clipPath: "inset(0 0 100% 0)", y: -14 }, { clipPath: "inset(0 0 0% 0)", y: 0, duration: .6, ease: "power3.out", stagger: .05 }, .12)
  g.set(".story-box-flap", { rotateX: 0 }); g.set(".story-letter", { clipPath: "inset(0 0 100% 0)" })
  ST.batch(".story-box", { start: "top 88%", once: true, onEnter: open })
  root.addEventListener("focusin", e => { const l = e.target.closest(".story-letter"); if (l) g.set([l, l.parentNode.querySelector(".story-box-flap")], { clipPath: "inset(0 0 0% 0)", y: 0, rotateX: -80 }) })

  g.fromTo(".story-toldo", { scaleY: .12 }, { scaleY: 1, duration: .5, ease: "power3.out", scrollTrigger: at(".story-f0", "top 80%") })
  g.fromTo(".story-shutter", { yPercent: 0 }, { yPercent: -101, ease: "none", scrollTrigger: { trigger: ".story-shop-in", start: "top 78%", end: "top 30%", scrub: .5 } })

  const scrub = { trigger: ".story-doorway", start: "top 85%", end: "center 55%", scrub: .5 }
  g.fromTo(".story-leaf-l", { rotateY: 0 }, { rotateY: -82, ease: "none", scrollTrigger: scrub })
  g.fromTo(".story-leaf-r", { rotateY: 0 }, { rotateY: 82, ease: "none", scrollTrigger: { ...scrub } })
  root.querySelector(".story-go").addEventListener("focus", e => e.target.scrollIntoView({ block: "center" }))
})()
