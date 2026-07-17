(function () {
  const list = document.querySelector("[data-public-form-list]");

  if (!list) return;

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  function createPublicClient() {
    if (!window.supabase?.createClient || !window.ShieldSupabase) {
      throw new Error("Forms are not ready yet.");
    }

    return window.supabase.createClient(
      window.ShieldSupabase.url,
      window.ShieldSupabase.publishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );
  }

  function getFormUrl(client, form) {
    if (form.file_source === "storage") {
      return client.storage.from("form-downloads").getPublicUrl(form.file_path).data.publicUrl;
    }
    return form.file_path || "#";
  }

  function renderForms(client, forms) {
    list.innerHTML = forms.map((form, index) => `
      <article class="form-card">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <h2>${escapeHtml(form.title)}</h2>
        <p>${escapeHtml(form.description)}</p>
        <a class="button primary" href="${escapeHtml(getFormUrl(client, form))}" target="_blank" rel="noopener">Download PDF</a>
      </article>
    `).join("");
  }

  async function loadForms() {
    try {
      const client = createPublicClient();
      const { data, error } = await client
        .from("forms")
        .select("title, description, file_path, file_source, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("title", { ascending: true });

      if (error) throw error;
      if (data?.length) renderForms(client, data);
    } catch (error) {
      console.warn("Managed forms could not be loaded", error);
    }
  }

  window.addEventListener("DOMContentLoaded", loadForms);
})();
