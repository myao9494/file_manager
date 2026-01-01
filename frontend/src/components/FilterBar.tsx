/**
 * フィルタバーコンポーネント
 * ファイル種別でフィルタリング
 */
import "./FilterBar.css";

interface FilterBarProps {
  typeFilter: string;
  extFilter: string;
  onTypeChange: (type: string) => void;
  onExtChange: (ext: string) => void;
  isFocused?: boolean;
}

const TYPE_FILTERS = [
  { id: "all", label: "全" },
  { id: "files", label: "F" },
  { id: "folders", label: "D" },
];

const EXT_FILTERS = [
  { id: "all", label: "全" },
  { id: "md+svg+csv+pdf+ipynb+py+excalidraw+excalidraw.md+excalidraw.svg+excalidraw.png", label: "常用" },
  { id: "md", label: "MD" },
  { id: "ipynb", label: "IPYNB" },
  { id: "pdf", label: "PDF" },
  { id: "docx+xlsx+xlsm+pptx+msg", label: "Office" },
  { id: "jpg+jpeg+png+gif+bmp+tiff", label: "画像" },
  { id: "excalidraw+excalidraw.svg+excalidraw.png", label: "Excali" },
];

export function FilterBar({ typeFilter, extFilter, onTypeChange, onExtChange, isFocused = false }: FilterBarProps) {
  return (
    <div className={`filter-bar ${isFocused ? 'section-focused' : ''}`}>
      <div className="filter-group">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            className={`filter-btn ${typeFilter === f.id ? "active" : ""}`}
            onClick={() => onTypeChange(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="filter-divider" />
      <div className="filter-group">
        {EXT_FILTERS.map((f) => (
          <button
            key={f.id}
            className={`filter-btn ${extFilter === f.id ? "active" : ""}`}
            onClick={() => onExtChange(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
