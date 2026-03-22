// cards.js
document.addEventListener("DOMContentLoaded", () => {
  // 1) Your CSV-like input (3 columns per row: category, code, title)
  const raw = `LIFO Core Program,L301,LIFO Communication Slide,img/press1.png\n
LIFO Core Program,L302,LIFO Compatibility Slide,img/press2.png\n
LIFO Core Program,L401 ,LIFO Strength Feedback Chart (random),img/press3.png\n
LIFO Core Program,L407,LIFO Strength Feedback Chart (Alpha),img/press1.png\n
LIFO Core Program,L501,Life Orientations Participant Guide,img/press2.png\n
LIFO Core Program,L502,Build Relations Participant Guide,img/press3.png\n
LIFO Core Program,L507,3 Essentials for Effective Teamwork Participant Guide,img/press1.png\n
LIFO Core Program,L508,Discovery Paricipant Guide,img/press2.png\n
LIFO Core Program,L538,LIFO Global Participant Guide,img/press3.png\n
LIFO Core Program,L601,The Name of Your Game,img/press1.png\n
LIFO Core Program,L701,Name Tent,img/press2.png\n
LIFO Core Program,L702,Match-a-Style Game,img/press3.png\n
LIFO Core Program,L703,Strength Reminder Card,img/press2.png\n`;

  // 2) Where to render
  const mount = document.querySelector("#cards");
  if (!mount) return;

  // 3) Fixed thumbnail (same for all cards)
  const FIXED_THUMBNAIL_SRC = "img/press1.png"; // <-- change this

  // 4) Parse lines -> rows -> render
  const rows = raw
    .split(/\r?\n/) // handles Windows/Unix newlines [web:36]
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(",").map(s => s.trim())); // simple comma split

  const items = rows
    .filter(cols => cols.length >= 4)
    .map(([category, code, title,img]) => ({ category, code, title, img }));

  mount.innerHTML = items.map(item => renderCard(item, FIXED_THUMBNAIL_SRC)).join("");

  function renderCard({ category, code, title, img }, thumbSrc) {
    return `
<div class="glass-card glass-card-3d stat-card">
  <div class="stat-card-inner">
    <div class="stat-info">
      <div>
        <h3>${escapeHtml(category)}</h3>
        <div class="">${escapeHtml(code)}</div>
        <div class="stat-value">${escapeHtml(title)}</div>
        <span class="stat-change positive">Download</span>
      </div>
    </div>
    <div class="stat-icon cyan">
      <div class="thumbnail">
        <img class="thumbnailsub" src="${escapeHtml(img)}" alt="">
      </div>
    </div>
  </div>
</div>`;
  }

  function escapeHtml(s = "") {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
});
