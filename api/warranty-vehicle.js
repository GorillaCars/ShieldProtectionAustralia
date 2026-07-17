const allowedFields = [
  "image",
  "image_thumbnail",
  "vehicle_title",
  "kilometers",
  "year",
  "transmission",
  "engine",
  "listing_link",
  "lot"
];

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function sanitizeVehicle(rawVehicle) {
  if (!rawVehicle || typeof rawVehicle !== "object") return null;
  const vehicle = {};
  for (const field of allowedFields) {
    if (rawVehicle[field] !== undefined && rawVehicle[field] !== null && rawVehicle[field] !== "") {
      vehicle[field] = rawVehicle[field];
    }
  }
  return Object.keys(vehicle).length ? vehicle : null;
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const token = process.env.WARRANTY_VEHICLE_API_TOKEN;
  if (!token) {
    sendJson(response, 503, { error: "Vehicle lookup is not configured" });
    return;
  }

  const ref = String(request.query?.ref || "").trim().toUpperCase();
  if (!/^SPA-\d+$/.test(ref)) {
    sendJson(response, 400, { error: "Invalid product number" });
    return;
  }

  try {
    const upstream = await fetch(`https://dealership-app-three.vercel.app/api/warranty-vehicle?ref=${encodeURIComponent(ref)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (upstream.status === 404) {
      sendJson(response, 404, { vehicle: null });
      return;
    }

    if (!upstream.ok) {
      sendJson(response, upstream.status, { error: "Vehicle lookup failed" });
      return;
    }

    const payload = await upstream.json();
    const vehicle = sanitizeVehicle(payload?.vehicle || payload?.data || payload);
    if (!vehicle) {
      sendJson(response, 404, { vehicle: null });
      return;
    }

    sendJson(response, 200, { vehicle });
  } catch (error) {
    sendJson(response, 502, { error: "Vehicle lookup failed" });
  }
};
