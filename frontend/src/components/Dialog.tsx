import { ReactNode, useEffect, useRef } from 'react';
import { FiX as MdClose } from 'react-icons/fi';

export default function Dialog({ title, children, onClose, className = '', canClose = true }: { title: string; children: ReactNode; onClose: () => void; className?: string; canClose?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!opener.current) opener.current = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { (opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('#archive-search'))?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={`app-dialog ${className}`} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); if (canClose) onClose(); }} onClose={onClose}>
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" disabled={!canClose} onClick={onClose} aria-label="Close dialog"><MdClose /></button></div>
    <div className="dialog-content">{children}</div>
  </dialog>;
}
