import { MAX_TABS, type FileTab } from "../../shared/files";

type Props = {
  tabs: FileTab[];
  active: string;
  readOnly: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function Tabs({ tabs, active, readOnly, onOpen, onAdd, onRename, onDelete }: Props) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <div key={t.id} className={`tab${t.id === active ? " active" : ""}`}>
          <button
            role="tab"
            aria-selected={t.id === active}
            className="tab-name"
            onClick={() => onOpen(t.id)}
            onDoubleClick={() => !readOnly && onRename(t.id)}
            title={readOnly ? t.name : `${t.name} (double-click to rename)`}
          >
            {t.name}
          </button>
          {!readOnly && t.id === active && (
            <>
              <button className="tab-x" onClick={() => onRename(t.id)} title="Rename file" aria-label={`Rename ${t.name}`}>✎</button>
              {tabs.length > 1 && (
                <button className="tab-x" onClick={() => onDelete(t.id)} title="Delete file" aria-label={`Delete ${t.name}`}>✕</button>
              )}
            </>
          )}
        </div>
      ))}
      {!readOnly && tabs.length < MAX_TABS && (
        <button className="tab-add" onClick={onAdd} title="New file" aria-label="New file">+</button>
      )}
    </div>
  );
}
