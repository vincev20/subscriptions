document.addEventListener("DOMContentLoaded", () => {
  const raw = `LIFO Core Program,L301,LIFO Communication Slide,img/press1.png
LIFO Core Program,L302,LIFO Compatibility Slide,img/press2.png
LIFO Core Program,L401,LIFO Strength Feedback Chart (random),img/press3.png
LIFO Core Program,L407,LIFO Strength Feedback Chart (Alpha),img/press1.png
LIFO Core Program,L501,Life Orientations Participant Guide,img/press2.png
LIFO Core Program,L502,Build Relations Participant Guide,img/press3.png
LIFO Core Program,L507,3 Essentials for Effective Teamwork Participant Guide,img/press1.png
LIFO Core Program,L508,Discovery Paricipant Guide,img/press2.png
LIFO Core Program,L538,LIFO Global Participant Guide,img/press3.png
LIFO Core Program,L601,The Name of Your Game,img/press1.png
LIFO Core Program,L701,Name Tent,img/press2.png
LIFO Core Program,L702,Match-a-Style Game,img/press3.png
LIFO Core Program,L703,Strength Reminder Card,img/press2.png`;

  const primaryMount = document.querySelector("#cards");
  const secondaryMount = document.querySelector("#cards-secondary");
  if (!primaryMount && !secondaryMount) return;

  const workerBaseUrl = (localStorage.getItem("workerBaseUrl") || "https://dnn-subscription-portal.vvelascoao2022.workers.dev/")
    .trim()
    .replace(/\/$/, "");
  const ADDITIONAL_FOLDER_ID = "209745447557";
  const ADDITIONAL_CACHE_KEY = `additionalResources:${ADDITIONAL_FOLDER_ID}`;
  const ADDITIONAL_CACHE_TTL_MS = 5 * 60 * 1000;
  const ADDITIONAL_PAGE_SIZE_KEY = `additionalResourcesPageSize:${ADDITIONAL_FOLDER_ID}`;

  const rows = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(",").map(s => s.trim()));

  const items = rows
    .filter(cols => cols.length >= 4)
    .map(([category, code, title, img]) => ({ category, code, title, img }));

  if (primaryMount) {
    primaryMount.innerHTML = `
      <div id="resourceDownloadStatus" style="margin-bottom: 18px; color: var(--text-muted); font-size: 14px;"></div>
      ${items.map(item => renderCard(item)).join("")}
    `;
  }

  const statusEl = document.getElementById("resourceDownloadStatus");
  const downloadButtons = primaryMount ? document.querySelectorAll("[data-download-code]") : [];
  let fileIndexPromise = null;
  let additionalFilesPromise = null;
  let additionalFiles = [];
  let additionalCurrentPage = 1;
  let additionalPageSize = readAdditionalPageSize();

  if (secondaryMount) {
    const pageSizeSelect = document.getElementById("resourcePageSize");
    const prevPageButton = document.getElementById("resourcePrevPage");
    const nextPageButton = document.getElementById("resourceNextPage");

    if (pageSizeSelect) {
      pageSizeSelect.value = String(additionalPageSize);
      pageSizeSelect.addEventListener("change", () => {
        additionalPageSize = Number(pageSizeSelect.value) || 10;
        additionalCurrentPage = 1;
        writeAdditionalPageSize(additionalPageSize);
        renderAdditionalPage();
      });
    }

    if (prevPageButton) {
      prevPageButton.addEventListener("click", () => {
        if (additionalCurrentPage > 1) {
          additionalCurrentPage -= 1;
          renderAdditionalPage();
        }
      });
    }

    if (nextPageButton) {
      nextPageButton.addEventListener("click", () => {
        const totalPages = getAdditionalTotalPages();
        if (additionalCurrentPage < totalPages) {
          additionalCurrentPage += 1;
          renderAdditionalPage();
        }
      });
    }

    loadAdditionalResources();
  }

  downloadButtons.forEach(button => {
    button.addEventListener("click", async () => {
      const code = button.getAttribute("data-download-code") || "";
      const title = button.getAttribute("data-download-title") || "";

      button.disabled = true;
      button.textContent = "Preparing...";
      setStatus(`Preparing ${code} for download...`, "var(--text-muted)");

      try {
        const files = await getFileIndex();
        const matchedFile = findBestFileMatch(files, code, title);

        if (!matchedFile) {
          throw new Error(`No HubSpot PDF found for ${code}.`);
        }

        const downloadUrl = new URL(workerBaseUrl + "/api/pdf-download");
        downloadUrl.searchParams.set("id", matchedFile.id);
        downloadUrl.searchParams.set("name", matchedFile.name || `${code} ${title}`);

        const link = document.createElement("a");
        link.href = downloadUrl.toString();
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();

        setStatus(`Started download for ${matchedFile.name}.`, "#10b981");
      } catch (error) {
        setStatus(error.message || "Unable to download the file.", "#ff6b6b");
      } finally {
        button.disabled = false;
        button.textContent = "Download";
      }
    });
  });

  function renderCard({ category, code, title, img }) {
    return `
<div class="glass-card glass-card-3d stat-card">
  <div class="stat-card-inner">
    <div class="stat-info">
      <div>
        <h3>${escapeHtml(category)}</h3>
        <div>${escapeHtml(code)}</div>
        <div class="stat-value">${escapeHtml(title)}</div>
        <button class="stat-change positive" type="button" data-download-code="${escapeHtml(code)}" data-download-title="${escapeHtml(title)}">Download</button>
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

  async function getFileIndex() {
    if (!fileIndexPromise) {
      fileIndexPromise = fetch(workerBaseUrl + "/api/pdfs", {
        headers: { Accept: "application/json" }
      })
        .then(async response => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || "Failed to load available PDFs.");
          }
          return Array.isArray(data.files) ? data.files : [];
        });
    }

    return fileIndexPromise;
  }

  function findBestFileMatch(files, code, title) {
    const targetCode = normalizeText(code);
    const targetTitle = normalizeText(title);
    const exactTargets = [
      normalizeText(`${code} ${title}`),
      targetTitle,
      targetCode
    ];

    for (const target of exactTargets) {
      const exact = files.find(file => normalizeText(file.name) === target);
      if (exact) {
        return exact;
      }
    }

    return files.find(file => {
      const normalizedName = normalizeText(file.name);
      return normalizedName.includes(targetCode) && normalizedName.includes(targetTitle);
    }) || files.find(file => normalizeText(file.name).includes(targetCode)) || null;
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function setStatus(message, color) {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message;
    statusEl.style.color = color;
  }

  async function loadAdditionalResources() {
    const secondaryStatusEl = document.getElementById("resourceSecondaryStatus");
    const secondaryCardsEl = secondaryMount;
    const cachedFiles = readAdditionalFilesCache();

    if (cachedFiles && cachedFiles.length) {
      renderAdditionalCards(cachedFiles, secondaryCardsEl, secondaryStatusEl);
      refreshAdditionalResourcesInBackground(secondaryCardsEl, secondaryStatusEl);
      return;
    }

    try {
      const files = await getAdditionalFiles();

      if (!files.length) {
        secondaryStatusEl.textContent = "No PDFs found in the additional resources folder.";
        secondaryStatusEl.style.color = "var(--text-muted)";
        secondaryCardsEl.innerHTML = "";
        return;
      }

      writeAdditionalFilesCache(files);
      renderAdditionalCards(files, secondaryCardsEl, secondaryStatusEl);
    } catch (error) {
      secondaryStatusEl.textContent = error.message || "Unable to load additional resources.";
      secondaryStatusEl.style.color = "#ff6b6b";
    }
  }

  async function getAdditionalFiles() {
    if (!additionalFilesPromise) {
      const folderUrl = new URL(workerBaseUrl + "/api/pdfs-by-folder");
      folderUrl.searchParams.set("id", ADDITIONAL_FOLDER_ID);

      additionalFilesPromise = fetch(folderUrl.toString(), {
        headers: { Accept: "application/json" }
      })
        .then(async response => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || "Failed to load additional resources.");
          }
          return Array.isArray(data.files) ? data.files : [];
        });
    }

    return additionalFilesPromise;
  }

  async function refreshAdditionalResourcesInBackground(secondaryCardsEl, secondaryStatusEl) {
    try {
      additionalFilesPromise = null;
      const files = await getAdditionalFiles();
      if (files.length) {
        writeAdditionalFilesCache(files);
        renderAdditionalCards(files, secondaryCardsEl, secondaryStatusEl);
      }
    } catch (_error) {
      // Keep showing cached results if the refresh fails.
    }
  }

  function renderAdditionalCards(files, secondaryCardsEl, secondaryStatusEl) {
    additionalFiles = files.slice();
    const totalPages = getAdditionalTotalPages();
    if (additionalCurrentPage > totalPages) {
      additionalCurrentPage = totalPages;
    }

    secondaryStatusEl.textContent = "Click any resource to download the HubSpot PDF.";
    secondaryStatusEl.style.color = "var(--text-muted)";
    renderAdditionalPage();
  }

  function renderFolderCard(file) {
    const title = file.name || "Document";
    const code = extractCodeFromName(title);
    return `
<div class="glass-card glass-card-3d stat-card additional-resource-card">
  <div class="additional-resource-card-inner">
    <div class="additional-resource-card-top">
      <div class="stat-info additional-resource-copy">
        <h3>Subscription Files</h3>
        <div>${escapeHtml(code)}</div>
        <div class="stat-value">${escapeHtml(title)}</div>
      </div>
      <div class="stat-icon cyan additional-resource-icon">
      <div class="thumbnail">
        <img class="thumbnailsub" src="${escapeHtml(file.thumbnail || "img/press1.png")}" alt="">
      </div>
    </div>
    </div>
    <div class="additional-resource-card-actions">
      <button class="stat-change positive" type="button" data-download-file-id="${escapeHtml(file.id)}" data-download-file-name="${escapeHtml(title)}">Download</button>
    </div>
  </div>
</div>`;
  }

  function extractCodeFromName(value) {
    const match = String(value || "").match(/\b[L]\d{3}\b/i);
    return match ? match[0].toUpperCase() : "PDF";
  }

  function triggerDirectDownload(button, fileId, fileName, statusNode) {
    button.disabled = true;
    button.textContent = "Preparing...";
    statusNode.textContent = `Preparing ${fileName} for download...`;
    statusNode.style.color = "var(--text-muted)";

    try {
      const downloadUrl = new URL(workerBaseUrl + "/api/pdf-download");
      downloadUrl.searchParams.set("id", fileId);
      downloadUrl.searchParams.set("name", fileName);

      const link = document.createElement("a");
      link.href = downloadUrl.toString();
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();

      statusNode.textContent = `Started download for ${fileName}.`;
      statusNode.style.color = "#10b981";
    } catch (error) {
      statusNode.textContent = error.message || "Unable to download the file.";
      statusNode.style.color = "#ff6b6b";
    } finally {
      button.disabled = false;
      button.textContent = "Download";
    }
  }

  function renderAdditionalPage() {
    const secondaryStatusEl = document.getElementById("resourceSecondaryStatus");
    const pageInfo = document.getElementById("resourcePageInfo");
    const prevPageButton = document.getElementById("resourcePrevPage");
    const nextPageButton = document.getElementById("resourceNextPage");
    const paginationShell = document.getElementById("resourcePagination");

    if (!secondaryMount) {
      return;
    }

    const totalPages = getAdditionalTotalPages();
    const startIndex = (additionalCurrentPage - 1) * additionalPageSize;
    const pageFiles = additionalFiles.slice(startIndex, startIndex + additionalPageSize);

    secondaryMount.innerHTML = pageFiles.map(file => renderFolderCard(file)).join("");

    secondaryMount.querySelectorAll("[data-download-file-id]").forEach(button => {
      button.addEventListener("click", () => {
        const fileId = button.getAttribute("data-download-file-id") || "";
        const fileName = button.getAttribute("data-download-file-name") || "document";
        triggerDirectDownload(button, fileId, fileName, secondaryStatusEl);
      });
    });

    if (pageInfo) {
      pageInfo.textContent = additionalFiles.length
        ? `Page ${additionalCurrentPage} of ${totalPages}`
        : "Page 0 of 0";
    }

    if (prevPageButton) {
      prevPageButton.disabled = additionalCurrentPage <= 1;
    }

    if (nextPageButton) {
      nextPageButton.disabled = additionalCurrentPage >= totalPages;
    }

    if (paginationShell) {
      paginationShell.style.display = additionalFiles.length ? "flex" : "none";
    }
  }

  function getAdditionalTotalPages() {
    return Math.max(1, Math.ceil(additionalFiles.length / additionalPageSize));
  }

  function readAdditionalFilesCache() {
    try {
      const raw = sessionStorage.getItem(ADDITIONAL_CACHE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.files) || !parsed.savedAt) {
        return null;
      }

      if (Date.now() - Number(parsed.savedAt) > ADDITIONAL_CACHE_TTL_MS) {
        sessionStorage.removeItem(ADDITIONAL_CACHE_KEY);
        return null;
      }

      return parsed.files;
    } catch (_error) {
      return null;
    }
  }

  function writeAdditionalFilesCache(files) {
    try {
      sessionStorage.setItem(ADDITIONAL_CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        files
      }));
    } catch (_error) {
      // Ignore storage write failures.
    }
  }

  function readAdditionalPageSize() {
    try {
      const raw = sessionStorage.getItem(ADDITIONAL_PAGE_SIZE_KEY);
      const parsed = Number(raw);
      return parsed === 20 ? 20 : 10;
    } catch (_error) {
      return 10;
    }
  }

  function writeAdditionalPageSize(value) {
    try {
      sessionStorage.setItem(ADDITIONAL_PAGE_SIZE_KEY, String(value));
    } catch (_error) {
      // Ignore storage write failures.
    }
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }
});
