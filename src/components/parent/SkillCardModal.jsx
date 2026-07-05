import { useEffect, useMemo, useState } from "react";

function buildPdfUrl(pdf, page) {
  const safePage = Math.max(1, Number(page || 1));
  return `${pdf}#page=${safePage}&toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
}

export default function SkillCardModal({ title, pdf, onClose }) {
  const [page, setPage] = useState(1);

  const pdfUrl = useMemo(() => buildPdfUrl(pdf, page), [pdf, page]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setPage(current => Math.max(1, current - 1));
      if (event.key === "ArrowRight") setPage(current => current + 1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="skill-modal-backdrop" onClick={onClose}>
      <div className="skill-modal" onClick={event => event.stopPropagation()}>
        <div className="skill-modal-header">
          <div>
            <p>Skill Card</p>
            <h2>{title}</h2>
          </div>

          <button className="skill-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="skill-card-viewer">
          <iframe
            key={pdfUrl}
            title={title}
            src={pdfUrl}
            className="skill-card-frame"
          />
        </div>

        <div className="skill-modal-footer">
          <button
            className="button secondary"
            disabled={page <= 1}
            onClick={() => setPage(current => Math.max(1, current - 1))}
          >
            ← Previous
          </button>

          <strong>Page {page}</strong>

          <button
            className="button primary"
            onClick={() => setPage(current => current + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
