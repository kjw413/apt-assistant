import { useEffect, useId, useRef, type KeyboardEvent } from 'react';

export function ConfirmDialog({
  open,
  title,
  body,
  confirmText,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') event.preventDefault();
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={body ? bodyId : undefined} onKeyDown={onKeyDown}>
      <h2 id={titleId}>{title}</h2>
      {body && <p id={bodyId}>{body}</p>}
      <div>
        <button ref={cancelRef} type="button" onClick={onCancel}>취소</button>
        <button type="button" onClick={onConfirm}>{confirmText}</button>
      </div>
    </div>
  );
}
