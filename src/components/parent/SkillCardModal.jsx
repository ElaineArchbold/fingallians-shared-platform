import { useEffect, useMemo, useState } from "react";

function buildPdfUrl(pdf, page, fitMode) {
  const safePage = Math.max(1, Number(page || 1));
  const view = fitMode === "width" ? "FitH" : "Fit";
  return `${pdf}#page=${safePage}&toolbar=0&navpanes=0&scrollbar=0&view=${view}`;
}

export default function SkillCardModal({ title, pdf, onClose }) {
  const [page, setPage] = useState(1);
  const [fitMode, setFitMode] = useState("page");

  const pdfUrl = useMemo(() => buildPdfUrl(pdf, page, fitMode), [pdf, page, fitMode]);

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
      <div className="skill-modal skill-modal-fit" onClick={event => event.stopPropagation()}>
        <div className="skill-modal-header">
          <div>
            <span>📄 Skill Card</span>
            <h2>{title}</h2>
          </div>

          <button className="skill-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="skill-modal-controls">
          <button
            className="button secondary"
            onClick={() => setPage(current => Math.max(1, current - 1))}
          >
            ←
          </button>

          <strong>Page {page}</strong>

          <button
            className="button secondary"
            onClick={() => setPage(current => current + 1)}
          >
            →
          </button>

          <button
            className="button secondary fit-toggle"
            onClick={() => setFitMode(current => (current === "page" ? "width" : "page"))}
          >
            {fitMode === "page" ? "Fit Width" : "Fit Page"}
          </button>
        </div>

        <div className="skill-pdf-frame">
          <iframe src={pdfUrl} title={title} />
        </div>
      </div>
    </div>
  );
}
