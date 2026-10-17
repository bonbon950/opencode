/* BGC CONDO — scroll = video playback.
 *
 * The page scroll position is the video's timeline:
 *   scrollY -> progress (0..1) -> video.currentTime
 * The video is never played. No smoothing, no easing: the frame always matches the scroll position.
 */

// ───────────────────────── CONFIG ─────────────────────────
// How many viewport-heights of scrolling it takes to travel through the whole video.
// Increase for a slower, longer film; decrease for a faster one.
const SCROLL_MULTIPLIER = 6;

// Video path is set in index.html (<video src="assets/bgc-condo.mp4">).
const MIN_LOADER_MS = 1400; // keep the loader up long enough to read
const MAX_LOADER_MS = 20000; // never trap the user if the network is slow
const FRAME_RATE_GUESS = 24; // only used to skip sub-frame seeks
// ──────────────────────────────────────────────────────────

const video = document.getElementById("film")
const timeline = document.getElementById("timeline")
const loader = document.getElementById("loader")
const loaderBar = document.getElementById("loaderBar")
const loaderPct = document.getElementById("loaderPct")
const scrollCue = document.getElementById("scrollCue")
const stageCta = document.getElementById("stageCta")
const chapters = [...document.querySelectorAll(".chapter")].map((el) => ({
  el,
  in: Number(el.dataset.in),
  out: Number(el.dataset.out),
  lift: Number(el.dataset.lift || 0),
  last: "",
}))

// The timeline holds: [scrub range: SCROLL_MULTIPLIER vh] + [pinned, final frame held while the
// contact section slides up: 1 vh] + [the viewport itself: 1 vh]. Keep in sync with .finale margin.
document.documentElement.style.setProperty("--timeline-vh", `${(SCROLL_MULTIPLIER + 2) * 100}vh`)

let duration = 0
let ready = false
let timelineTop = 0 // document-space Y where the sticky stage starts pinning
let scrubLength = 1 // px of scrolling that maps to the full video
let lastApplied = -1 // last currentTime we wrote
let lastProgress = -1
let frameQueued = false

// ───────────── geometry (measured on resize only, never per frame) ─────────────
function measure() {
  timelineTop = timeline.getBoundingClientRect().top + window.scrollY
  scrubLength = Math.max(1, window.innerHeight * SCROLL_MULTIPLIER)
}

// ───────────── scroll -> video ─────────────
function schedule() {
  if (frameQueued || !ready) return
  frameQueued = true
  requestAnimationFrame(render)
}

function render() {
  frameQueued = false
  const progress = Math.min(1, Math.max(0, (window.scrollY - timelineTop) / scrubLength))

  seek(progress)
  if (progress !== lastProgress) {
    lastProgress = progress
    paintOverlay(progress)
  }
}

function seek(progress) {
  // Last frame sits a hair before `duration` so every browser shows the final frame, not a blank.
  const target = progress * Math.max(0, duration - 0.01)
  const atEdge = progress === 0 || progress === 1
  const minStep = 1 / (FRAME_RATE_GUESS * 2)

  // Skip redundant writes; always land exactly on the first/last frame.
  if (atEdge ? target === lastApplied : Math.abs(target - lastApplied) < minStep) return

  // Don't pile up seeks: wait for the in-flight one, then re-read the scroll position.
  if (video.seeking) return

  lastApplied = target
  video.currentTime = target
}

video.addEventListener("seeked", schedule)
// Safety net: this video is a timeline, never a player.
video.addEventListener("play", () => video.pause())

// ───────────── overlay text driven by progress ─────────────
function paintOverlay(progress) {
  for (const c of chapters) {
    const fade = 0.04
    const a = Math.min(1, Math.max(0, (progress - c.in) / fade))
    const b = Math.min(1, Math.max(0, (c.out - progress) / fade))
    const opacity = c.in === 0 ? b : Math.min(a, b)
    // Very subtle parallax: text drifts as the chapter passes.
    const span = Math.max(0.0001, c.out - c.in)
    const t = Math.min(1, Math.max(0, (progress - c.in) / span))
    const y = c.in === 0 ? c.lift * t : c.lift * (1 - t * 2)
    const key = `${opacity.toFixed(3)}|${y.toFixed(1)}`
    if (key === c.last) continue
    c.last = key
    c.el.style.opacity = opacity
    c.el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`
  }
  scrollCue.classList.toggle("is-hidden", progress > 0.003)
  stageCta.classList.toggle("is-hidden", progress < 0.04)
}

window.addEventListener("scroll", schedule, { passive: true })
window.addEventListener("resize", () => {
  measure()
  schedule()
})

// ───────────── loading ─────────────
async function load() {
  const started = performance.now()
  const src = video.getAttribute("src")
  video.removeAttribute("src")

  const setProgress = (p) => {
    loaderBar.style.transform = `scaleX(${p})`
    loaderPct.textContent = ` ${Math.round(p * 100)}%`
  }

  // Preferred path: pull the whole file into memory so every seek is instant and local.
  // Falls back to a plain src (e.g. when opened via file://).
  const url = await fetchAsBlobUrl(src, setProgress).catch(() => src)
  const metadata = new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", resolve, { once: true })
    video.addEventListener("error", () => reject(video.error), { once: true })
  })
  video.src = url
  video.load()
  await metadata
  duration = video.duration

  // Wait for the first frame to be decodable.
  if (video.readyState < 2) {
    await new Promise((resolve) => video.addEventListener("loadeddata", resolve, { once: true }))
  }
  setProgress(1)

  const wait = Math.max(0, MIN_LOADER_MS - (performance.now() - started))
  await new Promise((resolve) => setTimeout(resolve, wait))
  reveal()
}

async function fetchAsBlobUrl(src, onProgress) {
  const res = await fetch(src)
  if (!res.ok || !res.body) throw new Error(`video ${res.status}`)
  const total = Number(res.headers.get("content-length")) || 0
  const reader = res.body.getReader()
  const chunks = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total) onProgress(Math.min(0.98, received / total))
  }
  return URL.createObjectURL(new Blob(chunks, { type: res.headers.get("content-type") || "video/mp4" }))
}

function reveal() {
  measure()
  ready = true
  video.pause()
  // Honour a restored scroll position (reload mid-film); otherwise this is frame 0.
  lastApplied = -1
  render()
  document.body.classList.remove("is-loading")
  loader.classList.add("is-done")
}

// Hard stop so a stalled download can't hold the page hostage.
setTimeout(() => {
  if (!ready && duration) reveal()
}, MAX_LOADER_MS)

load().catch((err) => {
  console.error("Video failed to load:", err)
  loaderPct.textContent = " — video unavailable"
})

// ───────────── contact panel ─────────────
const panel = document.getElementById("contactPanel")
let opener = null

function openContact(from) {
  opener = from
  panel.hidden = false
  document.documentElement.classList.add("is-locked")
  panel.querySelector(".contact__options a").focus()
}
function closeContact() {
  panel.hidden = true
  document.documentElement.classList.remove("is-locked")
  opener?.focus()
}
document.querySelectorAll("[data-open-contact]").forEach((b) => b.addEventListener("click", () => openContact(b)))
panel.querySelectorAll("[data-close-contact]").forEach((b) => b.addEventListener("click", closeContact))
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !panel.hidden) closeContact()
})

document.getElementById("backToTop").addEventListener("click", () => window.scrollTo(0, 0))
document.querySelector(".nav__brand").addEventListener("click", (e) => {
  e.preventDefault()
  window.scrollTo(0, 0)
})
