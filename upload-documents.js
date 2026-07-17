(function () {
  const modal = document.querySelector("[data-upload-modal]");
  const openButton = document.querySelector("[data-upload-open]");
  const closeButtons = document.querySelectorAll("[data-upload-close]");
  const form = document.querySelector("[data-upload-form]");
  const status = document.querySelector("[data-upload-status]");

  if (!modal || !openButton || !form || !status) return;

  const allowedTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/heif"
  ]);

  function setStatus(message, tone) {
    status.textContent = message || "";
    status.dataset.tone = tone || "";
  }

  function openModal() {
    modal.hidden = false;
    document.body.classList.add("modal-open");
    setStatus("");
    form.querySelector("input")?.focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    form.reset();
    setStatus("");
  }

  function cleanFileName(name) {
    return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "document";
  }

  function friendlyUploadError(error) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("policy details") || message.includes("do not match")) {
      return "Those details do not match a policy. Please check the policy number and full name exactly as written on your document.";
    }
    if (message.includes("row-level security") || message.includes("violates") || message.includes("permission")) {
      return "We could not upload your document right now. Please try again, or contact Shield Protection Australia if it keeps happening.";
    }
    if (message.includes("invalid") || message.includes("expired")) {
      return "This upload session expired. Please close the form and try again.";
    }
    if (message.includes("network") || message.includes("failed to fetch")) {
      return "We could not connect. Please check your internet connection and try again.";
    }
    return "Upload failed. Please try again.";
  }

  openButton.addEventListener("click", openModal);
  closeButtons.forEach((button) => button.addEventListener("click", closeModal));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector("button[type='submit']");
    const formData = new FormData(form);
    const policyNo = String(formData.get("policyNo") || "").trim();
    const fullName = String(formData.get("fullName") || "").trim();
    const file = formData.get("file");

    if (!policyNo || !fullName || !(file instanceof File) || file.size === 0) {
      setStatus("Please enter your policy details and choose a file.", "error");
      return;
    }

    if (!allowedTypes.has(file.type)) {
      setStatus("Please upload a PDF, JPG, PNG, HEIC or HEIF file.", "error");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setStatus("Please upload a file smaller than 15 MB.", "error");
      return;
    }

    submitButton.disabled = true;
    setStatus("Checking policy details...", "");

    try {
      const supabase = window.getShieldSupabaseClient();
      const { data: intent, error: intentError } = await supabase.rpc("create_policy_upload_intent", {
        p_policy_no: policyNo,
        p_customer_full_name: fullName
      });

      if (intentError || !intent?.[0]?.upload_token) {
        throw new Error("Those details do not match a policy. Please check the policy number and full name exactly as written on your document.");
      }

      const token = intent[0].upload_token;
      const filePath = `incoming/${token}/${Date.now()}-${cleanFileName(file.name)}`;
      setStatus("Uploading document...", "");

      const { error: uploadError } = await supabase.storage
        .from("policy-documents")
        .upload(filePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { error: recordError } = await supabase.rpc("record_policy_upload", {
        p_upload_token: token,
        p_file_path: filePath,
        p_file_name: file.name,
        p_content_type: file.type,
        p_file_size: file.size
      });

      if (recordError) throw recordError;

      setStatus("Upload received. Thank you.", "success");
      form.reset();
    } catch (error) {
      console.warn("Document upload failed", error);
      setStatus(friendlyUploadError(error), "error");
    } finally {
      submitButton.disabled = false;
    }
  });
})();
