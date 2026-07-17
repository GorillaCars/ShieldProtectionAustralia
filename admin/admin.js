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
  let supabase;
  let policies = [];
  let fileMap = new Map();

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
      const fileRows = files.length
        ? files.map((file) => `
            <div class="file-row">
              <div>
                <strong>${escapeHtml(file.file_name)}</strong>
                <span>${formatBytes(file.file_size)} - ${new Date(file.created_at).toLocaleDateString()}</span>
              </div>
              <div class="file-actions">
                <button type="button" data-download-file="${file.id}">Download</button>
                <button type="button" data-delete-file="${file.id}">Delete</button>
              </div>
            </div>
          `).join("")
        : '<div class="empty-files">No files uploaded.</div>';

      return `
        <article class="policy-row" data-policy-id="${policy.id}">
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
              <button type="button" data-edit-policy="${policy.id}">Edit</button>
            </div>
          </div>
          <div class="policy-files">${fileRows}</div>
        </article>
      `;
    }).join("");
    renderStats();
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

  policyList.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    const editId = target.dataset.editPolicy;
    if (editId) {
      const policy = policies.find((item) => item.id === editId);
      if (policy) openEditor(policy);
      return;
    }

    const downloadId = target.dataset.downloadFile;
    if (downloadId) {
      const file = [...fileMap.values()].flat().find((item) => item.id === downloadId);
      if (!file) return;
      target.disabled = true;
      try {
        const { data, error } = await supabase.storage.from("policy-documents").createSignedUrl(file.file_path, 120);
        if (error) throw error;
        window.open(data.signedUrl, "_blank", "noopener");
      } catch (error) {
        alert(error.message || "Could not create download link.");
      } finally {
        target.disabled = false;
      }
      return;
    }

    const deleteId = target.dataset.deleteFile;
    if (deleteId) {
      const file = [...fileMap.values()].flat().find((item) => item.id === deleteId);
      if (!file || !confirm(`Delete ${file.file_name}?`)) return;
      target.disabled = true;
      try {
        const { error: storageError } = await supabase.storage.from("policy-documents").remove([file.file_path]);
        if (storageError) throw storageError;
        const { error: rowError } = await supabase.from("policy_files").delete().eq("id", file.id);
        if (rowError) throw rowError;
        await loadPolicies();
      } catch (error) {
        alert(error.message || "Could not delete file.");
        target.disabled = false;
      }
    }
  });

  document.addEventListener("DOMContentLoaded", ensureAdminSession);
})();
