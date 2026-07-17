(function () {
  const adminEmail = "admin@shieldprotectionaustralia.com.au";
  const loginView = document.querySelector("[data-admin-login]");
  const panel = document.querySelector("[data-admin-panel]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginStatus = document.querySelector("[data-login-status]");
  const signoutButton = document.querySelector("[data-admin-signout]");
  const newPolicyButton = document.querySelector("[data-new-policy]");
  const editor = document.querySelector("[data-policy-editor]");
  const policyForm = document.querySelector("[data-policy-form]");
  const policyStatus = document.querySelector("[data-policy-status]");
  const cancelPolicyButton = document.querySelector("[data-cancel-policy]");
  const policyList = document.querySelector("[data-policy-list]");
  const policyCount = document.querySelector("[data-policy-count]");
  const searchInput = document.querySelector("[data-policy-search]");
  const statPolicies = document.querySelector("[data-stat-policies]");
  const statFiles = document.querySelector("[data-stat-files]");
  const statMonth = document.querySelector("[data-stat-month]");
  const statEmpty = document.querySelector("[data-stat-empty]");
  const policyBar = document.querySelector("[data-stat-policy-bar]");
  const fileBar = document.querySelector("[data-stat-file-bar]");
  const emptyBar = document.querySelector("[data-stat-empty-bar]");
  const uploadChart = document.querySelector("[data-upload-chart]");
  const detailModal = document.querySelector("[data-policy-detail-modal]");
  const detailForm = document.querySelector("[data-policy-detail-form]");
  const detailStatus = document.querySelector("[data-policy-detail-status]");
  const detailFiles = document.querySelector("[data-policy-detail-files]");
  const detailFileCount = document.querySelector("[data-policy-detail-file-count]");
  const detailCloseButtons = document.querySelectorAll("[data-policy-detail-close]");
  const adminUploadForm = document.querySelector("[data-admin-upload-form]");
  const adminUploadStatus = document.querySelector("[data-admin-upload-status]");
  const deletePolicyButton = document.querySelector("[data-delete-policy]");
  const allowedTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/heif"
  ]);
  let supabase;
  let policies = [];
  let fileMap = new Map();
  let activePolicyId = "";

  function setStatus(element, message, tone) {
    if (!element) return;
    element.textContent = message || "";
    element.dataset.tone = tone || "";
  }

  function showPanel(isAdmin) {
    loginView.hidden = isAdmin;
    panel.hidden = !isAdmin;
    signoutButton.hidden = !isAdmin;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  function formatBytes(bytes) {
    if (!bytes) return "Unknown size";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  function isPreviewableImage(file) {
    return String(file.content_type || "").startsWith("image/");
  }

  function cleanFileName(name) {
    return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "document";
  }

  function setBar(element, value) {
    if (!element) return;
    element.style.width = `${Math.max(6, Math.min(100, value))}%`;
  }

  function renderStats() {
    const files = [...fileMap.values()].flat();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const uploadsThisMonth = files.filter((file) => {
      const date = new Date(file.created_at);
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).length;
    const policiesWithoutFiles = policies.filter((policy) => !(fileMap.get(policy.id) || []).length).length;
    const maxValue = Math.max(policies.length, files.length, uploadsThisMonth, policiesWithoutFiles, 1);

    statPolicies.textContent = policies.length;
    statFiles.textContent = files.length;
    statMonth.textContent = uploadsThisMonth;
    statEmpty.textContent = policiesWithoutFiles;

    setBar(policyBar, (policies.length / maxValue) * 100);
    setBar(fileBar, (files.length / maxValue) * 100);
    setBar(emptyBar, (policiesWithoutFiles / Math.max(policies.length, 1)) * 100);

    const monthBuckets = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(currentYear, currentMonth - (5 - index), 1);
      return {
        label: date.toLocaleString("en-AU", { month: "short" }),
        count: files.filter((file) => {
          const fileDate = new Date(file.created_at);
          return fileDate.getMonth() === date.getMonth() && fileDate.getFullYear() === date.getFullYear();
        }).length
      };
    });
    const peak = Math.max(...monthBuckets.map((item) => item.count), 1);
    uploadChart.innerHTML = monthBuckets.map((item) => `
      <span style="--bar-height: ${Math.max(12, (item.count / peak) * 100)}%" title="${item.label}: ${item.count}">
        <i></i>
        <b>${item.label}</b>
      </span>
    `).join("");
  }

  function renderPolicies() {
    const query = (searchInput.value || "").trim().toLowerCase();
    const visible = policies.filter((policy) => {
      return !query || policy.policy_no.toLowerCase().includes(query) || policy.customer_full_name.toLowerCase().includes(query);
    });

    policyCount.textContent = `${policies.length} ${policies.length === 1 ? "policy" : "policies"}`;

    if (!visible.length) {
      policyList.innerHTML = '<div class="empty-state">No policies found.</div>';
      renderStats();
      return;
    }

    policyList.innerHTML = visible.map((policy) => {
      const files = fileMap.get(policy.id) || [];
      return `
        <article class="policy-row" data-policy-id="${policy.id}" role="button" tabindex="0" aria-label="Open ${escapeHtml(policy.policy_no)}">
          <div class="policy-summary">
            <div>
              <span>Policy No.</span>
              <strong>${escapeHtml(policy.policy_no)}</strong>
            </div>
            <div>
              <span>Customer</span>
              <strong>${escapeHtml(policy.customer_full_name)}</strong>
            </div>
            <div>
              <span>Files</span>
              <strong>${files.length}</strong>
            </div>
            <div class="row-actions">
              <span>Open</span>
            </div>
          </div>
        </article>
      `;
    }).join("");
    renderStats();
  }

  async function getSignedUrl(file) {
    const { data, error } = await supabase.storage.from("policy-documents").createSignedUrl(file.file_path, 120);
    if (error) throw error;
    return data.signedUrl;
  }

  async function renderDetailFiles(policyId) {
    const files = fileMap.get(policyId) || [];
    detailFileCount.textContent = files.length ? `${files.length} ${files.length === 1 ? "file" : "files"} uploaded` : "No files uploaded.";

    if (!files.length) {
      detailFiles.innerHTML = '<div class="empty-files">No attachments uploaded yet.</div>';
      return;
    }

    detailFiles.innerHTML = '<div class="empty-files">Loading attachments...</div>';
    try {
      const rows = await Promise.all(files.map(async (file) => {
        const signedUrl = await getSignedUrl(file);
        const preview = isPreviewableImage(file)
          ? `<img src="${signedUrl}" alt="">`
          : '<span class="attachment-icon">PDF</span>';
        return `
          <article class="attachment-card">
            <div class="attachment-preview">${preview}</div>
            <div class="attachment-meta">
              <strong>${escapeHtml(file.file_name)}</strong>
              <span>${formatBytes(file.file_size)} - ${new Date(file.created_at).toLocaleDateString()}</span>
            </div>
            <div class="file-actions">
              <a href="${signedUrl}" target="_blank" rel="noopener">Download</a>
              <button type="button" data-delete-file="${file.id}">Delete</button>
            </div>
          </article>
        `;
      }));
      detailFiles.innerHTML = rows.join("");
    } catch (error) {
      detailFiles.innerHTML = '<div class="empty-files">Attachments could not be loaded.</div>';
    }
  }

  async function openDetail(policy) {
    activePolicyId = policy.id;
    detailForm.id.value = policy.id;
    detailForm.policy_no.value = policy.policy_no;
    detailForm.customer_full_name.value = policy.customer_full_name;
    setStatus(detailStatus, "", "");
    detailModal.hidden = false;
    document.body.classList.add("modal-open");
    await renderDetailFiles(policy.id);
    detailForm.policy_no.focus();
  }

  function closeDetail() {
    detailModal.hidden = true;
    document.body.classList.remove("modal-open");
    detailForm.reset();
    activePolicyId = "";
    detailFiles.innerHTML = "";
    setStatus(detailStatus, "", "");
    setStatus(adminUploadStatus, "", "");
    adminUploadForm.reset();
  }

  async function loadPolicies() {
    const [{ data: policyData, error: policyError }, { data: fileData, error: fileError }] = await Promise.all([
      supabase.from("policies").select("id, policy_no, customer_full_name, created_at").order("policy_no", { ascending: true }),
      supabase.from("policy_files").select("id, policy_id, file_name, file_path, content_type, file_size, created_at").order("created_at", { ascending: false })
    ]);

    if (policyError) throw policyError;
    if (fileError) throw fileError;

    policies = policyData || [];
    fileMap = new Map();
    (fileData || []).forEach((file) => {
      const files = fileMap.get(file.policy_id) || [];
      files.push(file);
      fileMap.set(file.policy_id, files);
    });
    renderStats();
    renderPolicies();
  }

  function openEditor(policy) {
    editor.hidden = false;
    policyForm.id.value = policy?.id || "";
    policyForm.policy_no.value = policy?.policy_no || "";
    policyForm.customer_full_name.value = policy?.customer_full_name || "";
    setStatus(policyStatus, "", "");
    policyForm.policy_no.focus();
  }

  function closeEditor() {
    editor.hidden = true;
    policyForm.reset();
    setStatus(policyStatus, "", "");
  }

  async function ensureAdminSession() {
    supabase = window.getShieldSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const isAdmin = session?.user?.email?.toLowerCase() === adminEmail;
    showPanel(isAdmin);
    if (isAdmin) await loadPolicies();
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector("button");
    const formData = new FormData(loginForm);
    button.disabled = true;
    setStatus(loginStatus, "Signing in...", "");

    try {
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "");
      if (email !== adminEmail) throw new Error("Use the Shield Protection Australia admin account.");
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user?.email?.toLowerCase() !== adminEmail) throw new Error("This account is not authorised for the admin panel.");
      setStatus(loginStatus, "", "");
      showPanel(true);
      await loadPolicies();
    } catch (error) {
      setStatus(loginStatus, error.message || "Login failed.", "error");
    } finally {
      button.disabled = false;
    }
  });

  signoutButton.addEventListener("click", async () => {
    await supabase.auth.signOut();
    policies = [];
    fileMap = new Map();
    showPanel(false);
  });

  newPolicyButton.addEventListener("click", () => openEditor());
  cancelPolicyButton.addEventListener("click", closeEditor);
  searchInput.addEventListener("input", renderPolicies);
  detailCloseButtons.forEach((button) => button.addEventListener("click", closeDetail));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !detailModal.hidden) closeDetail();
  });

  policyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = policyForm.querySelector("button[type='submit']");
    const payload = {
      policy_no: policyForm.policy_no.value.trim(),
      customer_full_name: policyForm.customer_full_name.value.trim()
    };

    if (!payload.policy_no || !payload.customer_full_name) {
      setStatus(policyStatus, "Policy number and customer name are required.", "error");
      return;
    }

    button.disabled = true;
    setStatus(policyStatus, "Saving...", "");
    try {
      const id = policyForm.id.value;
      const result = id
        ? await supabase.from("policies").update(payload).eq("id", id)
        : await supabase.from("policies").insert(payload);
      if (result.error) throw result.error;
      closeEditor();
      await loadPolicies();
    } catch (error) {
      setStatus(policyStatus, error.message || "Policy could not be saved.", "error");
    } finally {
      button.disabled = false;
    }
  });

  detailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = detailForm.querySelector("button[type='submit']");
    const payload = {
      policy_no: detailForm.policy_no.value.trim(),
      customer_full_name: detailForm.customer_full_name.value.trim()
    };

    if (!payload.policy_no || !payload.customer_full_name) {
      setStatus(detailStatus, "Policy number and customer name are required.", "error");
      return;
    }

    button.disabled = true;
    setStatus(detailStatus, "Saving...", "");
    try {
      const { error } = await supabase.from("policies").update(payload).eq("id", detailForm.id.value);
      if (error) throw error;
      setStatus(detailStatus, "Saved.", "success");
      await loadPolicies();
      const updatedPolicy = policies.find((item) => item.id === detailForm.id.value);
      if (updatedPolicy) {
        detailForm.policy_no.value = updatedPolicy.policy_no;
        detailForm.customer_full_name.value = updatedPolicy.customer_full_name;
      }
    } catch (error) {
      setStatus(detailStatus, error.message || "Policy could not be saved.", "error");
    } finally {
      button.disabled = false;
    }
  });

  adminUploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = adminUploadForm.querySelector("button[type='submit']");
    const file = new FormData(adminUploadForm).get("file");

    if (!activePolicyId) {
      setStatus(adminUploadStatus, "Open a policy before uploading.", "error");
      return;
    }

    if (!(file instanceof File) || file.size === 0) {
      setStatus(adminUploadStatus, "Choose a file to upload.", "error");
      return;
    }

    if (!allowedTypes.has(file.type)) {
      setStatus(adminUploadStatus, "Upload a PDF, JPG, PNG, HEIC or HEIF file.", "error");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setStatus(adminUploadStatus, "Upload a file smaller than 15 MB.", "error");
      return;
    }

    button.disabled = true;
    setStatus(adminUploadStatus, "Uploading...", "");
    try {
      const filePath = `admin/${activePolicyId}/${Date.now()}-${cleanFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("policy-documents")
        .upload(filePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false
        });
      if (uploadError) throw uploadError;

      const { error: recordError } = await supabase.from("policy_files").insert({
        policy_id: activePolicyId,
        file_name: file.name,
        file_path: filePath,
        content_type: file.type,
        file_size: file.size,
        uploaded_by: "admin"
      });
      if (recordError) throw recordError;

      adminUploadForm.reset();
      setStatus(adminUploadStatus, "Uploaded.", "success");
      await loadPolicies();
      await renderDetailFiles(activePolicyId);
    } catch (error) {
      setStatus(adminUploadStatus, error.message || "Upload failed.", "error");
    } finally {
      button.disabled = false;
    }
  });

  deletePolicyButton.addEventListener("click", async () => {
    if (!activePolicyId) return;
    const policy = policies.find((item) => item.id === activePolicyId);
    if (!policy) return;

    const confirmed = confirm(`Are you sure you want to delete policy ${policy.policy_no}? This will also remove its uploaded attachments.`);
    if (!confirmed) return;

    deletePolicyButton.disabled = true;
    setStatus(detailStatus, "Deleting policy...", "");
    try {
      const files = fileMap.get(activePolicyId) || [];
      const paths = files.map((file) => file.file_path).filter(Boolean);
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from("policy-documents").remove(paths);
        if (storageError) throw storageError;
      }

      const { error } = await supabase.from("policies").delete().eq("id", activePolicyId);
      if (error) throw error;

      closeDetail();
      await loadPolicies();
    } catch (error) {
      setStatus(detailStatus, error.message || "Policy could not be deleted.", "error");
    } finally {
      deletePolicyButton.disabled = false;
    }
  });

  policyList.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-policy-id]");
    if (!row) return;
    const policy = policies.find((item) => item.id === row.dataset.policyId);
    if (policy) await openDetail(policy);
  });

  policyList.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("[data-policy-id]");
    if (!row) return;
    event.preventDefault();
    const policy = policies.find((item) => item.id === row.dataset.policyId);
    if (policy) await openDetail(policy);
  });

  detailFiles.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    const deleteId = target.dataset.deleteFile;
    if (!deleteId) return;

    const file = [...fileMap.values()].flat().find((item) => item.id === deleteId);
    if (!file || !confirm(`Delete ${file.file_name}?`)) return;
    target.disabled = true;
    try {
      const { error: storageError } = await supabase.storage.from("policy-documents").remove([file.file_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await supabase.from("policy_files").delete().eq("id", file.id);
      if (rowError) throw rowError;
      await loadPolicies();
      if (activePolicyId) await renderDetailFiles(activePolicyId);
    } catch (error) {
      alert(error.message || "Could not delete file.");
      target.disabled = false;
    }
  });

  document.addEventListener("DOMContentLoaded", ensureAdminSession);
})();
