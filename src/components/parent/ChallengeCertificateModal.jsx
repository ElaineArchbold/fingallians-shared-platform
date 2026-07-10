import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString("en-IE");

  return date.toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawCenteredText(ctx, text, x, y, maxWidth) {
  ctx.textAlign = "center";
  ctx.fillText(text, x, y, maxWidth);
}

export default function ChallengeCertificateModal({
  playerName,
  squadName,
  xpTotal = 0,
  badgeCount = 0,
  distanceKm = 0,
  completedAt,
  onClose,
}) {
  const previewRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  const completedDate = formatDate(completedAt);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  async function createCertificateImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1131;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Certificate image could not be created.");

    const gradient = ctx.createLinearGradient(0, 0, 1600, 1131);
    gradient.addColorStop(0, "#fffdf8");
    gradient.addColorStop(1, "#f8eee8");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#a80d19";
    ctx.lineWidth = 24;
    ctx.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);

    ctx.strokeStyle = "#f7c948";
    ctx.lineWidth = 8;
    ctx.strokeRect(66, 66, canvas.width - 132, canvas.height - 132);

    ctx.fillStyle = "#a80d19";
    ctx.fillRect(0, 0, canvas.width, 175);

    try {
      const crest = await loadImage("/fingallians-crest.png");
      const crestSize = 150;
      const crestX = (canvas.width - crestSize) / 2;
      const crestY = 52;

      ctx.beginPath();
      ctx.arc(canvas.width / 2, crestY + crestSize / 2, crestSize / 2 + 10, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#f7c948";
      ctx.stroke();
      ctx.drawImage(crest, crestX + 12, crestY + 12, crestSize - 24, crestSize - 24);
    } catch {
      ctx.fillStyle = "#f7c948";
      ctx.font = "bold 86px Arial";
      drawCenteredText(ctx, "🏆", canvas.width / 2, 145, 180);
    }

    ctx.fillStyle = "#a80d19";
    ctx.font = "900 60px Arial";
    drawCenteredText(ctx, "CERTIFICATE OF COMPLETION", canvas.width / 2, 300, 1350);

    ctx.fillStyle = "#6f6768";
    ctx.font = "600 30px Arial";
    drawCenteredText(ctx, "This certificate is proudly presented to", canvas.width / 2, 365, 1200);

    ctx.fillStyle = "#231f20";
    ctx.font = "900 76px Arial";
    drawCenteredText(ctx, playerName || "Summer Challenge Finisher", canvas.width / 2, 465, 1320);

    ctx.strokeStyle = "#f7c948";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(320, 500);
    ctx.lineTo(1280, 500);
    ctx.stroke();

    ctx.fillStyle = "#231f20";
    ctx.font = "700 35px Arial";
    drawCenteredText(
      ctx,
      "for completing the Fingallians Summer Fitness Challenge 2026",
      canvas.width / 2,
      585,
      1300
    );

    ctx.fillStyle = "#6f6768";
    ctx.font = "600 28px Arial";
    drawCenteredText(ctx, squadName || "Fingallians", canvas.width / 2, 635, 1000);

    const stats = [
      { value: String(Number(xpTotal || 0)), label: "TOTAL XP" },
      { value: String(Number(badgeCount || 0)), label: "BADGES" },
      { value: `${Number(distanceKm || 0).toFixed(2)} km`, label: "DISTANCE" },
    ];

    stats.forEach((stat, index) => {
      const x = 410 + index * 390;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#e9e2de";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(x - 145, 700, 290, 150, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#a80d19";
      ctx.font = "900 43px Arial";
      drawCenteredText(ctx, stat.value, x, 765, 250);

      ctx.fillStyle = "#6f6768";
      ctx.font = "800 19px Arial";
      drawCenteredText(ctx, stat.label, x, 815, 250);
    });

    ctx.fillStyle = "#231f20";
    ctx.font = "700 27px Arial";
    drawCenteredText(ctx, `Completed on ${completedDate}`, canvas.width / 2, 930, 1000);

    ctx.fillStyle = "#a80d19";
    ctx.font = "900 30px Arial";
    drawCenteredText(ctx, "FINS ABÚ", canvas.width / 2, 995, 500);

    ctx.fillStyle = "#6f6768";
    ctx.font = "600 20px Arial";
    drawCenteredText(ctx, "Effort · Skill · Teamwork · Fun", canvas.width / 2, 1035, 800);

    return canvas.toDataURL("image/png", 1);
  }

  async function downloadCertificate() {
    setDownloading(true);

    try {
      const dataUrl = await createCertificateImage();
      const safeName = String(playerName || "challenge-finisher")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${safeName || "challenge-finisher"}-fingallians-certificate.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Certificate download failed", error);
      window.alert("The certificate could not be downloaded. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function printCertificate() {
    try {
      const dataUrl = await createCertificateImage();
      const printWindow = window.open("", "_blank", "width=1100,height=800");

      if (!printWindow) {
        window.alert("Please allow pop-ups to print the certificate.");
        return;
      }

      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <title>${playerName || "Fingallians"} Certificate</title>
            <style>
              html, body { margin: 0; padding: 0; background: white; }
              body { display: grid; place-items: center; min-height: 100vh; }
              img { width: 100%; height: auto; display: block; }
              @page { size: A4 landscape; margin: 0; }
            </style>
          </head>
          <body><img src="${dataUrl}" alt="Fingallians challenge certificate" /></body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    } catch (error) {
      console.error("Certificate print failed", error);
      window.alert("The certificate could not be printed. Please try again.");
    }
  }

  const modal = (
    <div
      className="certificate-modal-backdrop certificate-fullscreen-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Challenge completion certificate"
      onClick={onClose}
    >
      <div
        className="certificate-modal certificate-fullscreen-modal"
        onClick={event => event.stopPropagation()}
      >
        <header className="certificate-viewer-toolbar">
          <div>
            <span>🏆 Challenge complete</span>
            <strong>{playerName || "Summer Challenge Finisher"}</strong>
          </div>

          <button
            type="button"
            className="certificate-modal-close"
            onClick={onClose}
            aria-label="Close certificate"
          >
            ×
          </button>
        </header>

        <main className="certificate-viewer-stage">
          <div ref={previewRef} className="challenge-certificate">
            <div className="certificate-top-band" />
            <img className="certificate-crest" src="/fingallians-crest.png" alt="Fingallians crest" />
            <p className="certificate-kicker">Certificate of Completion</p>
            <p className="certificate-presented">This certificate is proudly presented to</p>
            <h2>{playerName || "Summer Challenge Finisher"}</h2>
            <div className="certificate-name-rule" />
            <p className="certificate-copy">
              for completing the <strong>Fingallians Summer Fitness Challenge 2026</strong>
            </p>
            <p className="certificate-squad">{squadName || "Fingallians"}</p>

            <div className="certificate-stat-grid">
              <div><strong>{xpTotal}</strong><span>Total XP</span></div>
              <div><strong>{badgeCount}</strong><span>Badges</span></div>
              <div><strong>{Number(distanceKm || 0).toFixed(2)} km</strong><span>Distance</span></div>
            </div>

            <p className="certificate-date">Completed on {completedDate}</p>
            <strong className="certificate-club-line">FINS ABÚ</strong>
            <small>Effort · Skill · Teamwork · Fun</small>
          </div>
        </main>

        <footer className="certificate-viewer-actions">
          <p>Save it, print it, or share the downloaded image with family.</p>
          <div className="certificate-actions">
            <button className="button secondary" type="button" onClick={printCertificate}>
              Print Certificate
            </button>
            <button className="button primary" type="button" onClick={downloadCertificate} disabled={downloading}>
              {downloading ? "Creating…" : "Download Certificate"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

