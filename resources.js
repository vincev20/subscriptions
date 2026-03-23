(function () {
  "use strict";

  const STATIC_RESOURCE_THUMBNAIL_URL = "https://270115.fs1.hubspotusercontent-na1.net/hubfs/270115/subscription-portal/profile-images/press1.png";

  function initThemeToggle() {
    const themeToggle = document.getElementById("theme-toggle");
    if (!themeToggle) return;

    const themeRoot = document.querySelector(".allwrap") || document.documentElement;
    const iconSun = themeToggle.querySelector(".icon-sun");
    const iconMoon = themeToggle.querySelector(".icon-moon");

    function setTheme(theme) {
      themeRoot.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);

      if (iconSun && iconMoon) {
        if (theme === "light") {
          iconSun.style.display = "none";
          iconMoon.style.display = "block";
        } else {
          iconSun.style.display = "block";
          iconMoon.style.display = "none";
        }
      }
    }

    const savedTheme = localStorage.getItem("theme") || "light";
    setTheme(savedTheme);

    themeToggle.addEventListener("click", () => {
      const currentTheme = themeRoot.getAttribute("data-theme");
      setTheme(currentTheme === "dark" ? "light" : "dark");
    });
  }

  function initMobileMenu() {
    const menuToggle = document.querySelector(".mobile-menu-toggle");
    const sidebar = document.getElementById("sidebar");

    if (!menuToggle || !sidebar) return;

    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });

    document.addEventListener("click", (event) => {
      if (
        sidebar.classList.contains("open") &&
        !sidebar.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        sidebar.classList.remove("open");
      }
    });
  }

  function initSidebarLayout() {
    const wrap = document.querySelector(".allwrap");
    if (!wrap) return;
    wrap.style.setProperty("--sidebar-offset", "0px");
  }

  function initAdditionalResources() {
    const secondaryMount = document.querySelector("#cards-secondary");
    if (!secondaryMount) return;

    const workerBaseUrl = (localStorage.getItem("workerBaseUrl") || "https://dnn-subscription-portal.vvelascoao2022.workers.dev/")
      .trim()
      .replace(/\/$/, "");
    const additionalFolderId = "209745447557";
    const additionalCacheKey = `additionalResources:${additionalFolderId}`;
    const additionalCacheTtlMs = 5 * 60 * 1000;
    const additionalPageSizeKey = `additionalResourcesPageSize:${additionalFolderId}`;

    let additionalFilesPromise = null;
    let additionalFiles = [];
    let additionalCurrentPage = 1;
    let additionalPageSize = readAdditionalPageSize();

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

    async function loadAdditionalResources() {
      const secondaryStatusEl = document.getElementById("resourceSecondaryStatus");
      const cachedFiles = readAdditionalFilesCache();

      if (cachedFiles && cachedFiles.length) {
        renderAdditionalCards(cachedFiles, secondaryStatusEl);
        refreshAdditionalResourcesInBackground(secondaryStatusEl);
        return;
      }

      try {
        const files = await getAdditionalFiles();

        if (!files.length) {
          secondaryStatusEl.textContent = "No PDFs found in the additional resources folder.";
          secondaryStatusEl.style.color = "var(--text-muted)";
          secondaryMount.innerHTML = "";
          return;
        }

        writeAdditionalFilesCache(files);
        renderAdditionalCards(files, secondaryStatusEl);
      } catch (error) {
        secondaryStatusEl.textContent = error.message || "Unable to load additional resources.";
        secondaryStatusEl.style.color = "#ff6b6b";
      }
    }

    async function getAdditionalFiles() {
      if (!additionalFilesPromise) {
        const folderUrl = new URL(workerBaseUrl + "/api/pdfs-by-folder");
        folderUrl.searchParams.set("id", additionalFolderId);

        additionalFilesPromise = fetch(folderUrl.toString(), {
          headers: { Accept: "application/json" }
        }).then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || "Failed to load additional resources.");
          }
          return Array.isArray(data.files) ? data.files : [];
        });
      }

      return additionalFilesPromise;
    }

    async function refreshAdditionalResourcesInBackground(secondaryStatusEl) {
      try {
        additionalFilesPromise = null;
        const files = await getAdditionalFiles();
        if (files.length) {
          writeAdditionalFilesCache(files);
          renderAdditionalCards(files, secondaryStatusEl);
        }
      } catch (_error) {
        // Keep showing cached results if the refresh fails.
      }
    }

    function renderAdditionalCards(files, secondaryStatusEl) {
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
      const thumbnailUrl = resolveResourceThumbnail(file);
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
          <img class="thumbnailsub" src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(title)}">
        </div>
      </div>
    </div>
    <div class="additional-resource-card-actions">
      <button class="stat-change positive" type="button" data-download-file-id="${escapeHtml(file.id)}" data-download-file-name="${escapeHtml(title)}">Download</button>
    </div>
  </div>
</div>`;
    }

    function resolveResourceThumbnail(file) {
      const rawThumbnail = stripPortalPrefix(String(file && file.thumbnail || "").trim());
      return /^https?:\/\//i.test(rawThumbnail) ? rawThumbnail : stripPortalPrefix(STATIC_RESOURCE_THUMBNAIL_URL);
    }

    function stripPortalPrefix(value) {
      return String(value || "").replace(/^\/portals\/0\//i, "");
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
      const paginationShell = document.getElementById("resourcePagination");
      const totalPages = getAdditionalTotalPages();
      const startIndex = (additionalCurrentPage - 1) * additionalPageSize;
      const pageFiles = additionalFiles.slice(startIndex, startIndex + additionalPageSize);

      secondaryMount.innerHTML = pageFiles.map((file) => renderFolderCard(file)).join("");

      secondaryMount.querySelectorAll(".thumbnailsub").forEach((image) => {
        const currentSrc = image.getAttribute("src") || "";
        const cleanedSrc = stripPortalPrefix(currentSrc);
        if (cleanedSrc && cleanedSrc !== currentSrc) {
          image.setAttribute("src", cleanedSrc);
        }
      });

      secondaryMount.querySelectorAll("[data-download-file-id]").forEach((button) => {
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
        const raw = sessionStorage.getItem(additionalCacheKey);
        if (!raw) {
          return null;
        }

        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.files) || !parsed.savedAt) {
          return null;
        }

        if (Date.now() - Number(parsed.savedAt) > additionalCacheTtlMs) {
          sessionStorage.removeItem(additionalCacheKey);
          return null;
        }

        return parsed.files;
      } catch (_error) {
        return null;
      }
    }

    function writeAdditionalFilesCache(files) {
      try {
        sessionStorage.setItem(additionalCacheKey, JSON.stringify({
          savedAt: Date.now(),
          files
        }));
      } catch (_error) {
        // Ignore storage write failures.
      }
    }

    function readAdditionalPageSize() {
      try {
        const raw = sessionStorage.getItem(additionalPageSizeKey);
        const parsed = Number(raw);
        return parsed === 20 ? 20 : 10;
      } catch (_error) {
        return 10;
      }
    }

    function writeAdditionalPageSize(value) {
      try {
        sessionStorage.setItem(additionalPageSizeKey, String(value));
      } catch (_error) {
        // Ignore storage write failures.
      }
    }

    function escapeHtml(value = "") {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }
  }

  function init() {
    initThemeToggle();
    initMobileMenu();
    initSidebarLayout();
    initAdditionalResources();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());
