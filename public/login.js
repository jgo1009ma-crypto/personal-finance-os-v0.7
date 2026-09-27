async function readJson(response) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(
      text || `El servidor respondió con HTTP ${response.status}`
    );
  }

  return response.json();
}

async function checkSession() {
  try {
    const response = await fetch("/api/v1/auth/session", {
      credentials: "same-origin",
    });

    const data = await readJson(response);

    if (data.authenticated) {
      window.location.href = "/";
    }
  } catch {
    // Sin sesión activa. Permanecemos en login.
  }
}

document.getElementById("f").addEventListener("submit", async (event) => {
  event.preventDefault();

  const errorOutput = document.getElementById("e");
  const passwordInput = document.getElementById("p");

  errorOutput.textContent = "";

  try {
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        password: passwordInput.value,
      }),
    });

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(
        data?.error?.message || "No se pudo iniciar sesión"
      );
    }

    window.location.href = "/";
  } catch (error) {
    errorOutput.textContent =
      error instanceof Error
        ? error.message
        : "No se pudo iniciar sesión";
  }
});

checkSession();